import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { signToken, type BrancheAcces } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { numeroPoliceIncendieSynthetique } from "../services/notify.js";

export const authRouter = Router();

// Toutes les routes de connexion ci-dessous doivent forcer `email`/`password`/
// `telephone`/`motDePasse` à être des chaînes : sans ceci, un login basé sur
// `findFirst` (client/agent-distribution) accepterait un objet-filtre Prisma
// (ex. `{"telephone":{"startsWith":"07"}}`) à la place d'une valeur exacte,
// permettant d'énumérer des comptes sans en connaître le numéro.
const identifiantsSchema = z.object({
  email: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(200).optional(),
  telephone: z.string().min(1).max(40).optional(),
  motDePasse: z.string().min(1).max(200).optional(),
});

/**
 * Branches effectives d'un admin : un SUPER_ADMIN a toujours accès aux deux,
 * quel que soit le contenu stocké en base.
 */
function branchesEffectives(admin: { role: string; branches: string[] }): BrancheAcces[] {
  return admin.role === "SUPER_ADMIN"
    ? ["INCENDIE_ACCIDENT", "RELAX", "IMF"]
    : (admin.branches as BrancheAcces[]);
}

authRouter.post(
  "/admin/login",
  asyncHandler(async (req, res) => {
    const { email, password } = identifiantsSchema.parse(req.body ?? {});
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
    const { email, password } = identifiantsSchema.parse(req.body ?? {});
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
      // QR "sélecteur" (refonte Assurances Accidents/Dommages) — au plus un
      // par partenaire, voir contrainte d'unicité sur QrCode.
      // QR sélecteur — au plus un par partenaire (voir contrainte d'unicité
      // sur QrCode) : filtré sur `produitId: null` pour couvrir aussi bien
      // l'ancien QR scopé à une Assurance (`sousBranche` renseigné) que le
      // nouveau QR unique (`sousBranche` null, refonte 2026-08-07).
      const qrSelecteur = await prisma.qrCode.findFirst({
        where: { partenaireId: p.id, agentDistributionId: null, produitId: null },
        select: { sousBranche: true },
      });
      return res.json({
        token,
        user: {
          id: p.id,
          nom: p.nomResponsable,
          commerce: p.nomCommerce,
          email: p.email,
          type: "partenaire",
          produit: p.produitIncendie ? "incendie" : "accident",
          sousBranche: qrSelecteur?.sousBranche ?? null,
          qrUnifie: !!qrSelecteur && qrSelecteur.sousBranche == null,
        },
      });
    }

    const a = await prisma.agentImf.findUnique({
      where: { email },
      include: { agence: { include: { zone: true } }, zone: true, zones: true },
    });
    if (a && (await bcrypt.compare(password, a.passwordHash))) {
      const token = signToken({
        sub: a.id,
        type: "agent_imf",
        nom: `${a.prenom} ${a.nom}`,
        agenceId: a.agenceId ?? undefined,
        zoneIds: a.zones.length ? a.zones.map((z) => z.id) : a.zoneId ? [a.zoneId] : [],
        roleImf: a.roleImf,
      });
      return res.json({
        token,
        user: {
          id: a.id,
          nom: `${a.prenom} ${a.nom}`,
          email: a.email,
          type: "agent_imf",
          roleImf: a.roleImf,
          agenceNom: a.agence?.nom ?? null,
          zoneNom: a.agence?.zone.nom ?? (a.zones.length ? a.zones.map((z) => z.nom).join(", ") : a.zone?.nom ?? null),
        },
      });
    }

    return res.status(401).json({ error: "Identifiants invalides" });
  })
);

authRouter.post(
  "/agent-imf/login",
  asyncHandler(async (req, res) => {
    const { email, password } = identifiantsSchema.parse(req.body ?? {});
    const a = await prisma.agentImf.findUnique({
      where: { email },
      include: { agence: { include: { zone: true } }, zone: true, zones: true },
    });
    if (!a || !(await bcrypt.compare(password ?? "", a.passwordHash))) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }
    const token = signToken({
      sub: a.id,
      type: "agent_imf",
      nom: `${a.prenom} ${a.nom}`,
      agenceId: a.agenceId ?? undefined,
      zoneIds: a.zones.length ? a.zones.map((z) => z.id) : a.zoneId ? [a.zoneId] : [],
      roleImf: a.roleImf,
    });
    res.json({
      token,
      user: {
        id: a.id,
        nom: `${a.prenom} ${a.nom}`,
        email: a.email,
        type: "agent_imf",
        roleImf: a.roleImf,
        agenceNom: a.agence?.nom ?? null,
        zoneNom: a.agence?.zone.nom ?? (a.zones.length ? a.zones.map((z) => z.nom).join(", ") : a.zone?.nom ?? null),
      },
    });
  })
);

/**
 * Connexion de l'espace client, tous produits confondus (téléphone + mot de
 * passe reçu par SMS à la première confirmation du contrat — voir refonte
 * "espace client universel", paiementWave.ts/services/accident.ts/routes/
 * public.ts). Un client peut avoir plusieurs contrats sur le même téléphone,
 * y compris sur des produits/modèles différents (ex. moto puis Incendie) —
 * la connexion cible le plus récent contrat activé pour ce numéro, tous
 * modèles confondus.
 */
authRouter.post(
  "/client/login",
  asyncHandler(async (req, res) => {
    const { telephone, motDePasse } = identifiantsSchema.parse(req.body ?? {});
    if (!telephone || !motDePasse) {
      return res.status(400).json({ error: "Téléphone et mot de passe requis" });
    }
    const [generique, incendie, accident] = await Promise.all([
      prisma.souscription.findFirst({
        where: { telephone, clientPasswordHash: { not: null } },
        orderBy: { createdAt: "desc" },
        include: { produit: { select: { code: true, libelle: true } } },
      }),
      prisma.souscriptionIncendie.findFirst({
        where: { telephone, clientPasswordHash: { not: null } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.souscriptionAccident.findFirst({
        where: { telephone, clientPasswordHash: { not: null } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const candidats = [
      generique && { produitType: "generique" as const, row: generique, hash: generique.clientPasswordHash },
      incendie && { produitType: "incendie" as const, row: incendie, hash: incendie.clientPasswordHash },
      accident && { produitType: "accident" as const, row: accident, hash: accident.clientPasswordHash },
    ].filter((c): c is NonNullable<typeof c> => !!c);
    candidats.sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());
    const plusRecent = candidats[0];

    if (!plusRecent || !plusRecent.hash || !(await bcrypt.compare(motDePasse, plusRecent.hash))) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const { produitType, row } = plusRecent;
    const nom = `${row.prenom ?? ""} ${row.nom ?? ""}`.trim();
    const produitCode = produitType === "generique" ? generique!.produit.code : produitType;
    const produitLibelle =
      produitType === "generique"
        ? generique!.produit.libelle
        : produitType === "incendie"
        ? "Incendie Habitation en Inclusion"
        : "Accident (historique)";
    const numeroPolice =
      produitType === "incendie"
        ? numeroPoliceIncendieSynthetique(row.id, (row as { dateDebut: Date | null }).dateDebut ?? row.createdAt)
        : (row as { numeroPolice: string | null }).numeroPolice;

    const token = signToken({ sub: row.id, type: "client", produitType, nom });
    res.json({
      token,
      user: {
        id: row.id,
        nom,
        telephone: row.telephone,
        type: "client",
        produitType,
        produit: produitCode,
        produitLibelle,
        numeroPolice,
      },
    });
  })
);

/**
 * Connexion de l'espace agent de distribution (Incendie/Accident) —
 * téléphone + mot de passe communiqué par le partenaire à la création.
 */
authRouter.post(
  "/agent-distribution/login",
  asyncHandler(async (req, res) => {
    const { telephone, motDePasse } = identifiantsSchema.parse(req.body ?? {});
    if (!telephone || !motDePasse) {
      return res.status(400).json({ error: "Téléphone et mot de passe requis" });
    }
    const a = await prisma.agentDistribution.findFirst({
      where: { telephone, statut: "actif", partenaire: { statut: "actif" } },
      include: { partenaire: { select: { nomCommerce: true, produitIncendie: true, produitAccident: true } } },
    });
    if (!a || !a.passwordHash || !(await bcrypt.compare(motDePasse, a.passwordHash))) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }
    const produit = a.partenaire.produitIncendie ? "incendie" : "accident";
    const token = signToken({ sub: a.id, type: "agent_distribution", nom: a.nom });
    res.json({
      token,
      user: {
        id: a.id,
        nom: a.nom,
        telephone: a.telephone,
        type: "agent_distribution",
        produit,
        partenaireNom: a.partenaire.nomCommerce,
      },
    });
  })
);

authRouter.post(
  "/partenaire/login",
  asyncHandler(async (req, res) => {
    const { email, password } = identifiantsSchema.parse(req.body ?? {});
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
    // Voir le commentaire équivalent plus haut (login) : `produitId: null`
    // couvre à la fois l'ancien QR scopé à une Assurance et le nouveau QR
    // unique (refonte 2026-08-07).
    const qrSelecteur = await prisma.qrCode.findFirst({
      where: { partenaireId: p.id, agentDistributionId: null, produitId: null },
      select: { sousBranche: true },
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
        sousBranche: qrSelecteur?.sousBranche ?? null,
        qrUnifie: !!qrSelecteur && qrSelecteur.sousBranche == null,
      },
    });
  })
);
