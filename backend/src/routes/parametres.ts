import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdminBranche, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { envoyerRelancesEcheance } from "../services/relances.js";
import { CLES_CONDITIONS_GENERALES } from "../services/contractHtml.js";

export const parametresRouter = Router();
// Paramètres et tarifs sont une fonctionnalité d'administration générale —
// réservée au SUPER_ADMIN (le flux public de souscription utilise ses
// propres routes /public/tarifs/*, indépendantes de celles-ci).
parametresRouter.use(requireAuth("admin"), requireSuperAdminBranche("INCENDIE_ACCIDENT"));

/* ── Tarifications ── */

const tarifSchema = z.object({
  prime: z.number().int().positive(),
  primeHT: z.number().positive().optional().nullable(),
  fg: z.number().nonnegative().optional().nullable(),
  taxes: z.number().nonnegative().optional().nullable(),
  capitalGaranti: z.number().int().positive(),
  commission: z.number().positive(),
});

// Accident
parametresRouter.get("/tarifs/accident", asyncHandler(async (_req, res) => {
  res.json(await prisma.tarifAccident.findMany({ orderBy: { prime: "asc" } }));
}));

parametresRouter.post("/tarifs/accident", requireSuperAdminBranche("INCENDIE_ACCIDENT"), asyncHandler(async (req: AuthedRequest, res) => {
  const data = tarifSchema.parse(req.body);
  const t = await prisma.tarifAccident.create({ data });
  await logAction({ adminId: req.user!.sub, typeAction: "creation", objetType: "tarif_accident", objetId: String(t.id), valeurApres: data });
  res.status(201).json(t);
}));

parametresRouter.patch("/tarifs/accident/:id", requireSuperAdminBranche("INCENDIE_ACCIDENT"), asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  const data = tarifSchema.partial().parse(req.body);
  const t = await prisma.tarifAccident.update({ where: { id }, data });
  await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "tarif_accident", objetId: String(id), valeurApres: data });
  res.json(t);
}));

parametresRouter.delete("/tarifs/accident/:id", requireSuperAdminBranche("INCENDIE_ACCIDENT"), asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  await prisma.tarifAccident.delete({ where: { id } });
  await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "tarif_accident", objetId: String(id) });
  res.status(204).end();
}));

// Incendie
parametresRouter.get("/tarifs/incendie", asyncHandler(async (_req, res) => {
  res.json(await prisma.tarifIncendie.findMany({ orderBy: { prime: "asc" } }));
}));

parametresRouter.post("/tarifs/incendie", requireSuperAdminBranche("INCENDIE_ACCIDENT"), asyncHandler(async (req: AuthedRequest, res) => {
  const data = tarifSchema.parse(req.body);
  const t = await prisma.tarifIncendie.create({ data });
  await logAction({ adminId: req.user!.sub, typeAction: "creation", objetType: "tarif_incendie", objetId: String(t.id), valeurApres: data });
  res.status(201).json(t);
}));

parametresRouter.patch("/tarifs/incendie/:id", requireSuperAdminBranche("INCENDIE_ACCIDENT"), asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  const data = tarifSchema.partial().parse(req.body);
  const t = await prisma.tarifIncendie.update({ where: { id }, data });
  await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "tarif_incendie", objetId: String(id), valeurApres: data });
  res.json(t);
}));

parametresRouter.delete("/tarifs/incendie/:id", requireSuperAdminBranche("INCENDIE_ACCIDENT"), asyncHandler(async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id);
  await prisma.tarifIncendie.delete({ where: { id } });
  await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "tarif_incendie", objetId: String(id) });
  res.status(204).end();
}));

parametresRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    let p = await prisma.parametre.findUnique({ where: { id: 1 } });
    if (!p) p = await prisma.parametre.create({ data: { id: 1 } });
    res.json(p);
  })
);

const schema = z.object({
  tauxCommissionIncendie: z.number().min(0).max(1).optional(),
  tauxCommissionAccident: z.number().min(0).max(1).optional(),
  tauxCommissionMensuelleIncendie: z.number().min(0).max(1).optional(),
  primeAccident: z.number().int().min(0).optional(),
  primeHtIncendie1000: z.number().positive().optional(),
  primeHtIncendie2000: z.number().positive().optional(),
});

parametresRouter.patch(
  "/",
  requireSuperAdminBranche("INCENDIE_ACCIDENT"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = schema.parse(req.body);
    const updated = await prisma.parametre.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "parametre",
      objetId: "1",
      valeurApres: data,
    });
    res.json(updated);
  })
);

/**
 * Déclenchement manuel des relances automatiques d'échéance (J-5/jour J,
 * normalement exécutées une fois par jour — voir services/relances.ts et
 * l'enregistrement du planificateur dans index.ts). Utile pour vérifier le
 * comportement sans attendre le prochain déclenchement, et en exploitation.
 */
parametresRouter.post(
  "/relances/executer",
  asyncHandler(async (req: AuthedRequest, res) => {
    const resultat = await envoyerRelancesEcheance();
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "relances_echeance",
      objetId: "manuel",
    });
    res.json(resultat);
  })
);

/* ── Conditions Générales des contrats ── */

const conditionsGeneralesSchema = z.object({
  // HTML de confiance (saisi par un super-admin) mais injecté dans le rendu
  // Puppeteer : l'interception des schémas dangereux reste en place côté
  // services/pdf.ts, qui n'autorise que data:/http/https.
  contenuHtml: z.string().max(400_000),
});

/**
 * Liste des jeux de Conditions Générales éditables, avec le texte déjà saisi
 * s'il existe. `personnalise: false` signifie que le contrat sert encore le
 * fichier statique livré avec l'application.
 */
parametresRouter.get(
  "/conditions-generales",
  asyncHandler(async (_req, res) => {
    const saisies = await prisma.conditionsGenerales.findMany();
    const parCle = new Map(saisies.map((s) => [s.cle, s]));
    res.json(
      CLES_CONDITIONS_GENERALES.map((c) => {
        const saisie = parCle.get(c.cle);
        return {
          cle: c.cle,
          libelle: c.libelle,
          contenuHtml: saisie?.contenuHtml ?? "",
          personnalise: !!saisie?.contenuHtml.trim(),
          updatedAt: saisie?.updatedAt ?? null,
        };
      })
    );
  })
);

/** Enregistre (ou réinitialise, si le contenu est vide) les CG d'une clé. */
parametresRouter.put(
  "/conditions-generales/:cle",
  asyncHandler(async (req: AuthedRequest, res) => {
    const cle = req.params.cle;
    const entree = CLES_CONDITIONS_GENERALES.find((c) => c.cle === cle);
    if (!entree) return res.status(404).json({ error: "Conditions Générales inconnues" });

    const { contenuHtml } = conditionsGeneralesSchema.parse(req.body);

    if (!contenuHtml.trim()) {
      // Retour au texte livré avec l'application : on supprime la ligne
      // plutôt que d'enregistrer une chaîne vide, pour que loadCG retombe
      // naturellement sur le fichier statique.
      await prisma.conditionsGenerales.deleteMany({ where: { cle } });
      await logAction({ adminId: req.user!.sub, typeAction: "suppression", objetType: "conditions_generales", objetId: cle });
      return res.json({ cle, personnalise: false });
    }

    const saisie = await prisma.conditionsGenerales.upsert({
      where: { cle },
      create: { cle, libelle: entree.libelle, contenuHtml, modifieParAdminId: req.user?.sub ?? null },
      update: { libelle: entree.libelle, contenuHtml, modifieParAdminId: req.user?.sub ?? null },
    });
    await logAction({ adminId: req.user!.sub, typeAction: "modification", objetType: "conditions_generales", objetId: cle, valeurApres: { taille: contenuHtml.length } });
    res.json({ cle, personnalise: true, updatedAt: saisie.updatedAt });
  })
);
