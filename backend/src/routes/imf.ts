import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { StatutSinistreImf, StatutBordereauImf } from "@prisma/client";
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
        admin: { select: { nom: true } },
      },
    });
    res.json(rows.map(mapSouscriptionAdmin));
  })
);

/**
 * Sérialise une souscription IMF pour l'espace admin en aplatissant le nom de
 * l'agent, de l'agence et de la zone. Une souscription faite directement par
 * l'admin n'a pas d'agent : agentNom/agenceNom/zoneNom valent alors null et
 * `directe` = true (elle sera regroupée à part, hors des zones/agences).
 */
function mapSouscriptionAdmin(r: {
  agent: { nom: string; prenom: string; agence: { nom: string; zone: { nom: string } } | null; zone: { nom: string } | null } | null;
  admin: { nom: string } | null;
  [k: string]: unknown;
}) {
  return {
    ...r,
    agentNom: r.agent ? `${r.agent.prenom} ${r.agent.nom}` : null,
    agenceNom: r.agent?.agence?.nom ?? null,
    zoneNom: (r.agent?.agence?.zone.nom ?? r.agent?.zone?.nom) ?? null,
    adminNom: r.admin?.nom ?? null,
    directe: !r.agent,
  };
}

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

agentImfRouter.get(
  "/baremes/securstock",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.baremeSecurstock.findMany({ orderBy: { classe: "asc" } });
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

/**
 * COUPS DURS uniquement : déclaration de bonne santé (conditionne l'acceptation)
 * et répartition des bénéficiaires en cas de décès (parts en % du capital,
 * doivent totaliser 100 — exigé seulement pour la variante "deces", les
 * variantes "maladie"/IT ne versant pas à des bénéficiaires tiers).
 */
const santeSchema = z.object({
  taille: z.number().positive().optional(),
  poids: z.number().positive().optional(),
  fumeur: z.boolean(),
  cigarettesParJour: z.number().nonnegative().optional(),
  sportif: z.boolean(),
  sportifNiveau: z.enum(["amateur", "professionnel"]).optional(),
  infirmite: z.boolean(),
  infirmiteTaux: z.string().optional(),
  infirmiteNature: z.string().optional(),
  maladieRecente: z.boolean(),
  maladieRecentePrecisions: z.string().optional(),
  touxFievre: z.boolean(),
  diarrheeFrequente: z.boolean(),
  transfusion: z.boolean(),
  enceinte: z.boolean(),
  affections: z
    .array(
      z.enum([
        "cancer", "diabete", "hypertension", "cardiaque", "vih",
        "ulcere", "fatigue", "maladie_sang", "insuffisance_renale", "asthme",
      ])
    )
    .default([]),
  affectionsPrecisions: z.string().optional(),
  familleBonneSante: z.boolean(),
  familleBonneSantePrecisions: z.string().optional(),
  familleHospitalisee: z.boolean(),
  familleHospitaliseePrecisions: z.string().optional(),
});

const beneficiaireSchema = z.object({
  nom: z.string().min(1),
  contact: z.string().min(1),
  lien: z.string().min(1),
  pourcentage: z.number().positive(),
});

const coupsdursInputSchema = z
  .object({
    libelleVariante: z.string().min(1),
    sante: santeSchema,
    beneficiaires: z.array(beneficiaireSchema).optional(),
  })
  .refine(
    (d) =>
      d.libelleVariante !== "deces" ||
      (!!d.beneficiaires &&
        d.beneficiaires.length > 0 &&
        Math.round(d.beneficiaires.reduce((s, b) => s + b.pourcentage, 0)) === 100),
    { message: "La somme des parts des bénéficiaires doit être égale à 100%.", path: ["beneficiaires"] }
  );

const simulationSchema = z.object({
  produitCode: z.enum(["securpro", "securstock", "coupsdurs_classique", "coupsdurs_incapacite", "securecolte"]),
  entrees: z.record(z.unknown()),
});

/**
 * Calcul d'un devis IMF à partir du produit et des entrées, partagé entre le
 * simulateur agent (`/agent-imf/simulations`) et le simulateur admin
 * (`/imf/simulations`). Renvoie soit le résultat + la prime TTC, soit un
 * message d'erreur métier (barème/variante introuvable, risque non assurable).
 */
async function calculerDevisImf(
  produitCode: string,
  entrees: Record<string, unknown>
): Promise<{ ok: true; resultat: unknown; primeTTC: number } | { ok: false; error: string }> {
  if (produitCode === "securpro") {
    const input = securproInputSchema.parse(entrees) as SecurproInput;
    const bareme = await prisma.baremeSecurpro.findUnique({ where: { classe: input.classe } });
    if (!bareme) return { ok: false, error: "Barème SECURPRO introuvable pour cette classe" };
    const r = calculerSecurpro(input, { ...bareme, classe: input.classe });
    return { ok: true, resultat: r, primeTTC: r.primeTTC };
  }
  if (produitCode === "securstock") {
    const input = securstockInputSchema.parse(entrees) as SecurstockInput;
    const bareme = await prisma.baremeSecurstock.findUnique({ where: { classe: input.classe } });
    if (!bareme) return { ok: false, error: "Barème SECURSTOCK introuvable pour cette classe" };
    const r = calculerSecurstock(input, { ...bareme, classe: input.classe });
    if ("nonAssurable" in r && r.nonAssurable) return { ok: false, error: r.motif };
    return { ok: true, resultat: r, primeTTC: (r as { primeTTC: number }).primeTTC };
  }
  // Catalogue à prix fixe : coupsdurs_classique / coupsdurs_incapacite / securecolte
  const estCoupsdurs = produitCode === "coupsdurs_classique" || produitCode === "coupsdurs_incapacite";
  const { libelleVariante } = estCoupsdurs
    ? coupsdursInputSchema.parse(entrees)
    : catalogueInputSchema.parse(entrees);
  const produit = await prisma.produit.findUnique({ where: { code: produitCode } });
  if (!produit) return { ok: false, error: "Produit introuvable" };
  const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante } });
  if (!tarif) return { ok: false, error: "Variante introuvable pour ce produit" };
  return { ok: true, resultat: tarif, primeTTC: tarif.prime };
}

agentImfRouter.post(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produitCode, entrees } = simulationSchema.parse(req.body);
    const calc = await calculerDevisImf(produitCode, entrees);
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    const simulation = await prisma.simulationImf.create({
      data: {
        agentId: req.user!.sub,
        produitCode,
        entrees: JSON.parse(JSON.stringify(entrees)),
        resultat: JSON.parse(JSON.stringify(calc.resultat)),
        primeTTC: Math.round(calc.primeTTC),
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
  // Signature manuscrite facultative, capturée au moment de la conversion en souscription.
  signature: z.string().min(1).optional(),
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
        signature: data.signature,
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
    res.json(rows.map((r) => ({ ...r, agentNom: r.agent ? `${r.agent.prenom} ${r.agent.nom}` : null })));
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
    res.json(rows.map((r) => ({ ...r, agentNom: r.agent ? `${r.agent.prenom} ${r.agent.nom}` : null })));
  })
);

/* ────────────────────────────────────────────────────────────────────────
 * Simulateur & souscription directe de l'admin (imfRouter).
 * L'admin est au-dessus du réseau : ses simulations/souscriptions sont
 * rattachées à son adminId, sans agent ni zone ni agence.
 * ──────────────────────────────────────────────────────────────────────── */

imfRouter.post(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produitCode, entrees } = simulationSchema.parse(req.body);
    const calc = await calculerDevisImf(produitCode, entrees);
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    const simulation = await prisma.simulationImf.create({
      data: {
        adminId: req.user!.sub,
        produitCode,
        entrees: JSON.parse(JSON.stringify(entrees)),
        resultat: JSON.parse(JSON.stringify(calc.resultat)),
        primeTTC: Math.round(calc.primeTTC),
      },
    });
    res.status(201).json(simulation);
  })
);

imfRouter.post(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = souscriptionSchema.parse(req.body);

    const simulation = await prisma.simulationImf.findUnique({
      where: { id: data.simulationId },
      include: { souscription: true },
    });
    if (!simulation || simulation.adminId !== req.user!.sub) {
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
        adminId: req.user!.sub,
        simulationId: simulation.id,
        produitCode: simulation.produitCode,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        typePiece: data.typePiece,
        numeroPiece: data.numeroPiece,
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
      objetType: "souscription_imf",
      objetId: souscription.id,
      valeurApres: souscription,
    });

    res.status(201).json(souscription);
  })
);

/** Contrats (souscriptions actives) de tout le réseau — vue admin, à regrouper par zone/agence côté frontend. */
imfRouter.get(
  "/contrats",
  asyncHandler(async (req, res) => {
    const { produitCode } = req.query as { produitCode?: string };
    const rows = await prisma.souscriptionImf.findMany({
      where: { statut: "active", produitCode: produitCode || undefined },
      orderBy: { createdAt: "desc" },
      include: {
        agent: {
          select: { nom: true, prenom: true, agence: { select: { nom: true, zone: { select: { nom: true } } } }, zone: { select: { nom: true } } },
        },
        admin: { select: { nom: true } },
      },
    });
    res.json(rows.map(mapSouscriptionAdmin));
  })
);

/**
 * Regroupe les 5 codes produit en 4 familles commerciales (les deux variantes
 * COUPS DURS sont fusionnées) pour le tableau de bord.
 */
const FAMILLE_PRODUIT: Record<string, string> = {
  securpro: "SECURPRO",
  securstock: "SECURSTOCK",
  coupsdurs_classique: "COUPS DURS",
  coupsdurs_incapacite: "COUPS DURS",
  securecolte: "SECURECOLTE",
};
const FAMILLES = ["SECURPRO", "SECURSTOCK", "COUPS DURS", "SECURECOLTE"];

/**
 * Statistiques du tableau de bord admin : chiffre d'affaires, taxes et
 * accessoires — globaux et par produit — et évolution mensuelle du CA par
 * produit. Calculés sur les contrats (souscriptions actives). Les taxes et
 * accessoires ne sont ventilés que pour SECURPRO/SECURSTOCK (présents dans le
 * `resultat`) ; les produits catalogue (COUPS DURS/SECURECOLTE) n'ont qu'une
 * prime fixe, leurs taxes/accessoires valent donc 0.
 */
imfRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const souscriptions = await prisma.souscriptionImf.findMany({
      where: { statut: "active" },
      select: { produitCode: true, primeTTC: true, resultat: true, createdAt: true },
    });

    const parProduit: Record<string, { ca: number; taxes: number; accessoires: number; nombre: number }> = {};
    for (const f of FAMILLES) parProduit[f] = { ca: 0, taxes: 0, accessoires: 0, nombre: 0 };

    const evolutionMap = new Map<string, Record<string, number>>();

    for (const s of souscriptions) {
      const famille = FAMILLE_PRODUIT[s.produitCode] ?? s.produitCode;
      if (!parProduit[famille]) parProduit[famille] = { ca: 0, taxes: 0, accessoires: 0, nombre: 0 };
      const r = (s.resultat ?? {}) as { taxes?: number; accessoires?: number };
      parProduit[famille].ca += s.primeTTC;
      parProduit[famille].taxes += Math.round(r.taxes ?? 0);
      parProduit[famille].accessoires += Math.round(r.accessoires ?? 0);
      parProduit[famille].nombre += 1;

      const mois = s.createdAt.toISOString().slice(0, 7); // AAAA-MM
      if (!evolutionMap.has(mois)) evolutionMap.set(mois, {});
      const m = evolutionMap.get(mois)!;
      m[famille] = (m[famille] ?? 0) + s.primeTTC;
    }

    const global = {
      ca: FAMILLES.reduce((sum, f) => sum + parProduit[f].ca, 0),
      taxes: FAMILLES.reduce((sum, f) => sum + parProduit[f].taxes, 0),
      accessoires: FAMILLES.reduce((sum, f) => sum + parProduit[f].accessoires, 0),
      nombre: souscriptions.length,
    };

    const evolution = [...evolutionMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, valeurs]) => {
        const point: Record<string, number | string> = { mois };
        for (const f of FAMILLES) point[f] = valeurs[f] ?? 0;
        return point;
      });

    res.json({
      global,
      parProduit: FAMILLES.map((f) => ({ famille: f, ...parProduit[f] })),
      evolution,
    });
  })
);

/* ────────────────────────────────────────────────────────────────────────
 * Phase 6 — Sinistres IMF
 * ──────────────────────────────────────────────────────────────────────── */

interface PieceChecklist {
  label: string;
  fournie: boolean;
}

/**
 * Checklist des pièces à fournir, d'après la lettre "LISTE DES PIECES
 * NECESSAIRES POUR LE PAIEMENT DES SINISTRES" (SIM Assurances) et les
 * Conditions Particulières SECURSTOCK pour ses exigences propres
 * (vidéosurveillance + registre de stock). SECURECOLTE n'a pas de checklist :
 * son indemnisation est automatique par palier de sécheresse (voir plus bas).
 */
function checklistImf(produitCode: string, typeEvenement: string): string[] {
  if (produitCode === "securpro") {
    return [
      "Formulaire de déclaration de sinistre",
      "Pièce d'identité de l'assuré",
      "Facture CIE/SODECI ou quittance de loyer du local",
      "Photos des dommages et dégâts causés par les flammes",
      "Justificatifs de la valeur des biens (si nécessaire)",
    ];
  }
  if (produitCode === "securstock") {
    return [
      "Formulaire de déclaration de sinistre",
      "Pièce d'identité de l'assuré",
      "Déclaration du sinistre par l'institution bancaire (sous 48h)",
      "Enregistrements vidéo des 5 jours précédant le sinistre",
      "Registre de stock à jour (entrées/sorties)",
      "Justificatifs de la valeur du stock",
    ];
  }
  if (produitCode === "coupsdurs_classique" && typeEvenement === "deces") {
    return [
      "Formulaire de déclaration de sinistre",
      "Carte d'assuré et pièce d'identité",
      "Acte de décès",
      "Certificat de genre de mort",
      "Extrait de naissance du (des) bénéficiaire(s)",
      "Pièce d'identité du (des) bénéficiaire(s)",
      "Acte de mariage du conjoint (si nécessaire)",
      "Procès-verbal de constat de gendarmerie/police (si accident de la circulation)",
      "Certificat d'individualité (si nécessaire)",
    ];
  }
  if (produitCode === "coupsdurs_classique" || produitCode === "coupsdurs_incapacite") {
    return [
      "Formulaire de déclaration de sinistre",
      "Carte d'assuré ou pièce d'identité",
      "Reçus ou tickets de consultation médicale",
      "Ordonnances médicales",
      "Reçus ou tickets de caisse de pharmacie",
      "Certificat médical attestant l'événement Coups Durs",
      ...(produitCode === "coupsdurs_incapacite"
        ? ["Échéancier du prêt en cours auprès de l'institution financière"]
        : ["Certificat d'arrêt de travail (indemnité journalière), si applicable"]),
    ];
  }
  return [];
}

function numeroSinistre(produitCode: string, id: string) {
  const annee = new Date().getFullYear();
  return `SIN-${produitCode.toUpperCase()}-${annee}-${id.slice(0, 8).toUpperCase()}`;
}

function mapSinistre(sin: {
  agent: { nom: string; prenom: string } | null;
  admin: { nom: string } | null;
  souscription: { numeroPolice: string; nom: string; prenom: string; telephone: string; produitCode: string; primeTTC: number };
  [k: string]: unknown;
}) {
  return {
    ...sin,
    agentNom: sin.agent ? `${sin.agent.prenom} ${sin.agent.nom}` : null,
    adminNom: sin.admin?.nom ?? null,
    numeroPolice: sin.souscription.numeroPolice,
    clientNom: sin.souscription.nom,
    clientPrenom: sin.souscription.prenom,
    clientTelephone: sin.souscription.telephone,
    produitCode: sin.souscription.produitCode,
  };
}

const sinistreInclude = {
  agent: { select: { nom: true, prenom: true } },
  admin: { select: { nom: true } },
  souscription: { select: { numeroPolice: true, nom: true, prenom: true, telephone: true, produitCode: true, primeTTC: true } },
};

const declarationSchema = z.object({
  souscriptionId: z.string().min(1),
  typeEvenement: z.string().min(1),
  dateSurvenance: z.coerce.date(),
  montantEstime: z.number().nonnegative().optional(),
});

/** Déclaration d'un sinistre par un agent, sur une souscription dans sa portée réseau. */
agentImfRouter.post(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = declarationSchema.parse(req.body);
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneId: req.user!.zoneId ?? null,
    });
    const souscription = await prisma.souscriptionImf.findUnique({ where: { id: data.souscriptionId } });
    if (!souscription || !souscription.agentId || !scope.includes(souscription.agentId)) {
      return res.status(404).json({ error: "Souscription introuvable." });
    }
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
        agentId: req.user!.sub,
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
      objetType: "sinistre_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.status(201).json(mapSinistre(updated));
  })
);

/** Sinistres dans la portée réseau de l'agent connecté. */
agentImfRouter.get(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneId: req.user!.zoneId ?? null,
    });
    const rows = await prisma.sinistreImf.findMany({
      where: { agentId: { in: scope } },
      orderBy: { createdAt: "desc" },
      include: sinistreInclude,
    });
    res.json(rows.map(mapSinistre));
  })
);

const piecesPatchSchema = z.object({
  pieces: z.array(z.object({ label: z.string(), fournie: z.boolean() })),
});

/** L'agent coche les pièces fournies après vérification physique ; passe le dossier à "complet" une fois tout coché. */
agentImfRouter.patch(
  "/sinistres/:id/pieces",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = piecesPatchSchema.parse(req.body);
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneId: req.user!.zoneId ?? null,
    });
    const sinistre = await prisma.sinistreImf.findUnique({ where: { id: req.params.id } });
    if (!sinistre || !sinistre.agentId || !scope.includes(sinistre.agentId)) {
      return res.status(404).json({ error: "Sinistre introuvable." });
    }
    const toutesFournies = data.pieces.length > 0 && data.pieces.every((p) => p.fournie);
    const updated = await prisma.sinistreImf.update({
      where: { id: sinistre.id },
      data: {
        pieces: data.pieces as unknown as object,
        statut: toutesFournies ? "complet" : "pieces_attente",
      },
      include: sinistreInclude,
    });
    res.json(mapSinistre(updated));
  })
);

/* ── Admin : supervision réseau complet ── */

/** Déclaration par l'admin — pour toute souscription du réseau (visibilité totale), typiquement ses propres souscriptions directes. */
imfRouter.post(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = declarationSchema.parse(req.body);
    const souscription = await prisma.souscriptionImf.findUnique({ where: { id: data.souscriptionId } });
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
      objetType: "sinistre_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.status(201).json(mapSinistre(updated));
  })
);

imfRouter.get(
  "/sinistres",
  asyncHandler(async (req, res) => {
    const { statut, produitCode } = req.query as { statut?: string; produitCode?: string };
    const rows = await prisma.sinistreImf.findMany({
      where: {
        statut: (statut as StatutSinistreImf) || undefined,
        souscription: produitCode ? { produitCode } : undefined,
      },
      orderBy: { createdAt: "desc" },
      include: sinistreInclude,
    });
    res.json(rows.map(mapSinistre));
  })
);

const transitionSchema = z.object({
  statut: z.enum(["instruction", "accepte", "rejete", "regle"]),
  montantRegle: z.number().nonnegative().optional(),
  montantIMF: z.number().nonnegative().optional(),
  montantSouscripteur: z.number().nonnegative().optional(),
  motifRejet: z.string().min(1).optional(),
});

/**
 * Transition de statut par un admin : instruction / accepté / rejeté (avec
 * motif) / réglé (avec montant, ventilé montantIMF/montantSouscripteur pour
 * SECURSTOCK — indemnité versée en priorité à l'IMF nantie).
 */
imfRouter.patch(
  "/sinistres/:id/statut",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = transitionSchema.parse(req.body);
    const sinistre = await prisma.sinistreImf.findUnique({ where: { id: req.params.id } });
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
      objetType: "sinistre_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.json(mapSinistre(updated));
  })
);

/**
 * SECURECOLTE : pas de déclaration individuelle — indemnisation automatique
 * par palier de sécheresse (indice ARC). L'admin sélectionne les contrats
 * SECURECOLTE actifs concernés et le palier constaté ; un sinistre "réglé"
 * est créé directement pour chacun, au pourcentage du palier.
 */
const indemnisationSecurecolteSchema = z.object({
  souscriptionIds: z.array(z.string().min(1)).min(1),
  palier: z.enum(["forte", "moyenne", "faible"]),
  region: z.string().min(1),
});

const TAUX_PALIER: Record<"forte" | "moyenne" | "faible", number> = {
  forte: 1, moyenne: 0.5, faible: 0.2,
};

imfRouter.post(
  "/sinistres/securecolte/indemnisation",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = indemnisationSecurecolteSchema.parse(req.body);
    const souscriptions = await prisma.souscriptionImf.findMany({
      where: { id: { in: data.souscriptionIds }, produitCode: "securecolte", statut: "active" },
    });
    if (souscriptions.length === 0) {
      return res.status(400).json({ error: "Aucune souscription SECURECOLTE active dans la sélection." });
    }
    const taux = TAUX_PALIER[data.palier];
    const created = await Promise.all(
      souscriptions.map(async (s) => {
        const resultat = s.resultat as { capitalGaranti?: number };
        const capital = resultat.capitalGaranti ?? s.primeTTC;
        const montant = Math.round(capital * taux);
        const sin = await prisma.sinistreImf.create({
          data: {
            numeroSinistre: "TMP",
            souscriptionId: s.id,
            agentId: s.agentId,
            adminId: s.adminId,
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
      objetType: "indemnisation_securecolte",
      objetId: data.region,
      valeurApres: { palier: data.palier, region: data.region, nombre: created.length },
    });
    res.status(201).json({ nombre: created.length });
  })
);

/** Ratio Sinistres/Primes (S/P), global et par produit, sur les sinistres réglés. */
imfRouter.get(
  "/sinistres/stats",
  asyncHandler(async (_req, res) => {
    const [sinistres, souscriptions] = await Promise.all([
      prisma.sinistreImf.findMany({
        where: { statut: "regle" },
        select: { montantRegle: true, souscription: { select: { produitCode: true } } },
      }),
      prisma.souscriptionImf.findMany({ where: { statut: "active" }, select: { produitCode: true, primeTTC: true } }),
    ]);

    const primesParFamille: Record<string, number> = {};
    for (const f of FAMILLES) primesParFamille[f] = 0;
    for (const s of souscriptions) {
      const famille = FAMILLE_PRODUIT[s.produitCode] ?? s.produitCode;
      primesParFamille[famille] = (primesParFamille[famille] ?? 0) + s.primeTTC;
    }

    const sinistresParFamille: Record<string, number> = {};
    for (const f of FAMILLES) sinistresParFamille[f] = 0;
    for (const s of sinistres) {
      const famille = FAMILLE_PRODUIT[s.souscription.produitCode] ?? s.souscription.produitCode;
      sinistresParFamille[famille] = (sinistresParFamille[famille] ?? 0) + (s.montantRegle ?? 0);
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

/* ────────────────────────────────────────────────────────────────────────
 * Phase 7 — Bordereaux & règlement IMF.
 * Une AgenceImf correspond en pratique à l'agence d'une institution de
 * microfinance dans ce modèle de données : c'est l'unité pour laquelle un
 * bordereau de production est généré.
 * ──────────────────────────────────────────────────────────────────────── */

interface VirementBordereau {
  montant: number;
  date: string;
  reference: string;
}

function numeroBordereau(agenceNom: string, periodeDebut: Date, id: string) {
  const code = agenceNom.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "AGENCE";
  const aaaamm = `${periodeDebut.getFullYear()}${String(periodeDebut.getMonth() + 1).padStart(2, "0")}`;
  return `BORD-${code}-${aaaamm}-${id.slice(0, 6).toUpperCase()}`;
}

function statutBordereau(montantRecu: number, primeTotal: number): "emis" | "partiellement_regle" | "regle" {
  if (montantRecu <= 0) return "emis";
  if (montantRecu >= primeTotal) return "regle";
  return "partiellement_regle";
}

function mapBordereau(b: { agence: { nom: string; zone: { nom: string } }; genereParAdmin: { nom: string } | null; [k: string]: unknown }) {
  return {
    ...b,
    agenceNom: b.agence.nom,
    zoneNom: b.agence.zone.nom,
    genereParNom: b.genereParAdmin?.nom ?? null,
  };
}

const bordereauInclude = {
  agence: { select: { nom: true, zone: { select: { nom: true } } } },
  genereParAdmin: { select: { nom: true } },
};

const genererBordereauSchema = z.object({
  agenceId: z.string().min(1),
  periodeDebut: z.coerce.date(),
  periodeFin: z.coerce.date(),
});

/** Génère un bordereau de production pour une agence sur une période : agrège les souscriptions actives créées dans cette fenêtre. */
imfRouter.post(
  "/bordereaux",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = genererBordereauSchema.parse(req.body);
    if (data.periodeFin < data.periodeDebut) {
      return res.status(400).json({ error: "La date de fin doit être postérieure à la date de début." });
    }
    const agence = await prisma.agenceImf.findUnique({ where: { id: data.agenceId } });
    if (!agence) return res.status(400).json({ error: "Agence introuvable" });

    const agents = await prisma.agentImf.findMany({ where: { agenceId: data.agenceId }, select: { id: true } });
    const souscriptions = await prisma.souscriptionImf.findMany({
      where: {
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
      objetType: "bordereau_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.status(201).json(mapBordereau(updated));
  })
);

imfRouter.get(
  "/bordereaux",
  asyncHandler(async (req, res) => {
    const { agenceId, statut } = req.query as { agenceId?: string; statut?: string };
    const rows = await prisma.bordereauImf.findMany({
      where: { agenceId: agenceId || undefined, statut: (statut as StatutBordereauImf) || undefined },
      orderBy: { createdAt: "desc" },
      include: bordereauInclude,
    });
    res.json(rows.map(mapBordereau));
  })
);

/** Détail d'un bordereau, avec les souscriptions incluses résolues (pour l'export et le contrôle). */
imfRouter.get(
  "/bordereaux/:id",
  asyncHandler(async (req, res) => {
    const bordereau = await prisma.bordereauImf.findUnique({ where: { id: req.params.id }, include: bordereauInclude });
    if (!bordereau) return res.status(404).json({ error: "Bordereau introuvable" });
    const ids = bordereau.souscriptionIds as unknown as string[];
    const souscriptions = await prisma.souscriptionImf.findMany({
      where: { id: { in: ids } },
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

const virementSchema = z.object({
  montant: z.number().positive(),
  date: z.coerce.date(),
  reference: z.string().min(1),
});

/** Pointage d'un virement reçu en règlement du bordereau — paiements partiels supportés. */
imfRouter.post(
  "/bordereaux/:id/virements",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = virementSchema.parse(req.body);
    const bordereau = await prisma.bordereauImf.findUnique({ where: { id: req.params.id } });
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
      objetType: "bordereau_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.json(mapBordereau(updated));
  })
);
