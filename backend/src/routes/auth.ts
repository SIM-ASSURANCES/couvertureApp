import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { signToken } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";

export const authRouter = Router();

authRouter.post(
  "/admin/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin || !(await bcrypt.compare(password ?? "", admin.passwordHash))) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }
    await logAction({
      adminId: admin.id,
      typeAction: "connexion",
      objetType: "admin",
      objetId: admin.id,
    });
    const token = signToken({
      sub: admin.id,
      type: "admin",
      role: admin.role,
      nom: admin.nom,
    });
    res.json({
      token,
      user: {
        id: admin.id,
        nom: admin.nom,
        email: admin.email,
        role: admin.role,
        type: "admin",
      },
    });
  })
);

authRouter.post(
  "/partenaire/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    const p = await prisma.partenaire.findUnique({ where: { email } });
    if (
      !p ||
      !p.passwordHash ||
      !(await bcrypt.compare(password ?? "", p.passwordHash))
    ) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }
    const token = signToken({
      sub: p.id,
      type: "partenaire",
      nom: p.nomResponsable,
    });
    res.json({
      token,
      user: {
        id: p.id,
        nom: p.nomResponsable,
        commerce: p.nomCommerce,
        email: p.email,
        type: "partenaire",
        produit: p.produitIncendie ? "incendie" : "accident",
      },
    });
  })
);
