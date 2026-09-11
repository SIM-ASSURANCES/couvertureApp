import { prisma } from "../db.js";

type DateWhere = { createdAt?: { gte?: Date; lte?: Date } };
type FiltreAgent = string | null | { not: null };

/**
 * Part PAR DÉFAUT de la commission qui revient à l'agent de distribution
 * quand la souscription est faite depuis son propre espace (QR agent) — le
 * reste (25%) revient au partenaire. Depuis 2026-09, chaque agent porte sa
 * propre valeur (`AgentDistribution.tauxCommissionAgent`), réglable par le
 * partenaire ; cette constante n'est plus que le défaut à la création et le
 * repli. Quand la souscription est faite directement depuis l'espace du
 * partenaire (agentDistributionId null), le partenaire garde 100%.
 */
export const TAUX_COMMISSION_AGENT = 0.75;

/**
 * Taux de commission par défaut (fraction de la prime NETTE / HT) quand un
 * produit du modèle générique n'a pas de `Produit.tauxCommission` propre —
 * aligné sur la règle métier « 20 % de la prime nette ». Le seed force 0,20
 * sur les produits Accidents, et l'admin peut l'ajuster par produit
 * (routes/assurancesAccidents.ts, GET/PATCH /produits/:code/commission).
 */
const TAUX_COMMISSION_DEFAUT = 0.2;

/**
 * Commission d'un lot de souscriptions historiques (Incendie ou Accident),
 * groupées par `montantPrime` : `taux × prime nette (HT) × nombre de
 * paiements`. La prime nette est lue sur le barème (`TarifXxx.primeHT`), avec
 * repli sur le montant TTC si elle n'est pas renseignée. Pondère par
 * `_sum.nombrePaiements` (chaque renouvellement recrédite la même ligne),
 * sinon par le nombre de lignes.
 */
function commissionParTaux(
  groups: { montantPrime: number; _count: { _all: number }; _sum?: { nombrePaiements: number | null } }[],
  tarifs: { prime: number; primeHT: number | null }[],
  taux: number
): number {
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  return groups.reduce((s, g) => {
    const primeNette = map.get(g.montantPrime)?.primeHT ?? g.montantPrime;
    return s + primeNette * taux * (g._sum?.nombrePaiements ?? g._count._all);
  }, 0);
}

/**
 * Commission brute (100%, avant tout partage agent/partenaire) générée par
 * les souscriptions Incendie + Accident + modèle générique correspondant au
 * filtre `agentDistributionId` donné (null = ventes directes du partenaire,
 * {not: null} = ventes via un agent quelconque, une valeur précise = un seul agent).
 * Règle : `taux × prime nette (HT)`. Le taux est celui du produit
 * (`Produit.tauxCommission` pour le modèle générique, `Parametre` pour les
 * modèles historiques Incendie/Accident), 20 % par défaut.
 */
async function commissionBrute(
  partenaireId: string | undefined,
  agentDistributionId: FiltreAgent,
  dateWhere: DateWhere
): Promise<number> {
  const [incGroups, accGroups, tarifsInc, tarifsAcc, params, generique, dynamique] = await Promise.all([
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
    prisma.tarifIncendie.findMany({ select: { prime: true, primeHT: true } }),
    prisma.tarifAccident.findMany({ select: { prime: true, primeHT: true } }),
    prisma.parametre.findUnique({ where: { id: 1 } }),
    commissionSouscriptionsGeneriques({ partenaireId, agentDistributionId, ...dateWhere }),
    commissionSouscriptionsDynamiques({ partenaireId, agentDistributionId, ...dateWhere }),
  ]);

  const tauxInc = params?.tauxCommissionIncendie ?? TAUX_COMMISSION_DEFAUT;
  const tauxAcc = params?.tauxCommissionAccident ?? TAUX_COMMISSION_DEFAUT;

  return (
    commissionParTaux(incGroups, tarifsInc, tauxInc) +
    commissionParTaux(accGroups, tarifsAcc, tauxAcc) +
    generique +
    dynamique
  );
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

  const produitIds = [...new Set(groups.map((g) => g.produitId))];
  const [tarifs, produits] = await Promise.all([
    prisma.tarifProduit.findMany({
      where: { produitId: { in: produitIds } },
      select: { produitId: true, prime: true, primeHT: true },
    }),
    prisma.produit.findMany({ where: { id: { in: produitIds } }, select: { id: true, tauxCommission: true } }),
  ]);
  // Commission = taux du produit (Produit.tauxCommission, 20 % par défaut)
  // × prime NETTE (TarifProduit.primeHT, repli sur le TTC si absente).
  const tarifMap = new Map(tarifs.map((t) => [`${t.produitId}:${t.prime}`, t]));
  const tauxMap = new Map(produits.map((p) => [p.id, p.tauxCommission ?? TAUX_COMMISSION_DEFAUT]));
  return groups.reduce((s, g) => {
    const primeNette = tarifMap.get(`${g.produitId}:${g.montantPrime}`)?.primeHT ?? g.montantPrime;
    const taux = tauxMap.get(g.produitId) ?? TAUX_COMMISSION_DEFAUT;
    return s + primeNette * taux * (g._sum.nombrePaiements ?? g._count._all);
  }, 0);
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
 * Variante par-agent de commissionSouscriptionsGeneriques ci-dessus : une
 * seule passe groupée par agentDistributionId (clé "" pour les ventes
 * directes du partenaire) au lieu d'un appel séparé par agent — voir
 * commissionBruteParAgent (audit perf 2026-09-11, N+1 critique #1).
 */
async function commissionSouscriptionsGeneriquesParAgent(where: {
  partenaireId?: string;
  createdAt?: { gte?: Date; lte?: Date };
}): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const groups = await prisma.souscription.groupBy({
    by: ["agentDistributionId", "produitId", "montantPrime"],
    where: { ...where, waveStatut: "confirme" },
    _count: { _all: true },
    _sum: { nombrePaiements: true },
  });
  if (groups.length === 0) return result;

  const produitIds = [...new Set(groups.map((g) => g.produitId))];
  const [tarifs, produits] = await Promise.all([
    prisma.tarifProduit.findMany({
      where: { produitId: { in: produitIds } },
      select: { produitId: true, prime: true, primeHT: true },
    }),
    prisma.produit.findMany({ where: { id: { in: produitIds } }, select: { id: true, tauxCommission: true } }),
  ]);
  const tarifMap = new Map(tarifs.map((t) => [`${t.produitId}:${t.prime}`, t]));
  const tauxMap = new Map(produits.map((p) => [p.id, p.tauxCommission ?? TAUX_COMMISSION_DEFAUT]));
  for (const g of groups) {
    const k = g.agentDistributionId ?? "";
    const primeNette = tarifMap.get(`${g.produitId}:${g.montantPrime}`)?.primeHT ?? g.montantPrime;
    const taux = tauxMap.get(g.produitId) ?? TAUX_COMMISSION_DEFAUT;
    const montant = primeNette * taux * (g._sum.nombrePaiements ?? g._count._all);
    result.set(k, (result.get(k) ?? 0) + montant);
  }
  return result;
}

/**
 * Variante par-agent de commissionSouscriptionsDynamiques ci-dessus (voir
 * commissionSouscriptionsGeneriquesParAgent pour le principe).
 */
async function commissionSouscriptionsDynamiquesParAgent(where: {
  partenaireId?: string;
  createdAt?: { gte?: Date; lte?: Date };
}): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const produits = await prisma.produit.findMany({
    where: { code: { in: [...PRODUITS_COMMISSION_DYNAMIQUE] } },
  });
  if (produits.length === 0) return result;
  const produitParId = new Map(produits.map((p) => [p.id, p]));

  const rows = await prisma.souscription.findMany({
    where: { ...where, produitId: { in: produits.map((p) => p.id) }, waveStatut: "confirme" },
    select: { produitId: true, resultat: true, donneesSpecifiques: true, nombrePaiements: true, agentDistributionId: true },
  });
  if (rows.length === 0) return result;

  const baremes = await prisma.baremeSecurpro.findMany();
  const baremeParClasse = new Map(baremes.map((b) => [b.classe, b]));

  for (const s of rows) {
    const produit = produitParId.get(s.produitId);
    const resultat = s.resultat as { primeNetteHT?: number; primeNetteHT2?: number } | null;
    if (!produit || !resultat) continue;
    const poids = s.nombrePaiements ?? 1;
    const k = s.agentDistributionId ?? "";
    let montant: number;
    if (produit.code === "securpro_dommages") {
      const specs = s.donneesSpecifiques as { classe?: number } | null;
      const bareme = specs?.classe != null ? baremeParClasse.get(specs.classe) : undefined;
      montant = (resultat.primeNetteHT ?? 0) * (bareme?.tauxCommission ?? 0) * poids;
    } else {
      const primeBase = resultat.primeNetteHT2 ?? resultat.primeNetteHT ?? 0;
      montant = primeBase * (produit.tauxCommission ?? 0) * poids;
    }
    result.set(k, (result.get(k) ?? 0) + montant);
  }
  return result;
}

/**
 * Commission brute (100%) des ventes directes du partenaire (clé "") ET de
 * chacun de ses agents, en une seule passe — remplace N appels à
 * commissionBrute (un par agent + un pour les ventes directes), qui
 * refaisaient chacun ~7 requêtes DB IDENTIQUES (tarifs, paramètres, produits,
 * barèmes) alors qu'elles ne dépendent pas de l'agent. Audit perf
 * 2026-09-11, N+1 critique #1 : un partenaire avec 20 agents chargeait
 * jusqu'à ~300 requêtes DB pour "Mes agents" / la fiche admin d'un
 * partenaire — ramené ici à un nombre fixe de requêtes quel que soit le
 * nombre d'agents.
 */
async function commissionBruteParAgent(
  partenaireId: string,
  dateWhere: DateWhere
): Promise<Map<string, number>> {
  const [incGroups, accGroups, tarifsInc, tarifsAcc, params, generiqueMap, dynamiqueMap] = await Promise.all([
    prisma.souscriptionIncendie.groupBy({
      by: ["agentDistributionId", "montantPrime"],
      where: { partenaireId, ...dateWhere },
      _count: { _all: true },
      _sum: { nombrePaiements: true },
    }),
    prisma.souscriptionAccident.groupBy({
      by: ["agentDistributionId", "montantPrime"],
      where: { partenaireId, ...dateWhere, waveStatut: "confirme" },
      _count: { _all: true },
      _sum: { nombrePaiements: true },
    }),
    prisma.tarifIncendie.findMany({ select: { prime: true, primeHT: true } }),
    prisma.tarifAccident.findMany({ select: { prime: true, primeHT: true } }),
    prisma.parametre.findUnique({ where: { id: 1 } }),
    commissionSouscriptionsGeneriquesParAgent({ partenaireId, ...dateWhere }),
    commissionSouscriptionsDynamiquesParAgent({ partenaireId, ...dateWhere }),
  ]);

  const tauxInc = params?.tauxCommissionIncendie ?? TAUX_COMMISSION_DEFAUT;
  const tauxAcc = params?.tauxCommissionAccident ?? TAUX_COMMISSION_DEFAUT;
  const tarifIncMap = new Map(tarifsInc.map((t) => [t.prime, t]));
  const tarifAccMap = new Map(tarifsAcc.map((t) => [t.prime, t]));

  const result = new Map<string, number>();
  for (const g of incGroups) {
    const k = g.agentDistributionId ?? "";
    const primeNette = tarifIncMap.get(g.montantPrime)?.primeHT ?? g.montantPrime;
    const montant = primeNette * tauxInc * (g._sum.nombrePaiements ?? g._count._all);
    result.set(k, (result.get(k) ?? 0) + montant);
  }
  for (const g of accGroups) {
    const k = g.agentDistributionId ?? "";
    const primeNette = tarifAccMap.get(g.montantPrime)?.primeHT ?? g.montantPrime;
    const montant = primeNette * tauxAcc * (g._sum.nombrePaiements ?? g._count._all);
    result.set(k, (result.get(k) ?? 0) + montant);
  }
  for (const [k, v] of generiqueMap) result.set(k, (result.get(k) ?? 0) + v);
  for (const [k, v] of dynamiqueMap) result.set(k, (result.get(k) ?? 0) + v);
  return result;
}

/**
 * Commission totale due au partenaire : 100% de ses ventes directes
 * (agentDistributionId null) + la part partenaire de CHAQUE agent
 * (`1 - AgentDistribution.tauxCommissionAgent`, 25% par défaut) sur les
 * ventes de cet agent — le reste revient à l'agent, voir commissionTotaleAgent.
 */
export async function commissionTotalePartenaire(
  partenaireId: string,
  dateWhere: DateWhere = {}
): Promise<number> {
  const agents = await prisma.agentDistribution.findMany({
    where: { partenaireId },
    select: { id: true, tauxCommissionAgent: true },
  });
  const bruteParAgent = await commissionBruteParAgent(partenaireId, dateWhere);
  const directe = bruteParAgent.get("") ?? 0;
  const partsPartenaire = agents.reduce((s, a) => {
    const brute = bruteParAgent.get(a.id) ?? 0;
    return s + brute * (1 - (a.tauxCommissionAgent ?? TAUX_COMMISSION_AGENT));
  }, 0);
  return directe + partsPartenaire;
}

/**
 * Commission totale (part agent) de CHAQUE agent d'un partenaire, en une
 * seule passe — voir commissionBruteParAgent. Remplace N appels à
 * commissionTotaleAgent (un par agent) dans les listes "Mes agents"
 * (routes/me.ts, routes/partenaires.ts).
 */
export async function commissionTotaleAgentsDuPartenaire(
  partenaireId: string,
  agents: { id: string; tauxCommissionAgent: number | null }[]
): Promise<Map<string, number>> {
  const bruteParAgent = await commissionBruteParAgent(partenaireId, {});
  const result = new Map<string, number>();
  for (const a of agents) {
    const brute = bruteParAgent.get(a.id) ?? 0;
    result.set(a.id, brute * (a.tauxCommissionAgent ?? TAUX_COMMISSION_AGENT));
  }
  return result;
}

/**
 * Commission totale due à un agent de distribution précis : sa part
 * (`AgentDistribution.tauxCommissionAgent`, 75% par défaut) de la commission
 * brute générée par ses propres ventes (le reste revient au partenaire — voir
 * commissionTotalePartenaire).
 */
export async function commissionTotaleAgent(agentDistributionId: string): Promise<number> {
  const [brute, agent] = await Promise.all([
    commissionBrute(undefined, agentDistributionId, {}),
    prisma.agentDistribution.findUnique({
      where: { id: agentDistributionId },
      select: { tauxCommissionAgent: true },
    }),
  ]);
  return brute * (agent?.tauxCommissionAgent ?? TAUX_COMMISSION_AGENT);
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
