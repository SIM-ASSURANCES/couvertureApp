import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";

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
      prisma.souscriptionAccident.count({ where: dateWhere }),
      prisma.parametre.findUnique({ where: { id: 1 } }),
      prisma.souscriptionAccident.findMany({
        take: 5,
        where: dateWhere,
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
      }),
      prisma.souscriptionAccident.groupBy({
        by: ["montantPrime"],
        where: { ...dateWhere, waveStatut: "confirme" },
        _count: { _all: true },
      }),
      prisma.tarifAccident.findMany(),
      prisma.tarifIncendie.findMany(),
    ]);

    const primes = await prisma.souscriptionAccident.aggregate({
      _sum: { montantPrime: true },
      where: { ...dateWhere, waveStatut: "confirme" },
    });

    // ── Chiffre d'affaires (Prime TTC − Taxes) & Taxes, depuis les barèmes ──
    function caEtTaxes(
      groups: { montantPrime: number; _count: { _all: number } }[],
      tarifs: { prime: number; taxes: number | null }[]
    ) {
      const map = new Map(tarifs.map((t) => [t.prime, t]));
      let ca = 0;
      let taxes = 0;
      for (const g of groups) {
        const t = map.get(g.montantPrime);
        const tx = t?.taxes ?? 0;
        ca += (g.montantPrime - tx) * g._count._all;
        taxes += tx * g._count._all;
      }
      return { ca, taxes };
    }

    const acc = caEtTaxes(accGroups, tarifsAcc);
    const inc = caEtTaxes(incGroups, tarifsInc);
    const caAccident = acc.ca;
    const taxesAccident = acc.taxes;
    const caIncendie = inc.ca;
    const taxesIncendie = inc.taxes;

    // Prime Incendie TTC = somme des montants payés (1000 / 2000)
    const primesIncendie = incGroups.reduce(
      (s, g) => s + g.montantPrime * g._count._all,
      0
    );

    res.json({
      partenairesTotal,
      partenairesActifs,
      incendieTotal,
      accidentTotal,
      primesAccident: primes._sum.montantPrime ?? 0,
      primesIncendie,
      chiffreAffaires: Math.round(caIncendie + caAccident),
      taxes: Math.round(taxesIncendie + taxesAccident),
      caIncendie: Math.round(caIncendie),
      caAccident: Math.round(caAccident),
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

  const [allPartenaires, tarifsInc, tarifsAcc, encaisseeRows] = await Promise.all([
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
  ]);

  const incMap = new Map(tarifsInc.map((t) => [t.prime, t]));
  const accMap = new Map(tarifsAcc.map((t) => [t.prime, t]));
  const encMap = new Map(encaisseeRows.map((r) => [r.partenaireId, r._sum.montant ?? 0]));

  const showInc = !produit || produit === "incendie";
  const showAcc = !produit || produit === "accident";

  const rows = await Promise.all(
    allPartenaires.map(async (p) => {
      const baseWhere = {
        partenaireId: p.id,
        ...(dateRange ? { createdAt: dateRange } : {}),
      };
      const incWhere = { ...baseWhere, ...(montantPrime ? { montantPrime } : {}) };
      const accWhere = { ...baseWhere, ...(montantPrime ? { montantPrime } : {}) };

      const [incGroups, accGroups, accCount] = await Promise.all([
        showInc
          ? prisma.souscriptionIncendie.groupBy({ by: ["montantPrime"], where: incWhere, _count: { _all: true } })
          : [],
        showAcc
          ? prisma.souscriptionAccident.groupBy({ by: ["montantPrime"], where: { ...accWhere, waveStatut: "confirme" }, _count: { _all: true } })
          : [],
        showAcc
          ? prisma.souscriptionAccident.count({ where: accWhere })
          : 0,
      ]);

      let primesIncendie = 0, primesIncendieHT = 0, caIncendie = 0;
      let incendieCount = 0, commission = 0;
      for (const g of incGroups) {
        const t = incMap.get(g.montantPrime);
        const n = g._count._all;
        primesIncendie += g.montantPrime * n;
        primesIncendieHT += (t?.primeHT ?? g.montantPrime) * n;
        caIncendie += (g.montantPrime - (t?.taxes ?? 0)) * n;
        commission += (t?.commission ?? 0) * n;
        incendieCount += n;
      }

      let primesAccident = 0, primesAccidentHT = 0, caAccident = 0;
      for (const g of accGroups) {
        const t = accMap.get(g.montantPrime);
        const n = g._count._all;
        primesAccident += g.montantPrime * n;
        primesAccidentHT += (t?.primeHT ?? g.montantPrime) * n;
        caAccident += (g.montantPrime - (t?.taxes ?? 0)) * n;
        commission += (t?.commission ?? 0) * n;
      }

      const ca = Math.round(caIncendie + caAccident);

      return {
        id: p.id,
        nomCommerce: p.nomCommerce,
        localisation: p.localisation,
        clientsIncendie: incendieCount,
        clientsAccident: accCount as number,
        total: incendieCount + (accCount as number),
        primesAccident: Math.round(primesAccident),
        primesAccidentHT: Math.round(primesAccidentHT),
        primesIncendie: Math.round(primesIncendie),
        primesIncendieHT: Math.round(primesIncendieHT),
        ca,
        commission: Math.round(commission),
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
          clientsIncendie: r.clientsIncendie,
          clientsAccident: r.clientsAccident,
          primesAccident: r.primesAccident,
          commission: r.commission,
        }))
      )
    );
  })
);
