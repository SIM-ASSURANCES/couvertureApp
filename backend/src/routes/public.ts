import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../util.js";
import {
  initiateWavePayment,
  newNumeroPolice,
  newFormulaireToken,
  sendSMS,
  messageIncendie,
  lienFormulaire,
  messageAccidentEchec,
} from "../services/notify.js";
import { notifyPartenaire } from "../services/notifications.js";
import { verifyWaveSignature, type RawBodyRequest } from "../security.js";
import { confirmerAccident, verifierPaiementAccident } from "../services/accident.js";
import { refFactureDisponible, MAX_USAGES_REF_FACTURE } from "../services/incendie.js";
import { confirmerEcheance, verifierPaiementEcheance } from "../services/paiementWave.js";
import { genererEcheancier } from "../services/echeancier.js";
import { calculerRelaxAccidentsGenerale } from "../services/relaxAccidentsGenerale.js";
import { calculerSecurpro, type SecurproInput } from "../services/tarificationImf.js";
import { calculerSecurhome, type SecurhomeInput } from "../services/securhomeDommages.js";
import { DDE_CAPITAUX, DE_CAPITAUX, BDG_CAPITAUX, VOL_CAISSE_CAPITAUX, capitalDansListe } from "../services/capitauxDommages.js";

const PRODUITS_RELAX = ["relaxmoto", "relaxauto"] as const;
function isProduitRelax(p: string): p is (typeof PRODUITS_RELAX)[number] {
  return (PRODUITS_RELAX as readonly string[]).includes(p);
}

// Produits à formule unique payée en une fois (pas d'échéancier récurrent),
// bâtis sur le même modèle générique Produit/TarifProduit/Souscription —
// refonte Assurances Accidents/Dommages (voir routes /initiate-formule ci-dessous).
const PRODUITS_FORMULE = ["relaxaccidents_fraismedicaux", "relaxvoyage"] as const;
function isProduitFormule(p: string): p is (typeof PRODUITS_FORMULE)[number] {
  return (PRODUITS_FORMULE as readonly string[]).includes(p);
}

// Produits à devis calculé dynamiquement (pas de TarifProduit) — RelaxAccidents
// générale (police collective), SecurHome+ et SecurPro (Assurances Dommages).
const PRODUITS_CALCUL_DYNAMIQUE = ["relaxaccidents", "securhome_dommages", "securpro_dommages"] as const;
function isProduitCalculDynamique(p: string): p is (typeof PRODUITS_CALCUL_DYNAMIQUE)[number] {
  return (PRODUITS_CALCUL_DYNAMIQUE as readonly string[]).includes(p);
}

// Routes génériques partagées (dépôt de documents, infos, contrat) — accessibles
// aux produits récurrents (Relax), à formule unique, et à devis calculé.
function isProduitGenerique(p: string): boolean {
  return isProduitRelax(p) || isProduitFormule(p) || isProduitCalculDynamique(p);
}

type QrChamp = "qrIncendie1000Token" | "qrIncendie2000Token" | "qrAccidentToken";

/**
 * Résout un token QR Incendie/Accident, qu'il appartienne au partenaire
 * lui-même ou à l'un de ses agents de distribution — les deux partagent le
 * même espace de tokens (les trois colonnes qrXxxToken). Une souscription
 * scannée via le QR d'un agent reste rattachée au partenaire (facturation
 * inchangée) mais porte en plus `agentDistributionId` pour le suivi par agent.
 * Un agent désactivé (ou son partenaire) ne résout plus.
 */
async function resoudrePartenaireOuAgent(
  token: string
): Promise<{ partenaireId: string; agentDistributionId: string | null; qrChamp: QrChamp } | null> {
  const p = await prisma.partenaire.findFirst({
    where: {
      statut: "actif",
      OR: [{ qrIncendie1000Token: token }, { qrIncendie2000Token: token }, { qrAccidentToken: token }],
    },
  });
  if (p) {
    const qrChamp: QrChamp =
      p.qrIncendie1000Token === token ? "qrIncendie1000Token" : p.qrIncendie2000Token === token ? "qrIncendie2000Token" : "qrAccidentToken";
    return { partenaireId: p.id, agentDistributionId: null, qrChamp };
  }
  const a = await prisma.agentDistribution.findFirst({
    where: {
      statut: "actif",
      partenaire: { statut: "actif" },
      OR: [{ qrIncendie1000Token: token }, { qrIncendie2000Token: token }, { qrAccidentToken: token }],
    },
  });
  if (a) {
    const qrChamp: QrChamp =
      a.qrIncendie1000Token === token ? "qrIncendie1000Token" : a.qrIncendie2000Token === token ? "qrIncendie2000Token" : "qrAccidentToken";
    return { partenaireId: a.partenaireId, agentDistributionId: a.id, qrChamp };
  }
  return null;
}

/**
 * Résout un QR sur le modèle générique QrCode (précis ou sélecteur de
 * sousBranche) pour un produit donné — pattern partagé par tous les produits
 * à devis calculé dynamiquement (RelaxAccidents générale, SecurHome,
 * SecurPro Dommages, et désormais le repli du QR sélecteur pour Incendie).
 */
async function resoudreQrCodeGenerique(codeProduit: string, token: string) {
  const produit = await prisma.produit.findUnique({ where: { code: codeProduit } });
  if (!produit) return null;
  const qr = await prisma.qrCode.findFirst({
    where: {
      token,
      actif: true,
      partenaire: { statut: "actif" },
      OR: [
        { produitId: produit.id },
        ...(produit.sousBranche ? [{ produitId: null, sousBranche: produit.sousBranche }] : []),
      ],
    },
    include: { partenaire: true },
  });
  if (!qr) return null;
  if (qr.agentDistributionId) {
    const agent = await prisma.agentDistribution.findUnique({ where: { id: qr.agentDistributionId } });
    if (!agent || agent.statut !== "actif") return null;
  }
  return { produit, qr };
}

export const publicRouter = Router();

/** Tarifications accident disponibles */
publicRouter.get(
  "/tarifs/accident",
  asyncHandler(async (_req, res) => {
    const tarifs = await prisma.tarifAccident.findMany({
      orderBy: { prime: "asc" },
    });
    res.json(tarifs);
  })
);

/** Résout un QR token -> partenaire + produit + montantPrime */
publicRouter.get(
  "/qr/:token",
  asyncHandler(async (req, res) => {
    const token = req.params.token;

    // Modèle générique en priorité (RelaxMoto/RelaxAuto, et désormais les
    // produits migrés comme RelaxAccidents Frais Médicaux) — un token migré
    // garde exactement la même valeur, donc résout ici sans que les
    // partenaires n'aient à réimprimer leur QR physique.
    const qr = await prisma.qrCode.findFirst({
      where: { token, actif: true, partenaire: { statut: "actif" } },
      include: { produit: true, partenaire: { select: { id: true, nomCommerce: true, qrIncendie1000Token: true } } },
    });
    if (qr) {
      // QR "sélecteur" (un par partenaire/Assurance) : pas de produit précis,
      // renvoie la liste des produits de la sous-branche pour que le
      // prospect en choisisse un (refonte Assurances Accidents/Dommages).
      if (!qr.produitId && qr.sousBranche) {
        const produits = await prisma.produit.findMany({
          where: { sousBranche: qr.sousBranche },
          orderBy: { ordre: "asc" },
        });
        const items = await Promise.all(
          produits.map(async (p) => {
            const tarifDefaut = await prisma.tarifProduit.findFirst({
              where: { produitId: p.id },
              orderBy: { prime: "asc" },
            });
            // Incendie reste persisté sur le modèle historique
            // (SouscriptionIncendie), mais n'a plus de QR dédié par formule :
            // il continue avec le token du sélecteur comme tout autre produit
            // (voir POST /souscriptions/incendie, résolution via
            // resoudreQrCodeGenerique + montant d'achat → formule).
            return {
              code: p.code,
              libelle: p.libelle,
              disponible: p.actif,
              montantPrime: tarifDefaut?.prime ?? null,
              capitalGaranti: tarifDefaut?.capitalGaranti ?? null,
            };
          })
        );
        return res.json({
          type: "chooser",
          sousBranche: qr.sousBranche,
          partenaire: { id: qr.partenaire.id, nomCommerce: qr.partenaire.nomCommerce },
          produits: items,
        });
      }

      const tarifDefaut = await prisma.tarifProduit.findFirst({
        where: { produitId: qr.produitId! },
        orderBy: { prime: "asc" },
      });
      return res.json({
        produit: qr.produit!.code,
        montantPrime: tarifDefaut?.prime ?? null,
        capitalGaranti: tarifDefaut?.capitalGaranti ?? null,
        partenaire: { id: qr.partenaire.id, nomCommerce: qr.partenaire.nomCommerce },
      });
    }

    // Repli sur le modèle historique (Incendie — pas encore migré cette session).
    const resolu = await resoudrePartenaireOuAgent(token);
    if (resolu) {
      const p = await prisma.partenaire.findUnique({ where: { id: resolu.partenaireId } });
      if (!p) return res.status(404).json({ error: "QR invalide ou inactif" });

      let produit: "incendie" | "accident";
      let montantPrime: number | null = null;
      let capitalGaranti: number | null = null;

      if (resolu.qrChamp === "qrIncendie1000Token") {
        produit = "incendie";
        montantPrime = 1000;
        capitalGaranti = 500000;
      } else if (resolu.qrChamp === "qrIncendie2000Token") {
        produit = "incendie";
        montantPrime = 2000;
        capitalGaranti = 1000000;
      } else {
        produit = "accident";
      }

      return res.json({
        produit,
        montantPrime,
        capitalGaranti,
        partenaire: { id: p.id, nomCommerce: p.nomCommerce },
      });
    }

    return res.status(404).json({ error: "QR invalide ou inactif" });
  })
);

/** Tarifications d'un produit générique (RelaxMoto/RelaxAuto) */
publicRouter.get(
  "/tarifs/:produit",
  asyncHandler(async (req, res) => {
    const code = req.params.produit;
    if (!isProduitGenerique(code)) return res.status(404).json({ error: "Produit inconnu" });
    const prod = await prisma.produit.findUnique({ where: { code } });
    if (!prod) return res.status(404).json({ error: "Produit inconnu" });
    const tarifs = await prisma.tarifProduit.findMany({
      where: { produitId: prod.id },
      orderBy: { prime: "asc" },
    });
    res.json(tarifs);
  })
);

/**
 * Barème SECURPRO (classe de risque → taux Incendie/plafond) — lecture seule,
 * non authentifiée. Réutilise la même table que l'admin IMF
 * (GET /api/imf/baremes/securpro, protégée admin+IMF) : une seule source de
 * vérité pour les taux, que la vente passe par un agent IMF ou par le QR
 * self-service SecurPro (Assurances Dommages).
 */
publicRouter.get(
  "/baremes/securpro",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.baremeSecurpro.findMany({ orderBy: { classe: "asc" } });
    res.json(rows);
  })
);

/**
 * Incendie : enregistrement dès la saisie du téléphone.
 *
 * Deux chemins de résolution du QR coexistent :
 *  - QR précis historique (qrIncendie1000Token/qrIncendie2000Token, déjà
 *    imprimés) — la formule reste fixée par le token scanné, `montantAchat`
 *    est ignoré (rétro-compatibilité, comportement inchangé).
 *  - QR sélecteur "Assurances Dommages" (nouveau scénario) — plus de token
 *    dédié par formule : le client saisit le montant de son achat et la
 *    formule est déterminée ici, jamais confiance dans un montant/formule
 *    envoyé par le client (seuil 250 000 FCFA).
 */
const SEUIL_INCENDIE_FORMULE = 250_000;
const incSchema = z.object({
  qrToken: z.string(),
  telephone: z.string().min(6),
  nom: z.string().optional(),
  prenom: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  ville: z.string().min(1).optional(),
  commune: z.string().optional(),
  quartier: z.string().optional(),
  refFacture: z.string().min(1).optional(),
  montantAchat: z.number().int().min(0).optional(),
});

publicRouter.post(
  "/souscriptions/incendie",
  asyncHandler(async (req, res) => {
    const data = incSchema.parse(req.body);

    let partenaireId: string;
    let agentDistributionId: string | null;
    let montantPrime: number;
    let capitalGaranti: number;

    const resoluLegacy = await resoudrePartenaireOuAgent(data.qrToken);
    if (resoluLegacy && resoluLegacy.qrChamp !== "qrAccidentToken") {
      partenaireId = resoluLegacy.partenaireId;
      agentDistributionId = resoluLegacy.agentDistributionId;
      montantPrime = resoluLegacy.qrChamp === "qrIncendie1000Token" ? 1000 : 2000;
      capitalGaranti = montantPrime === 1000 ? 500000 : 1000000;
    } else {
      const resoluSelecteur = await resoudreQrCodeGenerique("incendie", data.qrToken);
      if (!resoluSelecteur) return res.status(404).json({ error: "QR Incendie invalide" });
      if (data.montantAchat == null) {
        return res.status(400).json({ error: "Montant de l'achat manquant." });
      }
      partenaireId = resoluSelecteur.qr.partenaireId;
      agentDistributionId = resoluSelecteur.qr.agentDistributionId;
      montantPrime = data.montantAchat < SEUIL_INCENDIE_FORMULE ? 1000 : 2000;
      capitalGaranti = montantPrime === 1000 ? 500000 : 1000000;
    }

    // Champs désormais requis dès cette étape pour le nouveau scénario
    // (formulaire.tsx les rend obligatoires) — repli optionnel côté schéma
    // pour ne pas casser un éventuel appel via un ancien QR précis qui ne les
    // enverrait pas encore.
    const token = newFormulaireToken();

    const s = await prisma.souscriptionIncendie.create({
      data: {
        partenaireId,
        agentDistributionId,
        telephone: data.telephone,
        nom: data.nom || null,
        prenom: data.prenom || null,
        email: data.email || null,
        ville: data.ville || null,
        commune: data.commune || null,
        quartier: data.quartier || null,
        refFacture: data.refFacture || null,
        montantAchat: data.montantAchat ?? null,
        montantPrime,
        capitalGaranti,
        statut: "en_cours",
        lienFormulaireToken: token,
        whatsappEnvoyeAt: new Date(),
      },
    });
    await sendSMS(
      data.telephone,
      messageIncendie(s.prenom, lienFormulaire("incendie", token))
    );
    await notifyPartenaire(
      partenaireId,
      "souscription",
      "Nouvelle souscription Incendie",
      `Nouveau client incendie (${montantPrime} FCFA) via votre QR code.`,
      "/partenaire/souscriptions"
    );
    res.status(201).json({ id: s.id, statut: s.statut, lienToken: token });
  })
);

/** Incendie : récupère la souscription via le token de lien (pré-remplissage du formulaire de complément) */
publicRouter.get(
  "/souscriptions/incendie/:token",
  asyncHandler(async (req, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({
      where: { lienFormulaireToken: req.params.token },
      include: { partenaire: { select: { nomCommerce: true } } },
    });
    if (!s) return res.status(404).json({ error: "Lien invalide" });
    const debut = s.createdAt;
    const fin = new Date(debut);
    fin.setFullYear(fin.getFullYear() + 1);
    res.json({
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      email: s.email,
      telephone: s.telephone,
      refFacture: s.refFacture,
      ville: s.ville,
      commune: s.commune,
      quartier: s.quartier,
      numeroMaison: s.numeroMaison,
      signature: s.signature,
      dateNaissance: s.dateNaissance,
      pieceIdentiteUrl: s.pieceIdentiteUrl,
      selfieUrl: s.selfieUrl,
      montant: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      statut: s.statut,
      partenaire: s.partenaire.nomCommerce,
      numeroPolice: `POL-INC-${debut.getFullYear()}-${s.id.slice(0, 8).toUpperCase()}`,
      dateDebut: debut,
      dateFin: fin,
    });
  })
);

/** Incendie : complétion du formulaire via lien WhatsApp */
publicRouter.patch(
  "/souscriptions/incendie/:token",
  asyncHandler(async (req, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({
      where: { lienFormulaireToken: req.params.token },
    });
    if (!s) return res.status(404).json({ error: "Lien invalide" });
    const {
      nom, prenom, email, refFacture, commune, quartier, numeroMaison, signature,
      dateNaissance, pieceIdentiteUrl, selfieUrl,
    } = req.body ?? {};

    // Nouveau scénario : refFacture (Référence CIE) et commune sont désormais
    // saisis dès la souscription (voir POST /souscriptions/incendie) — on
    // retombe sur les valeurs déjà en base si le formulaire de complétion ne
    // les renvoie pas. Rétro-compatible avec les souscriptions historiques où
    // elles sont encore vides à ce stade (le client les saisit alors ici).
    const refFactureFinale = refFacture || s.refFacture;
    const communeFinale = commune || s.commune;

    const tenteCompletion = !!(refFacture || commune || quartier || numeroMaison);
    if (tenteCompletion) {
      if (!refFactureFinale || !communeFinale || !quartier) {
        return res.status(400).json({
          error: "Réf.facture, commune et quartier sont obligatoires.",
        });
      }
      if (!(await refFactureDisponible(refFactureFinale, s.id))) {
        return res.status(409).json({
          error: `Cette référence facture a déjà été utilisée ${MAX_USAGES_REF_FACTURE} fois.`,
        });
      }
    }

    const factureAjoutee = tenteCompletion && !s.refFacture;
    let commissionCalculee = s.commissionCalculee;
    if (factureAjoutee) {
      const params = await prisma.parametre.findUnique({ where: { id: 1 } });
      const primeHt = s.montantPrime === 1000
        ? (params?.primeHtIncendie1000 ?? 800)
        : (params?.primeHtIncendie2000 ?? 1600);
      commissionCalculee = primeHt * (params?.tauxCommissionIncendie ?? 0.20);
    }

    const updated = await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: {
        nom: nom ?? s.nom,
        prenom: prenom ?? s.prenom,
        email: email ?? s.email,
        refFacture: refFactureFinale,
        commune: communeFinale,
        quartier: quartier ?? s.quartier,
        numeroMaison: numeroMaison ?? s.numeroMaison,
        signature: signature ?? s.signature,
        dateNaissance: dateNaissance ? new Date(dateNaissance) : s.dateNaissance,
        pieceIdentiteUrl: pieceIdentiteUrl ?? s.pieceIdentiteUrl,
        selfieUrl: selfieUrl ?? s.selfieUrl,
        statut: tenteCompletion ? "complet" : s.statut,
        commissionCalculee,
      },
    });
    res.json({
      id: updated.id,
      statut: updated.statut,
      signature: updated.signature,
      pieceIdentiteUrl: updated.pieceIdentiteUrl,
      selfieUrl: updated.selfieUrl,
    });
  })
);

/** Accident : initiation du paiement Wave */
const accSchema = z.object({
  qrToken: z.string(),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(6),
  dateNaissance: z.coerce.date(),
  tarifAccidentId: z.number().int().positive().optional(),
  signature: z.string().min(1).optional(),
});

publicRouter.post(
  "/souscriptions/accident/initiate",
  asyncHandler(async (req, res) => {
    const data = accSchema.parse(req.body);
    const resolu = await resoudrePartenaireOuAgent(data.qrToken);
    if (!resolu || resolu.qrChamp !== "qrAccidentToken") {
      return res.status(404).json({ error: "QR Accident invalide" });
    }

    let montant = 500;
    let capitalGaranti = 100000;
    let tarifAcc: { commission: number } | null = null;

    if (data.tarifAccidentId) {
      const tarif = await prisma.tarifAccident.findUnique({
        where: { id: data.tarifAccidentId },
      });
      if (!tarif) return res.status(400).json({ error: "Tarif Accident invalide" });
      montant = tarif.prime;
      capitalGaranti = tarif.capitalGaranti;
      tarifAcc = tarif;
    } else {
      const defaultTarif = await prisma.tarifAccident.findFirst({
        orderBy: { prime: "asc" },
      });
      if (defaultTarif) {
        montant = defaultTarif.prime;
        capitalGaranti = defaultTarif.capitalGaranti;
        tarifAcc = defaultTarif;
      }
    }

    const s = await prisma.souscriptionAccident.create({
      data: {
        partenaireId: resolu.partenaireId,
        agentDistributionId: resolu.agentDistributionId,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        dateNaissance: data.dateNaissance,
        montantPrime: montant,
        capitalGaranti,
        waveStatut: "en_attente",
        signature: data.signature,
      },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/accident/${data.qrToken}?paid=${s.id}`;
    const errorUrl = `${appUrl}/s/accident/${data.qrToken}?paiement=echec`;

    let checkoutUrl: string;
    let transactionId: string;

    if (!process.env.WAVE_API_KEY) {
      // Mode stub (dev / pas encore de clé) : confirmer immédiatement
      const numeroPolice = newNumeroPolice();
      const dateDebut = new Date();
      const dateFin = new Date(dateDebut);
      dateFin.setMonth(dateFin.getMonth() + 3);
      transactionId = `STUB-${s.id.slice(0, 8)}`;
      await prisma.souscriptionAccident.update({
        where: { id: s.id },
        data: {
          waveStatut: "confirme",
          waveTransactionId: transactionId,
          numeroPolice,
          dateDebut,
          dateFin,
          statutDossier: "complet",
          whatsappEnvoyeAt: new Date(),
          commissionCalculee: tarifAcc?.commission ?? null,
        },
      });
      checkoutUrl = successUrl;
    } else {
      // Mode Wave réel
      const wave = await initiateWavePayment(montant, s.id, successUrl, errorUrl);
      transactionId = wave.transactionId;
      checkoutUrl = wave.checkoutUrl;
      await prisma.souscriptionAccident.update({
        where: { id: s.id },
        data: { waveTransactionId: transactionId },
      });
    }

    await notifyPartenaire(
      resolu.partenaireId,
      "souscription",
      "Nouvelle souscription Accident",
      `Nouveau client accident (${montant} FCFA) via votre QR code.`,
      "/partenaire/souscriptions"
    );

    res.status(201).json({ souscriptionId: s.id, montant, capitalGaranti, checkoutUrl, transactionId });
  })
);

/** Webhook Wave CI : confirme ou marque comme échoué */
publicRouter.post(
  "/wave/callback",
  asyncHandler(async (req, res) => {
    // Sécurité : vérifie que la requête provient bien de Wave via la signature HMAC.
    // En l'absence de WAVE_WEBHOOK_SECRET (mode dev/stub), on journalise un avertissement.
    const webhookSecret =
      process.env.WAVE_WEBHOOK_SECRET || process.env.WAVE_HMAC_SECRET;
    if (webhookSecret) {
      const valid = verifyWaveSignature(
        (req as RawBodyRequest).rawBody,
        req.headers["wave-signature"] as string | undefined,
        webhookSecret
      );
      if (!valid) {
        return res.status(401).json({ error: "Signature webhook invalide" });
      }
    } else {
      console.warn(
        "[Wave callback] WAVE_WEBHOOK_SECRET non défini — signature NON vérifiée."
      );
    }

    // Wave CI envoie : { id, client_reference, payment_status, amount, currency, transaction_id }
    // Compatibilité format legacy : { souscriptionId, status }
    const body = req.body as {
      client_reference?: string;
      payment_status?: "succeeded" | "failed";
      id?: string;
      amount?: string | number;
      souscriptionId?: string;
      status?: "confirme" | "echoue";
    };

    const reference = body.client_reference ?? body.souscriptionId;
    if (!reference) return res.status(400).json({ error: "client_reference manquant" });

    const isConfirme =
      body.payment_status === "succeeded" || body.status === "confirme";

    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: reference },
    });

    if (s) {
      // Idempotent
      if (s.waveStatut === "confirme") return res.json({ ok: true, statut: "confirme" });

      if (!isConfirme) {
        await prisma.souscriptionAccident.update({
          where: { id: s.id },
          data: { waveStatut: "echoue" },
        });
        // Envoyer WhatsApp avec lien de relance
        const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
        const partenaire = await prisma.partenaire.findUnique({
          where: { id: s.partenaireId },
          select: { qrAccidentToken: true },
        });
        if (partenaire?.qrAccidentToken) {
          const retryUrl = `${appUrl}/s/accident/${partenaire.qrAccidentToken}?retry=${s.id}`;
          await sendSMS(s.telephone, messageAccidentEchec(s.prenom, s.montantPrime, retryUrl));
        }
        return res.json({ ok: true, statut: "echoue" });
      }

      // Vérifie que le montant payé correspond bien à la prime attendue
      if (body.amount != null && Number(body.amount) !== s.montantPrime) {
        console.error(
          `[Wave callback] Montant incohérent pour ${s.id} : payé ${body.amount}, attendu ${s.montantPrime}`
        );
        return res.status(400).json({ error: "Montant payé incohérent" });
      }

      await confirmerAccident(s);
      return res.json({ ok: true, statut: "confirme" });
    }

    // Modèle générique par échéance (RelaxMoto/RelaxAuto) : client_reference = Paiement.id
    const p = await prisma.paiement.findUnique({ where: { id: reference } });
    if (!p) return res.status(404).json({ error: "Échéance introuvable" });

    if (p.statut === "paye") return res.json({ ok: true, statut: "paye" });

    if (!isConfirme) {
      await prisma.paiement.update({ where: { id: p.id }, data: { statut: "echoue" } });
      return res.json({ ok: true, statut: "echoue" });
    }

    if (body.amount != null && Number(body.amount) !== p.montant) {
      console.error(
        `[Wave callback] Montant incohérent pour échéance ${p.id} : payé ${body.amount}, attendu ${p.montant}`
      );
      return res.status(400).json({ error: "Montant payé incohérent" });
    }

    await confirmerEcheance(p);
    res.json({ ok: true, statut: "paye" });
  })
);

/**
 * Vérifie l'état du paiement directement auprès de Wave et confirme si payé.
 * Appelé par le frontend au retour du paiement (filet de sécurité si le webhook
 * n'arrive pas). Renvoie le statut courant de la souscription.
 */
publicRouter.get(
  "/souscriptions/accident/:id/verify",
  asyncHandler(async (req, res) => {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Souscription introuvable" });

    const statut = await verifierPaiementAccident(s);
    res.json({ statut });
  })
);

/** Informations publiques d'une souscription accident (pour flux de relance) */
publicRouter.get(
  "/souscriptions/accident/:id/info",
  asyncHandler(async (req, res) => {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: req.params.id },
      include: {
        partenaire: { select: { nomCommerce: true } },
      },
    });
    if (!s) return res.status(404).json({ error: "Souscription introuvable" });
    res.json({
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      dateNaissance: s.dateNaissance,
      montant: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      waveStatut: s.waveStatut,
      partenaire: s.partenaire.nomCommerce,
      signature: s.signature,
    });
  })
);

/** Récupère les données du contrat après paiement Wave (accès public, lecture seule) */
publicRouter.get(
  "/souscriptions/accident/:id/contrat",
  asyncHandler(async (req, res) => {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: req.params.id },
      include: { partenaire: { select: { nomCommerce: true } } },
    });
    if (!s || s.waveStatut !== "confirme") {
      return res.status(404).json({ error: "Contrat non disponible" });
    }
    res.json({
      numeroPolice: s.numeroPolice,
      montant: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      dateNaissance: s.dateNaissance,
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      partenaire: s.partenaire.nomCommerce,
      signature: s.signature,
      pieceIdentiteUrl: s.pieceIdentiteUrl,
      selfieUrl: s.selfieUrl,
    });
  })
);

/**
 * Dépôt de la pièce d'identité + du selfie pour établir la carte virtuelle de
 * prise en charge — uniquement après confirmation du paiement (le formulaire
 * de collecte n'apparaît côté client qu'à ce moment-là).
 */
const cartePhotosSchema = z.object({
  pieceIdentiteUrl: z.string().min(1),
  selfieUrl: z.string().min(1),
});

publicRouter.patch(
  "/souscriptions/accident/:id/carte-photos",
  asyncHandler(async (req, res) => {
    const data = cartePhotosSchema.parse(req.body);
    const s = await prisma.souscriptionAccident.findUnique({ where: { id: req.params.id } });
    if (!s || s.waveStatut !== "confirme") {
      return res.status(404).json({ error: "Souscription non disponible" });
    }
    const updated = await prisma.souscriptionAccident.update({
      where: { id: s.id },
      data: { pieceIdentiteUrl: data.pieceIdentiteUrl, selfieUrl: data.selfieUrl },
    });
    res.json({ id: updated.id, pieceIdentiteUrl: updated.pieceIdentiteUrl, selfieUrl: updated.selfieUrl });
  })
);

/**
 * RelaxMoto/RelaxAuto : initiation d'un abonnement à paiement échelonné.
 * `tarif.prime` est la prime annuelle de référence ; `cycle` détermine le
 * nombre d'échéances (5 hebdomadaires, 12 mensuelles, ou 1 annuelle) et leur
 * montant. Seule la 1ère échéance est payée immédiatement via Wave ; elle
 * active l'abonnement (police + carte de prise en charge).
 */
const relaxSchema = z.object({
  qrToken: z.string(),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(6),
  dateNaissance: z.coerce.date().optional(),
  // Affiché sur la carte de prise en charge (refonte Novelia).
  sexe: z.enum(["masculin", "feminin"]).optional(),
  cycle: z.enum(["mensuel", "annuel"]),
  // Photo CNI/Permis + selfie (data URL), capturées depuis le téléphone du
  // souscripteur — voir documentSchema pour le dépôt effectif après création
  // de la souscription (id requis).
});

/**
 * RelaxAccidents générale — police collective à devis calculé dynamiquement
 * (classe de risque, effectif, montants choisis par garantie), pas de
 * TarifProduit. Le montant payé est toujours recalculé ici, jamais confiance
 * dans les totaux envoyés par le client (voir services/relaxAccidentsGenerale.ts).
 * Enregistrée AVANT la route générique `/souscriptions/:produit/initiate`
 * ci-dessous : sinon celle-ci (destinée à RelaxMoto/RelaxAuto) intercepterait
 * en premier tout POST vers ce chemin littéral, Express matchant les routes
 * dans l'ordre d'enregistrement.
 */
const relaxAccidentsGeneraleSchema = z.object({
  qrToken: z.string(),
  raisonSociale: z.string().min(1).max(200),
  profession: z.string().min(1).max(200),
  telephone: z.string().min(6),
  signature: z.string().min(1).optional(),
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  typeCouverture: z.enum(["vie_privee", "vie_professionnelle", "vie_privee_professionnelle"]),
  effectif: z.number().int().min(1),
  montantIJ: z.number().finite(),
  montantFraisMedicaux: z.number().finite(),
  montantIPT: z.number().finite(),
  montantDecesAccidentel: z.number().finite(),
});

publicRouter.post(
  "/souscriptions/relaxaccidents/initiate",
  asyncHandler(async (req, res) => {
    const data = relaxAccidentsGeneraleSchema.parse(req.body);

    const resolu = await resoudreQrCodeGenerique("relaxaccidents", data.qrToken);
    if (!resolu) return res.status(404).json({ error: "QR invalide pour ce produit" });
    const { produit: prod, qr } = resolu;

    let resultat;
    try {
      resultat = calculerRelaxAccidentsGenerale({
        classe: data.classe,
        typeCouverture: data.typeCouverture,
        effectif: data.effectif,
        montantIJ: data.montantIJ,
        montantFraisMedicaux: data.montantFraisMedicaux,
        montantIPT: data.montantIPT,
        montantDecesAccidentel: data.montantDecesAccidentel,
      });
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Entrées invalides." });
    }

    const s = await prisma.souscription.create({
      data: {
        produitId: prod.id,
        partenaireId: qr.partenaireId,
        agentDistributionId: qr.agentDistributionId,
        nom: data.raisonSociale,
        telephone: data.telephone,
        montantPrime: resultat.primeTTC,
        capitalGaranti: data.montantDecesAccidentel,
        waveStatut: "en_attente",
        nombreEcheances: 1,
        donneesSpecifiques: {
          signature: data.signature ?? null,
          raisonSociale: data.raisonSociale,
          profession: data.profession,
          classe: data.classe,
          typeCouverture: data.typeCouverture,
          effectif: data.effectif,
          montantIJ: data.montantIJ,
          montantFraisMedicaux: data.montantFraisMedicaux,
          montantIPT: data.montantIPT,
          montantDecesAccidentel: data.montantDecesAccidentel,
        },
        resultat: JSON.parse(JSON.stringify(resultat)),
        paiements: {
          create: { numeroEcheance: 1, montant: resultat.primeTTC, dateEcheance: new Date() },
        },
      },
    });

    const echeance = await prisma.paiement.findUniqueOrThrow({
      where: { souscriptionId_numeroEcheance: { souscriptionId: s.id, numeroEcheance: 1 } },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/relaxaccidents/${data.qrToken}?paid=${echeance.id}`;
    const errorUrl = `${appUrl}/s/relaxaccidents/${data.qrToken}?paiement=echec`;

    let checkoutUrl: string;
    let transactionId: string;

    if (!process.env.WAVE_API_KEY) {
      transactionId = `STUB-${echeance.id.slice(0, 8)}`;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
      await confirmerEcheance({ ...echeance, waveTransactionId: transactionId });
      checkoutUrl = successUrl;
    } else {
      const wave = await initiateWavePayment(echeance.montant, echeance.id, successUrl, errorUrl);
      transactionId = wave.transactionId;
      checkoutUrl = wave.checkoutUrl;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
    }

    await notifyPartenaire(
      qr.partenaireId,
      "souscription",
      `Nouvelle souscription ${prod.libelle}`,
      `Nouveau client ${prod.libelle} (${resultat.primeTTC} FCFA, ${data.effectif} pers.) via votre QR code.`,
      "/partenaire/souscriptions"
    );

    res.status(201).json({
      souscriptionId: s.id,
      echeanceId: echeance.id,
      montant: resultat.primeTTC,
      resultat,
      checkoutUrl,
      transactionId,
    });
  })
);

/**
 * SecurPro (Assurances Dommages) — réutilise TEL QUEL le moteur de calcul déjà
 * implémenté côté IMF (calculerSecurpro/BaremeSecurpro), vérifié conforme au
 * document TARIF SECURHOME+_SECURPRO.docx. Seul le canal de distribution
 * change (QR self-service plutôt qu'agent IMF) — mêmes taux, même barème
 * (GET /public/baremes/securpro ci-dessus), même rendu de contrat
 * (ContratSecurpro/renderContratSecurpro, étendu de nomCommercial/referenceCIE).
 * Enregistrée AVANT la route générique `/souscriptions/:produit/initiate`
 * ci-dessous (même piège d'ordre de routage Express que RelaxAccidents générale).
 */
const securproDommagesSchema = z.object({
  qrToken: z.string(),
  nom: z.string().min(1).max(120),
  prenom: z.string().min(1).max(120),
  nomCommercial: z.string().max(200).optional(),
  ville: z.string().min(1).max(120),
  communeQuartier: z.string().min(1).max(120),
  refFacture: z.string().min(1).max(120),
  telephone: z.string().min(6),
  signature: z.string().min(1).optional(),
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  statutOccupation: z.enum(["proprietaire", "locataire"]),
  valeurBatiment: z.number().finite().min(0).optional(),
  loyerMensuel: z.number().finite().min(0).optional(),
  contenu: z.number().finite().min(0),
  dansMarche: z.boolean(),
  gardien: z.boolean(),
  extincteur: z.boolean(),
  volContenu: z.boolean(),
  majorationVolContenu: z.boolean().optional(),
  volCaisseCapital: z.number().finite().optional(),
  majorationVolCaisse: z.boolean().optional(),
  ddeCapital: z.number().finite().optional(),
  deCapital: z.number().finite().optional(),
  bdgCapital: z.number().finite().optional(),
});

publicRouter.post(
  "/souscriptions/securpro_dommages/initiate",
  asyncHandler(async (req, res) => {
    const data = securproDommagesSchema.parse(req.body);

    if (data.statutOccupation === "proprietaire" && data.valeurBatiment == null) {
      return res.status(400).json({ error: "Valeur du bâtiment manquante." });
    }
    if (data.statutOccupation === "locataire" && data.loyerMensuel == null) {
      return res.status(400).json({ error: "Loyer mensuel manquant." });
    }
    if (
      !capitalDansListe(data.volCaisseCapital, VOL_CAISSE_CAPITAUX) ||
      !capitalDansListe(data.ddeCapital, DDE_CAPITAUX) ||
      !capitalDansListe(data.deCapital, DE_CAPITAUX) ||
      !capitalDansListe(data.bdgCapital, BDG_CAPITAUX)
    ) {
      return res.status(400).json({ error: "Capital choisi invalide pour une garantie." });
    }

    const resolu = await resoudreQrCodeGenerique("securpro_dommages", data.qrToken);
    if (!resolu) return res.status(404).json({ error: "QR invalide pour ce produit" });
    const { produit: prod, qr } = resolu;

    const baremeRow = await prisma.baremeSecurpro.findUnique({ where: { classe: data.classe } });
    if (!baremeRow) return res.status(400).json({ error: "Barème SECURPRO introuvable pour cette classe." });

    const input: SecurproInput = {
      classe: data.classe,
      statutOccupation: data.statutOccupation,
      valeurBatiment: data.valeurBatiment,
      loyerMensuel: data.loyerMensuel,
      contenu: data.contenu,
      dansMarche: data.dansMarche,
      gardien: data.gardien,
      extincteur: data.extincteur,
      volContenu: data.volContenu,
      majorationVolContenu: data.majorationVolContenu,
      volCaisseCapital: data.volCaisseCapital,
      majorationVolCaisse: data.majorationVolCaisse,
      ddeCapital: data.ddeCapital,
      deCapital: data.deCapital,
      bdgCapital: data.bdgCapital,
    };
    const resultat = calculerSecurpro(input, {
      classe: data.classe,
      limiteCapital: baremeRow.limiteCapital,
      tauxIncendie: baremeRow.tauxIncendie,
    });

    if (resultat.depassementPlafond) {
      return res.status(400).json({
        error:
          "Les capitaux totaux dépassent le plafond assurable automatiquement pour cette classe de risque. Contactez SIM Assurances pour une étude particulière.",
      });
    }

    const s = await prisma.souscription.create({
      data: {
        produitId: prod.id,
        partenaireId: qr.partenaireId,
        agentDistributionId: qr.agentDistributionId,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        montantPrime: resultat.primeTTC,
        capitalGaranti: Math.round(resultat.capitauxTotaux),
        waveStatut: "en_attente",
        nombreEcheances: 1,
        donneesSpecifiques: {
          signature: data.signature ?? null,
          nom: data.nom,
          prenom: data.prenom,
          nomCommercial: data.nomCommercial ?? null,
          ville: data.ville,
          communeQuartier: data.communeQuartier,
          refFacture: data.refFacture,
          classe: data.classe,
          statutOccupation: data.statutOccupation,
          valeurBatiment: data.valeurBatiment ?? null,
          loyerMensuel: data.loyerMensuel ?? null,
          contenu: data.contenu,
          dansMarche: data.dansMarche,
          gardien: data.gardien,
          extincteur: data.extincteur,
          volContenu: data.volContenu,
          majorationVolContenu: data.majorationVolContenu ?? null,
          volCaisseCapital: data.volCaisseCapital ?? null,
          majorationVolCaisse: data.majorationVolCaisse ?? null,
          ddeCapital: data.ddeCapital ?? null,
          deCapital: data.deCapital ?? null,
          bdgCapital: data.bdgCapital ?? null,
        },
        resultat: JSON.parse(JSON.stringify(resultat)),
        paiements: {
          create: { numeroEcheance: 1, montant: resultat.primeTTC, dateEcheance: new Date() },
        },
      },
    });

    const echeance = await prisma.paiement.findUniqueOrThrow({
      where: { souscriptionId_numeroEcheance: { souscriptionId: s.id, numeroEcheance: 1 } },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/securpro_dommages/${data.qrToken}?paid=${echeance.id}`;
    const errorUrl = `${appUrl}/s/securpro_dommages/${data.qrToken}?paiement=echec`;

    let checkoutUrl: string;
    let transactionId: string;

    if (!process.env.WAVE_API_KEY) {
      transactionId = `STUB-${echeance.id.slice(0, 8)}`;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
      await confirmerEcheance({ ...echeance, waveTransactionId: transactionId });
      checkoutUrl = successUrl;
    } else {
      const wave = await initiateWavePayment(echeance.montant, echeance.id, successUrl, errorUrl);
      transactionId = wave.transactionId;
      checkoutUrl = wave.checkoutUrl;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
    }

    await notifyPartenaire(
      qr.partenaireId,
      "souscription",
      `Nouvelle souscription ${prod.libelle}`,
      `Nouveau client ${prod.libelle} (${resultat.primeTTC} FCFA) via votre QR code.`,
      "/partenaire/souscriptions"
    );

    res.status(201).json({
      souscriptionId: s.id,
      echeanceId: echeance.id,
      montant: resultat.primeTTC,
      resultat,
      checkoutUrl,
      transactionId,
    });
  })
);

/**
 * SecurHome+ (Assurances Dommages) — moteur de calcul propre (aucun équivalent
 * IMF existant, contrairement à SecurPro), voir services/securhomeDommages.ts.
 * Enregistrée AVANT la route générique `/souscriptions/:produit/initiate`
 * ci-dessous (même piège d'ordre de routage Express que RelaxAccidents générale).
 */
const securhomeDommagesSchema = z.object({
  qrToken: z.string(),
  nom: z.string().min(1).max(120),
  prenom: z.string().min(1).max(120),
  ville: z.string().min(1).max(120),
  communeQuartier: z.string().min(1).max(120),
  refFacture: z.string().min(1).max(120),
  // Informatif uniquement — n'entre pas dans le calcul de la prime (confirmé
  // avec l'utilisateur).
  nombrePieces: z.number().int().min(0).optional(),
  telephone: z.string().min(6),
  signature: z.string().min(1).optional(),
  statutOccupation: z.enum(["proprietaire", "locataire"]),
  valeurBatiment: z.number().finite().min(0).optional(),
  loyerMensuel: z.number().finite().min(0).optional(),
  contenu: z.number().finite().min(0),
  gardien: z.boolean(),
  extincteur: z.boolean(),
  camera: z.boolean(),
  volContenu: z.boolean(),
  ddeCapital: z.number().finite().optional(),
  deCapital: z.number().finite().optional(),
  bdgCapital: z.number().finite().optional(),
});

publicRouter.post(
  "/souscriptions/securhome_dommages/initiate",
  asyncHandler(async (req, res) => {
    const data = securhomeDommagesSchema.parse(req.body);

    if (data.statutOccupation === "proprietaire" && data.valeurBatiment == null) {
      return res.status(400).json({ error: "Valeur du bâtiment manquante." });
    }
    if (data.statutOccupation === "locataire" && data.loyerMensuel == null) {
      return res.status(400).json({ error: "Loyer mensuel manquant." });
    }

    const resolu = await resoudreQrCodeGenerique("securhome_dommages", data.qrToken);
    if (!resolu) return res.status(404).json({ error: "QR invalide pour ce produit" });
    const { produit: prod, qr } = resolu;

    const input: SecurhomeInput = {
      statutOccupation: data.statutOccupation,
      valeurBatiment: data.valeurBatiment,
      loyerMensuel: data.loyerMensuel,
      contenu: data.contenu,
      gardien: data.gardien,
      extincteur: data.extincteur,
      camera: data.camera,
      volContenu: data.volContenu,
      ddeCapital: data.ddeCapital,
      deCapital: data.deCapital,
      bdgCapital: data.bdgCapital,
    };
    let resultat;
    try {
      resultat = calculerSecurhome(input);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Entrées invalides." });
    }

    const s = await prisma.souscription.create({
      data: {
        produitId: prod.id,
        partenaireId: qr.partenaireId,
        agentDistributionId: qr.agentDistributionId,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        montantPrime: resultat.primeTTC,
        capitalGaranti: resultat.capitauxTotaux,
        waveStatut: "en_attente",
        nombreEcheances: 1,
        donneesSpecifiques: {
          signature: data.signature ?? null,
          nom: data.nom,
          prenom: data.prenom,
          ville: data.ville,
          communeQuartier: data.communeQuartier,
          refFacture: data.refFacture,
          nombrePieces: data.nombrePieces ?? null,
          statutOccupation: data.statutOccupation,
          valeurBatiment: data.valeurBatiment ?? null,
          loyerMensuel: data.loyerMensuel ?? null,
          contenu: data.contenu,
          gardien: data.gardien,
          extincteur: data.extincteur,
          camera: data.camera,
          volContenu: data.volContenu,
          ddeCapital: data.ddeCapital ?? null,
          deCapital: data.deCapital ?? null,
          bdgCapital: data.bdgCapital ?? null,
        },
        resultat: JSON.parse(JSON.stringify(resultat)),
        paiements: {
          create: { numeroEcheance: 1, montant: resultat.primeTTC, dateEcheance: new Date() },
        },
      },
    });

    const echeance = await prisma.paiement.findUniqueOrThrow({
      where: { souscriptionId_numeroEcheance: { souscriptionId: s.id, numeroEcheance: 1 } },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/securhome_dommages/${data.qrToken}?paid=${echeance.id}`;
    const errorUrl = `${appUrl}/s/securhome_dommages/${data.qrToken}?paiement=echec`;

    let checkoutUrl: string;
    let transactionId: string;

    if (!process.env.WAVE_API_KEY) {
      transactionId = `STUB-${echeance.id.slice(0, 8)}`;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
      await confirmerEcheance({ ...echeance, waveTransactionId: transactionId });
      checkoutUrl = successUrl;
    } else {
      const wave = await initiateWavePayment(echeance.montant, echeance.id, successUrl, errorUrl);
      transactionId = wave.transactionId;
      checkoutUrl = wave.checkoutUrl;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
    }

    await notifyPartenaire(
      qr.partenaireId,
      "souscription",
      `Nouvelle souscription ${prod.libelle}`,
      `Nouveau client ${prod.libelle} (${resultat.primeTTC} FCFA) via votre QR code.`,
      "/partenaire/souscriptions"
    );

    res.status(201).json({
      souscriptionId: s.id,
      echeanceId: echeance.id,
      montant: resultat.primeTTC,
      resultat,
      checkoutUrl,
      transactionId,
    });
  })
);

publicRouter.post(
  "/souscriptions/:produit/initiate",
  asyncHandler(async (req, res) => {
    const code = req.params.produit;
    if (!isProduitRelax(code)) return res.status(404).json({ error: "Produit inconnu" });
    const data = relaxSchema.parse(req.body);

    const prod = await prisma.produit.findUnique({ where: { code } });
    if (!prod) return res.status(404).json({ error: "Produit inconnu" });

    // Le QR peut pointer précisément sur ce produit (comportement historique)
    // ou être un QR "sélecteur" de sa sous-branche (refonte Assurances
    // Accidents/Dommages — un seul QR par partenaire, produit choisi côté
    // client). Un produit sans sousBranche ne peut être atteint que par un QR
    // précis (sinon un QR sélecteur "orphelin" — impossible en pratique,
    // aucun n'est créé sans sousBranche — matcherait n'importe quel produit).
    const qr = await prisma.qrCode.findFirst({
      where: {
        token: data.qrToken,
        actif: true,
        partenaire: { statut: "actif" },
        OR: [
          { produitId: prod.id },
          ...(prod.sousBranche ? [{ produitId: null, sousBranche: prod.sousBranche }] : []),
        ],
      },
      include: { partenaire: true },
    });
    if (!qr) return res.status(404).json({ error: "QR invalide pour ce produit" });

    // Le tarif est déterminé par la formule choisie (libelleVariante = cycle),
    // jamais par un id envoyé par le client — chaque cycle porte son propre
    // montant PAR échéance (voir echeancier.ts).
    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: prod.id, libelleVariante: data.cycle },
    });
    if (!tarif) return res.status(400).json({ error: "Tarif indisponible pour ce produit" });

    const echeancier = genererEcheancier(tarif.prime, data.cycle);

    const s = await prisma.souscription.create({
      data: {
        produitId: prod.id,
        partenaireId: qr.partenaireId,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        dateNaissance: data.dateNaissance ?? null,
        sexe: data.sexe ?? null,
        montantPrime: tarif.prime,
        capitalGaranti: tarif.capitalGaranti,
        waveStatut: "en_attente",
        cycleFacturation: data.cycle,
        nombreEcheances: echeancier.length,
        paiements: {
          createMany: {
            data: echeancier.map((e) => ({
              numeroEcheance: e.numeroEcheance,
              montant: e.montant,
              dateEcheance: e.dateEcheance,
            })),
          },
        },
      },
    });

    const premiereEcheance = await prisma.paiement.findUniqueOrThrow({
      where: { souscriptionId_numeroEcheance: { souscriptionId: s.id, numeroEcheance: 1 } },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/${code}/${data.qrToken}?paid=${premiereEcheance.id}`;
    const errorUrl = `${appUrl}/s/${code}/${data.qrToken}?paiement=echec`;

    let checkoutUrl: string;
    let transactionId: string;

    if (!process.env.WAVE_API_KEY) {
      transactionId = `STUB-${premiereEcheance.id.slice(0, 8)}`;
      await prisma.paiement.update({ where: { id: premiereEcheance.id }, data: { waveTransactionId: transactionId } });
      await confirmerEcheance({ ...premiereEcheance, waveTransactionId: transactionId });
      checkoutUrl = successUrl;
    } else {
      const wave = await initiateWavePayment(premiereEcheance.montant, premiereEcheance.id, successUrl, errorUrl);
      transactionId = wave.transactionId;
      checkoutUrl = wave.checkoutUrl;
      await prisma.paiement.update({ where: { id: premiereEcheance.id }, data: { waveTransactionId: transactionId } });
    }

    await notifyPartenaire(
      qr.partenaireId,
      "souscription",
      `Nouvelle souscription ${prod.libelle}`,
      `Nouveau client ${prod.libelle} (${tarif.prime} FCFA/an, ${data.cycle}) via votre QR code.`,
      "/partenaire/souscriptions"
    );

    res.status(201).json({
      souscriptionId: s.id,
      echeanceId: premiereEcheance.id,
      montantEcheance: premiereEcheance.montant,
      nombreEcheances: echeancier.length,
      capitalGaranti: tarif.capitalGaranti,
      checkoutUrl,
      transactionId,
    });
  })
);

/**
 * Produits à formule unique payée en une fois (ex. RelaxAccidents Frais
 * Médicaux) — même modèle générique que ci-dessus, mais sans échéancier :
 * une seule "échéance" (numeroEcheance=1) due immédiatement, la formule
 * choisie (`formule` = TarifProduit.libelleVariante) fixe le montant.
 */
const formuleSchema = z.object({
  qrToken: z.string(),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(6),
  dateNaissance: z.coerce.date().optional(),
  // Affiché sur la carte de prise en charge (refonte Novelia).
  sexe: z.enum(["masculin", "feminin"]).optional(),
  formule: z.string().min(1),
  signature: z.string().min(1).optional(),
  // RelaxVoyage uniquement — voir isProduitFormule ci-dessus.
  typePiece: z.enum(["CNI", "Permis"]).optional(),
  compagnie: z.string().min(1).max(120).optional(),
  lieuDepart: z.string().min(1).max(120).optional(),
  lieuArrivee: z.string().min(1).max(120).optional(),
  numeroTicket: z.string().min(1).max(60).optional(),
  dateDepart: z.coerce.date().optional(),
  numeroPersonneContact: z.string().min(6).max(40).optional(),
});

const RELAXVOYAGE_CHAMPS_REQUIS = [
  "compagnie",
  "lieuDepart",
  "lieuArrivee",
  "numeroTicket",
  "dateDepart",
  "numeroPersonneContact",
] as const;

publicRouter.post(
  "/souscriptions/:produit/initiate-formule",
  asyncHandler(async (req, res) => {
    const code = req.params.produit;
    if (!isProduitFormule(code)) return res.status(404).json({ error: "Produit inconnu" });
    const data = formuleSchema.parse(req.body);

    if (code === "relaxvoyage" && RELAXVOYAGE_CHAMPS_REQUIS.some((champ) => !data[champ])) {
      return res.status(400).json({ error: "Champs de voyage manquants (compagnie, trajet, ticket, date de départ, contact)." });
    }

    const prod = await prisma.produit.findUnique({ where: { code } });
    if (!prod) return res.status(404).json({ error: "Produit inconnu" });

    // Résout le QR — accepte aussi bien un partenaire qu'un de ses agents de
    // distribution (comme resoudrePartenaireOuAgent pour Incendie/Accident,
    // mais sur le modèle générique QrCode) — précis (produitId) ou sélecteur
    // (sousBranche, voir /initiate ci-dessus pour le détail du raisonnement).
    const qr = await prisma.qrCode.findFirst({
      where: {
        token: data.qrToken,
        actif: true,
        partenaire: { statut: "actif" },
        OR: [
          { produitId: prod.id },
          ...(prod.sousBranche ? [{ produitId: null, sousBranche: prod.sousBranche }] : []),
        ],
      },
    });
    if (!qr) return res.status(404).json({ error: "QR invalide pour ce produit" });
    if (qr.agentDistributionId) {
      const agent = await prisma.agentDistribution.findUnique({ where: { id: qr.agentDistributionId } });
      if (!agent || agent.statut !== "actif") {
        return res.status(404).json({ error: "QR invalide (agent inactif)" });
      }
    }

    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: prod.id, libelleVariante: data.formule },
    });
    if (!tarif) return res.status(400).json({ error: "Formule indisponible pour ce produit" });

    const s = await prisma.souscription.create({
      data: {
        produitId: prod.id,
        partenaireId: qr.partenaireId,
        agentDistributionId: qr.agentDistributionId,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        dateNaissance: data.dateNaissance ?? null,
        sexe: data.sexe ?? null,
        montantPrime: tarif.prime,
        capitalGaranti: tarif.capitalGaranti,
        waveStatut: "en_attente",
        nombreEcheances: 1,
        donneesSpecifiques:
          code === "relaxvoyage"
            ? {
                signature: data.signature ?? null,
                typePiece: data.typePiece ?? null,
                compagnie: data.compagnie,
                lieuDepart: data.lieuDepart,
                lieuArrivee: data.lieuArrivee,
                numeroTicket: data.numeroTicket,
                dateDepart: data.dateDepart,
                numeroPersonneContact: data.numeroPersonneContact,
              }
            : data.signature
            ? { signature: data.signature }
            : undefined,
        paiements: {
          create: { numeroEcheance: 1, montant: tarif.prime, dateEcheance: new Date() },
        },
      },
    });

    const echeance = await prisma.paiement.findUniqueOrThrow({
      where: { souscriptionId_numeroEcheance: { souscriptionId: s.id, numeroEcheance: 1 } },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/${code}/${data.qrToken}?paid=${echeance.id}`;
    const errorUrl = `${appUrl}/s/${code}/${data.qrToken}?paiement=echec`;

    let checkoutUrl: string;
    let transactionId: string;

    if (!process.env.WAVE_API_KEY) {
      transactionId = `STUB-${echeance.id.slice(0, 8)}`;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
      await confirmerEcheance({ ...echeance, waveTransactionId: transactionId });
      checkoutUrl = successUrl;
    } else {
      const wave = await initiateWavePayment(echeance.montant, echeance.id, successUrl, errorUrl);
      transactionId = wave.transactionId;
      checkoutUrl = wave.checkoutUrl;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
    }

    await notifyPartenaire(
      qr.partenaireId,
      "souscription",
      `Nouvelle souscription ${prod.libelle}`,
      `Nouveau client ${prod.libelle} (${tarif.prime} FCFA) via votre QR code.`,
      "/partenaire/souscriptions"
    );

    res.status(201).json({
      souscriptionId: s.id,
      echeanceId: echeance.id,
      montant: tarif.prime,
      capitalGaranti: tarif.capitalGaranti,
      checkoutUrl,
      transactionId,
    });
  })
);

/** RelaxMoto/RelaxAuto : vérification manuelle du paiement d'une échéance (filet de sécurité) */
publicRouter.get(
  "/souscriptions/:produit/echeances/:echeanceId/verify",
  asyncHandler(async (req, res) => {
    if (!isProduitGenerique(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
    const p = await prisma.paiement.findUnique({ where: { id: req.params.echeanceId } });
    if (!p) return res.status(404).json({ error: "Échéance introuvable" });
    const statut = await verifierPaiementEcheance(p);
    res.json({ statut });
  })
);

/**
 * RelaxMoto/RelaxAuto : dépôt d'un document d'identité (CNI/Permis) lié à la
 * souscription. `url` est l'emplacement du fichier déjà hébergé côté client
 * (aucun service de stockage de fichiers n'est encore intégré côté backend).
 */
const documentSchema = z.object({
  type: z.enum(["CNI", "Permis", "Selfie"]),
  url: z.string().min(1),
});

publicRouter.post(
  "/souscriptions/:produit/:id/documents",
  asyncHandler(async (req, res) => {
    if (!isProduitGenerique(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
    const data = documentSchema.parse(req.body);
    const s = await prisma.souscription.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: "Souscription introuvable" });

    const doc = await prisma.document.create({
      data: { souscriptionId: s.id, type: data.type, url: data.url },
    });
    res.status(201).json(doc);
  })
);

/** RelaxMoto/RelaxAuto : infos publiques (flux de relance) */
publicRouter.get(
  "/souscriptions/:produit/:id/info",
  asyncHandler(async (req, res) => {
    if (!isProduitGenerique(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
    const s = await prisma.souscription.findUnique({
      where: { id: req.params.id },
      include: { partenaire: { select: { nomCommerce: true } } },
    });
    if (!s) return res.status(404).json({ error: "Souscription introuvable" });
    res.json({
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      dateNaissance: s.dateNaissance,
      montant: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      waveStatut: s.waveStatut,
      partenaire: s.partenaire.nomCommerce,
    });
  })
);

/**
 * RelaxMoto/RelaxAuto (et désormais RelaxAccidents Frais Médicaux/RelaxVoyage/
 * RelaxAccidents générale) : contrat après paiement confirmé. `:id` est
 * l'identifiant d'ÉCHÉANCE (paiement), pas de souscription — c'est la valeur
 * du paramètre `paid` transmis par Wave/le stub dans successUrl, la même
 * utilisée par la route /echeances/:echeanceId/verify juste au-dessus.
 */
publicRouter.get(
  "/souscriptions/:produit/:id/contrat",
  asyncHandler(async (req, res) => {
    if (!isProduitGenerique(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
    const echeance = await prisma.paiement.findUnique({
      where: { id: req.params.id },
      include: { souscription: { include: { partenaire: { select: { nomCommerce: true } } } } },
    });
    const s = echeance?.souscription;
    if (!s || s.waveStatut !== "confirme") {
      return res.status(404).json({ error: "Contrat non disponible" });
    }
    const donneesSpecifiques = s.donneesSpecifiques as {
      signature?: string;
      typePiece?: string | null;
      compagnie?: string;
      lieuDepart?: string;
      lieuArrivee?: string;
      numeroTicket?: string;
      dateDepart?: string;
      numeroPersonneContact?: string;
      raisonSociale?: string;
      profession?: string;
      classe?: number;
      typeCouverture?: string;
      effectif?: number;
      nom?: string;
      prenom?: string;
      nomCommercial?: string | null;
      ville?: string;
      communeQuartier?: string;
      refFacture?: string;
      statutOccupation?: "proprietaire" | "locataire";
      valeurBatiment?: number | null;
      loyerMensuel?: number | null;
      contenu?: number;
      dansMarche?: boolean;
      gardien?: boolean;
      extincteur?: boolean;
      camera?: boolean;
      volContenu?: boolean;
      majorationVolContenu?: boolean | null;
      volCaisseCapital?: number | null;
      majorationVolCaisse?: boolean | null;
      ddeCapital?: number | null;
      deCapital?: number | null;
      bdgCapital?: number | null;
      nombrePieces?: number | null;
    } | null;
    let fraisSante: number | null = null;
    let bagages: string | null = null;
    if (req.params.produit === "relaxvoyage") {
      const tarif = await prisma.tarifProduit.findFirst({
        where: { produitId: s.produitId, prime: s.montantPrime },
      });
      const infos = tarif?.donneesSpecifiques as { fraisSante?: number; bagages?: string } | null;
      fraisSante = infos?.fraisSante ?? null;
      bagages = infos?.bagages ?? null;
    }
    res.json({
      numeroPolice: s.numeroPolice,
      montant: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      dateNaissance: s.dateNaissance,
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      partenaire: s.partenaire.nomCommerce,
      signature: donneesSpecifiques?.signature ?? null,
      compagnie: donneesSpecifiques?.compagnie ?? null,
      lieuDepart: donneesSpecifiques?.lieuDepart ?? null,
      lieuArrivee: donneesSpecifiques?.lieuArrivee ?? null,
      numeroTicket: donneesSpecifiques?.numeroTicket ?? null,
      dateDepart: donneesSpecifiques?.dateDepart ?? null,
      numeroPersonneContact: donneesSpecifiques?.numeroPersonneContact ?? null,
      fraisSante,
      bagages,
      raisonSociale: donneesSpecifiques?.raisonSociale ?? null,
      profession: donneesSpecifiques?.profession ?? null,
      classe: donneesSpecifiques?.classe ?? null,
      typeCouverture: donneesSpecifiques?.typeCouverture ?? null,
      effectif: donneesSpecifiques?.effectif ?? null,
      // SecurHome+/SecurPro (Assurances Dommages)
      nomCommercial: donneesSpecifiques?.nomCommercial ?? null,
      ville: donneesSpecifiques?.ville ?? null,
      communeQuartier: donneesSpecifiques?.communeQuartier ?? null,
      refFacture: donneesSpecifiques?.refFacture ?? null,
      statutOccupation: donneesSpecifiques?.statutOccupation ?? null,
      valeurBatiment: donneesSpecifiques?.valeurBatiment ?? null,
      loyerMensuel: donneesSpecifiques?.loyerMensuel ?? null,
      contenu: donneesSpecifiques?.contenu ?? null,
      dansMarche: donneesSpecifiques?.dansMarche ?? null,
      gardien: donneesSpecifiques?.gardien ?? null,
      extincteur: donneesSpecifiques?.extincteur ?? null,
      camera: donneesSpecifiques?.camera ?? null,
      volContenu: donneesSpecifiques?.volContenu ?? null,
      nombrePieces: donneesSpecifiques?.nombrePieces ?? null,
      resultat: s.resultat ?? null,
    });
  })
);
