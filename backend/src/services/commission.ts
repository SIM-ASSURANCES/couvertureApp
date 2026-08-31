import { prisma } from "../db.js";

type DateWhere = { createdAt?: { gte?: Date; lte?: Date } };
type FiltreAgent = string | null | { not: null };

/**
 * Part de la commission qui revient à l'agent de distribution quand la
 * souscription est faite depuis son propre espace (QR agent) — le reste
 * (25%) revient au partenaire. Quand la souscription est faite directement
 * depuis l'espace du partenaire (agentDistributionId null), le partenaire
 * garde 100% : voir commissionTotalePartenaire/commissionTotaleAgent.
 */
export const TAUX_COMMISSION_AGENT = 0.75;

/**
 * Pondère par `_sum.nombrePaiements` quand disponible (chaque renouvellement
 * paie à nouveau la même ligne, voir services/accident.ts et
 * services/paiementWave.ts), sinon retombe sur le nombre de lignes
 * (`_count._all`, pour compatibilité si l'appelant n'a pas demandé `_sum`).
 */
function sommeParPrime(
  groups: { montantPrime: number; _count: { _all: number }; _sum?: { nombrePaiements: number | null } }[],
  tarifs: { prime: number; commission: number }[]
): number {
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  return groups.reduce(
    (s, g) => s + (map.get(g.montantPrime)?.commission ?? 0) * (g._sum?.nombrePaiements ?? g._count._all),
    0
  );
}

/**
 * Commission brute (100%, avant tout partage agent/partenaire) générée par
 * les souscriptions Incendie + Accident + modèle générique correspondant au
 * filtre `agentDistributionId` donné (null = ventes directes du partenaire,
 * {not: null} = ventes via un agent quelconque, une valeur précise = un seul agent).
 */
async function commissionBrute(
  partenaireId: string | undefined,
  agentDistributionId: FiltreAgent,
  dateWhere: DateWhere
): Promise<number> {
  const [incGroups, accGroups, tarifsInc, tarifsAcc, generique, dynamique] = await Promise.all([
    prisma.souscriptionIncendie.groupBy({
      by: ["montantPrime"],
      where: { partenaireId, agentDistributionId, ...dateWhere },
      _count: { _all: true },
      _sum: { nombrePaiements: true },
    }),
    prisma.souscriptionAccident.groupBy({
      by: ["montantPrime"],
      where: { partenaireId, agentDistributionId, ...dateWhere, waveStatut: "confirme" },
      _count: { _all: true },
      _sum: { nombrePaiements: true },
    }),
    prisma.tarifIncendie.findMany(),
    prisma.tarifAccident.findMany(),
    commissionSouscriptionsGeneriques({ partenaireId, agentDistributionId, ...dateWhere }),
    commissionSouscriptionsDynamiques({ partenaireId, agentDistributionId, ...dateWhere }),
  ]);

  return sommeParPrime(incGroups, tarifsInc) + sommeParPrime(accGroups, tarifsAcc) + generique + dynamique;
}

/**
 * Commission générée sur le modèle générique `Souscription` (RelaxMoto/
 * RelaxAuto, et désormais les produits issus de la refonte Assurances
 * Accidents/Dommages comme RelaxAccidents Frais Médicaux) — la commission
 * est jointe par (produitId, prime), pas seulement par prime, puisque
 * plusieurs produits différents peuvent partager un même montant.
 */
async function commissionSouscriptionsGeneriques(where: {
  partenaireId?: string;
  agentDistributionId?: FiltreAgent;
  createdAt?: { gte?: Date; lte?: Date };
}): Promise<number> {
  const groups = await prisma.souscription.groupBy({
    by: ["produitId", "montantPrime"],
    where: { ...where, waveStatut: "confirme" },
    _count: { _all: true },
    // Pondère par le nombre de paiements confirmés (1er + renouvellements —
    // produits à formule unique, RelaxMoto/Auto restent toujours à 1, voir
    // services/paiementWave.ts) plutôt que par ligne, pour qu'un
    // renouvellement génère une commission au partenaire.
    _sum: { nombrePaiements: true },
  });
  if (groups.length === 0) return 0;

  const tarifs = await prisma.tarifProduit.findMany({
    where: { produitId: { in: [...new Set(groups.map((g) => g.produitId))] } },
  });
  const map = new Map(tarifs.map((t) => [`${t.produitId}:${t.prime}`, t]));
  return groups.reduce(
    (s, g) =>
      s +
      (map.get(`${g.produitId}:${g.montantPrime}`)?.commission ?? 0) *
        (g._sum.nombrePaiements ?? g._count._all),
    0
  );
}

/**
 * Produits à devis calculé dynamiquement (pas de TarifProduit, donc jamais
 * couverts par commissionSouscriptionsGeneriques ci-dessus) — le taux de
 * commission est configurable depuis la page admin Tarifs et s'applique sur
 * la prime nette HT du devis, stockée dans `Souscription.resultat` à la
 * souscription. SecurPro a un taux par classe de risque (BaremeSecurpro,
 * déjà utilisé côté IMF) ; SecurHome+ a un taux unique par produit
 * (Produit.tauxCommission). RelaxAccidents générale est passée à un tarif
 * fixe (refonte 2026-08-31, voir services/relaxAccidentsGenerale.ts) : sa
 * commission est désormais couverte par commissionSouscriptionsGeneriques
 * ci-dessus, comme RelaxMoto/RelaxAuto.
 */
export const PRODUITS_COMMISSION_DYNAMIQUE = ["securhome_dommages", "securpro_dommages"] as const;

async function commissionSouscriptionsDynamiques(where: {
  partenaireId?: string;
  agentDistributionId?: FiltreAgent;
  createdAt?: { gte?: Date; lte?: Date };
}): Promise<number> {
  const produits = await prisma.produit.findMany({
    where: { code: { in: [...PRODUITS_COMMISSION_DYNAMIQUE] } },
  });
  if (produits.length === 0) return 0;
  const produitParId = new Map(produits.map((p) => [p.id, p]));

  const rows = await prisma.souscription.findMany({
    where: { ...where, produitId: { in: produits.map((p) => p.id) }, waveStatut: "confirme" },
    select: { produitId: true, resultat: true, donneesSpecifiques: true, nombrePaiements: true },
  });
  if (rows.length === 0) return 0;

  const baremes = await prisma.baremeSecurpro.findMany();
  const baremeParClasse = new Map(baremes.map((b) => [b.classe, b]));

  return rows.reduce((total, s) => {
    const produit = produitParId.get(s.produitId);
    const resultat = s.resultat as { primeNetteHT?: number; primeNetteHT2?: number } | null;
    if (!produit || !resultat) return total;
    // Pondère par le nombre de paiements confirmés (1er + renouvellements) —
    // voir services/paiementWave.ts::confirmerEcheance.
    const poids = s.nombrePaiements ?? 1;

    if (produit.code === "securpro_dommages") {
      const specs = s.donneesSpecifiques as { classe?: number } | null;
      const bareme = specs?.classe != null ? baremeParClasse.get(specs.classe) : undefined;
      return total + (resultat.primeNetteHT ?? 0) * (bareme?.tauxCommission ?? 0) * poids;
    }

    const primeBase = resultat.primeNetteHT2 ?? resultat.primeNetteHT ?? 0;
    return total + primeBase * (produit.tauxCommission ?? 0) * poids;
  }, 0);
}

/**
 * Commission totale due au partenaire : 100% de ses ventes directes
 * (agentDistributionId null) + la part partenaire (25%) des ventes faites
 * par ses agents de distribution — le reste (75%) revient à l'agent
 * concerné, voir commissionTotaleAgent.
 */
export async function commissionTotalePartenaire(
  partenaireId: string,
  dateWhere: DateWhere = {}
): Promise<number> {
  const [directe, viaAgents] = await Promise.all([
    commissionBrute(partenaireId, null, dateWhere),
    commissionBrute(partenaireId, { not: null }, dateWhere),
  ]);
  return directe + viaAgents * (1 - TAUX_COMMISSION_AGENT);
}

/**
 * Commission totale due à un agent de distribution précis : 75% de la
 * commission brute générée par ses propres ventes (le reste, 25%, revient
 * au partenaire — voir commissionTotalePartenaire).
 */
export async function commissionTotaleAgent(agentDistributionId: string): Promise<number> {
  const brute = await commissionBrute(undefined, agentDistributionId, {});
  return brute * TAUX_COMMISSION_AGENT;
}

/**
 * Commission encaissée par un partenaire = somme de ses PROPRES demandes
 * validées (hors demandes d'agents, comptées séparément dans
 * commissionEncaisseeAgent), optionnellement filtrée par date de traitement.
 */
export async function commissionEncaisseePartenaire(
  partenaireId: string,
  traiteeRange?: { gte?: Date; lte?: Date }
): Promise<number> {
  const agg = await prisma.demandeCommission.aggregate({
    _sum: { montant: true },
    where: {
      partenaireId,
      agentDistributionId: null,
      statut: "validee",
      ...(traiteeRange ? { traiteeAt: traiteeRange } : {}),
    },
  });
  return agg._sum.montant ?? 0;
}

/** Totale (all-time) / encaissée / due pour un partenaire. */
export async function commissionStatsPartenaire(partenaireId: string) {
  const [totale, encaissee] = await Promise.all([
    commissionTotalePartenaire(partenaireId),
    commissionEncaisseePartenaire(partenaireId),
  ]);
  return {
    totale: Math.round(totale),
    encaissee: Math.round(encaissee),
    due: Math.round(totale - encaissee),
  };
}

/** Commission encaissée par un agent de distribution = somme de ses demandes validées. */
export async function commissionEncaisseeAgent(
  agentDistributionId: string,
  traiteeRange?: { gte?: Date; lte?: Date }
): Promise<number> {
  const agg = await prisma.demandeCommission.aggregate({
    _sum: { montant: true },
    where: {
      agentDistributionId,
      statut: "validee",
      ...(traiteeRange ? { traiteeAt: traiteeRange } : {}),
    },
  });
  return agg._sum.montant ?? 0;
}

/** Totale (all-time) / encaissée / due pour un agent de distribution. */
export async function commissionStatsAgent(agentDistributionId: string) {
  const [totale, encaissee] = await Promise.all([
    commissionTotaleAgent(agentDistributionId),
    commissionEncaisseeAgent(agentDistributionId),
  ]);
  return {
    totale: Math.round(totale),
    encaissee: Math.round(encaissee),
    due: Math.round(totale - encaissee),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Commission mensuelle (bonus de performance sur 31 jours glissants)
// ─────────────────────────────────────────────────────────────────────────
// Accident : CA (prime HT) mensuel ≥ 144 000 FCFA → 5% du CA (prime HT).
// Incendie : CA (prime HT) mensuel ≥ 288 000 FCFA → 10% du CA (prime HT).
// En-dessous du seuil, aucune commission mensuelle n'est due.

const SEUIL_MENSUEL_ACCIDENT = 144000;
const SEUIL_MENSUEL_INCENDIE = 288000;
const TAUX_MENSUEL_ACCIDENT = 0.05;
const TAUX_MENSUEL_INCENDIE = 0.10;

function debutPeriode31Jours(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 31);
  return d;
}

/**
 * CA (prime HT) du modèle générique pour une sous-branche donnée, pondéré
 * par `nombrePaiements` — même logique que routes/stats.ts::statsGeneriques.
 * Sans ceci, les partenaires au QR unique (dont les ventes se font surtout
 * sur ces produits : RelaxAccidents/RelaxVoyage/SecurHome+/SecurPro Dommages,
 * etc.) ne pouvaient jamais compter dans le bonus mensuel ni dans le budget
 * mensuel global du tableau de bord, quel que soit leur volume réel.
 */
async function caHTGenerique(
  sousBranche: "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES",
  where: { partenaireId?: string; createdAt?: { gte: Date } }
): Promise<number> {
  const produits = await prisma.produit.findMany({ where: { sousBranche } });
  if (produits.length === 0) return 0;
  const idsDynamique = produits
    .filter((p) => (PRODUITS_COMMISSION_DYNAMIQUE as readonly string[]).includes(p.code))
    .map((p) => p.id);
  const idsCatalogue = produits.filter((p) => !idsDynamique.includes(p.id)).map((p) => p.id);

  const [groups, tarifs, dynRows] = await Promise.all([
    idsCatalogue.length
      ? prisma.souscription.groupBy({
          by: ["produitId", "montantPrime"],
          where: { produitId: { in: idsCatalogue }, waveStatut: "confirme", ...where },
          _count: { _all: true },
          _sum: { nombrePaiements: true },
        })
      : [],
    idsCatalogue.length
      ? prisma.tarifProduit.findMany({ where: { produitId: { in: idsCatalogue } } })
      : [],
    idsDynamique.length
      ? prisma.souscription.findMany({
          where: { produitId: { in: idsDynamique }, waveStatut: "confirme", ...where },
          select: { produitId: true, montantPrime: true, resultat: true, nombrePaiements: true },
        })
      : [],
  ]);

  const tarifMap = new Map(tarifs.map((t) => [`${t.produitId}:${t.prime}`, t]));
  let total = 0;
  for (const g of groups) {
    const primeHT = tarifMap.get(`${g.produitId}:${g.montantPrime}`)?.primeHT ?? g.montantPrime;
    total += primeHT * (g._sum.nombrePaiements ?? g._count._all);
  }
  for (const s of dynRows) {
    const resultat = s.resultat as { primeNetteHT?: number; primeNetteHT2?: number } | null;
    const primeHT = resultat?.primeNetteHT2 ?? resultat?.primeNetteHT ?? s.montantPrime;
    total += primeHT * (s.nombrePaiements ?? 1);
  }
  return total;
}

/** CA (prime HT) "Dommages" : Incendie (historique) + modèle générique ASSURANCES_DOMMAGES (SecurHome+, SecurPro Dommages). */
async function caHTIncendie(where: {
  partenaireId?: string;
  createdAt?: { gte: Date };
}): Promise<number> {
  const [groups, tarifs, generique] = await Promise.all([
    prisma.souscriptionIncendie.groupBy({
      by: ["montantPrime"],
      where: { ...where, statut: "complet" },
      _count: { _all: true },
      _sum: { nombrePaiements: true },
    }),
    prisma.tarifIncendie.findMany(),
    caHTGenerique("ASSURANCES_DOMMAGES", where),
  ]);
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  const legacy = groups.reduce(
    (s, g) =>
      s + (map.get(g.montantPrime)?.primeHT ?? g.montantPrime) * (g._sum.nombrePaiements ?? g._count._all),
    0
  );
  return legacy + generique;
}

/** CA (prime HT) "Accidents" : Accident (historique) + modèle générique ASSURANCES_ACCIDENTS (RelaxMoto/Auto, RelaxAccidents, RelaxVoyage). */
async function caHTAccident(where: {
  partenaireId?: string;
  createdAt?: { gte: Date };
}): Promise<number> {
  const [groups, tarifs, generique] = await Promise.all([
    prisma.souscriptionAccident.groupBy({
      by: ["montantPrime"],
      where: { ...where, waveStatut: "confirme" },
      _count: { _all: true },
      _sum: { nombrePaiements: true },
    }),
    prisma.tarifAccident.findMany(),
    caHTGenerique("ASSURANCES_ACCIDENTS", where),
  ]);
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  const legacy = groups.reduce(
    (s, g) =>
      s + (map.get(g.montantPrime)?.primeHT ?? g.montantPrime) * (g._sum.nombrePaiements ?? g._count._all),
    0
  );
  return legacy + generique;
}

/** Commission mensuelle (bonus de performance) d'un partenaire, sur les 31 derniers jours. */
export async function commissionMensuellePartenaire(partenaireId: string) {
  const depuis = debutPeriode31Jours();
  const [caIncendie, caAccident] = await Promise.all([
    caHTIncendie({ partenaireId, createdAt: { gte: depuis } }),
    caHTAccident({ partenaireId, createdAt: { gte: depuis } }),
  ]);

  const incendieAtteint = caIncendie >= SEUIL_MENSUEL_INCENDIE;
  const accidentAtteint = caAccident >= SEUIL_MENSUEL_ACCIDENT;

  return {
    periodeDepuis: depuis,
    incendie: {
      caHT: Math.round(caIncendie),
      seuil: SEUIL_MENSUEL_INCENDIE,
      tauxPct: TAUX_MENSUEL_INCENDIE * 100,
      seuilAtteint: incendieAtteint,
      commission: Math.round(incendieAtteint ? caIncendie * TAUX_MENSUEL_INCENDIE : 0),
    },
    accident: {
      caHT: Math.round(caAccident),
      seuil: SEUIL_MENSUEL_ACCIDENT,
      tauxPct: TAUX_MENSUEL_ACCIDENT * 100,
      seuilAtteint: accidentAtteint,
      commission: Math.round(accidentAtteint ? caAccident * TAUX_MENSUEL_ACCIDENT : 0),
    },
  };
}

/**
 * Budget mensuel global (tous partenaires confondus) : 5% du CA (prime HT)
 * du mois glissant (31 jours), pour le tableau de bord — indépendant du
 * seuil de déclenchement de la commission mensuelle par partenaire.
 */
export async function budgetMensuelGlobal() {
  const depuis = debutPeriode31Jours();
  const [caIncendie, caAccident] = await Promise.all([
    caHTIncendie({ createdAt: { gte: depuis } }),
    caHTAccident({ createdAt: { gte: depuis } }),
  ]);
  return {
    budgetIncendie: Math.round(caIncendie * 0.05),
    budgetAccident: Math.round(caAccident * 0.05),
  };
}
