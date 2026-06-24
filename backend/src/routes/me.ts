import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { qrDataUrl } from "../services/qr.js";

export const meRouter = Router();
meRouter.use(requireAuth("partenaire"));

meRouter.get(
  "/overview",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const [p, incendie, accCount, accAgg, params] = await Promise.all([
      prisma.partenaire.findUnique({ where: { id }, include: { tarifIncendie: true } }),
      prisma.souscriptionIncendie.count({ where: { partenaireId: id } }),
      prisma.souscriptionAccident.count({ where: { partenaireId: id } }),
      prisma.souscriptionAccident.aggregate({
        _sum: { montantPrime: true },
        where: { partenaireId: id, waveStatut: "confirme" },
      }),
      prisma.parametre.findUnique({ where: { id: 1 } }),
    ]);
    if (!p) return res.status(404).json({ error: "Introuvable" });
    const produit = p.produitIncendie ? "incendie" : "accident";
    const primesAccident = accAgg._sum.montantPrime ?? 0;
    const primesIncendie = incendie * (p.tarifIncendie?.prime ?? params?.primeIncendie ?? 1000);
    const commission = Math.round(
      primesAccident * (params?.tauxCommissionAccident ?? 0.1) +
        primesIncendie * (params?.tauxCommissionIncendie ?? 0.1)
    );
    res.json({
      partenaire: {
        id: p.id,
        nomCommerce: p.nomCommerce,
        nomResponsable: p.nomResponsable,
        localisation: p.localisation,
      },
      produit,
      clientsIncendie: incendie,
      clientsAccident: accCount,
      primesIncendie,
      primesAccident,
      commission,
    });
  })
);

meRouter.get(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const [incendie, accident] = await Promise.all([
      prisma.souscriptionIncendie.findMany({
        where: { partenaireId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.souscriptionAccident.findMany({
        where: { partenaireId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({ incendie, accident });
  })
);

meRouter.get(
  "/qr/:produit",
  asyncHandler(async (req: AuthedRequest, res) => {
    const produit = req.params.produit as "incendie" | "accident";
    const p = await prisma.partenaire.findUnique({ where: { id: req.user!.sub } });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    const token =
      produit === "incendie" ? p.qrIncendieToken : p.qrAccidentToken;
    if (!token) return res.status(404).json({ error: "QR non disponible" });
    res.json({ produit, token, dataUrl: await qrDataUrl(produit, token) });
  })
);
