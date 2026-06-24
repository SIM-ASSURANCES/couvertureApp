import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";

export const statsRouter = Router();
statsRouter.use(requireAuth("admin"));

statsRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [
      partenairesTotal,
      partenairesActifs,
      incendieTotal,
      accidentTotal,
      params,
      derniersAccident,
      derniersIncendie,
    ] = await Promise.all([
      prisma.partenaire.count(),
      prisma.partenaire.count({ where: { statut: "actif" } }),
      prisma.souscriptionIncendie.count(),
      prisma.souscriptionAccident.count(),
      prisma.parametre.findUnique({ where: { id: 1 } }),
      prisma.souscriptionAccident.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { partenaire: { select: { nomCommerce: true } } },
      }),
      prisma.souscriptionIncendie.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { partenaire: { select: { nomCommerce: true } } },
      }),
    ]);

    const primes = await prisma.souscriptionAccident.aggregate({
      _sum: { montantPrime: true },
      where: { waveStatut: "confirme" },
    });

    res.json({
      partenairesTotal,
      partenairesActifs,
      incendieTotal,
      accidentTotal,
      primesAccident: primes._sum.montantPrime ?? 0,
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

async function buildPerformance(since?: Date) {
  const params = await prisma.parametre.findUnique({ where: { id: 1 } });
  const tauxAcc = params?.tauxCommissionAccident ?? 0.1;
  const tauxInc = params?.tauxCommissionIncendie ?? 0.1;
  const primeInc = params?.primeIncendie ?? 1000;

  const partenaires = await prisma.partenaire.findMany({
    orderBy: { createdAt: "desc" },
  });

  const rows = await Promise.all(
    partenaires.map(async (p) => {
      const where = since
        ? { partenaireId: p.id, createdAt: { gte: since } }
        : { partenaireId: p.id };
      const [incendie, accAgg, accCount] = await Promise.all([
        prisma.souscriptionIncendie.count({ where }),
        prisma.souscriptionAccident.aggregate({
          _sum: { montantPrime: true },
          where: { ...where, waveStatut: "confirme" },
        }),
        prisma.souscriptionAccident.count({ where }),
      ]);
      const primesAccident = accAgg._sum.montantPrime ?? 0;
      const primesIncendie = incendie * primeInc;
      const commission = Math.round(
        primesAccident * tauxAcc + primesIncendie * tauxInc
      );
      return {
        id: p.id,
        nomCommerce: p.nomCommerce,
        localisation: p.localisation,
        clientsIncendie: incendie,
        clientsAccident: accCount,
        total: incendie + accCount,
        primesAccident,
        primesIncendie,
        commission,
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
    const { periode } = req.query as { periode?: string };
    const data = await buildPerformance(periodeToDate(periode));
    res.json(data);
  })
);

statsRouter.get(
  "/performance/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { periode } = req.query as { periode?: string };
    const { rows } = await buildPerformance(periodeToDate(periode));
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
