import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";
import { budgetMensuelGlobal, TAUX_COMMISSION_AGENT, PRODUITS_COMMISSION_DYNAMIQUE } from "../services/commission.js";

export const statsRouter = Router();
statsRouter.use(requireAuth("admin"));

function parseDateRange(req: {
  query: { from?: string; to?: string };
}): { gte?: Date; lte?: Date } | undefined {
  const { from, to } = req.query;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00`);
  if (to) range.lte = new Date(`${to}T23:59:59.999`);
  return range.gte || range.lte ? range : undefined;
}

type DateWhereStats = { createdAt?: { gte?: Date; lte?: Date } };

/**
 * Chiffre d'affaires/taxes/FG/primes du modèle GÉNÉRIQUE (RelaxMoto/Auto,
 * RelaxAccidents Frais Médicaux/générale, RelaxVoyage, SecurHome+, SecurPro
 * Dommages), réparti par sous-branche — sans quoi les partenaires au QR
 * unique (dont les ventes se font surtout sur ces produits) n'étaient
 * comptabilisés nulle part sur ces cartes du tableau de bord, qui ne
 * portaient jusqu'ici que sur les deux modèles historiques Incendie/Accident.
 * Pondéré par `nombrePaiements` (1er paiement + renouvellements), comme
 * services/commission.ts. Les 3 produits à devis dynamique (pas de
 * TarifProduit) n'ont pas de FG séparé dans leur `resultat` — seulement
 * primeNetteHT/accessoires/taxes/primeTTC (voir relaxAccidentsGenerale.ts/
 * securhomeDommages.ts/tarificationImf.ts) — leur contribution au FG total
 * reste donc nulle, seuls les produits à tarif catalogue (TarifProduit.fg)
 * peuvent y contribuer.
 *
 * `partenaireId` restreint à un seul partenaire — réutilisé par
 * routes/me.ts pour le chiffre d'affaires de l'espace partenaire.
 */
export async function statsGeneriques(dateWhere: DateWhereStats & { partenaireId?: string }) {
  const { partenaireId, ...periode } = dateWhere;
  const totals = {
    ASSURANCES_ACCIDENTS: { primes: 0, ca: 0, taxes: 0, fg: 0 },
    ASSURANCES_DOMMAGES: { primes: 0, ca: 0, taxes: 0, fg: 0 },
  };

  const produits = await prisma.produit.findMany({
    where: { sousBranche: { in: ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] } },
  });
  if (produits.length === 0) return totals;
  const produitParId = new Map(produits.map((p) => [p.id, p]));
  const idsDynamique = produits
    .filter((p) => (PRODUITS_COMMISSION_DYNAMIQUE as readonly string[]).includes(p.code))
    .map((p) => p.id);
  const idsCatalogue = produits.filter((p) => !idsDynamique.includes(p.id)).map((p) => p.id);

  const [groups, tarifs, dynRows] = await Promise.all([
    idsCatalogue.length
      ? prisma.souscription.groupBy({
          by: ["produitId", "montantPrime"],
          where: { produitId: { in: idsCatalogue }, partenaireId, waveStatut: "confirme", ...periode },
          _count: { _all: true },
          _sum: { nombrePaiements: true },
        })
      : [],
    idsCatalogue.length
      ? prisma.tarifProduit.findMany({ where: { produitId: { in: idsCatalogue } } })
      : [],
    idsDynamique.length
      ? prisma.souscription.findMany({
          where: { produitId: { in: idsDynamique }, partenaireId, waveStatut: "confirme", ...periode },
          select: { produitId: true, montantPrime: true, resultat: true, nombrePaiements: true },
        })
      : [],
  ]);

  const tarifMap = new Map(tarifs.map((t) => [`${t.produitId}:${t.prime}`, t]));

  for (const g of groups) {
    const produit = produitParId.get(g.produitId);
    if (!produit?.sousBranche) continue;
    const bucket = totals[produit.sousBranche as keyof typeof totals];
    const t = tarifMap.get(`${g.produitId}:${g.montantPrime}`);
    const tx = t?.taxes ?? 0;
    const f = t?.fg ?? 0;
    const n = g._sum.nombrePaiements ?? g._count._all;
    bucket.primes += g.montantPrime * n;
    bucket.ca += (g.montantPrime - tx) * n;
    bucket.taxes += tx * n;
    bucket.fg += f * n;
  }

  for (const s of dynRows) {
    const produit = produitParId.get(s.produitId);
    if (!produit?.sousBranche) continue;
    const bucket = totals[produit.sousBranche as keyof typeof totals];
    const resultat = s.resultat as { taxes?: number } | null;
    const tx = resultat?.taxes ?? 0;
    const n = s.nombrePaiements ?? 1;
    bucket.primes += s.montantPrime * n;
    bucket.ca += (s.montantPrime - tx) * n;
    bucket.taxes += tx * n;
  }

  return totals;
}

statsRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const createdAt = parseDateRange(req as { query: { from?: string; to?: string } });
    const dateWhere = createdAt ? { createdAt } : {};

    const [
      partenairesTotal,
      partenairesActifs,
      incendieTotal,
      accidentTotal,
      params,
      derniersAccident,
      derniersIncendie,
      incGroups,
      accGroups,
      tarifsAcc,
      tarifsInc,
    ] = await Promise.all([
      prisma.partenaire.count(),
      prisma.partenaire.count({ where: { statut: "actif" } }),
      prisma.souscriptionIncendie.count({ where: dateWhere }),
      // Un accident n'est compté comme souscription qu'une fois le paiement confirmé.
      prisma.souscriptionAccident.count({ where: { ...dateWhere, waveStatut: "confirme" } }),
      prisma.parametre.findUnique({ where: { id: 1 } }),
      prisma.souscriptionAccident.findMany({
        take: 5,
        where: { ...dateWhere, waveStatut: "confirme" },
        orderBy: { createdAt: "desc" },
        include: { partenaire: { select: { nomCommerce: true } } },
      }),
      prisma.souscriptionIncendie.findMany({
        take: 5,
        where: dateWhere,
        orderBy: { createdAt: "desc" },
        include: { partenaire: { select: { nomCommerce: true } } },
      }),
      prisma.souscriptionIncendie.groupBy({
        by: ["montantPrime"],
        where: dateWhere,
        _count: { _all: true },
        _sum: { nombrePaiements: true },
      }),
      prisma.souscriptionAccident.groupBy({
        by: ["montantPrime"],
        where: { ...dateWhere, waveStatut: "confirme" },
        _count: { _all: true },
        _sum: { nombrePaiements: true },
      }),
      prisma.tarifAccident.findMany(),
      prisma.tarifIncendie.findMany(),
    ]);

    // Budget mensuel (5% du CA prime HT sur 31 jours glissants) — indépendant
    // du filtre de période du tableau de bord, toujours calculé sur le mois en cours.
    const [budget, generiques] = await Promise.all([budgetMensuelGlobal(), statsGeneriques(dateWhere)]);

    // ── Chiffre d'affaires (Prime TTC − Taxes), Taxes et FG, depuis les barèmes ──
    // Pondéré par `_sum.nombrePaiements` quand disponible (Accident : chaque
    // renouvellement paie de nouveau la même ligne, voir services/accident.ts),
    // sinon par le nombre de lignes (Incendie, pas de renouvellement).
    function caTaxesEtFg(
      groups: { montantPrime: number; _count: { _all: number }; _sum?: { nombrePaiements: number | null } }[],
      tarifs: { prime: number; taxes: number | null; fg: number | null }[]
    ) {
      const map = new Map(tarifs.map((t) => [t.prime, t]));
      let ca = 0;
      let taxes = 0;
      let fg = 0;
      for (const g of groups) {
        const t = map.get(g.montantPrime);
        const tx = t?.taxes ?? 0;
        const f = t?.fg ?? 0;
        const n = g._sum?.nombrePaiements ?? g._count._all;
        ca += (g.montantPrime - tx) * n;
        taxes += tx * n;
        fg += f * n;
      }
      return { ca, taxes, fg };
    }

    const acc = caTaxesEtFg(accGroups, tarifsAcc);
    const inc = caTaxesEtFg(incGroups, tarifsInc);
    // Étendu au modèle générique (RelaxMoto/Auto, RelaxAccidents Frais
    // Médicaux/générale, RelaxVoyage, SecurHome+, SecurPro Dommages) — sans
    // quoi les partenaires au QR unique n'étaient comptabilisés nulle part
    // sur ces cartes, qui ne portaient que sur Incendie/Accident historiques.
    const caAccident = acc.ca + generiques.ASSURANCES_ACCIDENTS.ca;
    const taxesAccident = acc.taxes + generiques.ASSURANCES_ACCIDENTS.taxes;
    const caIncendie = inc.ca + generiques.ASSURANCES_DOMMAGES.ca;
    const taxesIncendie = inc.taxes + generiques.ASSURANCES_DOMMAGES.taxes;
    const fgTotal = acc.fg + inc.fg + generiques.ASSURANCES_ACCIDENTS.fg + generiques.ASSURANCES_DOMMAGES.fg;

    // Prime Incendie/Dommages TTC = somme des montants payés, PAIEMENTS
    // confirmés (1er + renouvellements), pas lignes distinctes, + produits
    // génériques Dommages (SecurHome+, SecurPro).
    const primesIncendie =
      incGroups.reduce((s, g) => s + g.montantPrime * (g._sum.nombrePaiements ?? g._count._all), 0) +
      generiques.ASSURANCES_DOMMAGES.primes;
    // Prime Accident/Accidents TTC = somme des montants payés, PAIEMENTS
    // confirmés (1er + renouvellements), pas lignes distinctes, + produits
    // génériques Accidents (RelaxMoto/Auto, RelaxAccidents, RelaxVoyage...).
    const primesAccident =
      accGroups.reduce((s, g) => s + g.montantPrime * (g._sum.nombrePaiements ?? g._count._all), 0) +
      generiques.ASSURANCES_ACCIDENTS.primes;

    res.json({
      partenairesTotal,
      partenairesActifs,
      incendieTotal,
      accidentTotal,
      primesAccident: Math.round(primesAccident),
      primesIncendie: Math.round(primesIncendie),
      chiffreAffaires: Math.round(caIncendie + caAccident),
      taxes: Math.round(taxesIncendie + taxesAccident),
      fgTotal: Math.round(fgTotal),
      caIncendie: Math.round(caIncendie),
      caAccident: Math.round(caAccident),
      budgetIncendie: budget.budgetIncendie,
      budgetAccident: budget.budgetAccident,
      params,
      derniersAccident: derniersAccident.map((r) => ({
        ...r,
        partenaireNom: r.partenaire.nomCommerce,
      })),
      derniersIncendie: derniersIncendie.map((r) => ({
        ...r,
        partenaireNom: r.partenaire.nomCommerce,
      })),
    });
  })
);

interface PerfOpts {
  since?: Date;
  from?: Date;
  to?: Date;
  partenaireId?: string;
  montantPrime?: number;
  produit?: "incendie" | "accident";
}

async function buildPerformance(opts: PerfOpts = {}) {
  const { since, from, to, partenaireId, montantPrime, produit } = opts;

  const params = await prisma.parametre.findUnique({ where: { id: 1 } });
  const tauxAcc = params?.tauxCommissionAccident ?? 0.1;
  const tauxInc = params?.tauxCommissionIncendie ?? 0.2;

  const dateRange =
    from || to || since
      ? {
          ...(from ?? since ? { gte: from ?? since } : {}),
          ...(to ? { lte: to } : {}),
        }
      : undefined;

  const showInc = !produit || produit === "incendie";
  const showAcc = !produit || produit === "accident";

  const [allPartenaires, tarifsInc, tarifsAcc, encaisseeRows, produitsGeneriques] = await Promise.all([
    prisma.partenaire.findMany({
      where: partenaireId ? { id: partenaireId } : undefined,
      orderBy: { createdAt: "desc" },
    }),
    prisma.tarifIncendie.findMany(),
    prisma.tarifAccident.findMany(),
    prisma.demandeCommission.groupBy({
      by: ["partenaireId"],
      where: {
        statut: "validee",
        ...(partenaireId ? { partenaireId } : {}),
      },
      _sum: { montant: true },
    }),
    // Modèle générique (RelaxMoto/Auto, RelaxAccidents Frais Médicaux/générale,
    // RelaxVoyage, SecurHome+, SecurPro Dommages) — sans quoi les partenaires au
    // QR unique, dont les ventes se font surtout sur ces produits, n'étaient
    // comptabilisés nulle part sur cette page (même angle mort que /overview,
    // déjà corrigé). Repartis dans les buckets "Incendie"/"Dommages" et
    // "Accident"/"Accidents" existants selon `Produit.sousBranche`.
    prisma.produit.findMany({
      where: { sousBranche: { in: ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] } },
    }),
  ]);

  const incMap = new Map(tarifsInc.map((t) => [t.prime, t]));
  const accMap = new Map(tarifsAcc.map((t) => [t.prime, t]));
  const encMap = new Map(encaisseeRows.map((r) => [r.partenaireId, r._sum.montant ?? 0]));

  const produitGenParId = new Map(produitsGeneriques.map((p) => [p.id, p]));
  const idsGenDynamique = produitsGeneriques
    .filter((p) => (PRODUITS_COMMISSION_DYNAMIQUE as readonly string[]).includes(p.code))
    .map((p) => p.id);
  const idsGenCatalogue = produitsGeneriques.filter((p) => !idsGenDynamique.includes(p.id)).map((p) => p.id);
  const [tarifsGeneriques, baremesSecurpro] = await Promise.all([
    idsGenCatalogue.length ? prisma.tarifProduit.findMany({ where: { produitId: { in: idsGenCatalogue } } }) : [],
    idsGenDynamique.length ? prisma.baremeSecurpro.findMany() : [],
  ]);
  const tarifGenMap = new Map(tarifsGeneriques.map((t) => [`${t.produitId}:${t.prime}`, t]));
  const baremeParClasse = new Map(baremesSecurpro.map((b) => [b.classe, b]));

  const rows = await Promise.all(
    allPartenaires.map(async (p) => {
      const baseWhere = {
        partenaireId: p.id,
        ...(dateRange ? { createdAt: dateRange } : {}),
      };
      const incWhere = { ...baseWhere, ...(montantPrime ? { montantPrime } : {}) };
      const accWhere = { ...baseWhere, ...(montantPrime ? { montantPrime } : {}) };
      const genWhere = { ...baseWhere, waveStatut: "confirme" as const, ...(montantPrime ? { montantPrime } : {}) };

      const [incGroups, incCount, accGroups, accCount, incGroupsViaAgents, accGroupsViaAgents, genCatalogueGroups, genDynRows] = await Promise.all([
        showInc
          ? prisma.souscriptionIncendie.groupBy({ by: ["montantPrime"], where: incWhere, _count: { _all: true }, _sum: { nombrePaiements: true } })
          : [],
        showInc ? prisma.souscriptionIncendie.count({ where: incWhere }) : 0,
        showAcc
          ? prisma.souscriptionAccident.groupBy({ by: ["montantPrime"], where: { ...accWhere, waveStatut: "confirme" }, _count: { _all: true }, _sum: { nombrePaiements: true } })
          : [],
        showAcc
          ? prisma.souscriptionAccident.count({ where: { ...accWhere, waveStatut: "confirme" } })
          : 0,
        // Sous-ensemble vendu par un agent de distribution : seuls 25% de leur
        // commission reviennent au partenaire, le reste (75%) à l'agent — voir
        // services/commission.ts.
        showInc
          ? prisma.souscriptionIncendie.groupBy({ by: ["montantPrime"], where: { ...incWhere, agentDistributionId: { not: null } }, _count: { _all: true }, _sum: { nombrePaiements: true } })
          : [],
        showAcc
          ? prisma.souscriptionAccident.groupBy({ by: ["montantPrime"], where: { ...accWhere, agentDistributionId: { not: null }, waveStatut: "confirme" }, _count: { _all: true }, _sum: { nombrePaiements: true } })
          : [],
        (showInc || showAcc) && idsGenCatalogue.length
          ? prisma.souscription.groupBy({
              by: ["produitId", "montantPrime", "agentDistributionId"],
              where: { ...genWhere, produitId: { in: idsGenCatalogue } },
              _count: { _all: true },
              _sum: { nombrePaiements: true },
            })
          : [],
        (showInc || showAcc) && idsGenDynamique.length
          ? prisma.souscription.findMany({
              where: { ...genWhere, produitId: { in: idsGenDynamique } },
              select: { produitId: true, montantPrime: true, resultat: true, donneesSpecifiques: true, nombrePaiements: true, agentDistributionId: true },
            })
          : [],
      ]);

      let primesIncendie = 0, primesIncendieHT = 0, caIncendie = 0;
      let commissionIncendie = 0;
      for (const g of incGroups) {
        const t = incMap.get(g.montantPrime);
        const n = g._sum.nombrePaiements ?? g._count._all;
        primesIncendie += g.montantPrime * n;
        primesIncendieHT += (t?.primeHT ?? g.montantPrime) * n;
        caIncendie += (g.montantPrime - (t?.taxes ?? 0)) * n;
        commissionIncendie += (t?.commission ?? 0) * n;
      }
      let commissionIncendieViaAgents = 0;
      for (const g of incGroupsViaAgents) {
        const n = g._sum.nombrePaiements ?? g._count._all;
        commissionIncendieViaAgents += (incMap.get(g.montantPrime)?.commission ?? 0) * n;
      }
      commissionIncendie -= commissionIncendieViaAgents * TAUX_COMMISSION_AGENT;

      // Pondéré par le nombre de paiements confirmés (1er + renouvellements),
      // pas par le nombre de lignes — un même client renouvelé génère une
      // prime/commission à chaque renouvellement (voir services/accident.ts).
      // `accCount`/`incCount` (nombre de CLIENTS distincts) restent, eux, non pondérés.
      let primesAccident = 0, primesAccidentHT = 0, caAccident = 0;
      let commissionAccident = 0;
      for (const g of accGroups) {
        const t = accMap.get(g.montantPrime);
        const n = g._sum.nombrePaiements ?? g._count._all;
        primesAccident += g.montantPrime * n;
        primesAccidentHT += (t?.primeHT ?? g.montantPrime) * n;
        caAccident += (g.montantPrime - (t?.taxes ?? 0)) * n;
        commissionAccident += (t?.commission ?? 0) * n;
      }
      let commissionAccidentViaAgents = 0;
      for (const g of accGroupsViaAgents) {
        const n = g._sum.nombrePaiements ?? g._count._all;
        commissionAccidentViaAgents += (accMap.get(g.montantPrime)?.commission ?? 0) * n;
      }
      commissionAccident -= commissionAccidentViaAgents * TAUX_COMMISSION_AGENT;

      // ── Modèle générique, réparti par sous-branche + agent/direct ──
      let genIncendieCount = 0, genAccidentCount = 0;
      for (const g of genCatalogueGroups) {
        const prod = produitGenParId.get(g.produitId);
        if (!prod?.sousBranche) continue;
        const t = tarifGenMap.get(`${g.produitId}:${g.montantPrime}`);
        const nPaiements = g._sum.nombrePaiements ?? g._count._all;
        const primeHT = t?.primeHT ?? g.montantPrime;
        const taxes = t?.taxes ?? 0;
        const commissionBrute = (t?.commission ?? 0) * nPaiements;
        const commissionPart = g.agentDistributionId ? commissionBrute * (1 - TAUX_COMMISSION_AGENT) : commissionBrute;
        if (prod.sousBranche === "ASSURANCES_DOMMAGES") {
          primesIncendie += g.montantPrime * nPaiements;
          primesIncendieHT += primeHT * nPaiements;
          caIncendie += (g.montantPrime - taxes) * nPaiements;
          commissionIncendie += commissionPart;
          genIncendieCount += g._count._all;
        } else {
          primesAccident += g.montantPrime * nPaiements;
          primesAccidentHT += primeHT * nPaiements;
          caAccident += (g.montantPrime - taxes) * nPaiements;
          commissionAccident += commissionPart;
          genAccidentCount += g._count._all;
        }
      }
      for (const s of genDynRows) {
        const prod = produitGenParId.get(s.produitId);
        const resultat = s.resultat as { primeNetteHT?: number; primeNetteHT2?: number; taxes?: number } | null;
        if (!prod?.sousBranche || !resultat) continue;
        const nPaiements = s.nombrePaiements ?? 1;
        const primeHT = resultat.primeNetteHT2 ?? resultat.primeNetteHT ?? 0;
        const taxes = resultat.taxes ?? 0;
        let commissionUnitaire = 0;
        if (prod.code === "securpro_dommages") {
          const specs = s.donneesSpecifiques as { classe?: number } | null;
          const bareme = specs?.classe != null ? baremeParClasse.get(specs.classe) : undefined;
          commissionUnitaire = (resultat.primeNetteHT ?? 0) * (bareme?.tauxCommission ?? 0);
        } else {
          commissionUnitaire = primeHT * (prod.tauxCommission ?? 0);
        }
        const commissionBrute = commissionUnitaire * nPaiements;
        const commissionPart = s.agentDistributionId ? commissionBrute * (1 - TAUX_COMMISSION_AGENT) : commissionBrute;
        if (prod.sousBranche === "ASSURANCES_DOMMAGES") {
          primesIncendie += s.montantPrime * nPaiements;
          primesIncendieHT += primeHT * nPaiements;
          caIncendie += (s.montantPrime - taxes) * nPaiements;
          commissionIncendie += commissionPart;
          genIncendieCount += 1;
        } else {
          primesAccident += s.montantPrime * nPaiements;
          primesAccidentHT += primeHT * nPaiements;
          caAccident += (s.montantPrime - taxes) * nPaiements;
          commissionAccident += commissionPart;
          genAccidentCount += 1;
        }
      }

      const ca = Math.round(caIncendie + caAccident);
      const clientsIncendie = incCount + genIncendieCount;
      const clientsAccident = (accCount as number) + genAccidentCount;

      return {
        id: p.id,
        nomCommerce: p.nomCommerce,
        nomResponsable: p.nomResponsable,
        localisation: p.localisation,
        clientsIncendie,
        clientsAccident,
        total: clientsIncendie + clientsAccident,
        primesAccident: Math.round(primesAccident),
        primesAccidentHT: Math.round(primesAccidentHT),
        primesIncendie: Math.round(primesIncendie),
        primesIncendieHT: Math.round(primesIncendieHT),
        ca,
        commission: Math.round(commissionIncendie + commissionAccident),
        commissionIncendie: Math.round(commissionIncendie),
        commissionAccident: Math.round(commissionAccident),
        commissionEncaissee: Math.round(encMap.get(p.id) ?? 0),
      };
    })
  );

  rows.sort((a, b) => b.total - a.total);
  return { rows, taux: { tauxAcc, tauxInc } };
}

function periodeToDate(periode?: string): Date | undefined {
  const now = new Date();
  if (periode === "mensuel")
    return new Date(now.getFullYear(), now.getMonth(), 1);
  if (periode === "trimestriel") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), q, 1);
  }
  if (periode === "annuel") return new Date(now.getFullYear(), 0, 1);
  return undefined;
}

statsRouter.get(
  "/performance",
  asyncHandler(async (req, res) => {
    const { periode, from, to, partenaireId, montantPrime, produit } =
      req.query as Record<string, string | undefined>;

    const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined;
    const since = !fromDate && !toDate ? periodeToDate(periode) : undefined;

    const data = await buildPerformance({
      since,
      from: fromDate,
      to: toDate,
      partenaireId: partenaireId || undefined,
      montantPrime: montantPrime ? Number(montantPrime) : undefined,
      produit: produit === "incendie" || produit === "accident" ? produit : undefined,
    });
    res.json(data);
  })
);

statsRouter.get(
  "/performance/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { periode, from, to, partenaireId, montantPrime, produit } =
      req.query as Record<string, string | undefined>;
    const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined;
    const since = !fromDate && !toDate ? periodeToDate(periode) : undefined;
    const { rows } = await buildPerformance({
      since, from: fromDate, to: toDate,
      partenaireId: partenaireId || undefined,
      montantPrime: montantPrime ? Number(montantPrime) : undefined,
      produit: produit === "incendie" || produit === "accident" ? produit : undefined,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "performance",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "performance_partenaires.csv",
      toCsv(
        rows.map((r) => ({
          partenaire: r.nomCommerce,
          localisation: r.localisation,
          clientsDommages: r.clientsIncendie,
          clientsAccidents: r.clientsAccident,
          // HT, comme le tableau à l'écran (Performance.tsx) — la valeur TTC
          // n'y est jamais affichée, l'export ne doit pas diverger de l'écran.
          primesAccidentsHT: r.primesAccidentHT,
          primesDommagesHT: r.primesIncendieHT,
          commission: r.commission,
        }))
      )
    );
  })
);
