import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";

export const parametresRouter = Router();
parametresRouter.use(requireAuth("admin"));

/* ── Tarifications ── */

const tarifSchema = z.object({
  prime: z.number().int().positive(),
  primeHT: z.number().positive().optional().nullable(),
  fg: z.number().nonnegative().optional().nullable(),
  taxes: z.number().nonnegative().optional().nullable(),
  capitalGaranti: z.number().int().positive(),
  commission: z.number().positive(),
});

// Accident
parametresRouter.get("/tarifs/accident", asyncHandler(async (_req, res) => {
  res.json(await prisma.tarifAccident.findMany({ orderBy: { prime: "asc" } }));
}));

parametresRouter.post("/tarifs/accident", requireSuperAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const data = tarifSchema.parse(req.body);
  const t = await prisma.tarifAccident.create({ data });
  await logAction({ adminId: req.user!.sub, typeAction: "creation", objetType: "tarif_accident", objetId: String(t.id), valeurApres: data });
  res.status(201).json(t);
}));

parametresRouter.patch("/tarifs/accident/:id", requireSuperAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  const data = tarifSchema.partial().parse(req.body);
  const t = await prisma.tarifAccident.update({ where: { id }, data });
  await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "tarif_accident", objetId: String(id), valeurApres: data });
  res.json(t);
}));

parametresRouter.delete("/tarifs/accident/:id", requireSuperAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  await prisma.tarifAccident.delete({ where: { id } });
  await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "tarif_accident", objetId: String(id) });
  res.status(204).end();
}));

// Incendie
parametresRouter.get("/tarifs/incendie", asyncHandler(async (_req, res) => {
  res.json(await prisma.tarifIncendie.findMany({ orderBy: { prime: "asc" } }));
}));

parametresRouter.post("/tarifs/incendie", requireSuperAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const data = tarifSchema.parse(req.body);
  const t = await prisma.tarifIncendie.create({ data });
  await logAction({ adminId: req.user!.sub, typeAction: "creation", objetType: "tarif_incendie", objetId: String(t.id), valeurApres: data });
  res.status(201).json(t);
}));

parametresRouter.patch("/tarifs/incendie/:id", requireSuperAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  const data = tarifSchema.partial().parse(req.body);
  const t = await prisma.tarifIncendie.update({ where: { id }, data });
  await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "tarif_incendie", objetId: String(id), valeurApres: data });
  res.json(t);
}));

parametresRouter.delete("/tarifs/incendie/:id", requireSuperAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  await prisma.tarifIncendie.delete({ where: { id } });
  await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "tarif_incendie", objetId: String(id) });
  res.status(204).end();
}));

parametresRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    let p = await prisma.parametre.findUnique({ where: { id: 1 } });
    if (!p) p = await prisma.parametre.create({ data: { id: 1 } });
    res.json(p);
  })
);

const schema = z.object({
  tauxCommissionIncendie: z.number().min(0).max(1).optional(),
  tauxCommissionAccident: z.number().min(0).max(1).optional(),
  primeAccident: z.number().int().min(0).optional(),
  primeIncendie: z.number().int().min(0).optional(),
});

parametresRouter.patch(
  "/",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = schema.parse(req.body);
    const updated = await prisma.parametre.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "parametre",
      objetId: "1",
      valeurApres: data,
    });
    res.json(updated);
  })
);
