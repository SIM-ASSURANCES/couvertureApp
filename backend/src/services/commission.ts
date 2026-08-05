import { prisma } from "../db.js";

type DateWhere = { createdAt?: { gte?: Date; lte?: Date } };

/**
 * Commission totale générée par un partenaire, depuis les barèmes (colonne
 * commission) — exclut les souscriptions apportées par un agent de
 * distribution (payées directement à l'agent, voir commissionTotaleAgent),
 * pour éviter tout double comptage.
 */
export async function commissionTotalePartenaire(
  partenaireId: string,
  dateWhere: DateWhere = {}
): Promise<number> {
  const [incGroups, accGroups, tarifsInc, tarifsAcc, generique] = await Promise.all([
    prisma.souscriptionIncendie.groupBy({
      by: ["montantPrime"],
      where: { partenaireId, agentDistributionId: null, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.souscriptionAccident.groupBy({
      by: ["montantPrime"],
      where: { partenaireId, agentDistributionId: null, ...dateWhere, waveStatut: "confirme" },
      _count: { _all: true },
    }),
    prisma.tarifIncendie.findMany(),
    prisma.tarifAccident.findMany(),
    commissionSouscriptionsGeneriques({ partenaireId, agentDistributionId: null, ...dateWhere }),
  ]);

  const sum = (
    groups: { montantPrime: number; _count: { _all: number } }[],
    tarifs: { prime: number; commission: number }[]
  ) => {
    const map = new Map(tarifs.map((t) => [t.prime, t]));
    return groups.reduce(
      (s, g) => s + (map.get(g.montantPrime)?.commission ?? 0) * g._count._all,
      0
    );
  };

  return sum(incGroups, tarifsInc) + sum(accGroups, tarifsAcc) + generique;
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
  agentDistributionId?: string | null;
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
 * Commission totale générée par un agent de distribution précis (sous-ensemble
 * des souscriptions du partenaire, filtrées par agentDistributionId) — payée
 * directement à l'agent via ses propres demandes de commission (voir
 * commissionStatsAgent), donc exclue du calcul de commission due du
 * partenaire (commissionTotalePartenaire).
 */
export async function commissionTotaleAgent(agentDistributionId: string): Promise<number> {
  const [incGroups, accGroups, tarifsInc, tarifsAcc, generique] = await Promise.all([
    prisma.souscriptionIncendie.groupBy({
      by: ["montantPrime"],
      where: { agentDistributionId },
      _count: { _all: true },
    }),
    prisma.souscriptionAccident.groupBy({
      by: ["montantPrime"],
      where: { agentDistributionId, waveStatut: "confirme" },
      _count: { _all: true },
    }),
    prisma.tarifIncendie.findMany(),
    prisma.tarifAccident.findMany(),
    commissionSouscriptionsGeneriques({ agentDistributionId }),
  ]);

  const sum = (
    groups: { montantPrime: number; _count: { _all: number } }[],
    tarifs: { prime: number; commission: number }[]
  ) => {
    const map = new Map(tarifs.map((t) => [t.prime, t]));
    return groups.reduce(
      (s, g) => s + (map.get(g.montantPrime)?.commission ?? 0) * g._count._all,
      0
    );
  };

  return sum(incGroups, tarifsInc) + sum(accGroups, tarifsAcc) + generique;
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
