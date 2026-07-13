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

const PRODUITS_RELAX = ["relaxmoto", "relaxauto"] as const;
function isProduitRelax(p: string): p is (typeof PRODUITS_RELAX)[number] {
  return (PRODUITS_RELAX as readonly string[]).includes(p);
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
    const p = await prisma.partenaire.findFirst({
      where: {
        statut: "actif",
        OR: [
          { qrIncendie1000Token: token },
          { qrIncendie2000Token: token },
          { qrAccidentToken: token },
        ],
      },
    });

    if (p) {
      let produit: "incendie" | "accident";
      let montantPrime: number | null = null;
      let capitalGaranti: number | null = null;

      if (p.qrIncendie1000Token === token) {
        produit = "incendie";
        montantPrime = 1000;
        capitalGaranti = 500000;
      } else if (p.qrIncendie2000Token === token) {
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

    // Modèle générique (RelaxMoto/RelaxAuto)
    const qr = await prisma.qrCode.findFirst({
      where: { token, actif: true, partenaire: { statut: "actif" } },
      include: { produit: true, partenaire: { select: { id: true, nomCommerce: true } } },
    });
    if (!qr) return res.status(404).json({ error: "QR invalide ou inactif" });

    const tarifDefaut = await prisma.tarifProduit.findFirst({
      where: { produitId: qr.produitId },
      orderBy: { prime: "asc" },
    });

    res.json({
      produit: qr.produit.code,
      montantPrime: tarifDefaut?.prime ?? null,
      capitalGaranti: tarifDefaut?.capitalGaranti ?? null,
      partenaire: { id: qr.partenaire.id, nomCommerce: qr.partenaire.nomCommerce },
    });
  })
);

/** Tarifications d'un produit générique (RelaxMoto/RelaxAuto) */
publicRouter.get(
  "/tarifs/:produit",
  asyncHandler(async (req, res) => {
    const code = req.params.produit;
    if (!isProduitRelax(code)) return res.status(404).json({ error: "Produit inconnu" });
    const prod = await prisma.produit.findUnique({ where: { code } });
    if (!prod) return res.status(404).json({ error: "Produit inconnu" });
    const tarifs = await prisma.tarifProduit.findMany({
      where: { produitId: prod.id },
      orderBy: { prime: "asc" },
    });
    res.json(tarifs);
  })
);

/** Incendie : enregistrement dès la saisie du téléphone */
const incSchema = z.object({
  qrToken: z.string(),
  telephone: z.string().min(6),
  nom: z.string().optional(),
  prenom: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  commune: z.string().optional(),
  quartier: z.string().optional(),
});

publicRouter.post(
  "/souscriptions/incendie",
  asyncHandler(async (req, res) => {
    const data = incSchema.parse(req.body);
    const p = await prisma.partenaire.findFirst({
      where: {
        statut: "actif",
        OR: [
          { qrIncendie1000Token: data.qrToken },
          { qrIncendie2000Token: data.qrToken },
        ],
      },
    });
    if (!p) return res.status(404).json({ error: "QR Incendie invalide" });

    const montantPrime = p.qrIncendie1000Token === data.qrToken ? 1000 : 2000;
    const capitalGaranti = montantPrime === 1000 ? 500000 : 1000000;

    const token = newFormulaireToken();

    const s = await prisma.souscriptionIncendie.create({
      data: {
        partenaireId: p.id,
        telephone: data.telephone,
        nom: data.nom || null,
        prenom: data.prenom || null,
        email: data.email || null,
        commune: data.commune || null,
        quartier: data.quartier || null,
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
      p.id,
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
      commune: s.commune,
      quartier: s.quartier,
      numeroMaison: s.numeroMaison,
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
    const { nom, prenom, email, refFacture, commune, quartier, numeroMaison } =
      req.body ?? {};

    const tenteCompletion = !!(refFacture || commune || quartier || numeroMaison);
    if (tenteCompletion) {
      if (!refFacture || !commune || !quartier) {
        return res.status(400).json({
          error: "Réf.facture, commune et quartier sont obligatoires.",
        });
      }
      if (!(await refFactureDisponible(refFacture, s.id))) {
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
        refFacture: refFacture ?? s.refFacture,
        commune: commune ?? s.commune,
        quartier: quartier ?? s.quartier,
        numeroMaison: numeroMaison ?? s.numeroMaison,
        statut: tenteCompletion ? "complet" : s.statut,
        commissionCalculee,
      },
    });
    res.json({ id: updated.id, statut: updated.statut });
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
});

publicRouter.post(
  "/souscriptions/accident/initiate",
  asyncHandler(async (req, res) => {
    const data = accSchema.parse(req.body);
    const p = await prisma.partenaire.findFirst({
      where: { qrAccidentToken: data.qrToken, statut: "actif" },
    });
    if (!p) return res.status(404).json({ error: "QR Accident invalide" });

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
        partenaireId: p.id,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        dateNaissance: data.dateNaissance,
        montantPrime: montant,
        capitalGaranti,
        waveStatut: "en_attente",
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
      p.id,
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
    });
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
  tarifId: z.number().int().positive().optional(),
  cycle: z.enum(["hebdo5semaines", "mensuel", "annuel"]),
});

publicRouter.post(
  "/souscriptions/:produit/initiate",
  asyncHandler(async (req, res) => {
    const code = req.params.produit;
    if (!isProduitRelax(code)) return res.status(404).json({ error: "Produit inconnu" });
    const data = relaxSchema.parse(req.body);

    const prod = await prisma.produit.findUnique({ where: { code } });
    if (!prod) return res.status(404).json({ error: "Produit inconnu" });

    const qr = await prisma.qrCode.findFirst({
      where: { token: data.qrToken, produitId: prod.id, actif: true, partenaire: { statut: "actif" } },
      include: { partenaire: true },
    });
    if (!qr) return res.status(404).json({ error: "QR invalide pour ce produit" });

    let tarif = data.tarifId
      ? await prisma.tarifProduit.findFirst({ where: { id: data.tarifId, produitId: prod.id } })
      : await prisma.tarifProduit.findFirst({ where: { produitId: prod.id }, orderBy: { prime: "asc" } });
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

/** RelaxMoto/RelaxAuto : vérification manuelle du paiement d'une échéance (filet de sécurité) */
publicRouter.get(
  "/souscriptions/:produit/echeances/:echeanceId/verify",
  asyncHandler(async (req, res) => {
    if (!isProduitRelax(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
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
  type: z.enum(["CNI", "Permis"]),
  url: z.string().min(1),
});

publicRouter.post(
  "/souscriptions/:produit/:id/documents",
  asyncHandler(async (req, res) => {
    if (!isProduitRelax(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
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
    if (!isProduitRelax(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
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

/** RelaxMoto/RelaxAuto : contrat après paiement confirmé */
publicRouter.get(
  "/souscriptions/:produit/:id/contrat",
  asyncHandler(async (req, res) => {
    if (!isProduitRelax(req.params.produit)) return res.status(404).json({ error: "Produit inconnu" });
    const s = await prisma.souscription.findUnique({
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
    });
  })
);
