import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";

/** Référentiels IMF (Zone/Agence/Agent) — réservé aux admins ayant la branche IMF. */
export const imfRouter = Router();

/* ── Zones ── */

imfRouter.get(
  "/zones",
  asyncHandler(async (_req, res) => {
    const zones = await prisma.zoneImf.findMany({
      orderBy: { nom: "asc" },
      include: { _count: { select: { agences: true, agents: true } } },
    });
    res.json(
      zones.map((z) => ({
        ...z,
        nbAgences: z._count.agences,
        nbAgents: z._count.agents,
      }))
    );
  })
);

const zoneSchema = z.object({ nom: z.string().min(1) });

imfRouter.post(
  "/zones",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = zoneSchema.parse(req.body);
    const created = await prisma.zoneImf.create({ data });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "zone_imf",
      objetId: created.id,
      valeurApres: created,
    });
    res.status(201).json(created);
  })
);

imfRouter.patch(
  "/zones/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = zoneSchema.partial().parse(req.body);
    const updated = await prisma.zoneImf.update({ where: { id: req.params.id }, data });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "zone_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.json(updated);
  })
);

imfRouter.delete(
  "/zones/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const zone = await prisma.zoneImf.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { agences: true, agents: true } } },
    });
    if (!zone) return res.status(404).json({ error: "Introuvable" });
    if (zone._count.agences > 0 || zone._count.agents > 0) {
      return res.status(409).json({
        error: "Impossible de supprimer une zone rattachée à des agences ou des agents.",
      });
    }
    await prisma.zoneImf.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "zone_imf",
      objetId: req.params.id,
    });
    res.status(204).end();
  })
);

/* ── Agences ── */

imfRouter.get(
  "/agences",
  asyncHandler(async (_req, res) => {
    const agences = await prisma.agenceImf.findMany({
      orderBy: { nom: "asc" },
      include: { zone: { select: { nom: true } }, _count: { select: { agents: true } } },
    });
    res.json(
      agences.map((a) => ({ ...a, zoneNom: a.zone.nom, nbAgents: a._count.agents }))
    );
  })
);

const agenceSchema = z.object({
  nom: z.string().min(1),
  zoneId: z.string().min(1),
  telephone: z.string().min(1).optional(),
  localisation: z.string().min(1).optional(),
});

imfRouter.post(
  "/agences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agenceSchema.parse(req.body);
    const zone = await prisma.zoneImf.findUnique({ where: { id: data.zoneId } });
    if (!zone) return res.status(400).json({ error: "Zone introuvable" });
    const created = await prisma.agenceImf.create({ data });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "agence_imf",
      objetId: created.id,
      valeurApres: created,
    });
    res.status(201).json(created);
  })
);

imfRouter.patch(
  "/agences/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agenceSchema.partial().parse(req.body);
    if (data.zoneId) {
      const zone = await prisma.zoneImf.findUnique({ where: { id: data.zoneId } });
      if (!zone) return res.status(400).json({ error: "Zone introuvable" });
    }
    const updated = await prisma.agenceImf.update({ where: { id: req.params.id }, data });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "agence_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.json(updated);
  })
);

imfRouter.delete(
  "/agences/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const agence = await prisma.agenceImf.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { agents: true } } },
    });
    if (!agence) return res.status(404).json({ error: "Introuvable" });
    if (agence._count.agents > 0) {
      return res.status(409).json({
        error: "Impossible de supprimer une agence rattachée à des agents.",
      });
    }
    await prisma.agenceImf.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "agence_imf",
      objetId: req.params.id,
    });
    res.status(204).end();
  })
);

/* ── Agents ── */

imfRouter.get(
  "/agents",
  asyncHandler(async (_req, res) => {
    const agents = await prisma.agentImf.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        agence: { select: { nom: true, zone: { select: { nom: true } } } },
        zone: { select: { nom: true } },
      },
    });
    res.json(
      agents.map((a) => ({
        ...a,
        passwordHash: undefined,
        agenceNom: a.agence?.nom ?? null,
        zoneNom: (a.agence?.zone.nom ?? a.zone?.nom) ?? null,
      }))
    );
  })
);

const agentSchema = z
  .object({
    nom: z.string().min(1),
    prenom: z.string().min(1),
    telephone: z.string().min(1),
    email: z.string().email(),
    motDePasse: z.string().min(6),
    roleImf: z.enum(["AGENT", "RESPONSABLE_ZONE"]).default("AGENT"),
    agenceId: z.string().min(1).optional(),
    zoneId: z.string().min(1).optional(),
  })
  .refine((d) => (d.roleImf === "AGENT" ? !!d.agenceId : !!d.zoneId), {
    message: "Un agent doit être rattaché à une agence, un responsable de zone à une zone.",
    path: ["agenceId"],
  });

imfRouter.post(
  "/agents",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agentSchema.parse(req.body);
    if (data.roleImf === "AGENT") {
      const agence = await prisma.agenceImf.findUnique({ where: { id: data.agenceId! } });
      if (!agence) return res.status(400).json({ error: "Agence introuvable" });
    } else {
      const zone = await prisma.zoneImf.findUnique({ where: { id: data.zoneId! } });
      if (!zone) return res.status(400).json({ error: "Zone introuvable" });
    }
    const created = await prisma.agentImf.create({
      data: {
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        roleImf: data.roleImf,
        agenceId: data.roleImf === "AGENT" ? data.agenceId : null,
        zoneId: data.roleImf === "RESPONSABLE_ZONE" ? data.zoneId : null,
        passwordHash: await bcrypt.hash(data.motDePasse, 10),
      },
      select: {
        id: true, nom: true, prenom: true, telephone: true, email: true,
        roleImf: true, agenceId: true, zoneId: true, statut: true, createdAt: true,
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "agent_imf",
      objetId: created.id,
      valeurApres: created,
    });
    res.status(201).json(created);
  })
);

const agentPatchSchema = z.object({
  nom: z.string().min(1).optional(),
  prenom: z.string().min(1).optional(),
  telephone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  motDePasse: z.string().min(6).optional(),
  statut: z.enum(["actif", "inactif"]).optional(),
});

imfRouter.patch(
  "/agents/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agentPatchSchema.parse(req.body);
    const updated = await prisma.agentImf.update({
      where: { id: req.params.id },
      data: {
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        statut: data.statut,
        passwordHash: data.motDePasse ? await bcrypt.hash(data.motDePasse, 10) : undefined,
      },
      select: {
        id: true, nom: true, prenom: true, telephone: true, email: true,
        roleImf: true, agenceId: true, zoneId: true, statut: true, createdAt: true,
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "agent_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.json(updated);
  })
);

imfRouter.delete(
  "/agents/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.agentImf.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "agent_imf",
      objetId: req.params.id,
    });
    res.status(204).end();
  })
);

/** Routeur séparé, monté avec requireAuth("agent_imf") : profil de l'agent connecté. */
export const agentImfRouter = Router();
agentImfRouter.use(requireAuth("agent_imf"));

agentImfRouter.get(
  "/moi",
  asyncHandler(async (req: AuthedRequest, res) => {
    const a = await prisma.agentImf.findUnique({
      where: { id: req.user!.sub },
      include: { agence: { include: { zone: true } }, zone: true },
    });
    if (!a) return res.status(404).json({ error: "Introuvable" });
    res.json({
      id: a.id,
      nom: a.nom,
      prenom: a.prenom,
      email: a.email,
      telephone: a.telephone,
      roleImf: a.roleImf,
      statut: a.statut,
      agenceNom: a.agence?.nom ?? null,
      zoneNom: (a.agence?.zone.nom ?? a.zone?.nom) ?? null,
    });
  })
);
