import { Router, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireSuperAdminBranche, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import {
  calculerDevisImf,
  simulationSchema,
  checklistImf,
  numeroSinistre,
  numeroBordereau,
  statutBordereau,
  mapSinistre,
  mapBordereau,
  mapSouscriptionAdmin,
  sinistreInclude,
  bordereauInclude,
  FAMILLE_PRODUIT,
  FAMILLES,
  TAUX_PALIER,
  declarationSchema,
  transitionSchema,
  indemnisationSecurecolteSchema,
  genererBordereauSchema,
  virementSchema,
  type PieceChecklist,
  type VirementBordereau,
} from "./imf.js";
import { ensureBaremesImf, ensureProduitsImf } from "../services/provisioningImf.js";
import { newQrToken, qrDataUrlImf } from "../services/qr.js";

/**
 * Phase 3a — Réseau d'une IMF partenaire : Zones / Agences / Agents, scopés par
 * `:imfId`. Monté sous /api/imf-partenaires/:imfId/reseau (mergeParams) par
 * routes/imfPartenaires.ts, qui applique déjà requireAuth("admin") +
 * requireBranche("IMF_PARTENAIRES").
 *
 * Toutes les lectures filtrent sur `imfId`, toutes les écritures le renseignent :
 * aucune donnée ne peut fuiter d'une IMF à l'autre ni vers la branche
 * « Assurances IMF » historique (imfId null).
 */
export const imfPartenairesReseauRouter = Router({ mergeParams: true });

/** Charge l'IMF du paramètre d'URL ; 404 sinon. */
export const withImfScope = asyncHandler(async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const imfId = req.params.imfId;
  const imf = await prisma.imf.findUnique({ where: { id: imfId }, select: { id: true } });
  if (!imf) {
    res.status(404).json({ error: "IMF introuvable" });
    return;
  }
  next();
});

imfPartenairesReseauRouter.use(withImfScope);

const imfId = (req: AuthedRequest) => req.params.imfId;

/* ── Zones ── */

imfPartenairesReseauRouter.get(
  "/zones",
  asyncHandler(async (req: AuthedRequest, res) => {
    const zones = await prisma.zoneImf.findMany({
      where: { imfId: imfId(req) },
      orderBy: { nom: "asc" },
      include: { _count: { select: { agences: true, agents: true } } },
    });
    res.json(zones.map((z) => ({ ...z, nbAgences: z._count.agences, nbAgents: z._count.agents })));
  })
);

const zoneSchema = z.object({ nom: z.string().min(1) });

imfPartenairesReseauRouter.post(
  "/zones",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = zoneSchema.parse(req.body);
    const doublon = await prisma.zoneImf.findFirst({ where: { imfId: imfId(req), nom: data.nom } });
    if (doublon) return res.status(409).json({ error: "Une zone porte déjà ce nom pour cette IMF." });
    const created = await prisma.zoneImf.create({ data: { nom: data.nom, imfId: imfId(req) } });
    await logAction({ adminId: req.user!.sub, typeAction: "creation", objetType: "imf_zone", objetId: created.id, valeurApres: created });
    res.status(201).json(created);
  })
);

imfPartenairesReseauRouter.patch(
  "/zones/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = zoneSchema.partial().parse(req.body);
    const zone = await prisma.zoneImf.findFirst({ where: { id: req.params.id, imfId: imfId(req) } });
    if (!zone) return res.status(404).json({ error: "Zone introuvable" });
    if (data.nom && data.nom !== zone.nom) {
      const doublon = await prisma.zoneImf.findFirst({ where: { imfId: imfId(req), nom: data.nom } });
      if (doublon) return res.status(409).json({ error: "Une zone porte déjà ce nom pour cette IMF." });
    }
    const updated = await prisma.zoneImf.update({ where: { id: zone.id }, data });
    await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "imf_zone", objetId: updated.id, valeurAvant: zone, valeurApres: updated });
    res.json(updated);
  })
);

imfPartenairesReseauRouter.delete(
  "/zones/:id",
  requireSuperAdminBranche("IMF_PARTENAIRES"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const zone = await prisma.zoneImf.findFirst({
      where: { id: req.params.id, imfId: imfId(req) },
      include: { _count: { select: { agences: true, agents: true } } },
    });
    if (!zone) return res.status(404).json({ error: "Zone introuvable" });
    if (zone._count.agences > 0 || zone._count.agents > 0) {
      return res.status(409).json({ error: "Impossible de supprimer une zone rattachée à des agences ou des agents." });
    }
    await prisma.zoneImf.delete({ where: { id: zone.id } });
    await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "imf_zone", objetId: zone.id });
    res.status(204).end();
  })
);

/* ── Agences ── */

imfPartenairesReseauRouter.get(
  "/agences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const agences = await prisma.agenceImf.findMany({
      where: { imfId: imfId(req) },
      orderBy: { nom: "asc" },
      include: { zone: { select: { nom: true } }, _count: { select: { agents: true } } },
    });
    res.json(agences.map((a) => ({ ...a, zoneNom: a.zone.nom, nbAgents: a._count.agents })));
  })
);

const agenceSchema = z.object({
  nom: z.string().min(1),
  zoneId: z.string().min(1),
  telephone: z.string().min(1).optional(),
  localisation: z.string().min(1).optional(),
});

/** Vérifie qu'une zone appartient bien à l'IMF courante. */
async function zoneDeLImf(zoneId: string, imf: string) {
  return prisma.zoneImf.findFirst({ where: { id: zoneId, imfId: imf } });
}

imfPartenairesReseauRouter.post(
  "/agences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agenceSchema.parse(req.body);
    if (!(await zoneDeLImf(data.zoneId, imfId(req)))) return res.status(400).json({ error: "Zone introuvable pour cette IMF" });
    const created = await prisma.agenceImf.create({ data: { ...data, imfId: imfId(req) } });
    await logAction({ adminId: req.user!.sub, typeAction: "creation", objetType: "imf_agence", objetId: created.id, valeurApres: created });
    res.status(201).json(created);
  })
);

imfPartenairesReseauRouter.patch(
  "/agences/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agenceSchema.partial().parse(req.body);
    const agence = await prisma.agenceImf.findFirst({ where: { id: req.params.id, imfId: imfId(req) } });
    if (!agence) return res.status(404).json({ error: "Agence introuvable" });
    if (data.zoneId && !(await zoneDeLImf(data.zoneId, imfId(req)))) {
      return res.status(400).json({ error: "Zone introuvable pour cette IMF" });
    }
    const updated = await prisma.agenceImf.update({ where: { id: agence.id }, data });
    await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "imf_agence", objetId: updated.id, valeurAvant: agence, valeurApres: updated });
    res.json(updated);
  })
);

imfPartenairesReseauRouter.delete(
  "/agences/:id",
  requireSuperAdminBranche("IMF_PARTENAIRES"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const agence = await prisma.agenceImf.findFirst({
      where: { id: req.params.id, imfId: imfId(req) },
      include: { _count: { select: { agents: true } } },
    });
    if (!agence) return res.status(404).json({ error: "Agence introuvable" });
    if (agence._count.agents > 0) {
      return res.status(409).json({ error: "Impossible de supprimer une agence rattachée à des agents." });
    }
    await prisma.agenceImf.delete({ where: { id: agence.id } });
    await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "imf_agence", objetId: agence.id });
    res.status(204).end();
  })
);

/* ── Agents ── */

const SELECT_AGENT = {
  id: true, nom: true, prenom: true, telephone: true, email: true,
  roleImf: true, agenceId: true, zoneId: true, zones: { select: { id: true, nom: true } }, statut: true, createdAt: true,
} satisfies Prisma.AgentImfSelect;

imfPartenairesReseauRouter.get(
  "/agents",
  asyncHandler(async (req: AuthedRequest, res) => {
    const agents = await prisma.agentImf.findMany({
      where: { imfId: imfId(req) },
      orderBy: { createdAt: "desc" },
      include: {
        agence: { select: { nom: true, zone: { select: { nom: true } } } },
        zone: { select: { nom: true } },
        zones: { select: { nom: true } },
      },
    });
    res.json(
      agents.map((a) => ({
        ...a,
        passwordHash: undefined,
        agenceNom: a.agence?.nom ?? null,
        zoneNom: a.agence?.zone.nom ?? (a.zones.length ? a.zones.map((z) => z.nom).join(", ") : a.zone?.nom ?? null),
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
    roleImf: z.enum(["AGENT", "RESPONSABLE_AGENCE", "RESPONSABLE_ZONE", "CHEF_ZONE", "FINANCE_COMPTABLE"]).default("AGENT"),
    agenceId: z.string().min(1).optional(),
    zoneId: z.string().min(1).optional(),
    zoneIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (d) =>
      d.roleImf === "RESPONSABLE_ZONE" ? !!d.zoneId : d.roleImf === "CHEF_ZONE" ? !!d.zoneIds?.length : !!d.agenceId,
    {
      message:
        "Un agent ou un responsable d'agence doit être rattaché à une agence, un responsable de zone à une zone, un chef de zone à au moins une zone.",
      path: ["agenceId"],
    }
  );

/** Unicité des rôles à responsable unique, scopée à l'IMF. */
async function verifierUniciteResponsable(
  imf: string,
  roleImf: string,
  agenceId?: string | null,
  zoneId?: string | null
): Promise<string | null> {
  if (roleImf === "RESPONSABLE_AGENCE" && agenceId) {
    const e = await prisma.agentImf.findFirst({ where: { imfId: imf, roleImf: "RESPONSABLE_AGENCE", agenceId } });
    if (e) return `Cette agence a déjà un responsable (${e.prenom} ${e.nom}).`;
  }
  if (roleImf === "FINANCE_COMPTABLE" && agenceId) {
    const e = await prisma.agentImf.findFirst({ where: { imfId: imf, roleImf: "FINANCE_COMPTABLE", agenceId } });
    if (e) return `Cette agence a déjà un finance comptable (${e.prenom} ${e.nom}).`;
  }
  if (roleImf === "RESPONSABLE_ZONE" && zoneId) {
    const e = await prisma.agentImf.findFirst({ where: { imfId: imf, roleImf: "RESPONSABLE_ZONE", zoneId } });
    if (e) return `Cette zone a déjà un responsable (${e.prenom} ${e.nom}).`;
  }
  return null;
}

imfPartenairesReseauRouter.post(
  "/agents",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agentSchema.parse(req.body);
    const imf = imfId(req);

    if (data.roleImf === "RESPONSABLE_ZONE") {
      if (!(await zoneDeLImf(data.zoneId!, imf))) return res.status(400).json({ error: "Zone introuvable pour cette IMF" });
    } else if (data.roleImf === "CHEF_ZONE") {
      const zones = await prisma.zoneImf.findMany({ where: { id: { in: data.zoneIds! }, imfId: imf } });
      if (zones.length !== data.zoneIds!.length) return res.status(400).json({ error: "Zone introuvable pour cette IMF" });
    } else {
      const agence = await prisma.agenceImf.findFirst({ where: { id: data.agenceId!, imfId: imf } });
      if (!agence) return res.status(400).json({ error: "Agence introuvable pour cette IMF" });
    }

    const conflit = await verifierUniciteResponsable(imf, data.roleImf, data.agenceId, data.zoneId);
    if (conflit) return res.status(409).json({ error: conflit });

    try {
      const created = await prisma.agentImf.create({
        data: {
          nom: data.nom,
          prenom: data.prenom,
          telephone: data.telephone,
          email: data.email,
          roleImf: data.roleImf,
          imfId: imf,
          agenceId: data.roleImf === "RESPONSABLE_ZONE" || data.roleImf === "CHEF_ZONE" ? null : data.agenceId,
          zoneId: data.roleImf === "RESPONSABLE_ZONE" ? data.zoneId : null,
          zones: data.roleImf === "CHEF_ZONE" ? { connect: data.zoneIds!.map((id) => ({ id })) } : undefined,
          passwordHash: await bcrypt.hash(data.motDePasse, 10),
        },
        select: SELECT_AGENT,
      });
      await logAction({ adminId: req.user!.sub, typeAction: "creation", objetType: "imf_agent", objetId: created.id, valeurApres: created });
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return res.status(409).json({ error: "Cet e-mail est déjà utilisé par un autre agent." });
      }
      throw e;
    }
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

imfPartenairesReseauRouter.patch(
  "/agents/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agentPatchSchema.parse(req.body);
    const agent = await prisma.agentImf.findFirst({ where: { id: req.params.id, imfId: imfId(req) } });
    if (!agent) return res.status(404).json({ error: "Agent introuvable" });
    try {
      const updated = await prisma.agentImf.update({
        where: { id: agent.id },
        data: {
          nom: data.nom,
          prenom: data.prenom,
          telephone: data.telephone,
          email: data.email,
          statut: data.statut,
          passwordHash: data.motDePasse ? await bcrypt.hash(data.motDePasse, 10) : undefined,
        },
        select: SELECT_AGENT,
      });
      await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "imf_agent", objetId: updated.id, valeurAvant: { ...agent, passwordHash: undefined }, valeurApres: updated });
      res.json(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return res.status(409).json({ error: "Cet e-mail est déjà utilisé par un autre agent." });
      }
      throw e;
    }
  })
);

imfPartenairesReseauRouter.delete(
  "/agents/:id",
  requireSuperAdminBranche("IMF_PARTENAIRES"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const agent = await prisma.agentImf.findFirst({ where: { id: req.params.id, imfId: imfId(req) } });
    if (!agent) return res.status(404).json({ error: "Agent introuvable" });
    await prisma.agentImf.delete({ where: { id: agent.id } });
    await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "imf_agent", objetId: agent.id });
    res.status(204).end();
  })
);

/* ================================================================
 * Phase 3b — Simulateur scopé (barèmes, devis, souscription directe)
 * ============================================================== */

// Barèmes lus par le composant Simulateur (formulaires SECURPRO / SECURSTOCK).
imfPartenairesReseauRouter.get(
  "/baremes/securpro",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ensureBaremesImf(imfId(req));
    const rows = await prisma.imfBaremeSecurpro.findMany({ where: { imfId: imfId(req) }, orderBy: { classe: "asc" } });
    res.json(rows);
  })
);

imfPartenairesReseauRouter.get(
  "/baremes/securstock",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ensureBaremesImf(imfId(req));
    const rows = await prisma.imfBaremeSecurstock.findMany({ where: { imfId: imfId(req) }, orderBy: { classe: "asc" } });
    res.json(rows);
  })
);

// Devis + brouillon de simulation, rattaché à l'admin ET à l'IMF.
imfPartenairesReseauRouter.post(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produitCode, entrees } = simulationSchema.parse(req.body);
    await ensureProduitsImf(imfId(req));
    await ensureBaremesImf(imfId(req));
    const calc = await calculerDevisImf(produitCode, entrees, imfId(req));
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    const simulation = await prisma.simulationImf.create({
      data: {
        adminId: req.user!.sub,
        imfId: imfId(req),
        produitCode,
        entrees: JSON.parse(JSON.stringify(entrees)),
        resultat: JSON.parse(JSON.stringify(calc.resultat)),
        primeTTC: Math.round(calc.primeTTC),
      },
    });
    res.status(201).json(simulation);
  })
);

// Brouillons de l'admin courant pour cette IMF (non convertis en souscription).
imfPartenairesReseauRouter.get(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.simulationImf.findMany({
      where: { imfId: imfId(req), adminId: req.user!.sub, souscription: null },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  })
);

imfPartenairesReseauRouter.delete(
  "/simulations/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const simulation = await prisma.simulationImf.findFirst({
      where: { id: req.params.id, imfId: imfId(req) },
      include: { souscription: { select: { id: true } } },
    });
    if (!simulation) return res.status(404).json({ error: "Introuvable" });
    if (simulation.souscription) {
      return res.status(409).json({ error: "Cette simulation a déjà été convertie en souscription." });
    }
    await prisma.simulationImf.delete({ where: { id: simulation.id } });
    res.status(204).end();
  })
);

const souscriptionScopedSchema = z.object({
  simulationId: z.string().min(1),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(1),
  email: z.string().email().optional(),
  typePiece: z.enum(["cni", "passeport", "permis_conduire"]),
  numeroPiece: z.string().min(1),
  ville: z.string().min(1),
  communeQuartier: z.string().min(1),
  signature: z.string().min(1).optional(),
});

// Souscription directe (rattachée à l'admin de l'IMF, sans agent/zone/agence) —
// le portefeuille (Contrats/Sinistres/Bordereaux) est livré en 3c.
imfPartenairesReseauRouter.post(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = souscriptionScopedSchema.parse(req.body);
    const simulation = await prisma.simulationImf.findFirst({
      where: { id: data.simulationId, imfId: imfId(req), adminId: req.user!.sub },
      include: { souscription: { select: { id: true } } },
    });
    if (!simulation) return res.status(404).json({ error: "Simulation introuvable" });
    if (simulation.souscription) {
      return res.status(409).json({ error: "Cette simulation a déjà été convertie en souscription." });
    }

    const annee = new Date().getFullYear();
    const numeroPolice = `IMF-${simulation.produitCode.toUpperCase()}-${annee}-${simulation.id.slice(0, 8).toUpperCase()}`;

    const souscription = await prisma.souscriptionImf.create({
      data: {
        numeroPolice,
        adminId: req.user!.sub,
        imfId: imfId(req),
        simulationId: simulation.id,
        produitCode: simulation.produitCode,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        typePiece: data.typePiece,
        numeroPiece: data.numeroPiece,
        ville: data.ville,
        communeQuartier: data.communeQuartier,
        signature: data.signature,
        entrees: simulation.entrees as object,
        resultat: simulation.resultat as object,
        primeTTC: simulation.primeTTC,
        statut: "active",
      },
    });

    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "imf_souscription",
      objetId: souscription.id,
      valeurApres: { numeroPolice, produitCode: souscription.produitCode, primeTTC: souscription.primeTTC },
    });
    res.status(201).json(souscription);
  })
);

/* ── Lien / QR public de simulation d'un agent de l'IMF ── */

imfPartenairesReseauRouter.get(
  "/agents/:id/qr",
  asyncHandler(async (req: AuthedRequest, res) => {
    let agent = await prisma.agentImf.findFirst({ where: { id: req.params.id, imfId: imfId(req) } });
    if (!agent) return res.status(404).json({ error: "Agent introuvable" });
    if (!agent.qrImfToken) {
      agent = await prisma.agentImf.update({ where: { id: agent.id }, data: { qrImfToken: newQrToken("imf") } });
    }
    const dataUrl = await qrDataUrlImf(agent.qrImfToken!, "#004b9c");
    res.json({ token: agent.qrImfToken, dataUrl });
  })
);

/* ================================================================
 * Phase 3c — Portefeuille scopé (Contrats / Sinistres / Bordereaux)
 * ============================================================== */

const SOUSCRIPTION_ADMIN_INCLUDE = {
  agent: {
    select: {
      nom: true, prenom: true,
      agence: { select: { nom: true, zone: { select: { nom: true } } } },
      zone: { select: { nom: true } },
      zones: { select: { nom: true } },
    },
  },
  admin: { select: { nom: true } },
} as const;

/* ── Souscriptions (sélecteur de police, page Sinistres) ── */
imfPartenairesReseauRouter.get(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produitCode } = req.query as { produitCode?: string };
    const rows = await prisma.souscriptionImf.findMany({
      where: { imfId: imfId(req), produitCode: produitCode || undefined },
      orderBy: { createdAt: "desc" },
      include: SOUSCRIPTION_ADMIN_INCLUDE,
    });
    res.json(rows.map(mapSouscriptionAdmin));
  })
);

/* ── Contrats (souscriptions actives) ── */
imfPartenairesReseauRouter.get(
  "/contrats",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produitCode } = req.query as { produitCode?: string };
    const rows = await prisma.souscriptionImf.findMany({
      where: { imfId: imfId(req), statut: "active", produitCode: produitCode || undefined },
      orderBy: { createdAt: "desc" },
      include: SOUSCRIPTION_ADMIN_INCLUDE,
    });
    res.json(rows.map(mapSouscriptionAdmin));
  })
);

imfPartenairesReseauRouter.delete(
  "/contrats/:id",
  requireSuperAdminBranche("IMF_PARTENAIRES"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const souscription = await prisma.souscriptionImf.findFirst({
      where: { id: req.params.id, imfId: imfId(req) },
      include: { _count: { select: { sinistres: true } } },
    });
    if (!souscription) return res.status(404).json({ error: "Introuvable" });
    if (souscription._count.sinistres > 0) {
      return res.status(409).json({ error: "Impossible de supprimer un contrat ayant des sinistres déclarés." });
    }
    await prisma.souscriptionImf.delete({ where: { id: souscription.id } });
    await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "imf_souscription", objetId: souscription.id });
    res.status(204).end();
  })
);

/* ── Sinistres ── */
imfPartenairesReseauRouter.get(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { statut, produitCode } = req.query as { statut?: string; produitCode?: string };
    const rows = await prisma.sinistreImf.findMany({
      where: {
        imfId: imfId(req),
        statut: (statut as Prisma.SinistreImfWhereInput["statut"]) || undefined,
        souscription: produitCode ? { produitCode } : undefined,
      },
      orderBy: { createdAt: "desc" },
      include: sinistreInclude,
    });
    res.json(rows.map(mapSinistre));
  })
);

imfPartenairesReseauRouter.post(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = declarationSchema.parse(req.body);
    const souscription = await prisma.souscriptionImf.findFirst({
      where: { id: data.souscriptionId, imfId: imfId(req) },
    });
    if (!souscription) return res.status(404).json({ error: "Souscription introuvable." });
    if (souscription.produitCode === "securecolte") {
      return res.status(400).json({
        error: "SECURECOLTE n'a pas de déclaration individuelle : l'indemnisation est automatique par palier de sécheresse.",
      });
    }
    const pieces: PieceChecklist[] = checklistImf(souscription.produitCode, data.typeEvenement).map((label) => ({
      label, fournie: false,
    }));
    const created = await prisma.sinistreImf.create({
      data: {
        numeroSinistre: "TMP",
        souscriptionId: souscription.id,
        adminId: req.user!.sub,
        imfId: imfId(req),
        typeEvenement: data.typeEvenement,
        dateSurvenance: data.dateSurvenance,
        montantEstime: data.montantEstime ? Math.round(data.montantEstime) : undefined,
        pieces: pieces as unknown as object,
      },
    });
    const updated = await prisma.sinistreImf.update({
      where: { id: created.id },
      data: { numeroSinistre: numeroSinistre(souscription.produitCode, created.id) },
      include: sinistreInclude,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "imf_sinistre",
      objetId: updated.id,
      valeurApres: { numeroSinistre: updated.numeroSinistre, typeEvenement: updated.typeEvenement },
    });
    res.status(201).json(mapSinistre(updated));
  })
);

imfPartenairesReseauRouter.patch(
  "/sinistres/:id/statut",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = transitionSchema.parse(req.body);
    const sinistre = await prisma.sinistreImf.findFirst({ where: { id: req.params.id, imfId: imfId(req) } });
    if (!sinistre) return res.status(404).json({ error: "Sinistre introuvable." });
    if (data.statut === "rejete" && !data.motifRejet) {
      return res.status(400).json({ error: "Le motif de rejet est obligatoire." });
    }
    if (data.statut === "regle" && data.montantRegle === undefined) {
      return res.status(400).json({ error: "Le montant réglé est obligatoire." });
    }
    const updated = await prisma.sinistreImf.update({
      where: { id: sinistre.id },
      data: {
        statut: data.statut,
        montantRegle: data.montantRegle !== undefined ? Math.round(data.montantRegle) : undefined,
        montantIMF: data.montantIMF !== undefined ? Math.round(data.montantIMF) : undefined,
        montantSouscripteur: data.montantSouscripteur !== undefined ? Math.round(data.montantSouscripteur) : undefined,
        motifRejet: data.statut === "rejete" ? data.motifRejet : undefined,
      },
      include: sinistreInclude,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "imf_sinistre",
      objetId: updated.id,
      valeurAvant: { statut: sinistre.statut },
      valeurApres: { statut: updated.statut, montantRegle: updated.montantRegle },
    });
    res.json(mapSinistre(updated));
  })
);

imfPartenairesReseauRouter.post(
  "/sinistres/securecolte/indemnisation",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = indemnisationSecurecolteSchema.parse(req.body);
    const souscriptions = await prisma.souscriptionImf.findMany({
      where: { imfId: imfId(req), id: { in: data.souscriptionIds }, produitCode: "securecolte", statut: "active" },
    });
    if (souscriptions.length === 0) {
      return res.status(400).json({ error: "Aucune souscription SECURECOLTE active dans la sélection." });
    }
    const created = await Promise.all(
      souscriptions.map(async (s) => {
        const resultat = s.resultat as {
          capitalGaranti?: number; capitalFaible?: number; capitalMoyenne?: number; capitalForte?: number; capitalDeces?: number;
        };
        const capitalDirect =
          data.palier === "faible" ? resultat.capitalFaible
          : data.palier === "moyenne" ? resultat.capitalMoyenne
          : data.palier === "forte" ? resultat.capitalForte
          : resultat.capitalDeces;
        const montant =
          capitalDirect !== undefined
            ? Math.round(capitalDirect)
            : Math.round((resultat.capitalGaranti ?? s.primeTTC) * TAUX_PALIER[data.palier]);
        const sin = await prisma.sinistreImf.create({
          data: {
            numeroSinistre: "TMP",
            souscriptionId: s.id,
            agentId: s.agentId,
            adminId: s.adminId,
            imfId: imfId(req),
            typeEvenement: `secheresse_${data.palier}_${data.region}`,
            dateSurvenance: new Date(),
            pieces: [] as unknown as object,
            montantRegle: montant,
            statut: "regle",
          },
        });
        return prisma.sinistreImf.update({
          where: { id: sin.id },
          data: { numeroSinistre: numeroSinistre("securecolte", sin.id) },
        });
      })
    );
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "imf_indemnisation_securecolte",
      objetId: data.region,
      valeurApres: { palier: data.palier, region: data.region, nombre: created.length },
    });
    res.status(201).json({ nombre: created.length });
  })
);

imfPartenairesReseauRouter.get(
  "/sinistres/stats",
  asyncHandler(async (req: AuthedRequest, res) => {
    const [sinistres, souscriptions] = await Promise.all([
      prisma.sinistreImf.findMany({
        where: { imfId: imfId(req), statut: "regle" },
        select: { montantRegle: true, souscription: { select: { produitCode: true } } },
      }),
      prisma.souscriptionImf.findMany({
        where: { imfId: imfId(req), statut: "active" },
        select: { produitCode: true, primeTTC: true },
      }),
    ]);
    const primesParFamille: Record<string, number> = {};
    const sinistresParFamille: Record<string, number> = {};
    for (const f of FAMILLES) { primesParFamille[f] = 0; sinistresParFamille[f] = 0; }
    for (const s of souscriptions) {
      const f = FAMILLE_PRODUIT[s.produitCode] ?? s.produitCode;
      primesParFamille[f] = (primesParFamille[f] ?? 0) + s.primeTTC;
    }
    for (const s of sinistres) {
      const f = FAMILLE_PRODUIT[s.souscription.produitCode] ?? s.souscription.produitCode;
      sinistresParFamille[f] = (sinistresParFamille[f] ?? 0) + (s.montantRegle ?? 0);
    }
    const primesTotal = FAMILLES.reduce((sum, f) => sum + primesParFamille[f], 0);
    const sinistresTotal = FAMILLES.reduce((sum, f) => sum + sinistresParFamille[f], 0);
    res.json({
      global: { primes: primesTotal, sinistres: sinistresTotal, ratio: primesTotal ? sinistresTotal / primesTotal : 0 },
      parProduit: FAMILLES.map((f) => ({
        famille: f,
        primes: primesParFamille[f],
        sinistres: sinistresParFamille[f],
        ratio: primesParFamille[f] ? sinistresParFamille[f] / primesParFamille[f] : 0,
      })),
    });
  })
);

/* ── Bordereaux ── */
imfPartenairesReseauRouter.get(
  "/bordereaux",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { agenceId, statut } = req.query as { agenceId?: string; statut?: string };
    const rows = await prisma.bordereauImf.findMany({
      where: {
        imfId: imfId(req),
        agenceId: agenceId || undefined,
        statut: (statut as Prisma.BordereauImfWhereInput["statut"]) || undefined,
      },
      orderBy: { createdAt: "desc" },
      include: bordereauInclude,
    });
    res.json(rows.map(mapBordereau));
  })
);

imfPartenairesReseauRouter.get(
  "/bordereaux/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const bordereau = await prisma.bordereauImf.findFirst({
      where: { id: req.params.id, imfId: imfId(req) },
      include: bordereauInclude,
    });
    if (!bordereau) return res.status(404).json({ error: "Bordereau introuvable" });
    const ids = bordereau.souscriptionIds as unknown as string[];
    const souscriptions = await prisma.souscriptionImf.findMany({
      where: { imfId: imfId(req), id: { in: ids } },
      include: { agent: { select: { nom: true, prenom: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      ...mapBordereau(bordereau),
      souscriptions: souscriptions.map((s) => ({
        numeroPolice: s.numeroPolice,
        nom: s.nom,
        prenom: s.prenom,
        produitCode: s.produitCode,
        primeTTC: s.primeTTC,
        agentNom: s.agent ? `${s.agent.prenom} ${s.agent.nom}` : null,
        createdAt: s.createdAt,
      })),
    });
  })
);

imfPartenairesReseauRouter.post(
  "/bordereaux",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = genererBordereauSchema.parse(req.body);
    if (data.periodeFin < data.periodeDebut) {
      return res.status(400).json({ error: "La date de fin doit être postérieure à la date de début." });
    }
    const agence = await prisma.agenceImf.findFirst({ where: { id: data.agenceId, imfId: imfId(req) } });
    if (!agence) return res.status(400).json({ error: "Agence introuvable pour cette IMF" });

    const agents = await prisma.agentImf.findMany({ where: { agenceId: data.agenceId, imfId: imfId(req) }, select: { id: true } });
    const souscriptions = await prisma.souscriptionImf.findMany({
      where: {
        imfId: imfId(req),
        agentId: { in: agents.map((a) => a.id) },
        statut: "active",
        createdAt: { gte: data.periodeDebut, lte: data.periodeFin },
      },
      select: { id: true, primeTTC: true },
    });
    const primeTotal = souscriptions.reduce((sum, s) => sum + s.primeTTC, 0);

    const created = await prisma.bordereauImf.create({
      data: {
        numero: "TMP",
        agenceId: data.agenceId,
        imfId: imfId(req),
        periodeDebut: data.periodeDebut,
        periodeFin: data.periodeFin,
        souscriptionIds: souscriptions.map((s) => s.id) as unknown as object,
        nombreSouscriptions: souscriptions.length,
        primeTotal,
        genereParAdminId: req.user!.sub,
      },
    });
    const updated = await prisma.bordereauImf.update({
      where: { id: created.id },
      data: { numero: numeroBordereau(agence.nom, data.periodeDebut, created.id) },
      include: bordereauInclude,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "imf_bordereau",
      objetId: updated.id,
      valeurApres: { numero: updated.numero, nombreSouscriptions: updated.nombreSouscriptions, primeTotal: updated.primeTotal },
    });
    res.status(201).json(mapBordereau(updated));
  })
);

imfPartenairesReseauRouter.post(
  "/bordereaux/:id/virements",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = virementSchema.parse(req.body);
    const bordereau = await prisma.bordereauImf.findFirst({ where: { id: req.params.id, imfId: imfId(req) } });
    if (!bordereau) return res.status(404).json({ error: "Bordereau introuvable" });

    const virements = (bordereau.virements as unknown as VirementBordereau[]) ?? [];
    virements.push({ montant: Math.round(data.montant), date: data.date.toISOString(), reference: data.reference });
    const montantRecu = virements.reduce((sum, v) => sum + v.montant, 0);

    const updated = await prisma.bordereauImf.update({
      where: { id: bordereau.id },
      data: {
        virements: virements as unknown as object,
        montantRecu,
        statut: statutBordereau(montantRecu, bordereau.primeTotal),
      },
      include: bordereauInclude,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "imf_bordereau",
      objetId: updated.id,
      valeurApres: { montantRecu, statut: updated.statut },
    });
    res.json(mapBordereau(updated));
  })
);
