import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";

export const adminsRouter = Router();
adminsRouter.use(requireAuth("admin"));

adminsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const admins = await prisma.admin.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, nom: true, email: true, role: true, createdAt: true },
    });
    res.json(admins);
  })
);

const createSchema = z.object({
  nom: z.string().min(1),
  email: z.string().email(),
  motDePasse: z.string().min(6),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).default("ADMIN"),
});

adminsRouter.post(
  "/",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const created = await prisma.admin.create({
      data: {
        nom: data.nom,
        email: data.email,
        role: data.role,
        passwordHash: await bcrypt.hash(data.motDePasse, 10),
      },
      select: { id: true, nom: true, email: true, role: true, createdAt: true },
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
