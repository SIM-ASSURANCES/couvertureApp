import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { newQrToken, qrDataUrl } from "../services/qr.js";

export const partenairesRouter = Router();
partenairesRouter.use(requireAuth("admin"));

function genMotDePasseProvisoire(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const part = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part(3)}-${part(4)}`;
}

const createSchema = z
  .object({
    nomCommerce: z.string().min(1),
    nomResponsable: z.string().min(1),
    telephone: z.string().min(1),
    localisation: z.string().min(1),
    typeCommerce: z.enum(["Electronique", "Alimentation", "Textile", "Autre"]),
    produit: z.enum(["incendie", "accident"]),
    tarifIncendieId: z.number().int().positive().optional(),
    email: z.string().email().optional().or(z.literal("")),
  })
  .refine(
    (d) => d.produit !== "incendie" || d.tarifIncendieId != null,
    { message: "Un tarif incendie est requis pour ce produit", path: ["tarifIncendieId"] }
  );

async function withCounts(id: string) {
  const [incendie, accident] = await Promise.all([
    prisma.souscriptionIncendie.count({ where: { partenaireId: id } }),
    prisma.souscriptionAccident.count({ where: { partenaireId: id } }),
  ]);
  return { clientsIncendie: incendie, clientsAccident: accident };
}

partenairesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, statut } = req.query as { q?: string; statut?: string };
    const list = await prisma.partenaire.findMany({
      where: {
        statut: statut === "actif" || statut === "inactif" ? statut : undefined,
        OR: q
          ? [
              { nomCommerce: { contains: q, mode: "insensitive" } },
              { localisation: { contains: q, mode: "insensitive" } },
              { nomResponsable: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { incendie: true, accident: true } },
        tarifIncendie: true,
      },
    });
    res.json(
      list.map((p) => ({
        ...p,
        passwordHash: undefined,
        clientsIncendie: p._count.incendie,
        clientsAccident: p._count.accident,
      }))
    );
  })
);

partenairesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const p = await prisma.partenaire.findUnique({
      where: { id: req.params.id },
      include: { tarifIncendie: true },
    });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    const counts = await withCounts(p.id);
    res.json({ ...p, passwordHash: undefined, ...counts });
  })
);

partenairesRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const isIncendie = data.produit === "incendie";

    const motDePasseProvisoire = data.email ? genMotDePasseProvisoire() : null;

    const created = await prisma.partenaire.create({
      data: {
        nomCommerce: data.nomCommerce,
        nomResponsable: data.nomResponsable,
        telephone: data.telephone,
        localisation: data.localisation,
        typeCommerce: data.typeCommerce,
        produitIncendie: isIncendie,
        produitAccident: !isIncendie,
        qrIncendieToken: isIncendie ? newQrToken("inc") : null,
        qrAccidentToken: !isIncendie ? newQrToken("acc") : null,
        tarifIncendieId: isIncendie ? data.tarifIncendieId : null,
        email: data.email || null,
        passwordHash: motDePasseProvisoire
          ? await bcrypt.hash(motDePasseProvisoire, 10)
          : null,
      },
      include: { tarifIncendie: true },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "partenaire",
      objetId: created.id,
      valeurApres: { ...created, passwordHash: undefined },
    });
    res.status(201).json({
      ...created,
      passwordHash: undefined,
      motDePasseProvisoire,
    });
  })
);

partenairesRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const before = await prisma.partenaire.findUnique({
      where: { id: req.params.id },
    });
    if (!before) return res.status(404).json({ error: "Introuvable" });
    const data = createSchema.partial().parse(req.body);

    const isIncendie = data.produit != null
      ? data.produit === "incendie"
      : before.produitIncendie;

    const updated = await prisma.partenaire.update({
      where: { id: req.params.id },
      data: {
        nomCommerce: data.nomCommerce,
        nomResponsable: data.nomResponsable,
        telephone: data.telephone,
        localisation: data.localisation,
        typeCommerce: data.typeCommerce,
        produitIncendie: data.produit != null ? isIncendie : undefined,
        produitAccident: data.produit != null ? !isIncendie : undefined,
        tarifIncendieId: data.produit != null
          ? (isIncendie ? (data.tarifIncendieId ?? null) : null)
          : data.tarifIncendieId,
        email: data.email === "" ? null : data.email,
        qrIncendieToken: data.produit != null && isIncendie && !before.qrIncendieToken
          ? newQrToken("inc")
          : undefined,
        qrAccidentToken: data.produit != null && !isIncendie && !before.qrAccidentToken
          ? newQrToken("acc")
          : undefined,
        passwordHash: data.motDePasse
          ? await bcrypt.hash(data.motDePasse, 10)
          : undefined,
      },
      include: { tarifIncendie: true },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "partenaire",
      objetId: updated.id,
      valeurAvant: { ...before, passwordHash: undefined },
      valeurApres: { ...updated, passwordHash: undefined },
    });
    res.json({ ...updated, passwordHash: undefined });
  })
);

partenairesRouter.post(
  "/:id/statut",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { statut } = req.body as { statut: "actif" | "inactif" };
    const updated = await prisma.partenaire.update({
      where: { id: req.params.id },
      data: { statut },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "partenaire",
      objetId: updated.id,
      valeurApres: { statut },
    });
    res.json({ ...updated, passwordHash: undefined });
  })
);

partenairesRouter.delete(
  "/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const counts = await withCounts(req.params.id);
    if (counts.clientsIncendie + counts.clientsAccident > 0) {
      return res
        .status(409)
        .json({ error: "Impossible : des clients sont liés à ce partenaire" });
    }
    await prisma.partenaire.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "partenaire",
      objetId: req.params.id,
    });
    res.json({ ok: true });
  })
);

partenairesRouter.get(
  "/:id/qr/:produit",
  asyncHandler(async (req, res) => {
    const produit = req.params.produit as "incendie" | "accident";
    const p = await prisma.partenaire.findUnique({
      where: { id: req.params.id },
    });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    const token =
      produit === "incendie" ? p.qrIncendieToken : p.qrAccidentToken;
    if (!token)
      return res.status(404).json({ error: "QR non disponible pour ce produit" });
    const dataUrl = await qrDataUrl(produit, token);
    res.json({ produit, token, dataUrl });
  })
);
