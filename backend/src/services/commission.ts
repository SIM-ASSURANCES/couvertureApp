import { prisma } from "../db.js";

type DateWhere = { createdAt?: { gte?: Date; lte?: Date } };

/** Commission totale générée par un partenaire, depuis les barèmes (colonne commission). */
export async function commissionTotalePartenaire(
  partenaireId: string,
  dateWhere: DateWhere = {}
): Promise<number> {
  const [incGroups, accGroups, tarifsInc, tarifsAcc] = await Promise.all([
    prisma.souscriptionIncendie.groupBy({
      by: ["montantPrime"],
      where: { partenaireId, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.souscriptionAccident.groupBy({
      by: ["montantPrime"],
      where: { partenaireId, ...dateWhere, waveStatut: "confirme" },
      _count: { _all: true },
    }),
    prisma.tarifIncendie.findMany(),
    prisma.tarifAccident.findMany(),
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

  return sum(incGroups, tarifsInc) + sum(accGroups, tarifsAcc);
}

/** Commission encaissée = somme des demandes validées (optionnellement filtrée par date de traitement). */
export async function commissionEncaisseePartenaire(
  partenaireId: string,
  traiteeRange?: { gte?: Date; lte?: Date }
): Promise<number> {
  const agg = await prisma.demandeCommission.aggregate({
    _sum: { montant: true },
    where: {
      partenaireId,
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
