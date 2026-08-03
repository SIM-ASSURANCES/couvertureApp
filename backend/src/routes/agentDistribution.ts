import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { qrDataUrl } from "../services/qr.js";

/** Espace agent de distribution (Incendie/Accident) : lecture seule de son activité + QR + mot de passe. */
export const agentDistributionRouter = Router();
agentDistributionRouter.use(requireAuth("agent_distribution"));

agentDistributionRouter.get(
  "/moi",
  asyncHandler(async (req: AuthedRequest, res) => {
    const a = await prisma.agentDistribution.findUnique({
      where: { id: req.user!.sub },
      include: { partenaire: { select: { nomCommerce: true, produitIncendie: true, produitAccident: true } } },
    });
    if (!a) return res.status(404).json({ error: "Introuvable" });
    res.json({
      id: a.id,
      nom: a.nom,
      telephone: a.telephone,
      localisation: a.localisation,
      statut: a.statut,
      partenaireNom: a.partenaire.nomCommerce,
      produit: a.partenaire.produitIncendie ? "incendie" : "accident",
    });
  })
);

agentDistributionRouter.get(
  "/qr/:produit",
  asyncHandler(async (req: AuthedRequest, res) => {
    const a = await prisma.agentDistribution.findUnique({ where: { id: req.user!.sub } });
    if (!a) return res.status(404).json({ error: "Introuvable" });
    const produit = req.params.produit as "incendie1000" | "incendie2000" | "accident";
    const token =
      produit === "incendie1000" ? a.qrIncendie1000Token
      : produit === "incendie2000" ? a.qrIncendie2000Token
      : a.qrAccidentToken;
    if (!token) return res.status(404).json({ error: "QR non disponible" });
    const qrProduit: "incendie" | "accident" = produit === "accident" ? "accident" : "incendie";
    res.json({ produit, token, dataUrl: await qrDataUrl(qrProduit, token) });
  })
);

agentDistributionRouter.get(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const agentDistributionId = req.user!.sub;
    const [incendie, accident] = await Promise.all([
      prisma.souscriptionIncendie.findMany({
        where: { agentDistributionId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.souscriptionAccident.findMany({
        where: { agentDistributionId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({
      incendie: incendie.map((s) => ({
        id: s.id,
        produit: "incendie" as const,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        montantPrime: s.montantPrime,
        statut: s.statut,
        createdAt: s.createdAt,
      })),
      accident: accident.map((s) => ({
        id: s.id,
        produit: "accident" as const,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        montantPrime: s.montantPrime,
        statut: s.waveStatut,
        createdAt: s.createdAt,
      })),
    });
  })
);

const motDePasseSchema = z.object({
  ancienMotDePasse: z.string().min(1),
  nouveauMotDePasse: z.string().min(6),
});

agentDistributionRouter.patch(
  "/mot-de-passe",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = motDePasseSchema.parse(req.body);
    const a = await prisma.agentDistribution.findUnique({ where: { id: req.user!.sub } });
    if (!a || !a.passwordHash || !(await bcrypt.compare(data.ancienMotDePasse, a.passwordHash))) {
      return res.status(401).json({ error: "Ancien mot de passe incorrect" });
    }
    await prisma.agentDistribution.update({
      where: { id: a.id },
      data: { passwordHash: await bcrypt.hash(data.nouveauMotDePasse, 10) },
    });
    res.json({ ok: true });
  })
);
