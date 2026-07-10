import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";

export const adminsRouter = Router();
adminsRouter.use(requireAuth("admin"));

/** Branches effectives : un SUPER_ADMIN a toujours accès aux deux, quel que soit le stockage en base. */
function branchesEffectives(a: { role: string; branches: string[] }) {
  return a.role === "SUPER_ADMIN" ? ["INCENDIE_ACCIDENT", "RELAX"] : a.branches;
}

adminsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const admins = await prisma.admin.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, nom: true, email: true, role: true, branches: true, createdAt: true },
    });
    res.json(admins.map((a) => ({ ...a, branches: branchesEffectives(a) })));
  })
);

/* ── Profil de l'admin connecté ── */
adminsRouter.get(
  "/me",
  asyncHandler(async (req: AuthedRequest, res) => {
    const a = await prisma.admin.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, nom: true, email: true, role: true, branches: true, createdAt: true },
    });
    if (!a) return res.status(404).json({ error: "Introuvable" });
    res.json({ ...a, branches: branchesEffectives(a) });
  })
);

const profilSchema = z.object({
  nom: z.string().min(1).optional(),
  email: z.string().email().optional(),
  motDePasse: z.string().min(6).optional(),
});

adminsRouter.patch(
  "/me",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = profilSchema.parse(req.body);
    const updated = await prisma.admin.update({
      where: { id: req.user!.sub },
      data: {
        nom: data.nom,
        email: data.email,
        passwordHash: data.motDePasse
          ? await bcrypt.hash(data.motDePasse, 10)
          : undefined,
      },
      select: { id: true, nom: true, email: true, role: true, createdAt: true },
    });
    res.json(updated);
  })
);

const createSchema = z.object({
  nom: z.string().min(1),
  email: z.string().email(),
  motDePasse: z.string().min(6),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).default("ADMIN"),
  branches: z.array(z.enum(["INCENDIE_ACCIDENT", "RELAX"])).default([]),
}).refine(
  (data) => data.role === "SUPER_ADMIN" || data.branches.length > 0,
  { message: "Au moins une branche doit être assignée à un administrateur.", path: ["branches"] }
);

adminsRouter.post(
  "/",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    // Un SUPER_ADMIN reçoit toujours les deux branches automatiquement.
    const branches: ("INCENDIE_ACCIDENT" | "RELAX")[] =
      data.role === "SUPER_ADMIN" ? ["INCENDIE_ACCIDENT", "RELAX"] : data.branches;
    const created = await prisma.admin.create({
      data: {
        nom: data.nom,
        email: data.email,
        role: data.role,
        branches,
        passwordHash: await bcrypt.hash(data.motDePasse, 10),
      },
      select: { id: true, nom: true, email: true, role: true, branches: true, createdAt: true },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "admin",
      objetId: created.id,
      valeurApres: created,
    });
    res.status(201).json(created);
  })
);

adminsRouter.delete(
  "/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.params.id === req.user!.sub) {
      return res
        .status(400)
        .json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
    }
    await prisma.admin.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "admin",
      objetId: req.params.id,
    });
    res.json({ ok: true });
  })
);
