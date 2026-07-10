import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { signToken, type BrancheAcces } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";

export const authRouter = Router();

/**
 * Branches effectives d'un admin : un SUPER_ADMIN a toujours accès aux deux,
 * quel que soit le contenu stocké en base.
 */
function branchesEffectives(admin: { role: string; branches: string[] }): BrancheAcces[] {
  return admin.role === "SUPER_ADMIN"
    ? ["INCENDIE_ACCIDENT", "RELAX"]
    : (admin.branches as BrancheAcces[]);
}

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
    const branches = branchesEffectives(admin);
    const token = signToken({
      sub: admin.id,
      type: "admin",
      role: admin.role,
      nom: admin.nom,
      branches,
    });
    res.json({
      token,
      user: {
        id: admin.id,
        nom: admin.nom,
        email: admin.email,
        role: admin.role,
        branches,
        type: "admin",
      },
    });
  })
);

/** Connexion unifiée : détecte automatiquement admin ou partenaire */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password)
      return res.status(400).json({ error: "Email et mot de passe requis" });

    const admin = await prisma.admin.findUnique({ where: { email } });
    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      await logAction({
        adminId: admin.id,
        typeAction: "connexion",
        objetType: "admin",
        objetId: admin.id,
      });
      const branches = branchesEffectives(admin);
      const token = signToken({ sub: admin.id, type: "admin", role: admin.role, nom: admin.nom, branches });
      return res.json({
        token,
        user: { id: admin.id, nom: admin.nom, email: admin.email, role: admin.role, branches, type: "admin" },
      });
    }

    const p = await prisma.partenaire.findUnique({ where: { email } });
    if (p && p.passwordHash && (await bcrypt.compare(password, p.passwordHash))) {
      const token = signToken({ sub: p.id, type: "partenaire", nom: p.nomResponsable });
      return res.json({
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
    }

    return res.status(401).json({ error: "Identifiants invalides" });
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
