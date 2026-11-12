import { Router } from "express";
import type { Response } from "express";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import type { Produit } from "@prisma/client";
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
  PRODUITS_SOUSCRIPTION_API,
  PRODUITS_API_CALCULES,
  calculerCommissionApi,
  souscriptionGeneriqueDejaConfirmee,
  type ResolutionProduit,
} from "../services/cataloguePartenaire.js";
import { dateDebutPremiereActivation } from "../services/notify.js";
import { confirmerEcheance } from "../services/paiementWave.js";
import { notifyPartenaire } from "../services/notifications.js";
import { renderCartePngGenerique, CarteIndisponibleError } from "../services/carteRender.js";
import { emettreWebhook } from "../services/partnerWebhook.js";
import { analyserSouscriptionApiIA } from "../services/fraudeIA.js";
import { openapiPartnerV1 } from "../openapi/partnerV1.js";
import { resoudreOuCreerClient } from "../services/clients.js";
import { aGarantieDeces, avecBeneficiaire, beneficiaireAStocker } from "../services/beneficiaireDeces.js";
import { capitalDecesDuTarif, estProduitRaf } from "../services/garantieDecesFraisMedicaux.js";
import { refusSiCumulRelaxAccidents } from "../services/cumulRelaxAccidents.js";
import { calculerCotation, ErreurCotation, garantiesCotation, type ProduitCotation, type ResultatCotation } from "../services/cotations.js";
import { construireDonneesSpecifiques, primeNetteDuDevis, resultatAStocker } from "../services/donneesSouscription.js";
import { beneficiaireRequisPourDevis, verifierBeneficiaire } from "../services/beneficiaireDeces.js";
import {
  AGE_MAX_ASSURE_PRINCIPAL,
  AGE_MIN_ASSURE_PRINCIPAL,
  VALIDATION_SANTE,
  ageRevolu,
  estProduitSante,
  ficheSanteSchema,
  paiementBloqueParValidation,
  personneAssureeSanteSchema,
  questionnaireSanteSchema,
  type ReponsesSante,
  validerFichesPersonnesSante,
  validerPersonnesAssureesSante,
  verifierQuestionnaireSante,
} from "../services/assurancesSante.js";

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

// Limite d'abord (par IP tant que req.partner n'est pas encore posé — voir
// security.ts::partnerLimiter — pour que les tentatives avec une clé
// invalide soient elles aussi comptabilisées, audit sécurité 2026-09-11),
// PUIS authentifie (pose req.partner, la limite bascule alors par clé pour
// la suite de la requête), PUIS journalise.
partnerApiRouter.use(partnerLimiter);
partnerApiRouter.use(requireApiKey());
partnerApiRouter.use(journaliserRequetesPartenaire());

/** Produits vendus à la période (curseur de durée) — les autres sont payés en une fois. */
const PRODUITS_CYCLE = new Set(["relaxmoto", "relaxauto"]);
const MAX_PERIODES = 12;

// Produits que `POST /v1/souscriptions` sait créer : voir PRODUITS_SOUSCRIPTION_API
// (services/cataloguePartenaire.ts), aussi exposé au catalogue (`souscriptionApi`).

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
  /**
   * Paramètres de tarification des produits « calculés » (RelaxVoyage, RelaxAccidents générale, SecurHome,
   * SecurHome+, SecurPro, SecurMoto, Santé) — mêmes champs que le devis partageable (services/cotations.ts).
   */
  entrees: z.record(z.string(), z.unknown()).optional(),
});

/** Produits dont la « formule » du barème se place dans `entrees.formule` (le partenaire peut l'envoyer à la racine). */
const FORMULE_DANS_ENTREES = new Set(["relaxvoyage", "sante_solo", "sante_duo", "sante_famille"]);

/**
 * Prix d'un produit « calculé » par le moteur de devis partagé (services/cotations.ts) — jamais lu dans
 * la requête. Répond 400 et renvoie `null` si les paramètres sont invalides ou le barème indisponible.
 */
async function calculerDevisApi(
  res: Response,
  code: ProduitCotation,
  formule: string | undefined,
  entreesBrutes: Record<string, unknown> | undefined
): Promise<ResultatCotation | null> {
  const entrees: Record<string, unknown> = { ...(entreesBrutes ?? {}) };
  if (formule !== undefined && entrees.formule === undefined && FORMULE_DANS_ENTREES.has(code)) entrees.formule = formule;
  try {
    return await calculerCotation(code, entrees);
  } catch (e) {
    if (e instanceof ZodError) {
      apiError(res, 400, "entrees_invalides", "Paramètres de tarification invalides pour ce produit (voir « details »).", e.errors);
      return null;
    }
    if (e instanceof ErreurCotation) {
      apiError(res, 400, "devis_invalide", e.message);
      return null;
    }
    throw e;
  }
}

partnerApiRouter.post(
  "/v1/devis",
  requireScope("catalogue:read"),
  asyncHandler(async (req: PartnerRequest, res) => {
    const data = devisSchema.parse(req.body);

    const resol = await resoudreProduitPourPartenaire(req.partner!.partenaireId, data.produit);
    if (!resol.ok) return erreurResolution(res, resol.raison);
    const { produit } = resol;

    // Produits « calculés » : même moteur que le devis partageable, paramètres dans `entrees`.
    if (PRODUITS_API_CALCULES.has(produit.code)) {
      const code = produit.code as ProduitCotation;
      const calcul = await calculerDevisApi(res, code, data.formule, data.entrees);
      if (!calcul) return;
      // Prime à l'unité de franc : la base stocke des montants entiers (SecurPro peut calculer 13 085,25).
      const primeAPayer = Math.round(calcul.primeTTC);
      const primeHT = await primeNetteDuDevis(code, calcul);
      const commissionApi = await calculerCommissionApi(produit, primeHT);
      const debut = dateDebutPremiereActivation(code);
      const delaiAttente = debut.getTime() > Date.now() + 1000;
      return apiOk(res, {
        produit: { code: produit.code, libelle: produit.libelle, kycRequis: produit.sousBranche === "ASSURANCES_ACCIDENTS" },
        formule: calcul.libelleFormule,
        cycleFacturation: null,
        nombrePeriodes: 1,
        prime: primeAPayer,
        primeUnitaire: primeAPayer,
        primeHT,
        capitalGaranti: calcul.capitalGaranti,
        garanties: garantiesCotation(code, calcul.entrees, calcul.resultat, calcul.capitalGaranti),
        // Détail de la prime (lignes de garanties, accessoires, taxes) pour SecurHome+, SecurPro et SecurMoto ;
        // les produits à tarif fixe n'ont pas de détail ligne à ligne.
        detail: calcul.resultat,
        entrees: calcul.entrees,
        beneficiaireRequis: beneficiaireRequisPourDevis(code, calcul.resultat),
        // Assurances Santé : aucune couverture avant la validation de la demande par SIM Assurances.
        validationRequise: estProduitSante(code),
        priseEffet: {
          delaiAttente72h: delaiAttente,
          dateEstimee: debut.toISOString(),
          description: delaiAttente
            ? "Prise d'effet 24h après confirmation du paiement (produits Accidents)."
            : "Prise d'effet immédiate à la confirmation du paiement.",
        },
        commissionApi: { montant: commissionApi, montantAReverser: primeAPayer - commissionApi },
      });
    }

    const tarifs = await prisma.tarifProduit.findMany({
      where: { produitId: produit.id },
      orderBy: { prime: "asc" },
    });
    if (tarifs.length === 0) {
      return apiError(
        res,
        501,
        "devis_calcule_non_supporte",
        "Ce produit n'a pas de barème exploitable pour un devis via l'API."
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
          ? "Prise d'effet 24h après confirmation du paiement (produits Accidents)."
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
// Trajet RelaxVoyage (même contrôle que le parcours public).
const voyageSchema = z.object({
  typePiece: z.enum(["CNI", "Permis", "Passeport"]).optional(),
  compagnie: z.string().min(1).max(120),
  lieuDepart: z.string().min(1).max(120),
  lieuArrivee: z.string().min(1).max(120),
  numeroTicket: z.string().min(1).max(60),
  dateDepart: z.coerce.date(),
  numeroPersonneContact: z.string().min(6).max(40),
});

// Commerce / logement assuré — SecurHome+ et SecurPro (facultatif, imprimé sur le contrat).
const commerceSchema = z.object({
  nomCommercial: z.string().max(200).optional(),
  ville: z.string().max(120).optional(),
  communeQuartier: z.string().max(120).optional(),
  refFacture: z.string().max(120).optional(),
});

// Assurances Santé : dossier médical de la demande, validé par SIM Assurances avant tout paiement.
const santeSchema = z.object({
  ficheSante: ficheSanteSchema,
  /** Personnes couvertes en plus du souscripteur (Solo : aucune ; Duo : le conjoint ; Famille : conjoint + 3 enfants max). */
  personnesAssurees: z.array(personneAssureeSanteSchema).max(4).default([]),
  /** Réponses au questionnaire médical, une entrée par personne assurée (souscripteur en tête). */
  questionnaireSante: questionnaireSanteSchema,
});

const souscriptionSchema = z.object({
  produit: z.string().min(1),
  /**
   * = TarifProduit.libelleVariante : "mensuel"/"annuel" pour RelaxMoto/Auto, formule du barème pour les
   * RelaxAccidents Frais Médicaux, RelaxVoyage et Santé. Inutile pour les autres produits « calculés »
   * (leurs paramètres vont dans `entrees`). Exigée pour les 4 produits tarifés par formule — vérifié plus bas.
   */
  formule: z.string().min(1).optional(),
  /** Périodes payées d'avance — RelaxMoto/RelaxAuto uniquement. */
  nombrePeriodes: z.number().int().min(1).max(MAX_PERIODES).optional(),
  /** Paramètres de tarification des 9 produits « calculés » — voir POST /v1/devis. */
  entrees: z.record(z.string(), z.unknown()).optional(),
  prospect: z.object({
    nom: z.string().min(1).max(120),
    prenom: z.string().min(1).max(120),
    telephone: z.string().min(6).max(30),
    dateNaissance: z.coerce.date().optional(),
    sexe: z.enum(["masculin", "feminin"]).optional(),
    civilite: z.enum(["M.", "MLLE", "MME"]).optional(),
    email: z.string().trim().email().max(160).optional(),
    ville: z.string().max(120).optional(),
    commune: z.string().max(120).optional(),
    adresse: z.string().max(200).optional(),
    numeroPieceIdentite: z.string().max(60).optional(),
  }),
  /** RelaxVoyage uniquement — trajet. */
  voyage: voyageSchema.optional(),
  /** SecurHome+ / SecurPro uniquement — commerce ou logement assuré. */
  commerce: commerceSchema.optional(),
  /** Assurances Santé uniquement — dossier médical. */
  sante: santeSchema.optional(),
  // Pièce d'identité exigée pour les 6 produits Accidents ; selfie exigé pour tous sauf RelaxVoyage ; rien pour
  // les Assurances Dommages et Santé (la pièce est déposée plus tard via le lien SMS de la demande Santé).
  // Vérifié par produit plus bas.
  pieceIdentiteUrl: dataUrlImage.optional(),
  selfieUrl: dataUrlImage.optional(),
  signature: dataUrlImage.optional(),
  // RelaxAccidents Frais Médicaux : case « je ne suis pas livreur » (produit grand public).
  declarePasLivreur: z.boolean().optional(),
  // Ancienne option Décès, supprimée le 2026-10-30 (Décès inclus dans la formule) : acceptée au
  // parsing pour répondre par une erreur explicite aux intégrations qui l'envoient encore.
  optionDeces: z.string().optional(),
  // Bénéficiaire de la garantie Décès — facultatif côté API (les intégrations existantes ne
  // l'envoient pas), imprimé sur le contrat quand il est fourni.
  beneficiaire: z.object({ nom: z.string().trim().min(2).max(120), telephone: z.string().trim().min(6).max(40) }).optional(),
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
    // Un seul produit RelaxAccidents par client (RelaxVoyage excepté) — services/cumulRelaxAccidents.ts.
    const refusCumul = await refusSiCumulRelaxAccidents(produit.code, data.prospect.telephone);
    if (refusCumul) return apiError(res, 409, refusCumul.code, refusCumul.error);

    // Les 9 produits « calculés » ont leur propre parcours (prime issue du moteur de devis).
    if (PRODUITS_API_CALCULES.has(produit.code)) return souscrireProduitCalcule(req, res, data, produit);

    // Produits tarifés par formule : formule et KYC (pièce + selfie) obligatoires.
    if (!data.formule) return apiError(res, 400, "formule_requise", "Le champ « formule » est obligatoire pour ce produit.");
    if (!data.pieceIdentiteUrl || !data.selfieUrl) {
      return apiError(res, 400, "kyc_requis", "« pieceIdentiteUrl » et « selfieUrl » sont obligatoires pour ce produit.");
    }
    const pieceIdentiteUrl = data.pieceIdentiteUrl;
    const selfieUrl = data.selfieUrl;

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

    // L'option Décès n'existe plus (2026-10-30) : le Décès est inclus dans la formule des
    // RelaxAccidents Frais Médicaux. Une intégration qui l'envoie encore reçoit une erreur
    // explicite plutôt qu'un montant différent de celui qu'elle attendait.
    if (data.optionDeces) {
      return apiError(
        res,
        400,
        "option_deces_supprimee",
        "L'option Décès n'existe plus : la garantie Décès est incluse dans la formule de RelaxAccidents Frais Médicaux. Retirez le champ « optionDeces »."
      );
    }
    // Capital Décès de la formule, lu sur la ligne de barème et figé sur la souscription.
    const capitalDeces = estProduitRaf(produit.code) ? capitalDecesDuTarif(tarif) : null;

    // Le montant est recalculé ici depuis le tarif en base, jamais transmis.
    const prime = tarif.prime * nombrePeriodes;
    const primeHT = Math.round((tarif.primeHT ?? tarif.prime) * nombrePeriodes);
    const commissionApi = await calculerCommissionApi(produit, primeHT);
    const montantAReverser = prime - commissionApi;

    const donneesSpecifiques = avecBeneficiaire(
      data.signature || capitalDeces
        ? {
            signature: data.signature ?? null,
            ...(capitalDeces ? { garantieDeces: { capital: capitalDeces } } : {}),
          }
        : undefined,
      beneficiaireAStocker(
        { beneficiaireNom: data.beneficiaire?.nom, beneficiaireTelephone: data.beneficiaire?.telephone },
        !!data.beneficiaire && aGarantieDeces(produit.code)
      )
    );

    const client = await resoudreOuCreerClient(data.prospect.telephone, data.prospect.nom, data.prospect.prenom);
    const s = await prisma.souscription.create({
      data: {
        produitId: produit.id,
        partenaireId,
        clientId: client.id,
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
        pieceIdentiteUrl,
        donneesSpecifiques,
        canalVente: "api",
        apiKeyId: req.partner!.apiKeyId,
        montantCommissionApi: commissionApi,
        montantAReverser,
        documents: { create: { type: "Selfie", url: selfieUrl } },
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

    // Analyse anti-fraude IA (pièce d'identité ↔ selfie ↔ identité déclarée),
    // en fire-and-forget : ne bloque ni ne fait échouer la souscription.
    // Résultat purement indicatif, consultable côté admin.
    void analyserSouscriptionApiIA(s.id).catch((e) =>
      console.error("[fraudeIA] souscription API", e)
    );

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

type DonneesSouscriptionApi = z.infer<typeof souscriptionSchema>;

/**
 * Souscription d'un des 9 produits « calculés » (RelaxVoyage, RelaxAccidents générale, SecurHome, SecurHome+,
 * SecurPro, SecurMoto, Santé Solo/Duo/Famille). La prime vient du moteur de devis (jamais de la requête) ;
 * les données sont écrites dans la même forme que sur le parcours public (services/donneesSouscription.ts),
 * donc contrat, carte et facture se génèrent à la confirmation comme pour tout autre canal.
 *
 * Assurances Santé : la souscription est une DEMANDE (`validationStatut: en_attente`) que SIM Assurances
 * valide avant tout paiement — le client reçoit alors le lien de dépôt des pièces par SMS.
 */
async function souscrireProduitCalcule(
  req: PartnerRequest,
  res: Response,
  data: DonneesSouscriptionApi,
  produit: Produit
): Promise<Response | void> {
  const code = produit.code as ProduitCotation;
  const partenaireId = req.partner!.partenaireId;
  const sante = estProduitSante(code);
  const p = data.prospect;

  // Pièces d'identité : exigées pour les produits Accidents (la pièce pour RelaxVoyage ; pièce + selfie pour
  // RelaxAccidents générale) ; facultatives pour les Assurances Dommages et Santé.
  if ((code === "relaxvoyage" || code === "relaxaccidents") && !data.pieceIdentiteUrl) {
    return apiError(res, 400, "kyc_requis", "« pieceIdentiteUrl » est obligatoire pour ce produit.");
  }
  if (code === "relaxaccidents" && !data.selfieUrl) {
    return apiError(res, 400, "kyc_requis", "« selfieUrl » est obligatoire pour ce produit.");
  }
  if (p.dateNaissance && p.dateNaissance > new Date()) {
    return apiError(res, 400, "date_naissance_invalide", "La date de naissance ne peut pas être dans le futur.");
  }

  // Trajet RelaxVoyage.
  if (code === "relaxvoyage") {
    if (!data.voyage) {
      return apiError(res, 400, "voyage_requis", "Le bloc « voyage » (compagnie, trajet, ticket, date de départ, contact) est obligatoire pour RelaxVoyage.");
    }
    const aujourdhui = new Date();
    aujourdhui.setUTCHours(0, 0, 0, 0);
    if (data.voyage.dateDepart < aujourdhui) {
      return apiError(res, 400, "date_depart_passee", "La date de départ ne peut pas être passée.");
    }
  }

  // Bénéficiaire de la garantie Décès : exigé pour RelaxVoyage et RelaxAccidents générale.
  const exigeBeneficiaire = aGarantieDeces(code);
  const erreurBeneficiaire = verifierBeneficiaire(
    { beneficiaireNom: data.beneficiaire?.nom, beneficiaireTelephone: data.beneficiaire?.telephone },
    exigeBeneficiaire
  );
  if (erreurBeneficiaire) return apiError(res, 400, "beneficiaire_requis", erreurBeneficiaire);

  // Assurances Santé : mêmes contrôles que le formulaire public (âge, fiche, personnes assurées, questionnaire).
  let reponsesSante: ReponsesSante[] = [];
  if (sante) {
    if (!data.sante) {
      return apiError(res, 400, "sante_requis", "Le bloc « sante » (ficheSante, personnesAssurees, questionnaireSante) est obligatoire pour ce produit.");
    }
    if (!p.dateNaissance) {
      return apiError(res, 400, "date_naissance_requise", "La date de naissance du souscripteur est obligatoire pour les Assurances Santé.");
    }
    const age = ageRevolu(p.dateNaissance);
    if (age < AGE_MIN_ASSURE_PRINCIPAL || age > AGE_MAX_ASSURE_PRINCIPAL) {
      return apiError(res, 400, "age_non_eligible", `L'assuré principal doit avoir entre ${AGE_MIN_ASSURE_PRINCIPAL} et ${AGE_MAX_ASSURE_PRINCIPAL} ans.`);
    }
    if (!p.sexe) return apiError(res, 400, "sexe_requis", "Le sexe du souscripteur est obligatoire pour les Assurances Santé.");
    const erreurPersonnes = validerPersonnesAssureesSante(code as "sante_solo" | "sante_duo" | "sante_famille", data.sante.personnesAssurees);
    if (erreurPersonnes) return apiError(res, 400, "personnes_assurees_invalides", erreurPersonnes);
    const erreurFiches = validerFichesPersonnesSante(data.sante.personnesAssurees);
    if (erreurFiches) return apiError(res, 400, "fiches_invalides", erreurFiches);
    const verification = verifierQuestionnaireSante(p.sexe, data.sante.personnesAssurees, data.sante.questionnaireSante);
    if ("erreur" in verification) return apiError(res, 400, "questionnaire_invalide", verification.erreur);
    reponsesSante = verification.reponses;
  }

  // Prime : toujours recalculée ici depuis le barème, jamais transmise.
  const calcul = await calculerDevisApi(res, code, data.formule, data.entrees);
  if (!calcul) return;

  if (sante) {
    // Une demande déjà déposée (en attente de validation, ou validée mais pas encore payée) n'est pas doublée.
    const demandeEnCours = await prisma.souscription.findFirst({
      where: {
        produitId: produit.id,
        nom: { equals: p.nom.trim(), mode: "insensitive" },
        telephone: p.telephone.trim(),
        waveStatut: { not: "confirme" },
        validationStatut: { in: [VALIDATION_SANTE.EN_ATTENTE, VALIDATION_SANTE.VALIDEE] },
      },
      select: { id: true },
    });
    if (demandeEnCours) {
      return apiError(res, 409, "demande_en_cours", "Une demande est déjà en cours pour ce nom et ce numéro sur ce produit.");
    }
  }

  // Montant entier : le même que celui du devis et de `Souscription.montantPrime` (colonne entière).
  const prime = Math.round(calcul.primeTTC);
  const primeHT = await primeNetteDuDevis(code, calcul);
  const commissionApi = await calculerCommissionApi(produit, primeHT);
  const montantAReverser = prime - commissionApi;

  const donneesBase =
    sante && data.sante
      ? {
          signature: data.signature ?? null,
          formule: calcul.entrees.formule,
          tauxPriseEnCharge: (calcul.resultat as { tauxPriseEnCharge?: number }).tauxPriseEnCharge,
          personnesAssurees: data.sante.personnesAssurees,
          // Fiche de l'assuré principal et questionnaire de chaque personne assurée — données de santé,
          // relues uniquement par l'admin qui valide la demande.
          ficheSante: data.sante.ficheSante,
          questionnaireSante: {
            personnes: reponsesSante.map((reponses) => ({ reponses })),
            declareExactEtSincere: true,
            signeLe: new Date().toISOString(),
          },
        }
      : construireDonneesSpecifiques(code, calcul.entrees, calcul.resultat, {
          nom: p.nom,
          prenom: p.prenom,
          signature: data.signature ?? null,
          ville: data.commerce?.ville ?? p.ville ?? null,
          communeQuartier: data.commerce?.communeQuartier ?? null,
          refFacture: data.commerce?.refFacture ?? null,
          nomCommercial: data.commerce?.nomCommercial ?? null,
          typePiece: data.voyage?.typePiece ?? null,
          compagnie: data.voyage?.compagnie,
          lieuDepart: data.voyage?.lieuDepart,
          lieuArrivee: data.voyage?.lieuArrivee,
          numeroTicket: data.voyage?.numeroTicket,
          dateDepart: data.voyage?.dateDepart,
          numeroPersonneContact: data.voyage?.numeroPersonneContact,
        });
  const donneesSpecifiques = avecBeneficiaire(
    donneesBase,
    beneficiaireAStocker({ beneficiaireNom: data.beneficiaire?.nom, beneficiaireTelephone: data.beneficiaire?.telephone }, exigeBeneficiaire)
  );

  const client = await resoudreOuCreerClient(p.telephone, p.nom, p.prenom);
  const s = await prisma.souscription.create({
    data: {
      produitId: produit.id,
      partenaireId,
      clientId: client.id,
      nom: p.nom,
      prenom: p.prenom,
      telephone: p.telephone,
      email: sante ? p.email ?? null : undefined,
      dateNaissance: p.dateNaissance ?? null,
      sexe: p.sexe ?? null,
      civilite: p.civilite ?? null,
      ville: p.ville ?? null,
      commune: p.commune ?? null,
      adresse: p.adresse ?? null,
      numeroPieceIdentite: p.numeroPieceIdentite ?? null,
      montantPrime: prime,
      capitalGaranti: calcul.capitalGaranti,
      waveStatut: "en_attente",
      // Assurances Santé : demande soumise à la validation d'un admin, sans paiement immédiat.
      validationStatut: sante ? VALIDATION_SANTE.EN_ATTENTE : null,
      nombreEcheances: 1,
      pieceIdentiteUrl: data.pieceIdentiteUrl ?? null,
      donneesSpecifiques: JSON.parse(JSON.stringify(donneesSpecifiques)),
      resultat: resultatAStocker(code, calcul.entrees, calcul.resultat),
      canalVente: "api",
      apiKeyId: req.partner!.apiKeyId,
      montantCommissionApi: commissionApi,
      montantAReverser,
      ...(data.selfieUrl ? { documents: { create: { type: "Selfie", url: data.selfieUrl } } } : {}),
      paiements: { create: { numeroEcheance: 1, montant: prime, dateEcheance: new Date() } },
    },
    include: { paiements: true },
  });
  res.locals.souscriptionId = s.id;

  const statut = sante ? "en_attente_validation" : "en_attente_confirmation";
  await notifyPartenaire(
    partenaireId,
    "souscription",
    sante ? `Demande API ${produit.libelle}` : `Souscription API ${produit.libelle}`,
    sante
      ? `Nouvelle demande ${produit.libelle} (${prime} FCFA) via l'API — en attente de validation par SIM Assurances.`
      : `Nouvelle souscription ${produit.libelle} (${prime} FCFA) via l'API — en attente de confirmation de paiement.`,
    "/partenaire/souscriptions"
  );
  await emettreWebhook(req.partner!.apiKeyId, "souscription.creee", {
    souscriptionId: s.id,
    produit: produit.code,
    formule: calcul.libelleFormule,
    statut,
    montantAPercevoir: prime,
    montantAReverser,
  }).catch((e) => console.error("[partnerWebhook] souscription.creee", e));

  // Analyse anti-fraude IA : seulement si une pièce ET un selfie ont été fournis.
  if (data.pieceIdentiteUrl && data.selfieUrl) {
    void analyserSouscriptionApiIA(s.id).catch((e) => console.error("[fraudeIA] souscription API", e));
  }

  const debut = dateDebutPremiereActivation(code);
  return apiOk(
    res,
    {
      id: s.id,
      statut,
      produit: produit.code,
      formule: calcul.libelleFormule,
      montantAPercevoir: prime,
      montantCommissionApi: commissionApi,
      montantAReverser,
      // Santé : le paiement n'est possible qu'après validation (voir confirmer-paiement).
      echeanceId: sante ? null : s.paiements[0]?.id ?? null,
      validationRequise: sante,
      priseEffet: {
        delaiAttente72h: debut.getTime() > Date.now() + 1000,
        dateEstimee: debut.toISOString(),
      },
    },
    undefined,
    201
  );
}

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
    // Assurances Santé : une demande doit être validée par SIM Assurances avant tout paiement.
    if (paiementBloqueParValidation(s.validationStatut)) {
      return apiError(
        res,
        409,
        "validation_requise",
        s.validationStatut === VALIDATION_SANTE.REFUSEE
          ? "Cette demande a été refusée par SIM Assurances : aucun paiement ne peut être confirmé."
          : "Cette demande Santé est en attente de validation par SIM Assurances : le paiement ne peut être confirmé qu'après validation."
      );
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

type StatutPublic = "en_attente_validation" | "refusee" | "en_attente_confirmation" | "confirmee" | "echouee";

/** État exposé côté partenaire, dérivé de `waveStatut` et (Assurances Santé) de `validationStatut`. */
function statutPublic(waveStatut: string | null, validationStatut: string | null): StatutPublic {
  if (waveStatut === "confirme") return "confirmee";
  if (validationStatut === VALIDATION_SANTE.REFUSEE) return "refusee";
  if (validationStatut === VALIDATION_SANTE.EN_ATTENTE) return "en_attente_validation";
  if (waveStatut === "echoue") return "echouee";
  return "en_attente_confirmation";
}

type LigneSouscription = {
  id: string;
  produitId: string;
  cycleFacturation: string | null;
  waveStatut: string | null;
  validationStatut: string | null;
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
    statut: statutPublic(s.waveStatut, s.validationStatut),
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
  statut: z.enum(["en_attente_validation", "refusee", "en_attente_confirmation", "confirmee", "echouee"]).optional(),
  produit: z.string().min(1).optional(),
  depuis: z.coerce.date().optional(),
});

/** Filtre Prisma d'un statut public : `waveStatut` + (Assurances Santé) `validationStatut`. */
function filtreStatutPublic(statut: StatutPublic): Prisma.SouscriptionWhereInput {
  switch (statut) {
    case "confirmee":
      return { waveStatut: "confirme" };
    case "en_attente_validation":
      return { waveStatut: { not: "confirme" }, validationStatut: VALIDATION_SANTE.EN_ATTENTE };
    case "refusee":
      return { waveStatut: { not: "confirme" }, validationStatut: VALIDATION_SANTE.REFUSEE };
    case "echouee":
      return { waveStatut: "echoue", NOT: { validationStatut: { in: [VALIDATION_SANTE.EN_ATTENTE, VALIDATION_SANTE.REFUSEE] } } };
    case "en_attente_confirmation":
      return {
        waveStatut: "en_attente",
        OR: [{ validationStatut: null }, { validationStatut: VALIDATION_SANTE.VALIDEE }],
      };
  }
}

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
    if (q.statut) Object.assign(where, filtreStatutPublic(q.statut));
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
      // Assurances Santé : null pour les autres produits ; le motif de refus reste interne.
      validationStatut: s.validationStatut,
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
