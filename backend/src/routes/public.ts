import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../util.js";
import {
  initiateWavePayment,
  newNumeroPolice,
  newFormulaireToken,
  sendWhatsApp,
  messageIncendie,
  messageAccident,
  lienFormulaire,
} from "../services/notify.js";

export const publicRouter = Router();

/** Tarifications disponibles */
publicRouter.get(
  "/tarifs/accident",
  asyncHandler(async (_req, res) => {
    const tarifs = await prisma.tarifAccident.findMany({
      orderBy: { prime: "asc" },
    });
    res.json(tarifs);
  })
);

publicRouter.get(
  "/tarifs/incendie",
  asyncHandler(async (_req, res) => {
    const tarifs = await prisma.tarifIncendie.findMany({
      orderBy: { prime: "asc" },
    });
    res.json(tarifs);
  })
);

/** Résout un QR token -> partenaire + produit */
publicRouter.get(
  "/qr/:token",
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const p = await prisma.partenaire.findFirst({
      where: {
        statut: "actif",
        OR: [{ qrIncendieToken: token }, { qrAccidentToken: token }],
      },
      include: { tarifIncendie: true },
    });
    if (!p) return res.status(404).json({ error: "QR invalide ou inactif" });
    const produit = p.qrIncendieToken === token ? "incendie" : "accident";
    res.json({
      produit,
      partenaire: { id: p.id, nomCommerce: p.nomCommerce },
      tarifIncendie:
        produit === "incendie" && p.tarifIncendie
          ? {
              id: p.tarifIncendie.id,
              prime: p.tarifIncendie.prime,
              capitalGaranti: p.tarifIncendie.capitalGaranti,
            }
          : null,
    });
  })
);

/** Incendie : enregistrement dès la saisie du téléphone */
const incSchema = z.object({
  qrToken: z.string(),
  telephone: z.string().min(6),
  nom: z.string().optional(),
  prenom: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  numeroFacture: z.string().optional(),
});

publicRouter.post(
  "/souscriptions/incendie",
  asyncHandler(async (req, res) => {
    const data = incSchema.parse(req.body);
    const p = await prisma.partenaire.findFirst({
      where: { qrIncendieToken: data.qrToken, statut: "actif" },
      include: { tarifIncendie: true },
    });
    if (!p) return res.status(404).json({ error: "QR Incendie invalide" });
    if (!p.tarifIncendie) {
      return res.status(400).json({ error: "Aucun tarif configuré pour ce partenaire" });
    }

    const { prime: montantPrime, capitalGaranti, commission } = p.tarifIncendie;
    const facturePresente = !!(data.numeroFacture);

    const token = newFormulaireToken();
    const s = await prisma.souscriptionIncendie.create({
      data: {
        partenaireId: p.id,
        telephone: data.telephone,
        nom: data.nom || null,
        prenom: data.prenom || null,
        email: data.email || null,
        numeroFacture: data.numeroFacture || null,
        montantPrime,
        capitalGaranti,
        commissionCalculee: facturePresente ? commission : null,
        statut: facturePresente ? "complet" : "en_cours",
        lienFormulaireToken: token,
        whatsappEnvoyeAt: new Date(),
      },
    });
    await sendWhatsApp(
      data.telephone,
      messageIncendie(s.prenom, lienFormulaire("incendie", token))
    );
    res.status(201).json({ id: s.id, statut: s.statut, lienToken: token });
  })
);

/** Incendie : complétion du formulaire via lien WhatsApp */
publicRouter.patch(
  "/souscriptions/incendie/:token",
  asyncHandler(async (req, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({
      where: { lienFormulaireToken: req.params.token },
      include: { partenaire: { include: { tarifIncendie: true } } },
    });
    if (!s) return res.status(404).json({ error: "Lien invalide" });
    const { nom, prenom, email, numeroFacture } = req.body ?? {};

    const factureAjoutee = !!numeroFacture && !s.numeroFacture;
    const commissionCalculee =
      factureAjoutee && s.partenaire?.tarifIncendie
        ? s.partenaire.tarifIncendie.commission
        : s.commissionCalculee;

    const updated = await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: {
        nom: nom ?? s.nom,
        prenom: prenom ?? s.prenom,
        email: email ?? s.email,
        numeroFacture: numeroFacture ?? s.numeroFacture,
        statut: numeroFacture || s.numeroFacture ? "complet" : s.statut,
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

    // Résolution du tarif choisi
    let montant = 500;
    let capitalGaranti = 100000;
    if (data.tarifAccidentId) {
      const tarif = await prisma.tarifAccident.findUnique({
        where: { id: data.tarifAccidentId },
      });
      if (!tarif) return res.status(400).json({ error: "Tarif Accident invalide" });
      montant = tarif.prime;
      capitalGaranti = tarif.capitalGaranti;
    } else {
      // Tarif par défaut : le moins cher
      const defaultTarif = await prisma.tarifAccident.findFirst({
        orderBy: { prime: "asc" },
      });
      if (defaultTarif) {
        montant = defaultTarif.prime;
        capitalGaranti = defaultTarif.capitalGaranti;
      }
    }

    const s = await prisma.souscriptionAccident.create({
      data: {
        partenaireId: p.id,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        montantPrime: montant,
        capitalGaranti,
        waveStatut: "en_attente",
      },
    });
    const wave = await initiateWavePayment(montant, s.id);
    await prisma.souscriptionAccident.update({
      where: { id: s.id },
      data: { waveTransactionId: wave.transactionId },
    });
    res.status(201).json({
      souscriptionId: s.id,
      montant,
      capitalGaranti,
      checkoutUrl: wave.checkoutUrl,
      transactionId: wave.transactionId,
    });
  })
);

/** Callback Wave (simulé) : confirme/échoue le paiement */
publicRouter.post(
  "/wave/callback",
  asyncHandler(async (req, res) => {
    const { souscriptionId, status } = req.body as {
      souscriptionId: string;
      status: "confirme" | "echoue";
    };
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: souscriptionId },
    });
    if (!s) return res.status(404).json({ error: "Souscription introuvable" });

    if (status !== "confirme") {
      await prisma.souscriptionAccident.update({
        where: { id: s.id },
        data: { waveStatut: "echoue" },
      });
      return res.json({ ok: true, statut: "echoue" });
    }

    const numeroPolice = newNumeroPolice();
    const token = newFormulaireToken();
    const tarifAcc = await prisma.tarifAccident.findFirst({
      where: { prime: s.montantPrime },
    });
    await prisma.souscriptionAccident.update({
      where: { id: s.id },
      data: {
        waveStatut: "confirme",
        numeroPolice,
        whatsappEnvoyeAt: new Date(),
        commissionCalculee: tarifAcc?.commission ?? null,
      },
    });
    await sendWhatsApp(
      s.telephone,
      messageAccident(
        s.prenom,
        s.montantPrime,
        numeroPolice,
        lienFormulaire("accident", token)
      )
    );
    res.json({ ok: true, statut: "confirme", numeroPolice });
  })
);
