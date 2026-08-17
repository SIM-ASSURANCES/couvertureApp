import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import {
  initiateWavePayment,
  sendSMS,
  lienFormulaire,
  messageRelanceRenouvellementIncendie,
  numeroPoliceIncendieSynthetique,
} from "../services/notify.js";
import { confirmerEcheance, verifierPaiementEcheance } from "../services/paiementWave.js";
import { confirmerAccident } from "../services/accident.js";
import { construireChooserProduits } from "./public.js";

/**
 * Espace client, tous produits confondus (modèle générique, Incendie,
 * Accident historique — voir refonte "espace client universel") : contrat,
 * carte, renouvellement, souscription à d'autres produits du même
 * partenaire, sinistres. `req.user.sub` est l'id de la ligne dans le modèle
 * désigné par `req.user.produitType` (voir auth.ts POST /client/login).
 */
export const clientRouter = Router();
clientRouter.use(requireAuth("client"));

function numeroSinistre(produitCode: string, id: string) {
  const annee = new Date().getFullYear();
  return `SIN-${produitCode.toUpperCase()}-${annee}-${id.slice(0, 8).toUpperCase()}`;
}

function produitType(req: AuthedRequest): "generique" | "incendie" | "accident" {
  return req.user!.produitType ?? "generique";
}

clientRouter.get(
  "/moi",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({
        where: { id },
        include: { partenaire: { select: { nomCommerce: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      const debut = s.dateDebut ?? s.createdAt;
      return res.json({
        id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        produitType: type,
        carteType: "incendie",
        produitLibelle: "Incendie Habitation en Inclusion",
        partenaire: s.partenaire.nomCommerce,
        numeroPolice: numeroPoliceIncendieSynthetique(s.id, debut),
        montantPrime: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        cycleFacturation: null,
        statutAbonnement: null,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
      });
    }

    if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({
        where: { id },
        include: { partenaire: { select: { nomCommerce: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      return res.json({
        id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        produitType: type,
        carteType: "accident",
        produitLibelle: "Accident (historique)",
        partenaire: s.partenaire.nomCommerce,
        numeroPolice: s.numeroPolice,
        montantPrime: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        cycleFacturation: null,
        statutAbonnement: null,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
      });
    }

    const s = await prisma.souscription.findUnique({
      where: { id },
      include: { produit: { select: { code: true, libelle: true } }, partenaire: { select: { nomCommerce: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    res.json({
      id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      produitType: type,
      carteType: s.produit.code,
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

/** Crée une échéance de renouvellement sur le modèle générique et lance le paiement (ou stub-confirme sans WAVE_API_KEY). */
async function creerEcheanceRenouvellement(souscriptionId: string, montant: number) {
  const dernier = await prisma.paiement.findFirst({
    where: { souscriptionId },
    orderBy: { numeroEcheance: "desc" },
  });
  const paiement = await prisma.paiement.create({
    data: {
      souscriptionId,
      numeroEcheance: (dernier?.numeroEcheance ?? 0) + 1,
      montant,
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
    return { paiementId: paiement.id, montant: paiement.montant, checkoutUrl: successUrl };
  }

  const wave = await initiateWavePayment(paiement.montant, paiement.id, successUrl, errorUrl);
  await prisma.paiement.update({ where: { id: paiement.id }, data: { waveTransactionId: wave.transactionId } });
  return { paiementId: paiement.id, montant: paiement.montant, checkoutUrl: wave.checkoutUrl };
}

/**
 * Renouvellement, tous produits confondus — trois mécaniques selon
 * `produitType` :
 * - générique + cycleFacturation (RelaxMoto/Auto) : un paiement au même
 *   cycle que le contrat initial, prolonge dateFin à la confirmation (voir
 *   confirmerEcheance, branche estRenouvellement).
 * - générique sans cycleFacturation (formule 3 mois) et accident (historique)
 *   : nouveau paiement Wave (ou stub) sur la même ligne — le numéro de
 *   police est conservé sauf si le renouvellement dépasse le délai de grâce
 *   de 2 jours après l'échéance (voir numeroPoliceRenouvellement).
 * - incendie : pas de paiement en ligne (achat en boutique) — déclenche le
 *   même SMS que la relance admin, invitant à revenir avec une nouvelle
 *   réf.facture (voir POST /souscriptions/incendie/:id/relance-renouvellement).
 */
clientRouter.post(
  "/renouveler",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      if (s.statut !== "complet" || !s.lienFormulaireToken) {
        return res.status(400).json({ error: "Ce contrat n'est pas encore complet." });
      }
      await sendSMS(
        s.telephone,
        messageRelanceRenouvellementIncendie(lienFormulaire("incendie", s.lienFormulaireToken))
      );
      const updated = await prisma.souscriptionIncendie.update({
        where: { id: s.id },
        data: { renouvellementEnCoursDepuis: new Date(), relanceRenouvellementCount: { increment: 1 } },
      });
      return res.json({ sms: true, relanceRenouvellementCount: updated.relanceRenouvellementCount });
    }

    if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      if (s.waveStatut !== "confirme" || !s.numeroPolice) {
        return res.status(400).json({ error: "Ce contrat n'est pas encore confirmé." });
      }

      const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
      const successUrl = `${appUrl}/client?renouvele=${s.id}`;
      const errorUrl = `${appUrl}/client?paiement=echec`;

      if (!process.env.WAVE_API_KEY) {
        const transactionId = `STUB-${s.id.slice(0, 8)}-${Date.now()}`;
        const stub = { ...s, waveTransactionId: transactionId, renouvellementEnCoursDepuis: new Date() };
        await prisma.souscriptionAccident.update({
          where: { id: s.id },
          data: { waveTransactionId: transactionId, renouvellementEnCoursDepuis: stub.renouvellementEnCoursDepuis },
        });
        await confirmerAccident(stub);
        return res.status(201).json({ checkoutUrl: successUrl });
      }

      const wave = await initiateWavePayment(s.montantPrime, s.id, successUrl, errorUrl);
      await prisma.souscriptionAccident.update({
        where: { id: s.id },
        data: { waveTransactionId: wave.transactionId, renouvellementEnCoursDepuis: new Date() },
      });
      return res.status(201).json({ checkoutUrl: wave.checkoutUrl });
    }

    const s = await prisma.souscription.findUnique({ where: { id } });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    if (s.cycleFacturation === "mensuel" || s.cycleFacturation === "annuel") {
      const tarif = await prisma.tarifProduit.findFirst({
        where: { produitId: s.produitId, libelleVariante: s.cycleFacturation },
      });
      if (!tarif) return res.status(400).json({ error: "Tarif indisponible pour ce produit" });
      return res.status(201).json(await creerEcheanceRenouvellement(s.id, tarif.prime));
    }

    if (s.waveStatut !== "confirme") {
      return res.status(400).json({ error: "Ce contrat n'est pas encore confirmé." });
    }
    res.status(201).json(await creerEcheanceRenouvellement(s.id, s.montantPrime));
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

/** Autres produits actifs du partenaire d'origine, non encore souscrits (confirmés) par ce même numéro chez ce partenaire. */
clientRouter.get(
  "/produits-disponibles",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;

    let partenaireId: string;
    let telephone: string;
    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      partenaireId = s.partenaireId;
      telephone = s.telephone;
    } else if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      partenaireId = s.partenaireId;
      telephone = s.telephone;
    } else {
      const s = await prisma.souscription.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      partenaireId = s.partenaireId;
      telephone = s.telephone;
    }

    const partenaire = await prisma.partenaire.findUnique({
      where: { id: partenaireId },
      select: { id: true, nomCommerce: true },
    });
    if (!partenaire) return res.status(404).json({ error: "Partenaire introuvable" });

    const [accidentsChooser, dommagesChooser, dejaSouscrits, qr] = await Promise.all([
      construireChooserProduits("ASSURANCES_ACCIDENTS", partenaire),
      construireChooserProduits("ASSURANCES_DOMMAGES", partenaire),
      prisma.souscription.findMany({
        where: { telephone, partenaireId, waveStatut: "confirme" },
        select: { produit: { select: { code: true } } },
      }),
      prisma.qrCode.findFirst({ where: { partenaireId, produitId: null } }),
    ]);

    const codesDejaSouscrits = new Set(dejaSouscrits.map((d) => d.produit.code));
    const produits = [...accidentsChooser.produits, ...dommagesChooser.produits].filter(
      (p) => p.disponible && !codesDejaSouscrits.has(p.code)
    );

    res.json({
      partenaire: { nomCommerce: partenaire.nomCommerce },
      qrToken: qr?.token ?? null,
      produits: produits.map((p) => ({ code: p.code, libelle: p.libelle, montantPrime: p.montantPrime })),
    });
  })
);

const sinistreSchema = z.object({
  typeEvenement: z.string().min(1).max(120),
  dateSurvenance: z.coerce.date(),
  description: z.string().max(2000).optional(),
  photoUrl: z.string().max(2_000_000).optional(),
});

clientRouter.post(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = sinistreSchema.parse(req.body);
    const type = produitType(req);
    const id = req.user!.sub;

    let produitCode: string;
    if (type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      produitCode = "incendie";
    } else if (type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      produitCode = "accident";
    } else {
      const s = await prisma.souscription.findUnique({
        where: { id },
        include: { produit: { select: { code: true } } },
      });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      produitCode = s.produit.code;
    }

    const created = await prisma.sinistreRelax.create({
      data: {
        produitType: type,
        souscriptionId: type === "generique" ? id : undefined,
        souscriptionIncendieId: type === "incendie" ? id : undefined,
        souscriptionAccidentId: type === "accident" ? id : undefined,
        numeroSinistre: "TMP",
        typeEvenement: data.typeEvenement,
        dateSurvenance: data.dateSurvenance,
        description: data.description,
        photoUrl: data.photoUrl,
      },
    });
    const updated = await prisma.sinistreRelax.update({
      where: { id: created.id },
      data: { numeroSinistre: numeroSinistre(produitCode, created.id) },
    });
    res.status(201).json(updated);
  })
);

clientRouter.get(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = produitType(req);
    const id = req.user!.sub;
    const where =
      type === "incendie"
        ? { souscriptionIncendieId: id }
        : type === "accident"
        ? { souscriptionAccidentId: id }
        : { souscriptionId: id };
    const rows = await prisma.sinistreRelax.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json(rows);
  })
);
