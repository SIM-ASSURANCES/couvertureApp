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

function sommeParPrime(
  groups: { montantPrime: number; _count: { _all: number } }[],
  tarifs: { prime: number; commission: number }[]
): number {
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  return groups.reduce(
    (s, g) => s + (map.get(g.montantPrime)?.commission ?? 0) * g._count._all,
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
    }),
    prisma.souscriptionAccident.groupBy({
      by: ["montantPrime"],
      where: { partenaireId, agentDistributionId, ...dateWhere, waveStatut: "confirme" },
      _count: { _all: true },
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
  });
  if (groups.length === 0) return 0;

  const tarifs = await prisma.tarifProduit.findMany({
    where: { produitId: { in: [...new Set(groups.map((g) => g.produitId))] } },
  });
  const map = new Map(tarifs.map((t) => [`${t.produitId}:${t.prime}`, t]));
  return groups.reduce(
    (s, g) => s + (map.get(`${g.produitId}:${g.montantPrime}`)?.commission ?? 0) * g._count._all,
    0
  );
}

/**
 * Produits à devis calculé dynamiquement (pas de TarifProduit, donc jamais
 * couverts par commissionSouscriptionsGeneriques ci-dessus) — le taux de
 * commission est configurable depuis la page admin Tarifs et s'applique sur
 * la prime nette HT du devis, stockée dans `Souscription.resultat` à la
 * souscription. SecurPro a un taux par classe de risque (BaremeSecurpro,
 * déjà utilisé côté IMF) ; RelaxAccidents générale et SecurHome+ ont un taux
 * unique par produit (Produit.tauxCommission).
 */
const PRODUITS_COMMISSION_DYNAMIQUE = ["relaxaccidents", "securhome_dommages", "securpro_dommages"] as const;

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
    select: { produitId: true, resultat: true, donneesSpecifiques: true },
  });
  if (rows.length === 0) return 0;

  const baremes = await prisma.baremeSecurpro.findMany();
  const baremeParClasse = new Map(baremes.map((b) => [b.classe, b]));

  return rows.reduce((total, s) => {
    const produit = produitParId.get(s.produitId);
    const resultat = s.resultat as { primeNetteHT?: number; primeNetteHT2?: number } | null;
    if (!produit || !resultat) return total;

    if (produit.code === "securpro_dommages") {
      const specs = s.donneesSpecifiques as { classe?: number } | null;
      const bareme = specs?.classe != null ? baremeParClasse.get(specs.classe) : undefined;
      return total + (resultat.primeNetteHT ?? 0) * (bareme?.tauxCommission ?? 0);
    }

    const primeBase = resultat.primeNetteHT2 ?? resultat.primeNetteHT ?? 0;
    return total + primeBase * (produit.tauxCommission ?? 0);
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

async function caHTIncendie(where: {
  partenaireId?: string;
  createdAt?: { gte: Date };
}): Promise<number> {
  const [groups, tarifs] = await Promise.all([
    prisma.souscriptionIncendie.groupBy({
      by: ["montantPrime"],
      where: { ...where, statut: "complet" },
      _count: { _all: true },
    }),
    prisma.tarifIncendie.findMany(),
  ]);
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  return groups.reduce(
    (s, g) => s + (map.get(g.montantPrime)?.primeHT ?? g.montantPrime) * g._count._all,
    0
  );
}

async function caHTAccident(where: {
  partenaireId?: string;
  createdAt?: { gte: Date };
}): Promise<number> {
  const [groups, tarifs] = await Promise.all([
    prisma.souscriptionAccident.groupBy({
      by: ["montantPrime"],
      where: { ...where, waveStatut: "confirme" },
      _count: { _all: true },
    }),
    prisma.tarifAccident.findMany(),
  ]);
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  return groups.reduce(
    (s, g) => s + (map.get(g.montantPrime)?.primeHT ?? g.montantPrime) * g._count._all,
    0
  );
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
