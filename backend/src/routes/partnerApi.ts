import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler } from "../util.js";
import {
  requireApiKey,
  requireScope,
  withIdempotency,
  journaliserRequetesPartenaire,
  apiOk,
  apiError,
  type PartnerRequest,
} from "../apiKey.js";
import { partnerLimiter } from "../security.js";
import {
  resoudreProduitPourPartenaire,
  catalogueDuPartenaire,
  calculerCommissionApi,
  souscriptionGeneriqueDejaConfirmee,
  type ResolutionProduit,
} from "../services/cataloguePartenaire.js";
import { dateDebutPremiereActivation } from "../services/notify.js";
import { confirmerEcheance } from "../services/paiementWave.js";
import { notifyPartenaire } from "../services/notifications.js";
import { renderCartePngGenerique, CarteIndisponibleError } from "../services/carteRender.js";
import { emettreWebhook } from "../services/partnerWebhook.js";
import { openapiPartnerV1 } from "../openapi/partnerV1.js";

// =====================================================================
// API partenaire — routeur `/api/partner/v1`.
//
//   GET  /v1/openapi.json | /v1/docs            — spec + Redoc (public)
//   GET  /v1/ping                               — vérifie la clé
//   GET  /v1/catalogue | /v1/produits/:code     — catalogue
//   POST /v1/devis                              — calcule une prime
//   POST /v1/souscriptions                      — crée (option B, sans Wave)
//   POST /v1/souscriptions/:id/confirmer-paiement
//   GET  /v1/souscriptions[/:id[/evenements]]   — lecture
//   GET  /v1/souscriptions/:id/carte.png | contrat.pdf
//
// Auth par clé API (src/apiKey.ts), limiteur dédié (security.ts),
// journalisation (PartnerApiRequest), webhooks sortants (services/partnerWebhook.ts).
// =====================================================================

export const partnerApiRouter = Router();

// --- Documentation : PUBLIQUE (déclarée avant requireApiKey) ---
partnerApiRouter.get("/v1/openapi.json", (_req, res) => {
  res.json(openapiPartnerV1);
});
partnerApiRouter.get("/v1/docs", (_req, res) => {
  res.type("html").send(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
      `<title>API partenaire SIM Assurances</title>` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `</head><body style="margin:0">` +
      `<redoc spec-url="openapi.json"></redoc>` +
      `<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>` +
      `</body></html>`
  );
});

// Authentifie tout le reste de /v1 (pose req.partner), PUIS limite par clé, PUIS journalise.
partnerApiRouter.use(requireApiKey());
partnerApiRouter.use(partnerLimiter);
partnerApiRouter.use(journaliserRequetesPartenaire());

/** Produits vendus à la période (curseur de durée) — les autres sont payés en une fois. */
const PRODUITS_CYCLE = new Set(["relaxmoto", "relaxauto"]);
const MAX_PERIODES = 12;

/**
 * Produits que `POST /v1/souscriptions` sait créer aujourd'hui. Les autres
 * (RelaxVoyage, RelaxAccidents générale, SecurHome incendie, produits à devis
 * calculé, Incendie/Accident historiques) demandent des champs métier
 * supplémentaires — reportés à un ticket ultérieur qui extraira une fonction
 * commune partagée avec routes/public.ts.
 */
const PRODUITS_SOUSCRIPTION_API = new Set([
  "relaxmoto",
  "relaxauto",
  "relaxaccidents_fraismedicaux",
]);

/**
 * Option Décès en supplément de RelaxAccidents Frais Médicaux — doit rester
 * alignée sur OPTIONS_DECES_FRAIS_MEDICAUX de routes/public.ts.
 */
const OPTIONS_DECES_FRAIS_MEDICAUX: Record<
  "200000" | "100000",
  { prime: number; capital: number; dureeMois: number }
> = {
  "200000": { prime: 500, capital: 200_000, dureeMois: 2 },
  "100000": { prime: 300, capital: 100_000, dureeMois: 2 },
};

// Data URL image bornée + regex stricte — même régime que routes/public.ts
// (aucun caractère de sortie d'attribut HTML jusqu'au rendu PDF/carte).
const dataUrlImage = z
  .string()
  .max(2_000_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/, "Image invalide");

/** Traduit un échec de résolution produit en réponse HTTP normalisée. */
function erreurResolution(res: Response, raison: Exclude<ResolutionProduit, { ok: true }>["raison"]): Response {
  switch (raison) {
    case "inconnu":
      return apiError(res, 404, "produit_inconnu", "Produit inconnu ou inactif.");
    case "non_autorise":
      return apiError(res, 403, "produit_non_autorise", "Ce produit n'est pas rattaché à votre compte partenaire.");
    case "desactive":
      return apiError(res, 403, "produit_desactive", "Ce produit est désactivé pour votre compte partenaire.");
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET /v1/ping
// ─────────────────────────────────────────────────────────────────────
partnerApiRouter.get(
  "/v1/ping",
  asyncHandler(async (req: PartnerRequest, res) => {
    const p = await prisma.partenaire.findUnique({
      where: { id: req.partner!.partenaireId },
      select: { id: true, nomCommerce: true, nomResponsable: true },
    });
    apiOk(res, {
      environnement: req.partner!.env,
      scopes: req.partner!.scopes,
      partenaire: p,
      horodatage: new Date().toISOString(),
    });
  })
);

// ─────────────────────────────────────────────────────────────────────
// GET /v1/catalogue
// ─────────────────────────────────────────────────────────────────────
partnerApiRouter.get(
  "/v1/catalogue",
  requireScope("catalogue:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const produits = await catalogueDuPartenaire(req.partner!.partenaireId);
    apiOk(res, produits, { total: produits.length });
  })
);

// ─────────────────────────────────────────────────────────────────────
// GET /v1/produits/:code
// ─────────────────────────────────────────────────────────────────────
partnerApiRouter.get(
  "/v1/produits/:code",
  requireScope("catalogue:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const resol = await resoudreProduitPourPartenaire(req.partner!.partenaireId, req.params.code);
    if (!resol.ok) return erreurResolution(res, resol.raison);

    const catalogue = await catalogueDuPartenaire(req.partner!.partenaireId);
    const fiche = catalogue.find((p) => p.code === req.params.code);
    if (!fiche) return erreurResolution(res, "non_autorise");
    apiOk(res, fiche);
  })
);

// ─────────────────────────────────────────────────────────────────────
// POST /v1/devis
// ─────────────────────────────────────────────────────────────────────
const devisSchema = z.object({
  produit: z.string().min(1),
  /** Libellé de la formule (TarifProduit.libelleVariante) — optionnel si le produit n'en a qu'une. */
  formule: z.string().min(1).optional(),
  /** Nombre de périodes souscrites d'avance — RelaxMoto/RelaxAuto uniquement. */
  nombrePeriodes: z.number().int().min(1).max(MAX_PERIODES).optional(),
});

partnerApiRouter.post(
  "/v1/devis",
  requireScope("catalogue:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const data = devisSchema.parse(req.body);

    const resol = await resoudreProduitPourPartenaire(req.partner!.partenaireId, data.produit);
    if (!resol.ok) return erreurResolution(res, resol.raison);
    const { produit } = resol;

    const tarifs = await prisma.tarifProduit.findMany({
      where: { produitId: produit.id },
      orderBy: { prime: "asc" },
    });
    if (tarifs.length === 0) {
      return apiError(
        res,
        501,
        "devis_calcule_non_supporte",
        "Ce produit exige un devis calculé (SecurHome+, SecurPro Dommages) — non encore disponible via l'API."
      );
    }

    let tarif;
    if (data.formule) {
      tarif = tarifs.find((t) => t.libelleVariante === data.formule);
      if (!tarif) {
        return apiError(
          res,
          400,
          "formule_inconnue",
          `Formule inconnue. Formules disponibles : ${tarifs.map((t) => t.libelleVariante ?? "(unique)").join(", ")}.`
        );
      }
    } else if (tarifs.length === 1) {
      tarif = tarifs[0];
    } else {
      return apiError(
        res,
        400,
        "formule_requise",
        `Ce produit a plusieurs formules : ${tarifs.map((t) => t.libelleVariante).join(", ")}.`
      );
    }

    const estCycle = PRODUITS_CYCLE.has(produit.code);
    if (data.nombrePeriodes !== undefined && !estCycle) {
      return apiError(
        res,
        400,
        "nombre_periodes_non_applicable",
        "« nombrePeriodes » ne s'applique qu'à RelaxMoto / RelaxAuto."
      );
    }
    const nombrePeriodes = estCycle ? data.nombrePeriodes ?? 1 : 1;

    const prime = tarif.prime * nombrePeriodes;
    const primeHT = Math.round((tarif.primeHT ?? tarif.prime) * nombrePeriodes);
    const commissionApi = await calculerCommissionApi(produit, primeHT);
    const debut = dateDebutPremiereActivation(produit.code);
    const delaiAttente = debut.getTime() > Date.now() + 1000;

    apiOk(res, {
      produit: {
        code: produit.code,
        libelle: produit.libelle,
        kycRequis: produit.sousBranche === "ASSURANCES_ACCIDENTS",
      },
      formule: tarif.libelleVariante,
      cycleFacturation: estCycle ? tarif.libelleVariante : null,
      nombrePeriodes,
      prime,
      primeUnitaire: tarif.prime,
      primeHT,
      capitalGaranti: tarif.capitalGaranti,
      garanties: tarif.donneesSpecifiques ?? null,
      priseEffet: {
        delaiAttente72h: delaiAttente,
        dateEstimee: debut.toISOString(),
        description: delaiAttente
          ? "Prise d'effet 72h après confirmation du paiement (produits Accidents)."
          : "Prise d'effet immédiate à la confirmation du paiement.",
      },
      commissionApi: {
        montant: commissionApi,
        montantAReverser: prime - commissionApi,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────
// POST /v1/souscriptions  (option B : le partenaire encaisse lui-même)
//
// Crée la souscription en attente de confirmation. Aucune interaction Wave :
// la couverture n'est activée qu'à POST /v1/souscriptions/:id/confirmer-paiement.
// ─────────────────────────────────────────────────────────────────────
const souscriptionSchema = z.object({
  produit: z.string().min(1),
  /** = TarifProduit.libelleVariante ("mensuel"/"annuel" pour RelaxMoto/Auto). */
  formule: z.string().min(1),
  /** Périodes payées d'avance — RelaxMoto/RelaxAuto uniquement. */
  nombrePeriodes: z.number().int().min(1).max(MAX_PERIODES).optional(),
  prospect: z.object({
    nom: z.string().min(1).max(120),
    prenom: z.string().min(1).max(120),
    telephone: z.string().min(6).max(30),
    dateNaissance: z.coerce.date().optional(),
    sexe: z.enum(["masculin", "feminin"]).optional(),
  }),
  // KYC obligatoire : tous les produits actuellement supportés relèvent des
  // Assurances Accidents (carte de prise en charge).
  pieceIdentiteUrl: dataUrlImage,
  selfieUrl: dataUrlImage,
  signature: dataUrlImage.optional(),
  // RelaxAccidents Frais Médicaux : option Décès facultative, réservée aux
  // non-livreurs.
  declarePasLivreur: z.boolean().optional(),
  optionDeces: z.enum(["200000", "100000"]).optional(),
});

partnerApiRouter.post(
  "/v1/souscriptions",
  requireScope("souscriptions:write"),
  withIdempotency(),
  asyncHandler(async (req: PartnerRequest, res) => {
    const data = souscriptionSchema.parse(req.body);
    const partenaireId = req.partner!.partenaireId;

    const resol = await resoudreProduitPourPartenaire(partenaireId, data.produit);
    if (!resol.ok) return erreurResolution(res, resol.raison);
    const { produit } = resol;

    if (!PRODUITS_SOUSCRIPTION_API.has(produit.code)) {
      return apiError(
        res,
        501,
        "produit_non_supporte_api",
        "La création de souscription via l'API n'est pas encore disponible pour ce produit."
      );
    }

    if (await souscriptionGeneriqueDejaConfirmee(produit.id, data.prospect.nom, data.prospect.telephone)) {
      return apiError(
        res,
        409,
        "souscription_doublon",
        "Une souscription confirmée existe déjà pour ce nom et ce numéro sur ce produit."
      );
    }

    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: produit.id, libelleVariante: data.formule },
    });
    if (!tarif) {
      const dispo = await prisma.tarifProduit.findMany({
        where: { produitId: produit.id },
        select: { libelleVariante: true },
        orderBy: { prime: "asc" },
      });
      return apiError(
        res,
        400,
        "formule_inconnue",
        `Formule inconnue. Formules disponibles : ${dispo.map((t) => t.libelleVariante).join(", ")}.`
      );
    }

    const estCycle = PRODUITS_CYCLE.has(produit.code);
    if (data.nombrePeriodes !== undefined && !estCycle) {
      return apiError(
        res,
        400,
        "nombre_periodes_non_applicable",
        "« nombrePeriodes » ne s'applique qu'à RelaxMoto / RelaxAuto."
      );
    }
    if (estCycle && data.formule !== "mensuel" && data.formule !== "annuel") {
      return apiError(res, 400, "formule_inconnue", "Formule attendue pour ce produit : « mensuel » ou « annuel ».");
    }
    const nombrePeriodes = estCycle ? data.nombrePeriodes ?? 1 : 1;

    // Option Décès : uniquement RelaxAccidents Frais Médicaux ET non-livreur
    // déclaré — jamais sur la seule foi du champ transmis.
    const optionDeces =
      data.optionDeces && produit.code === "relaxaccidents_fraismedicaux" && data.declarePasLivreur
        ? OPTIONS_DECES_FRAIS_MEDICAUX[data.optionDeces]
        : null;
    if (data.optionDeces && !optionDeces) {
      return apiError(
        res,
        400,
        "option_deces_indisponible",
        "L'option Décès n'est disponible que pour RelaxAccidents Frais Médicaux, souscripteur non-livreur."
      );
    }

    // Le montant est recalculé ici depuis le tarif en base, jamais transmis.
    const prime = tarif.prime * nombrePeriodes + (optionDeces?.prime ?? 0);
    const primeHT = Math.round((tarif.primeHT ?? tarif.prime) * nombrePeriodes);
    const commissionApi = await calculerCommissionApi(produit, primeHT);
    const montantAReverser = prime - commissionApi;

    const donneesSpecifiques =
      data.signature || optionDeces
        ? {
            signature: data.signature ?? null,
            ...(optionDeces ? { declarePasLivreur: true, optionDeces } : {}),
          }
        : undefined;

    const s = await prisma.souscription.create({
      data: {
        produitId: produit.id,
        partenaireId,
        nom: data.prospect.nom,
        prenom: data.prospect.prenom,
        telephone: data.prospect.telephone,
        dateNaissance: data.prospect.dateNaissance ?? null,
        sexe: data.prospect.sexe ?? null,
        montantPrime: prime,
        capitalGaranti: tarif.capitalGaranti,
        waveStatut: "en_attente",
        nombreEcheances: 1,
        cycleFacturation: estCycle ? (data.formule as "mensuel" | "annuel") : null,
        nombrePeriodes,
        pieceIdentiteUrl: data.pieceIdentiteUrl,
        donneesSpecifiques,
        canalVente: "api",
        apiKeyId: req.partner!.apiKeyId,
        montantCommissionApi: commissionApi,
        montantAReverser,
        documents: { create: { type: "Selfie", url: data.selfieUrl } },
        paiements: {
          create: { numeroEcheance: 1, montant: prime, dateEcheance: new Date() },
        },
      },
      include: { paiements: true },
    });
    res.locals.souscriptionId = s.id;

    await notifyPartenaire(
      partenaireId,
      "souscription",
      `Souscription API ${produit.libelle}`,
      `Nouvelle souscription ${produit.libelle} (${prime} FCFA) via l'API — en attente de confirmation de paiement.`,
      "/partenaire/souscriptions"
    );
    await emettreWebhook(req.partner!.apiKeyId, "souscription.creee", {
      souscriptionId: s.id,
      produit: produit.code,
      formule: data.formule,
      statut: "en_attente_confirmation",
      montantAPercevoir: prime,
      montantAReverser,
    }).catch((e) => console.error("[partnerWebhook] souscription.creee", e));

    const debut = dateDebutPremiereActivation(produit.code);
    apiOk(
      res,
      {
        id: s.id,
        statut: "en_attente_confirmation",
        produit: produit.code,
        formule: data.formule,
        montantAPercevoir: prime,
        montantCommissionApi: commissionApi,
        montantAReverser,
        echeanceId: s.paiements[0]?.id ?? null,
        priseEffet: {
          delaiAttente72h: debut.getTime() > Date.now() + 1000,
          dateEstimee: debut.toISOString(),
        },
      },
      undefined,
      201
    );
  })
);

// ─────────────────────────────────────────────────────────────────────
// POST /v1/souscriptions/:id/confirmer-paiement
//
// Le partenaire déclare avoir encaissé la prime. Rejoue exactement ce que
// fait le webhook Wave sur le parcours public (confirmerEcheance) : police,
// dates (délai 72h le cas échéant), carte, compte + SMS client, commission.
// ─────────────────────────────────────────────────────────────────────
const confirmerPaiementSchema = z.object({
  referencePaiement: z.string().min(1).max(120),
  /** Doit être STRICTEMENT égal à la prime due (aucune tolérance). */
  montantPercu: z.number().int().positive(),
  datePaiement: z.coerce.date().optional(),
});

partnerApiRouter.post(
  "/v1/souscriptions/:id/confirmer-paiement",
  requireScope("souscriptions:write"),
  withIdempotency(),
  asyncHandler(async (req: PartnerRequest, res) => {
    const data = confirmerPaiementSchema.parse(req.body);

    const s = await prisma.souscription.findFirst({
      where: {
        id: req.params.id,
        partenaireId: req.partner!.partenaireId,
        canalVente: "api",
      },
      include: { paiements: true, produit: { select: { code: true } } },
    });
    if (!s) return apiError(res, 404, "souscription_inconnue", "Souscription introuvable pour ce partenaire.");
    res.locals.souscriptionId = s.id;

    if (s.waveStatut === "confirme") {
      return apiError(res, 409, "deja_confirmee", "Cette souscription est déjà confirmée.");
    }
    if (data.montantPercu !== s.montantPrime) {
      return apiError(
        res,
        400,
        "montant_incoherent",
        `Le montant perçu (${data.montantPercu}) doit être strictement égal à la prime due (${s.montantPrime}).`
      );
    }

    const echeance = s.paiements.find((p) => p.numeroEcheance === 1);
    if (!echeance) {
      return apiError(res, 500, "echeance_absente", "Aucune échéance à confirmer sur cette souscription.");
    }

    const waveTransactionId = `API-${data.referencePaiement}`;
    await prisma.souscription.update({
      where: { id: s.id },
      data: { referencePaiementPartenaire: data.referencePaiement },
    });
    await prisma.paiement.update({
      where: { id: echeance.id },
      data: { waveTransactionId },
    });

    await confirmerEcheance({ ...echeance, waveTransactionId });

    const apres = await prisma.souscription.findUniqueOrThrow({
      where: { id: s.id },
      select: {
        waveStatut: true,
        numeroPolice: true,
        dateDebut: true,
        dateFin: true,
        montantAReverser: true,
      },
    });

    const apiKeyId = req.partner!.apiKeyId;
    await emettreWebhook(apiKeyId, "paiement.recu", {
      souscriptionId: s.id,
      referencePaiement: data.referencePaiement,
      montant: data.montantPercu,
    }).catch((e) => console.error("[partnerWebhook] paiement.recu", e));
    if (apres.waveStatut === "confirme") {
      await emettreWebhook(apiKeyId, "souscription.confirmee", {
        souscriptionId: s.id,
        produit: s.produit.code,
        numeroPolice: apres.numeroPolice,
        dateDebut: apres.dateDebut,
        dateFin: apres.dateFin,
        montantAReverser: apres.montantAReverser,
      }).catch((e) => console.error("[partnerWebhook] souscription.confirmee", e));
      await emettreWebhook(apiKeyId, "contrat.disponible", {
        souscriptionId: s.id,
        numeroPolice: apres.numeroPolice,
        carteUrl: `/api/partner/v1/souscriptions/${s.id}/carte.png`,
      }).catch((e) => console.error("[partnerWebhook] contrat.disponible", e));
    }

    apiOk(res, {
      id: s.id,
      statut: apres.waveStatut === "confirme" ? "confirmee" : "en_attente_confirmation",
      numeroPolice: apres.numeroPolice,
      dateDebut: apres.dateDebut,
      dateFin: apres.dateFin,
      montantAReverser: apres.montantAReverser,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────
// Lecture des souscriptions du partenaire (canal API uniquement)
// ─────────────────────────────────────────────────────────────────────

/** État exposé côté partenaire, dérivé de `waveStatut`. */
function statutPublic(waveStatut: string | null): "en_attente_confirmation" | "confirmee" | "echouee" {
  if (waveStatut === "confirme") return "confirmee";
  if (waveStatut === "echoue") return "echouee";
  return "en_attente_confirmation";
}

type LigneSouscription = {
  id: string;
  produitId: string;
  cycleFacturation: string | null;
  waveStatut: string | null;
  nom: string | null;
  prenom: string | null;
  telephone: string;
  montantPrime: number;
  montantCommissionApi: number | null;
  montantAReverser: number | null;
  numeroPolice: string | null;
  dateDebut: Date | null;
  dateFin: Date | null;
  referencePaiementPartenaire: string | null;
  createdAt: Date;
  produit: { code: string; libelle: string };
};

function vueSouscription(s: LigneSouscription) {
  return {
    id: s.id,
    produit: s.produit.code,
    produitLibelle: s.produit.libelle,
    formule: s.cycleFacturation,
    statut: statutPublic(s.waveStatut),
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    montantPrime: s.montantPrime,
    montantCommissionApi: s.montantCommissionApi,
    montantAReverser: s.montantAReverser,
    numeroPolice: s.numeroPolice,
    dateDebut: s.dateDebut,
    dateFin: s.dateFin,
    referencePaiementPartenaire: s.referencePaiementPartenaire,
    createdAt: s.createdAt,
  };
}

const listeSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
  statut: z.enum(["en_attente_confirmation", "confirmee", "echouee"]).optional(),
  produit: z.string().min(1).optional(),
  depuis: z.coerce.date().optional(),
});

const WAVE_STATUT_PAR_PUBLIC: Record<
  "en_attente_confirmation" | "confirmee" | "echouee",
  "en_attente" | "confirme" | "echoue"
> = {
  en_attente_confirmation: "en_attente",
  confirmee: "confirme",
  echouee: "echoue",
};

partnerApiRouter.get(
  "/v1/souscriptions",
  requireScope("souscriptions:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const q = listeSchema.parse(req.query);

    let produitId: string | undefined;
    if (q.produit) {
      const resol = await resoudreProduitPourPartenaire(req.partner!.partenaireId, q.produit);
      if (!resol.ok) return erreurResolution(res, resol.raison);
      produitId = resol.produit.id;
    }

    const where: Prisma.SouscriptionWhereInput = {
      partenaireId: req.partner!.partenaireId,
      canalVente: "api",
    };
    if (produitId) where.produitId = produitId;
    if (q.statut) where.waveStatut = WAVE_STATUT_PAR_PUBLIC[q.statut];
    if (q.depuis) where.createdAt = { gte: q.depuis };

    const lignes = await prisma.souscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { produit: { select: { code: true, libelle: true } } },
    });

    const page = lignes.slice(0, q.limit);
    const nextCursor = lignes.length > q.limit ? page[page.length - 1]?.id ?? null : null;

    apiOk(res, page.map(vueSouscription), { limit: q.limit, nextCursor });
  })
);

partnerApiRouter.get(
  "/v1/souscriptions/:id",
  requireScope("souscriptions:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const s = await prisma.souscription.findFirst({
      where: { id: req.params.id, partenaireId: req.partner!.partenaireId, canalVente: "api" },
      include: {
        produit: { select: { code: true, libelle: true } },
        documents: { select: { type: true, createdAt: true } },
      },
    });
    if (!s) return apiError(res, 404, "souscription_inconnue", "Souscription introuvable pour ce partenaire.");

    apiOk(res, {
      ...vueSouscription(s),
      capitalGaranti: s.capitalGaranti,
      nombrePeriodes: s.nombrePeriodes,
      sexe: s.sexe,
      dateNaissance: s.dateNaissance,
      garanties: s.donneesSpecifiques ?? null,
      documents: s.documents.map((d) => ({ type: d.type, depuisLe: d.createdAt })),
    });
  })
);

partnerApiRouter.get(
  "/v1/souscriptions/:id/evenements",
  requireScope("souscriptions:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const s = await prisma.souscription.findFirst({
      where: { id: req.params.id, partenaireId: req.partner!.partenaireId, canalVente: "api" },
      include: { paiements: { orderBy: { numeroEcheance: "asc" } } },
    });
    if (!s) return apiError(res, 404, "souscription_inconnue", "Souscription introuvable pour ce partenaire.");

    const evenements: { type: string; date: Date; reference?: string | null }[] = [
      { type: "creee", date: s.createdAt },
    ];
    for (const p of s.paiements) {
      if (p.statut === "paye" && p.datePaiement) {
        evenements.push({
          type: p.estRenouvellement ? "renouvellement_confirme" : "paiement_confirme",
          date: p.datePaiement,
          reference: p.waveTransactionId,
        });
      }
    }
    if (s.dateDebut) evenements.push({ type: "couverture_debut", date: s.dateDebut });
    if (s.renouveleAt) evenements.push({ type: "renouvelee", date: s.renouveleAt });

    evenements.sort((a, b) => a.date.getTime() - b.date.getTime());
    apiOk(res, evenements);
  })
);

// ─────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────

partnerApiRouter.get(
  "/v1/souscriptions/:id/carte.png",
  requireScope("documents:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const s = await prisma.souscription.findFirst({
      where: { id: req.params.id, partenaireId: req.partner!.partenaireId, canalVente: "api" },
      select: { id: true },
    });
    if (!s) return apiError(res, 404, "souscription_inconnue", "Souscription introuvable pour ce partenaire.");

    try {
      const { png, matricule } = await renderCartePngGenerique(s.id);
      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="carte-${(matricule || "sim").replace(/[^a-zA-Z0-9-_]+/g, "-")}.png"`
      );
      res.send(png);
    } catch (e) {
      if (e instanceof CarteIndisponibleError) return apiError(res, e.status, e.code, e.message);
      throw e;
    }
  })
);

partnerApiRouter.get(
  "/v1/souscriptions/:id/contrat.pdf",
  requireScope("documents:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const s = await prisma.souscription.findFirst({
      where: { id: req.params.id, partenaireId: req.partner!.partenaireId, canalVente: "api" },
      select: { id: true },
    });
    if (!s) return apiError(res, 404, "souscription_inconnue", "Souscription introuvable pour ce partenaire.");
    // L'assemblage des données de contrat vit aujourd'hui côté frontend
    // (routes/contrats.ts::POST /pdf attend un payload déjà construit).
    // Portage serveur prévu dans un ticket ultérieur.
    return apiError(
      res,
      501,
      "contrat_pdf_non_disponible",
      "Le PDF du contrat n'est pas encore exposé via l'API. Utilisez les champs de GET /v1/souscriptions/:id."
    );
  })
);
