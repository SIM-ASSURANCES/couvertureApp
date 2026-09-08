import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireSuperAdminBranche, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import {
  CODES_PRODUITS_IMF,
  produitImfCatalogue,
  DOCUMENTS_IMF,
  documentImfCatalogue,
} from "../services/cataloguesImf.js";
import { ensureProduitsImf, ensureBaremesImf } from "../services/provisioningImf.js";
import { PRODUITS_TARIF_FIXE_IMF } from "../services/baremesImfDefaut.js";
import { imfPartenairesReseauRouter } from "./imfPartenairesReseau.js";

/**
 * Branche « IMF Partenaires » — CRUD des institutions de microfinance (Imf),
 * chacune rattachée 1:1 à un Partenaire. Le montage du routeur applique déjà
 * requireAuth("admin") + requireBranche("IMF_PARTENAIRES") (voir index.ts).
 *
 * Phase 1 : identité + branding + statut.
 * Phase 2a : produits & garanties activés par IMF (model ImfProduit).
 * Phase 2b : barèmes / tarifs + taux de commission par IMF.
 * Documents, habilitations et la réplique des écrans réseau/portefeuille
 * arrivent aux phases suivantes.
 */
export const imfPartenairesRouter = Router();

/** Dérive un slug stable à partir du nom (unicité garantie par suffixe si besoin). */
function slugify(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "imf";
}

async function codeUnique(nom: string): Promise<string> {
  const base = slugify(nom);
  let code = base;
  for (let i = 2; i < 100; i++) {
    const existe = await prisma.imf.findUnique({ where: { code } });
    if (!existe) return code;
    code = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function serialize(imf: {
  id: string;
  code: string;
  nom: string;
  statut: string;
  logoUrl: string | null;
  couleurPrimaire: string | null;
  couleurSecondaire: string | null;
  mentionsLegales: string | null;
  createdAt: Date;
  updatedAt: Date;
  partenaire: {
    id: string;
    nomResponsable: string;
    telephone: string;
    email: string | null;
    localisation: string | null;
  };
  _count?: { zones: number; agences: number; agents: number; souscriptions: number };
}) {
  return {
    id: imf.id,
    code: imf.code,
    nom: imf.nom,
    statut: imf.statut,
    logoUrl: imf.logoUrl,
    couleurPrimaire: imf.couleurPrimaire,
    couleurSecondaire: imf.couleurSecondaire,
    mentionsLegales: imf.mentionsLegales,
    createdAt: imf.createdAt,
    updatedAt: imf.updatedAt,
    partenaireId: imf.partenaire.id,
    nomResponsable: imf.partenaire.nomResponsable,
    telephone: imf.partenaire.telephone,
    email: imf.partenaire.email,
    localisation: imf.partenaire.localisation,
    nbZones: imf._count?.zones ?? 0,
    nbAgences: imf._count?.agences ?? 0,
    nbAgents: imf._count?.agents ?? 0,
    nbSouscriptions: imf._count?.souscriptions ?? 0,
  };
}

// Phase 3a — réseau (Zones/Agences/Agents) scopé par IMF.
imfPartenairesRouter.use("/:imfId/reseau", imfPartenairesReseauRouter);

/* ── Liste ── */

imfPartenairesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const imfs = await prisma.imf.findMany({
      orderBy: { nom: "asc" },
      include: {
        partenaire: {
          select: { id: true, nomResponsable: true, telephone: true, email: true, localisation: true },
        },
        _count: { select: { zones: true, agences: true, agents: true, souscriptions: true } },
      },
    });
    res.json(imfs.map(serialize));
  })
);

/* ── Statistiques de la branche (tableau de bord) ── */

imfPartenairesRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [total, actives, inactives, souscriptions] = await Promise.all([
      prisma.imf.count(),
      prisma.imf.count({ where: { statut: "actif" } }),
      prisma.imf.count({ where: { statut: "inactif" } }),
      prisma.souscriptionImf.count({ where: { imfId: { not: null } } }),
    ]);
    res.json({ total, actives, inactives, souscriptions });
  })
);

/* ── Détail ── */

imfPartenairesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const imf = await prisma.imf.findUnique({
      where: { id: req.params.id },
      include: {
        partenaire: {
          select: { id: true, nomResponsable: true, telephone: true, email: true, localisation: true },
        },
        _count: { select: { zones: true, agences: true, agents: true, souscriptions: true } },
      },
    });
    if (!imf) return res.status(404).json({ error: "IMF introuvable" });
    res.json(serialize(imf));
  })
);

/* ── Création (Partenaire + Imf) ── */

const createSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  nomResponsable: z.string().min(1, "Responsable requis"),
  telephone: z.string().min(1, "Téléphone requis"),
  email: z.string().email().optional().or(z.literal("")),
  localisation: z.string().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  couleurPrimaire: z.string().optional().or(z.literal("")),
  couleurSecondaire: z.string().optional().or(z.literal("")),
  mentionsLegales: z.string().optional().or(z.literal("")),
});

imfPartenairesRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const code = await codeUnique(data.nom);
    const email = data.email ? data.email : undefined;

    try {
      const imf = await prisma.$transaction(async (tx) => {
        const partenaire = await tx.partenaire.create({
          data: {
            nomCommerce: data.nom,
            nomResponsable: data.nomResponsable,
            telephone: data.telephone,
            email,
            localisation: data.localisation || undefined,
            branche: "IMF_PARTENAIRES",
            statut: "actif",
          },
        });
        const cree = await tx.imf.create({
          data: {
            code,
            nom: data.nom,
            partenaireId: partenaire.id,
            logoUrl: data.logoUrl || undefined,
            couleurPrimaire: data.couleurPrimaire || undefined,
            couleurSecondaire: data.couleurSecondaire || undefined,
            mentionsLegales: data.mentionsLegales || undefined,
          },
          include: {
            partenaire: {
              select: { id: true, nomResponsable: true, telephone: true, email: true, localisation: true },
            },
            _count: { select: { zones: true, agences: true, agents: true, souscriptions: true } },
          },
        });
        // Provisionne le paramétrage par défaut (phases 2a + 2b).
        await ensureProduitsImf(cree.id, tx);
        await ensureBaremesImf(cree.id, tx);
        return cree;
      });

      await logAction({
        adminId: req.user!.sub,
        typeAction: "creation",
        objetType: "imf",
        objetId: imf.id,
        valeurApres: { code: imf.code, nom: imf.nom, partenaireId: imf.partenaireId },
      });
      res.status(201).json(serialize(imf));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return res.status(409).json({ error: "Un partenaire utilise déjà cet e-mail." });
      }
      throw e;
    }
  })
);

/* ── Mise à jour ── */

const updateSchema = z.object({
  nom: z.string().min(1).optional(),
  nomResponsable: z.string().min(1).optional(),
  telephone: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  localisation: z.string().optional().or(z.literal("")),
  statut: z.enum(["actif", "inactif"]).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  couleurPrimaire: z.string().optional().or(z.literal("")),
  couleurSecondaire: z.string().optional().or(z.literal("")),
  mentionsLegales: z.string().optional().or(z.literal("")),
});

imfPartenairesRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    const existant = await prisma.imf.findUnique({ where: { id: req.params.id } });
    if (!existant) return res.status(404).json({ error: "IMF introuvable" });

    const partData: Prisma.PartenaireUpdateInput = {};
    if (data.nomResponsable !== undefined) partData.nomResponsable = data.nomResponsable;
    if (data.telephone !== undefined) partData.telephone = data.telephone;
    if (data.email !== undefined) partData.email = data.email ? data.email : null;
    if (data.localisation !== undefined) partData.localisation = data.localisation || null;
    if (data.nom !== undefined) partData.nomCommerce = data.nom;
    if (data.statut !== undefined) partData.statut = data.statut;

    try {
      const imf = await prisma.$transaction(async (tx) => {
        if (Object.keys(partData).length) {
          await tx.partenaire.update({ where: { id: existant.partenaireId }, data: partData });
        }
        return tx.imf.update({
          where: { id: req.params.id },
          data: {
            nom: data.nom,
            statut: data.statut,
            logoUrl: data.logoUrl !== undefined ? data.logoUrl || null : undefined,
            couleurPrimaire: data.couleurPrimaire !== undefined ? data.couleurPrimaire || null : undefined,
            couleurSecondaire: data.couleurSecondaire !== undefined ? data.couleurSecondaire || null : undefined,
            mentionsLegales: data.mentionsLegales !== undefined ? data.mentionsLegales || null : undefined,
          },
          include: {
            partenaire: {
              select: { id: true, nomResponsable: true, telephone: true, email: true, localisation: true },
            },
            _count: { select: { zones: true, agences: true, agents: true, souscriptions: true } },
          },
        });
      });

      await logAction({
        adminId: req.user!.sub,
        typeAction: "modification",
        objetType: "imf",
        objetId: imf.id,
        valeurAvant: {
          nom: existant.nom,
          statut: existant.statut,
          logoUrl: existant.logoUrl,
          couleurPrimaire: existant.couleurPrimaire,
          couleurSecondaire: existant.couleurSecondaire,
        },
        valeurApres: {
          nom: imf.nom,
          statut: imf.statut,
          logoUrl: imf.logoUrl,
          couleurPrimaire: imf.couleurPrimaire,
          couleurSecondaire: imf.couleurSecondaire,
        },
      });
      res.json(serialize(imf));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return res.status(409).json({ error: "Un partenaire utilise déjà cet e-mail." });
      }
      throw e;
    }
  })
);

/* ── Suppression (réservée au Super Administrateur de la branche) ── */

imfPartenairesRouter.delete(
  "/:id",
  requireSuperAdminBranche("IMF_PARTENAIRES"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const imf = await prisma.imf.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { zones: true, agences: true, agents: true, souscriptions: true, sinistres: true, bordereaux: true } },
      },
    });
    if (!imf) return res.status(404).json({ error: "IMF introuvable" });

    const c = imf._count;
    if (c.zones || c.agences || c.agents || c.souscriptions || c.sinistres || c.bordereaux) {
      return res.status(409).json({
        error: "Impossible de supprimer une IMF qui possède déjà des zones, agences, agents ou un portefeuille. Passez-la plutôt en « inactif ».",
      });
    }

    // La suppression du Partenaire rattaché entraîne celle de l'Imf (onDelete: Cascade).
    await prisma.partenaire.delete({ where: { id: imf.partenaireId } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "imf",
      objetId: req.params.id,
      valeurAvant: { code: imf.code, nom: imf.nom },
    });
    res.status(204).end();
  })
);

/* ================================================================
 * Phase 2a — Produits & garanties activés par IMF (model ImfProduit)
 * ============================================================== */

interface GarantieConfig {
  code: string;
  libelle: string;
  actif: boolean;
  plafond: number | null;
}

/** Réaligne le bloc `garanties` stocké sur le catalogue de référence (ajoute les nouvelles, garde les surcharges). */
function fusionnerGaranties(code: string, stocke: unknown): GarantieConfig[] {
  const ref = produitImfCatalogue(code)?.garanties ?? [];
  const parCode = new Map<string, Partial<GarantieConfig>>();
  if (Array.isArray(stocke)) {
    for (const g of stocke as Record<string, unknown>[]) {
      if (g && typeof g.code === "string") parCode.set(g.code, g as Partial<GarantieConfig>);
    }
  }
  return ref.map((g) => {
    const s = parCode.get(g.code);
    return {
      code: g.code,
      libelle: g.libelle,
      actif: typeof s?.actif === "boolean" ? s.actif : true,
      plafond: typeof s?.plafond === "number" ? s.plafond : null,
    };
  });
}

function serializeProduit(p: { code: string; actif: boolean; garanties: unknown; plafond: number | null; updatedAt: Date }) {
  const cat = produitImfCatalogue(p.code);
  return {
    code: p.code,
    libelle: cat?.libelle ?? p.code,
    aFormule: cat?.aFormule ?? false,
    actif: p.actif,
    plafond: p.plafond,
    garanties: fusionnerGaranties(p.code, p.garanties),
    updatedAt: p.updatedAt,
  };
}

imfPartenairesRouter.get(
  "/:id/produits",
  asyncHandler(async (req, res) => {
    const imf = await prisma.imf.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!imf) return res.status(404).json({ error: "IMF introuvable" });
    await ensureProduitsImf(imf.id);
    const rows = await prisma.imfProduit.findMany({ where: { imfId: imf.id } });
    const ordre = new Map(CODES_PRODUITS_IMF.map((c, i) => [c, i]));
    rows.sort((a, b) => (ordre.get(a.code) ?? 99) - (ordre.get(b.code) ?? 99));
    res.json(rows.map(serializeProduit));
  })
);

const garantiePatchSchema = z.object({
  code: z.string().min(1),
  actif: z.boolean().optional(),
  plafond: z.number().int().nonnegative().nullable().optional(),
});

const produitPatchSchema = z
  .object({
    actif: z.boolean().optional(),
    plafond: z.number().int().nonnegative().nullable().optional(),
    garanties: z.array(garantiePatchSchema).optional(),
  })
  .refine((d) => d.actif !== undefined || d.plafond !== undefined || d.garanties !== undefined, {
    message: "Aucune modification fournie.",
  });

imfPartenairesRouter.patch(
  "/:id/produits/:code",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!CODES_PRODUITS_IMF.includes(req.params.code)) {
      return res.status(404).json({ error: "Produit IMF inconnu." });
    }
    const data = produitPatchSchema.parse(req.body);
    const imf = await prisma.imf.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!imf) return res.status(404).json({ error: "IMF introuvable" });
    await ensureProduitsImf(imf.id);

    const existant = await prisma.imfProduit.findUnique({
      where: { imfId_code: { imfId: imf.id, code: req.params.code } },
    });
    if (!existant) return res.status(404).json({ error: "Produit non provisionné pour cette IMF." });

    let garanties = fusionnerGaranties(req.params.code, existant.garanties);
    if (data.garanties) {
      const patchParCode = new Map(data.garanties.map((g) => [g.code, g]));
      garanties = garanties.map((g) => {
        const p = patchParCode.get(g.code);
        if (!p) return g;
        return {
          ...g,
          actif: p.actif ?? g.actif,
          plafond: p.plafond !== undefined ? p.plafond : g.plafond,
        };
      });
    }

    const updated = await prisma.imfProduit.update({
      where: { imfId_code: { imfId: imf.id, code: req.params.code } },
      data: {
        actif: data.actif ?? existant.actif,
        plafond: data.plafond !== undefined ? data.plafond : existant.plafond,
        garanties: garanties as unknown as Prisma.InputJsonValue,
      },
    });

    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "imf_produit",
      objetId: `${imf.id}:${req.params.code}`,
      valeurAvant: { actif: existant.actif, plafond: existant.plafond, garanties: existant.garanties },
      valeurApres: { actif: updated.actif, plafond: updated.plafond, garanties: updated.garanties },
    });
    res.json(serializeProduit(updated));
  })
);

/* ================================================================
 * Phase 2b — Barèmes / tarifs + taux de commission par IMF
 * ============================================================== */

/** Charge l'IMF (id seul) ou renvoie false après avoir répondu 404. */
async function chargerImfOu404(id: string, res: import("express").Response): Promise<{ id: string } | false> {
  const imf = await prisma.imf.findUnique({ where: { id }, select: { id: true } });
  if (!imf) {
    res.status(404).json({ error: "IMF introuvable" });
    return false;
  }
  return imf;
}

imfPartenairesRouter.get(
  "/:id/baremes",
  asyncHandler(async (req, res) => {
    const imf = await chargerImfOu404(req.params.id, res);
    if (!imf) return;
    await ensureBaremesImf(imf.id);
    const [securpro, securstock, securecolte, tarifsFixes] = await Promise.all([
      prisma.imfBaremeSecurpro.findMany({ where: { imfId: imf.id }, orderBy: { classe: "asc" } }),
      prisma.imfBaremeSecurstock.findMany({ where: { imfId: imf.id }, orderBy: { classe: "asc" } }),
      prisma.imfPalierSecurecolte.findMany({ where: { imfId: imf.id } }),
      prisma.imfTarifFixe.findMany({ where: { imfId: imf.id }, orderBy: [{ produitCode: "asc" }, { libelleVariante: "asc" }] }),
    ]);
    const ordreSeuil: Record<string, number> = { forte: 0, moyenne: 1, faible: 2 };
    securecolte.sort((a, b) => (ordreSeuil[a.seuil] ?? 9) - (ordreSeuil[b.seuil] ?? 9));
    res.json({
      securpro: securpro.map((b) => ({ classe: b.classe, limiteCapital: b.limiteCapital, tauxIncendie: b.tauxIncendie, tauxCommission: b.tauxCommission })),
      securstock: securstock.map((b) => ({
        classe: b.classe,
        limiteCapital: b.limiteCapital,
        tauxDommageElectrique: b.tauxDommageElectrique,
        tauxAutreCause: b.tauxAutreCause,
        tauxCommission: b.tauxCommission,
      })),
      securecolte: securecolte.map((p) => ({ seuil: p.seuil, pourcentageIndice: p.pourcentageIndice, montantIndemnite: p.montantIndemnite })),
      tarifsFixes: tarifsFixes.map((t) => ({
        produitCode: t.produitCode,
        libelleVariante: t.libelleVariante,
        prime: t.prime,
        primeHT: t.primeHT,
        fg: t.fg,
        taxes: t.taxes,
        capitalGaranti: t.capitalGaranti,
        commission: t.commission,
      })),
    });
  })
);

async function journaliserBareme(adminId: string, imfId: string, cible: string, avant: unknown, apres: unknown) {
  await logAction({
    adminId,
    typeAction: "modification",
    objetType: "imf_bareme",
    objetId: `${imfId}:${cible}`,
    valeurAvant: avant,
    valeurApres: apres,
  });
}

const securproPatch = z
  .object({
    limiteCapital: z.number().int().positive().optional(),
    tauxIncendie: z.number().nonnegative().optional(),
    tauxCommission: z.number().min(0).max(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Aucune modification fournie." });

imfPartenairesRouter.patch(
  "/:id/baremes/securpro/:classe",
  asyncHandler(async (req: AuthedRequest, res) => {
    const classe = Number(req.params.classe);
    if (![1, 2, 3, 4].includes(classe)) return res.status(400).json({ error: "Classe invalide (1 à 4)." });
    const data = securproPatch.parse(req.body);
    const imf = await chargerImfOu404(req.params.id, res);
    if (!imf) return;
    await ensureBaremesImf(imf.id);
    const avant = await prisma.imfBaremeSecurpro.findUnique({ where: { imfId_classe: { imfId: imf.id, classe } } });
    if (!avant) return res.status(404).json({ error: "Barème non provisionné." });
    const apres = await prisma.imfBaremeSecurpro.update({ where: { imfId_classe: { imfId: imf.id, classe } }, data });
    await journaliserBareme(req.user!.sub, imf.id, `securpro:${classe}`, avant, apres);
    res.json({ classe: apres.classe, limiteCapital: apres.limiteCapital, tauxIncendie: apres.tauxIncendie, tauxCommission: apres.tauxCommission });
  })
);

const securstockPatch = z
  .object({
    limiteCapital: z.number().int().positive().optional(),
    tauxDommageElectrique: z.number().nonnegative().optional(),
    tauxAutreCause: z.number().nonnegative().optional(),
    tauxCommission: z.number().min(0).max(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Aucune modification fournie." });

imfPartenairesRouter.patch(
  "/:id/baremes/securstock/:classe",
  asyncHandler(async (req: AuthedRequest, res) => {
    const classe = Number(req.params.classe);
    if (![1, 2, 3, 4].includes(classe)) return res.status(400).json({ error: "Classe invalide (1 à 4)." });
    const data = securstockPatch.parse(req.body);
    const imf = await chargerImfOu404(req.params.id, res);
    if (!imf) return;
    await ensureBaremesImf(imf.id);
    const avant = await prisma.imfBaremeSecurstock.findUnique({ where: { imfId_classe: { imfId: imf.id, classe } } });
    if (!avant) return res.status(404).json({ error: "Barème non provisionné." });
    const apres = await prisma.imfBaremeSecurstock.update({ where: { imfId_classe: { imfId: imf.id, classe } }, data });
    await journaliserBareme(req.user!.sub, imf.id, `securstock:${classe}`, avant, apres);
    res.json({
      classe: apres.classe,
      limiteCapital: apres.limiteCapital,
      tauxDommageElectrique: apres.tauxDommageElectrique,
      tauxAutreCause: apres.tauxAutreCause,
      tauxCommission: apres.tauxCommission,
    });
  })
);

const palierPatch = z
  .object({
    pourcentageIndice: z.number().min(0).max(2).optional(),
    montantIndemnite: z.number().int().nonnegative().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Aucune modification fournie." });

imfPartenairesRouter.patch(
  "/:id/baremes/securecolte/:seuil",
  asyncHandler(async (req: AuthedRequest, res) => {
    const seuil = req.params.seuil;
    if (!["forte", "moyenne", "faible"].includes(seuil)) return res.status(400).json({ error: "Seuil invalide." });
    const data = palierPatch.parse(req.body);
    const imf = await chargerImfOu404(req.params.id, res);
    if (!imf) return;
    await ensureBaremesImf(imf.id);
    const avant = await prisma.imfPalierSecurecolte.findUnique({ where: { imfId_seuil: { imfId: imf.id, seuil } } });
    if (!avant) return res.status(404).json({ error: "Palier non provisionné." });
    const apres = await prisma.imfPalierSecurecolte.update({ where: { imfId_seuil: { imfId: imf.id, seuil } }, data });
    await journaliserBareme(req.user!.sub, imf.id, `securecolte:${seuil}`, avant, apres);
    res.json({ seuil: apres.seuil, pourcentageIndice: apres.pourcentageIndice, montantIndemnite: apres.montantIndemnite });
  })
);

const tarifFixePatch = z
  .object({
    prime: z.number().int().nonnegative().optional(),
    primeHT: z.number().nonnegative().nullable().optional(),
    fg: z.number().nonnegative().nullable().optional(),
    taxes: z.number().nonnegative().nullable().optional(),
    capitalGaranti: z.number().int().nonnegative().optional(),
    commission: z.number().min(0).max(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Aucune modification fournie." });

imfPartenairesRouter.patch(
  "/:id/baremes/tarif-fixe/:produitCode/:variante",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produitCode, variante } = req.params;
    if (!(PRODUITS_TARIF_FIXE_IMF as readonly string[]).includes(produitCode)) {
      return res.status(404).json({ error: "Produit à prix fixe inconnu." });
    }
    const data = tarifFixePatch.parse(req.body);
    const imf = await chargerImfOu404(req.params.id, res);
    if (!imf) return;
    await ensureBaremesImf(imf.id);
    const cle = { imfId_produitCode_libelleVariante: { imfId: imf.id, produitCode, libelleVariante: variante } };
    const avant = await prisma.imfTarifFixe.findUnique({ where: cle });
    if (!avant) return res.status(404).json({ error: "Tarif non provisionné pour cette variante." });
    const apres = await prisma.imfTarifFixe.update({ where: cle, data });
    await journaliserBareme(req.user!.sub, imf.id, `tarif-fixe:${produitCode}:${variante}`, avant, apres);
    res.json({
      produitCode: apres.produitCode,
      libelleVariante: apres.libelleVariante,
      prime: apres.prime,
      primeHT: apres.primeHT,
      fg: apres.fg,
      taxes: apres.taxes,
      capitalGaranti: apres.capitalGaranti,
      commission: apres.commission,
    });
  })
);

/* ================================================================
 * Phase 2c — Documents paramétrables par IMF (model ImfDocumentModele)
 * ============================================================== */

imfPartenairesRouter.get(
  "/:id/documents",
  asyncHandler(async (req, res) => {
    const imf = await chargerImfOu404(req.params.id, res);
    if (!imf) return;
    const saisies = await prisma.imfDocumentModele.findMany({ where: { imfId: imf.id } });
    const parCle = new Map(saisies.map((s) => [s.cle, s]));
    res.json(
      DOCUMENTS_IMF.map((d) => {
        const s = parCle.get(d.cle);
        return {
          cle: d.cle,
          libelle: d.libelle,
          contenuHtml: s?.contenuHtml ?? "",
          personnalise: !!s?.contenuHtml.trim(),
          updatedAt: s?.updatedAt ?? null,
        };
      })
    );
  })
);

const documentImfSchema = z.object({
  // HTML de confiance (saisi par un admin) — mêmes garde-fous que pour les
  // Conditions Générales de branche (voir services/pdf.ts au rendu).
  contenuHtml: z.string().max(400_000),
});

imfPartenairesRouter.put(
  "/:id/documents/:cle",
  asyncHandler(async (req: AuthedRequest, res) => {
    const entree = documentImfCatalogue(req.params.cle);
    if (!entree) return res.status(404).json({ error: "Document IMF inconnu." });
    const imf = await chargerImfOu404(req.params.id, res);
    if (!imf) return;
    const { contenuHtml } = documentImfSchema.parse(req.body);
    const cle = req.params.cle;

    if (!contenuHtml.trim()) {
      // Retour au document de branche : on supprime la ligne plutôt que
      // d'enregistrer une chaîne vide.
      await prisma.imfDocumentModele.deleteMany({ where: { imfId: imf.id, cle } });
      await logAction({
        adminId: req.user!.sub,
        typeAction: "suppression",
        objetType: "imf_document",
        objetId: `${imf.id}:${cle}`,
      });
      return res.json({ cle, personnalise: false, updatedAt: null });
    }

    const saisie = await prisma.imfDocumentModele.upsert({
      where: { imfId_cle: { imfId: imf.id, cle } },
      create: { imfId: imf.id, cle, libelle: entree.libelle, contenuHtml, modifieParAdminId: req.user?.sub ?? null },
      update: { libelle: entree.libelle, contenuHtml, modifieParAdminId: req.user?.sub ?? null },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "imf_document",
      objetId: `${imf.id}:${cle}`,
      valeurApres: { taille: contenuHtml.length },
    });
    res.json({ cle, personnalise: true, updatedAt: saisie.updatedAt });
  })
);
