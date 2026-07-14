import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import {
  calculerSecurpro,
  calculerSecurstock,
  palierSecheresse,
  type SecurproInput,
  type SecurstockInput,
} from "../services/tarificationImf.js";

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
    roleImf: z.enum(["AGENT", "RESPONSABLE_AGENCE", "RESPONSABLE_ZONE"]).default("AGENT"),
    agenceId: z.string().min(1).optional(),
    zoneId: z.string().min(1).optional(),
  })
  .refine((d) => (d.roleImf === "RESPONSABLE_ZONE" ? !!d.zoneId : !!d.agenceId), {
    message: "Un agent ou un responsable d'agence doit être rattaché à une agence, un responsable de zone à une zone.",
    path: ["agenceId"],
  });

/**
 * Une agence ne peut avoir qu'un seul responsable d'agence, une zone qu'un
 * seul responsable de zone. Vérifié ici plutôt qu'en contrainte SQL : Prisma
 * ne modélise pas d'index unique partiel, et le déploiement applique le
 * schéma via `prisma db push` (pas de migration SQL manuelle possible).
 */
async function verifierUniciteResponsable(
  roleImf: "AGENT" | "RESPONSABLE_AGENCE" | "RESPONSABLE_ZONE",
  agenceId?: string | null,
  zoneId?: string | null
) {
  if (roleImf === "RESPONSABLE_AGENCE" && agenceId) {
    const existant = await prisma.agentImf.findFirst({
      where: { roleImf: "RESPONSABLE_AGENCE", agenceId },
    });
    if (existant) {
      return `Cette agence a déjà un responsable (${existant.prenom} ${existant.nom}).`;
    }
  }
  if (roleImf === "RESPONSABLE_ZONE" && zoneId) {
    const existant = await prisma.agentImf.findFirst({
      where: { roleImf: "RESPONSABLE_ZONE", zoneId },
    });
    if (existant) {
      return `Cette zone a déjà un responsable (${existant.prenom} ${existant.nom}).`;
    }
  }
  return null;
}

imfRouter.post(
  "/agents",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = agentSchema.parse(req.body);
    if (data.roleImf === "RESPONSABLE_ZONE") {
      const zone = await prisma.zoneImf.findUnique({ where: { id: data.zoneId! } });
      if (!zone) return res.status(400).json({ error: "Zone introuvable" });
    } else {
      const agence = await prisma.agenceImf.findUnique({ where: { id: data.agenceId! } });
      if (!agence) return res.status(400).json({ error: "Agence introuvable" });
    }
    const conflit = await verifierUniciteResponsable(data.roleImf, data.agenceId, data.zoneId);
    if (conflit) return res.status(409).json({ error: conflit });

    const created = await prisma.agentImf.create({
      data: {
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        roleImf: data.roleImf,
        agenceId: data.roleImf === "RESPONSABLE_ZONE" ? null : data.agenceId,
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

/* ── Tarification : barèmes SECURPRO / SECURSTOCK ── */

imfRouter.get(
  "/baremes/securpro",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.baremeSecurpro.findMany({ orderBy: { classe: "asc" } });
    res.json(rows);
  })
);

const baremeSecurproSchema = z.object({
  limiteCapital: z.number().positive().optional(),
  tauxIncendie: z.number().positive().optional(),
});

imfRouter.patch(
  "/baremes/securpro/:classe",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = baremeSecurproSchema.parse(req.body);
    const updated = await prisma.baremeSecurpro.update({
      where: { classe: Number(req.params.classe) },
      data,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "bareme_securpro",
      objetId: String(updated.classe),
      valeurApres: updated,
    });
    res.json(updated);
  })
);

imfRouter.get(
  "/baremes/securstock",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.baremeSecurstock.findMany({ orderBy: { classe: "asc" } });
    res.json(rows);
  })
);

const baremeSecurstockSchema = z.object({
  limiteCapital: z.number().positive().optional(),
  tauxDommageElectrique: z.number().positive().optional(),
  tauxAutreCause: z.number().positive().optional(),
});

imfRouter.patch(
  "/baremes/securstock/:classe",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = baremeSecurstockSchema.parse(req.body);
    const updated = await prisma.baremeSecurstock.update({
      where: { classe: Number(req.params.classe) },
      data,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "bareme_securstock",
      objetId: String(updated.classe),
      valeurApres: updated,
    });
    res.json(updated);
  })
);

/* ── Catalogue à prix fixe : COUPS DURS / SECURECOLTE ── */

imfRouter.get(
  "/produits/:code/tarifs",
  asyncHandler(async (req, res) => {
    const produit = await prisma.produit.findUnique({ where: { code: req.params.code } });
    if (!produit) return res.status(404).json({ error: "Produit introuvable" });
    const tarifs = await prisma.tarifProduit.findMany({
      where: { produitId: produit.id },
      orderBy: { prime: "asc" },
    });
    res.json(tarifs);
  })
);

/* ── Indice ARC (saisie manuelle, SECURECOLTE) ── */

imfRouter.get(
  "/indice-arc",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.indiceArcImf.findMany({ orderBy: [{ annee: "desc" }, { region: "asc" }] });
    res.json(rows.map((r) => ({ ...r, palier: palierSecheresse(r.valeur, r.reference) })));
  })
);

const indiceArcSchema = z.object({
  region: z.string().min(1),
  annee: z.number().int().min(2020).max(2100),
  valeur: z.number().positive(),
  reference: z.number().positive(),
});

imfRouter.post(
  "/indice-arc",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = indiceArcSchema.parse(req.body);
    const upserted = await prisma.indiceArcImf.upsert({
      where: { region_annee: { region: data.region, annee: data.annee } },
      update: { valeur: data.valeur, reference: data.reference },
      create: data,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "indice_arc_imf",
      objetId: upserted.id,
      valeurApres: upserted,
    });
    res.status(201).json({ ...upserted, palier: palierSecheresse(upserted.valeur, upserted.reference) });
  })
);

/* ── Historique des simulations (lecture admin) ── */

imfRouter.get(
  "/simulations",
  asyncHandler(async (req, res) => {
    const { agentId } = req.query as { agentId?: string };
    const rows = await prisma.simulationImf.findMany({
      where: { agentId: agentId || undefined },
      orderBy: { createdAt: "desc" },
      include: { agent: { select: { nom: true, prenom: true } } },
    });
    res.json(rows);
  })
);

/* ── Souscriptions (lecture admin) ── */

imfRouter.get(
  "/souscriptions",
  asyncHandler(async (req, res) => {
    const { produitCode, agentId } = req.query as { produitCode?: string; agentId?: string };
    const rows = await prisma.souscriptionImf.findMany({
      where: { produitCode: produitCode || undefined, agentId: agentId || undefined },
      orderBy: { createdAt: "desc" },
      include: {
        agent: {
          select: { nom: true, prenom: true, agence: { select: { nom: true, zone: { select: { nom: true } } } }, zone: { select: { nom: true } } },
        },
      },
    });
    res.json(
      rows.map((r) => ({
        ...r,
        agentNom: `${r.agent.prenom} ${r.agent.nom}`,
        agenceNom: r.agent.agence?.nom ?? null,
        zoneNom: (r.agent.agence?.zone.nom ?? r.agent.zone?.nom) ?? null,
      }))
    );
  })
);

/**
 * Portée réseau d'un agent connecté : la liste des identifiants d'agents
 * dont il peut voir l'activité (lui-même, ou son équipe s'il est
 * responsable). Réutilisée par toutes les routes ci-dessous qui doivent
 * refléter cette portée (souscriptions, contrats, réseau).
 */
async function agentIdsDuReseau(agent: {
  id: string;
  roleImf: string;
  agenceId: string | null;
  zoneId: string | null;
}): Promise<string[]> {
  if (agent.roleImf === "AGENT") return [agent.id];

  if (agent.roleImf === "RESPONSABLE_AGENCE") {
    if (!agent.agenceId) return [agent.id];
    const membres = await prisma.agentImf.findMany({
      where: { agenceId: agent.agenceId },
      select: { id: true },
    });
    return membres.map((m) => m.id);
  }

  // RESPONSABLE_ZONE : lui-même + agents rattachés directement à la zone +
  // agents de toutes les agences de la zone.
  if (!agent.zoneId) return [agent.id];
  const agences = await prisma.agenceImf.findMany({
    where: { zoneId: agent.zoneId },
    select: { id: true },
  });
  const membres = await prisma.agentImf.findMany({
    where: { OR: [{ zoneId: agent.zoneId }, { agenceId: { in: agences.map((a) => a.id) } }] },
    select: { id: true },
  });
  return membres.map((m) => m.id);
}

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

/** Lecture seule pour le simulateur agent : limites de capital par classe en vigueur. */
agentImfRouter.get(
  "/baremes/securpro",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.baremeSecurpro.findMany({ orderBy: { classe: "asc" } });
    res.json(rows);
  })
);

/* ── Simulation de devis ── */

const securproInputSchema = z.object({
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  statutOccupation: z.enum(["proprietaire", "locataire"]),
  valeurBatiment: z.number().nonnegative().optional(),
  loyerMensuel: z.number().nonnegative().optional(),
  contenu: z.number().nonnegative(),
  dansMarche: z.boolean(),
  gardien: z.boolean(),
  extincteur: z.boolean(),
  volContenu: z.boolean(),
  majorationVolContenu: z.boolean().optional(),
  volCaisseCapital: z.number().positive().optional(),
  majorationVolCaisse: z.boolean().optional(),
  ddeCapital: z.number().positive().optional(),
  deCapital: z.number().positive().optional(),
  bdgCapital: z.number().positive().optional(),
});

const securstockInputSchema = z.object({
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  capitalDeclare: z.number().positive(),
  densite: z.enum(["aere", "normal", "compact", "tres_compact", "entasse"]),
  localisation: z.enum(["hors_marche", "abords_marche", "marche_zone_industrielle"]),
  installationElectrique: z.enum(["securisee", "acceptable", "degradee", "dangereuse"]),
  prevention: z.enum(["extincteurs_alarme_formation_eau", "extincteurs_eau", "extincteurs_seuls", "aucun"]),
  gardien: z.boolean(),
});

const catalogueInputSchema = z.object({ libelleVariante: z.string().min(1) });

const simulationSchema = z.object({
  produitCode: z.enum(["securpro", "securstock", "coupsdurs_classique", "coupsdurs_incapacite", "securecolte"]),
  entrees: z.record(z.unknown()),
});

agentImfRouter.post(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produitCode, entrees } = simulationSchema.parse(req.body);

    let resultat: unknown;
    let primeTTC: number;

    if (produitCode === "securpro") {
      const input = securproInputSchema.parse(entrees) as SecurproInput;
      const bareme = await prisma.baremeSecurpro.findUnique({ where: { classe: input.classe } });
      if (!bareme) return res.status(400).json({ error: "Barème SECURPRO introuvable pour cette classe" });
      const r = calculerSecurpro(input, { ...bareme, classe: input.classe });
      resultat = r;
      primeTTC = r.primeTTC;
    } else if (produitCode === "securstock") {
      const input = securstockInputSchema.parse(entrees) as SecurstockInput;
      const bareme = await prisma.baremeSecurstock.findUnique({ where: { classe: input.classe } });
      if (!bareme) return res.status(400).json({ error: "Barème SECURSTOCK introuvable pour cette classe" });
      const r = calculerSecurstock(input, { ...bareme, classe: input.classe });
      if ("nonAssurable" in r && r.nonAssurable) {
        return res.status(400).json({ error: r.motif });
      }
      resultat = r;
      primeTTC = (r as { primeTTC: number }).primeTTC;
    } else {
      // Catalogue à prix fixe : coupsdurs_classique / coupsdurs_incapacite / securecolte
      const { libelleVariante } = catalogueInputSchema.parse(entrees);
      const produit = await prisma.produit.findUnique({ where: { code: produitCode } });
      if (!produit) return res.status(400).json({ error: "Produit introuvable" });
      const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante } });
      if (!tarif) return res.status(400).json({ error: "Variante introuvable pour ce produit" });
      resultat = tarif;
      primeTTC = tarif.prime;
    }

    const simulation = await prisma.simulationImf.create({
      data: {
        agentId: req.user!.sub,
        produitCode,
        entrees: JSON.parse(JSON.stringify(entrees)),
        resultat: JSON.parse(JSON.stringify(resultat)),
        primeTTC: Math.round(primeTTC),
      },
    });
    res.status(201).json(simulation);
  })
);

agentImfRouter.get(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.simulationImf.findMany({
      where: { agentId: req.user!.sub },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  })
);

/* ── Conversion d'une simulation en souscription ── */

const souscriptionSchema = z.object({
  simulationId: z.string().min(1),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(1),
  email: z.string().email().optional(),
  typePiece: z.enum(["cni", "passeport", "permis_conduire"]),
  numeroPiece: z.string().min(1),
});

agentImfRouter.post(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = souscriptionSchema.parse(req.body);

    const simulation = await prisma.simulationImf.findUnique({
      where: { id: data.simulationId },
      include: { souscription: true },
    });
    if (!simulation || simulation.agentId !== req.user!.sub) {
      return res.status(404).json({ error: "Simulation introuvable" });
    }
    if (simulation.souscription) {
      return res.status(409).json({ error: "Cette simulation a déjà été convertie en souscription." });
    }

    const annee = new Date().getFullYear();
    const numeroPolice = `IMF-${simulation.produitCode.toUpperCase()}-${annee}-${simulation.id.slice(0, 8).toUpperCase()}`;

    const souscription = await prisma.souscriptionImf.create({
      data: {
        numeroPolice,
        agentId: req.user!.sub,
        simulationId: simulation.id,
        produitCode: simulation.produitCode,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        typePiece: data.typePiece,
        numeroPiece: data.numeroPiece,
        entrees: simulation.entrees as object,
        resultat: simulation.resultat as object,
        primeTTC: simulation.primeTTC,
        // Pas de passerelle de paiement bloquante côté IMF (contrairement à
        // Wave pour Accident) : la souscription est déjà le contrat.
        statut: "active",
      },
    });

    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "souscription_imf",
      objetId: souscription.id,
      valeurApres: souscription,
    });

    res.status(201).json(souscription);
  })
);

agentImfRouter.get(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneId: req.user!.zoneId ?? null,
    });
    const rows = await prisma.souscriptionImf.findMany({
      where: { agentId: { in: scope } },
      orderBy: { createdAt: "desc" },
      include: { agent: { select: { nom: true, prenom: true } } },
    });
    res.json(rows.map((r) => ({ ...r, agentNom: `${r.agent.prenom} ${r.agent.nom}` })));
  })
);

/* ── Réseau (supervision, réservé aux responsables) ── */

/** Agences de la zone du responsable de zone connecté, chacune avec ses agents. */
agentImfRouter.get(
  "/reseau/agences",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.user!.roleImf !== "RESPONSABLE_ZONE" || !req.user!.zoneId) {
      return res.status(403).json({ error: "Réservé aux responsables de zone." });
    }
    const agences = await prisma.agenceImf.findMany({
      where: { zoneId: req.user!.zoneId },
      orderBy: { nom: "asc" },
      include: {
        agents: {
          select: { id: true, nom: true, prenom: true, roleImf: true, statut: true, telephone: true, email: true },
        },
      },
    });
    res.json(agences);
  })
);

/** Agents dans la portée du responsable connecté, avec leur activité (nb souscriptions, prime totale). */
agentImfRouter.get(
  "/reseau/agents",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.user!.roleImf === "AGENT") {
      return res.status(403).json({ error: "Réservé aux responsables." });
    }
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneId: req.user!.zoneId ?? null,
    });
    const [agents, souscriptions] = await Promise.all([
      prisma.agentImf.findMany({
        where: { id: { in: scope } },
        orderBy: { nom: "asc" },
        include: {
          agence: { select: { nom: true, zone: { select: { nom: true } } } },
          zone: { select: { nom: true } },
        },
      }),
      prisma.souscriptionImf.groupBy({
        by: ["agentId"],
        where: { agentId: { in: scope } },
        _count: { _all: true },
        _sum: { primeTTC: true },
      }),
    ]);
    const statsParAgent = new Map(souscriptions.map((s) => [s.agentId, s]));
    res.json(
      agents.map((a) => ({
        id: a.id,
        nom: a.nom,
        prenom: a.prenom,
        roleImf: a.roleImf,
        statut: a.statut,
        agenceNom: a.agence?.nom ?? null,
        zoneNom: (a.agence?.zone.nom ?? a.zone?.nom) ?? null,
        nbSouscriptions: statsParAgent.get(a.id)?._count._all ?? 0,
        primeTotale: statsParAgent.get(a.id)?._sum.primeTTC ?? 0,
      }))
    );
  })
);

agentImfRouter.get(
  "/contrats",
  asyncHandler(async (req: AuthedRequest, res) => {
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneId: req.user!.zoneId ?? null,
    });
    const rows = await prisma.souscriptionImf.findMany({
      where: { agentId: { in: scope }, statut: "active" },
      orderBy: { createdAt: "desc" },
      include: { agent: { select: { nom: true, prenom: true } } },
    });
    res.json(rows.map((r) => ({ ...r, agentNom: `${r.agent.prenom} ${r.agent.nom}` })));
  })
);
