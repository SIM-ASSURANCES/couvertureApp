import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { initiateWavePayment } from "../services/notify.js";
import { confirmerEcheance, verifierPaiementEcheance } from "../services/paiementWave.js";

/** Espace client RelaxMoto/RelaxAuto : contrat, renouvellement, sinistres. */
export const clientRouter = Router();
clientRouter.use(requireAuth("client"));

function numeroSinistre(produitCode: string, id: string) {
  const annee = new Date().getFullYear();
  return `SIN-${produitCode.toUpperCase()}-${annee}-${id.slice(0, 8).toUpperCase()}`;
}

clientRouter.get(
  "/moi",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscription.findUnique({
      where: { id: req.user!.sub },
      include: { produit: { select: { code: true, libelle: true } }, partenaire: { select: { nomCommerce: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    res.json({
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      produitCode: s.produit.code,
      produitLibelle: s.produit.libelle,
      partenaire: s.partenaire.nomCommerce,
      numeroPolice: s.numeroPolice,
      montantPrime: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      cycleFacturation: s.cycleFacturation,
      statutAbonnement: s.statutAbonnement,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
    });
  })
);

/**
 * Renouvellement : toujours un paiement annuel unique (25 000 FCFA de base),
 * qui prolonge dateFin d'un an à la confirmation — voir confirmerEcheance
 * (branche estRenouvellement). Ne modifie jamais le cycle initial du contrat.
 */
clientRouter.post(
  "/renouveler",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscription.findUnique({ where: { id: req.user!.sub } });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: s.produitId, libelleVariante: "annuel" },
    });
    if (!tarif) return res.status(400).json({ error: "Tarif indisponible pour ce produit" });

    const dernier = await prisma.paiement.findFirst({
      where: { souscriptionId: s.id },
      orderBy: { numeroEcheance: "desc" },
    });

    const paiement = await prisma.paiement.create({
      data: {
        souscriptionId: s.id,
        numeroEcheance: (dernier?.numeroEcheance ?? 0) + 1,
        montant: tarif.prime,
        dateEcheance: new Date(),
        estRenouvellement: true,
      },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/client?renouvele=${paiement.id}`;
    const errorUrl = `${appUrl}/client?paiement=echec`;

    if (!process.env.WAVE_API_KEY) {
      const transactionId = `STUB-${paiement.id.slice(0, 8)}`;
      await prisma.paiement.update({ where: { id: paiement.id }, data: { waveTransactionId: transactionId } });
      await confirmerEcheance({ ...paiement, waveTransactionId: transactionId });
      return res.status(201).json({ paiementId: paiement.id, montant: paiement.montant, checkoutUrl: successUrl });
    }

    const wave = await initiateWavePayment(paiement.montant, paiement.id, successUrl, errorUrl);
    await prisma.paiement.update({ where: { id: paiement.id }, data: { waveTransactionId: wave.transactionId } });
    res.status(201).json({ paiementId: paiement.id, montant: paiement.montant, checkoutUrl: wave.checkoutUrl });
  })
);

clientRouter.get(
  "/renouveler/:paiementId/verify",
  asyncHandler(async (req: AuthedRequest, res) => {
    const p = await prisma.paiement.findUnique({ where: { id: req.params.paiementId } });
    if (!p || p.souscriptionId !== req.user!.sub) return res.status(404).json({ error: "Introuvable" });
    const statut = await verifierPaiementEcheance(p);
    res.json({ statut });
  })
);

const sinistreSchema = z.object({
  typeEvenement: z.string().min(1),
  dateSurvenance: z.coerce.date(),
  description: z.string().optional(),
  photoUrl: z.string().optional(),
});

clientRouter.post(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = sinistreSchema.parse(req.body);
    const s = await prisma.souscription.findUnique({
      where: { id: req.user!.sub },
      include: { produit: { select: { code: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    const created = await prisma.sinistreRelax.create({
      data: {
        souscriptionId: s.id,
        numeroSinistre: "TMP",
        typeEvenement: data.typeEvenement,
        dateSurvenance: data.dateSurvenance,
        description: data.description,
        photoUrl: data.photoUrl,
      },
    });
    const updated = await prisma.sinistreRelax.update({
      where: { id: created.id },
      data: { numeroSinistre: numeroSinistre(s.produit.code, created.id) },
    });
    res.status(201).json(updated);
  })
);

clientRouter.get(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.sinistreRelax.findMany({
      where: { souscriptionId: req.user!.sub },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  })
);
