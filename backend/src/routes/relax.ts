import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";
import { sendSMS, messageRelancePaiement, initiateWavePayment } from "../services/notify.js";
import { verifierPaiementEcheance } from "../services/paiementWave.js";
import { renouvelerCarte } from "../services/novelia.js";

/**
 * Routes admin pour la branche RelaxMoto/RelaxAuto, sur le modèle générique
 * Produit/Souscription. Miroir fonctionnel de souscriptions.ts (Incendie/Accident)
 * mais générique par code produit ("relaxmoto" | "relaxauto").
 */
export const relaxRouter = Router();
relaxRouter.use(requireAuth("admin"));

const PRODUITS_RELAX = ["relaxmoto", "relaxauto"] as const;
function isProduitRelax(p: string): p is (typeof PRODUITS_RELAX)[number] {
  return (PRODUITS_RELAX as readonly string[]).includes(p);
}

async function resolveProduitId(code: string) {
  const p = await prisma.produit.findUnique({ where: { code } });
  return p?.id;
}

/** Vue d'ensemble de la branche Relax (pour le tableau de bord dédié) */
relaxRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const produits = await prisma.produit.findMany({ where: { branche: "RELAX" } });
    const counts = await Promise.all(
      produits.map(async (p) => ({
        produit: p.code,
        libelle: p.libelle,
        confirmes: await prisma.souscription.count({ where: { produitId: p.id, waveStatut: "confirme" } }),
        enAttente: await prisma.souscription.count({ where: { produitId: p.id, waveStatut: { in: ["en_attente", "echoue"] } } }),
      }))
    );
    const partenairesRelax = await prisma.partenaire.count({ where: { branche: "RELAX" } });
    const derniers = await prisma.souscription.findMany({
      where: { produitId: { in: produits.map((p) => p.id) }, waveStatut: "confirme" },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { partenaire: { select: { nomCommerce: true } }, produit: { select: { code: true, libelle: true } } },
    });
    res.json({ partenairesRelax, produits: counts, derniers });
  })
);

/**
 * Liste des échéances à travers tous les abonnements (pas seulement ceux
 * jamais démarrés) — utilisé par la page "Paiements en attente" pour couvrir
 * aussi bien la 1ère échéance non payée qu'un retard sur une échéance
 * ultérieure d'un abonnement déjà actif.
 */
relaxRouter.get(
  "/echeances",
  asyncHandler(async (req, res) => {
    const { produit, statut } = req.query as { produit?: string; statut?: string };
    if (produit && !isProduitRelax(produit)) return res.status(400).json({ error: "Produit inconnu" });
    const produitId = produit ? await resolveProduitId(produit) : undefined;
    if (produit && !produitId) return res.status(404).json({ error: "Produit inconnu" });

    const produitsRelax = await prisma.produit.findMany({ where: { branche: "RELAX" } });
    const produitIds = produitId ? [produitId] : produitsRelax.map((p) => p.id);

    const echeances = await prisma.paiement.findMany({
      where: {
        statut: statut === "paye" ? "paye" : { in: ["en_attente", "echoue"] },
        souscription: { produitId: { in: produitIds } },
      },
      include: {
        souscription: {
          select: {
            nom: true,
            prenom: true,
            telephone: true,
            partenaire: { select: { nomCommerce: true } },
            produit: { select: { code: true, libelle: true } },
          },
        },
      },
      orderBy: { dateEcheance: "asc" },
    });
    res.json(echeances);
  })
);

/** Liste des souscriptions Relax, filtrable par produit / partenaire / attente */
relaxRouter.get(
  "/souscriptions",
  asyncHandler(async (req, res) => {
    const { produit, attente, partenaireId } = req.query as {
      produit?: string;
      attente?: string;
      partenaireId?: string;
    };
    if (produit && !isProduitRelax(produit)) return res.status(400).json({ error: "Produit inconnu" });
    const produitId = produit ? await resolveProduitId(produit) : undefined;
    if (produit && !produitId) return res.status(404).json({ error: "Produit inconnu" });

    const produitsRelax = await prisma.produit.findMany({ where: { branche: "RELAX" } });
    const produitIds = produitId ? [produitId] : produitsRelax.map((p) => p.id);

    const rows = await prisma.souscription.findMany({
      where: {
        produitId: { in: produitIds },
        waveStatut: attente === "1" ? { in: ["en_attente", "echoue"] } : "confirme",
        partenaireId: partenaireId || undefined,
      },
      include: {
        partenaire: { select: { nomCommerce: true } },
        produit: { select: { code: true, libelle: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows.map((r) => ({ ...r, partenaireNom: r.partenaire.nomCommerce })));
  })
);

/** Liste les échéances (calendrier de paiement) d'un abonnement */
relaxRouter.get(
  "/souscriptions/:id/echeances",
  asyncHandler(async (req, res) => {
    const echeances = await prisma.paiement.findMany({
      where: { souscriptionId: req.params.id },
      orderBy: { numeroEcheance: "asc" },
    });
    res.json(echeances);
  })
);

/** Relance le paiement Wave d'une échéance en attente/échouée */
relaxRouter.post(
  "/souscriptions/:id/echeances/:numeroEcheance/relance-paiement",
  asyncHandler(async (req: AuthedRequest, res) => {
    const numeroEcheance = Number(req.params.numeroEcheance);
    const s = await prisma.souscription.findUnique({
      where: { id: req.params.id },
      include: { produit: true },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    const echeance = await prisma.paiement.findUnique({
      where: { souscriptionId_numeroEcheance: { souscriptionId: s.id, numeroEcheance } },
    });
    if (!echeance) return res.status(404).json({ error: "Échéance introuvable" });
    if (echeance.statut === "paye") {
      return res.status(400).json({ error: "Cette échéance est déjà payée." });
    }
    if (!process.env.WAVE_API_KEY) {
      return res.status(400).json({ error: "Wave n'est pas configuré (WAVE_API_KEY manquant)." });
    }
    const qr = await prisma.qrCode.findFirst({ where: { partenaireId: s.partenaireId, produitId: s.produitId } });
    if (!qr) return res.status(400).json({ error: "QR introuvable pour ce partenaire/produit." });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/${s.produit.code}/${qr.token}?paid=${echeance.id}`;
    const errorUrl = `${appUrl}/s/${s.produit.code}/${qr.token}?paiement=echec`;

    const wave = await initiateWavePayment(echeance.montant, echeance.id, successUrl, errorUrl);
    await prisma.paiement.update({
      where: { id: echeance.id },
      data: { waveTransactionId: wave.transactionId, statut: "en_attente" },
    });
    await sendSMS(s.telephone, messageRelancePaiement(echeance.montant, wave.checkoutUrl));
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "paiement_echeance",
      objetId: echeance.id,
    });
    res.json({ ok: true });
  })
);

/** Re-vérifie le paiement Wave d'une échéance bloquée « en attente » */
relaxRouter.post(
  "/souscriptions/:id/echeances/:numeroEcheance/verifier",
  asyncHandler(async (req: AuthedRequest, res) => {
    const numeroEcheance = Number(req.params.numeroEcheance);
    const echeance = await prisma.paiement.findUnique({
      where: { souscriptionId_numeroEcheance: { souscriptionId: req.params.id, numeroEcheance } },
    });
    if (!echeance) return res.status(404).json({ error: "Échéance introuvable" });
    const statut = await verifierPaiementEcheance(echeance);
    if (statut === "paye" && echeance.statut !== "paye") {
      await logAction({
        adminId: req.user!.sub,
        typeAction: "modification",
        objetType: "paiement_echeance",
        objetId: echeance.id,
        valeurApres: { statut: "paye", source: "verification_wave" },
      });
    }
    res.json({ statut });
  })
);

relaxRouter.get(
  "/souscriptions/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { produit } = req.query as { produit?: string };
    if (produit && !isProduitRelax(produit)) return res.status(400).json({ error: "Produit inconnu" });
    const produitId = produit ? await resolveProduitId(produit) : undefined;
    const produitsRelax = await prisma.produit.findMany({ where: { branche: "RELAX" } });
    const produitIds = produitId ? [produitId] : produitsRelax.map((p) => p.id);

    const rows = await prisma.souscription.findMany({
      where: { produitId: { in: produitIds } },
      include: { partenaire: { select: { nomCommerce: true } }, produit: { select: { libelle: true } } },
      orderBy: { createdAt: "desc" },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "souscription",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "clients_relax.csv",
      toCsv(
        rows.map((r) => ({
          id: r.id,
          produit: r.produit.libelle,
          telephone: r.telephone,
          nom: r.nom ?? "",
          prenom: r.prenom ?? "",
          montantPrime: r.montantPrime,
          waveStatut: r.waveStatut ?? "",
          numeroPolice: r.numeroPolice ?? "",
          partenaire: r.partenaire.nomCommerce,
          date: r.createdAt.toISOString(),
        }))
      )
    );
  })
);

/** Liste les documents (CNI/Permis) déposés pour un abonnement */
relaxRouter.get(
  "/souscriptions/:id/documents",
  asyncHandler(async (req, res) => {
    const documents = await prisma.document.findMany({
      where: { souscriptionId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(documents);
  })
);

/** Valide un document déposé par le souscripteur */
relaxRouter.post(
  "/documents/:docId/valider",
  asyncHandler(async (req: AuthedRequest, res) => {
    const doc = await prisma.document.update({
      where: { id: req.params.docId },
      data: { statutValidation: "valide", motifRejet: null },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "document",
      objetId: doc.id,
      valeurApres: { statutValidation: "valide" },
    });
    res.json(doc);
  })
);

/** Rejette un document déposé par le souscripteur, avec motif */
relaxRouter.post(
  "/documents/:docId/rejeter",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { motifRejet } = (req.body ?? {}) as { motifRejet?: string };
    if (!motifRejet?.trim()) return res.status(400).json({ error: "Motif de rejet requis." });
    const doc = await prisma.document.update({
      where: { id: req.params.docId },
      data: { statutValidation: "rejete", motifRejet: motifRejet.trim() },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "document",
      objetId: doc.id,
      valeurApres: { statutValidation: "rejete", motifRejet: doc.motifRejet },
    });
    res.json(doc);
  })
);

/** Liste les cartes de prise en charge, filtrable par produit/statut (pour export impression) */
relaxRouter.get(
  "/cartes",
  asyncHandler(async (req, res) => {
    const { produit, statut } = req.query as { produit?: string; statut?: string };
    if (produit && !isProduitRelax(produit)) return res.status(400).json({ error: "Produit inconnu" });
    const produitId = produit ? await resolveProduitId(produit) : undefined;
    const produitsRelax = await prisma.produit.findMany({ where: { branche: "RELAX" } });
    const produitIds = produitId ? [produitId] : produitsRelax.map((p) => p.id);

    const cartes = await prisma.carte.findMany({
      where: {
        statut: statut === "generee" || statut === "envoyee" || statut === "activee" ? statut : undefined,
        souscription: { produitId: { in: produitIds } },
      },
      include: {
        souscription: {
          select: { nom: true, prenom: true, telephone: true, produit: { select: { code: true, libelle: true } } },
        },
      },
      orderBy: { dateGeneration: "desc" },
    });
    res.json(cartes);
  })
);

/** Carte d'un abonnement donné */
relaxRouter.get(
  "/souscriptions/:id/carte",
  asyncHandler(async (req, res) => {
    const carte = await prisma.carte.findUnique({ where: { souscriptionId: req.params.id } });
    if (!carte) return res.status(404).json({ error: "Carte non disponible" });
    res.json(carte);
  })
);

/** Marque la carte comme envoyée au souscripteur */
relaxRouter.post(
  "/souscriptions/:id/carte/envoyer",
  asyncHandler(async (req: AuthedRequest, res) => {
    const carte = await prisma.carte.update({
      where: { souscriptionId: req.params.id },
      data: { statut: "envoyee", dateEnvoi: new Date() },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "carte",
      objetId: carte.id,
      valeurApres: { statut: "envoyee" },
    });
    res.json(carte);
  })
);

/** Marque la carte comme activée */
relaxRouter.post(
  "/souscriptions/:id/carte/activer",
  asyncHandler(async (req: AuthedRequest, res) => {
    const carte = await prisma.carte.update({
      where: { souscriptionId: req.params.id },
      data: { statut: "activee", dateActivation: new Date() },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "carte",
      objetId: carte.id,
      valeurApres: { statut: "activee" },
    });
    res.json(carte);
  })
);

/** Renouvelle la carte (nouvelle période de couverture) */
relaxRouter.post(
  "/souscriptions/:id/carte/renouveler",
  asyncHandler(async (req: AuthedRequest, res) => {
    await renouvelerCarte(req.params.id);
    const carte = await prisma.carte.findUnique({ where: { souscriptionId: req.params.id } });
    if (!carte) return res.status(404).json({ error: "Carte non disponible" });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "carte",
      objetId: carte.id,
      valeurApres: { dateRenouvellement: carte.dateRenouvellement },
    });
    res.json(carte);
  })
);

/** Export des cartes pour impression/envoi */
relaxRouter.get(
  "/cartes/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const cartes = await prisma.carte.findMany({
      include: {
        souscription: {
          select: { nom: true, prenom: true, telephone: true, produit: { select: { libelle: true } } },
        },
      },
      orderBy: { dateGeneration: "desc" },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "carte",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "cartes_relax.csv",
      toCsv(
        cartes.map((c) => ({
          numero: c.numero,
          produit: c.souscription.produit.libelle,
          nom: c.souscription.nom ?? "",
          prenom: c.souscription.prenom ?? "",
          telephone: c.souscription.telephone,
          statut: c.statut,
          dateGeneration: c.dateGeneration.toISOString(),
        }))
      )
    );
  })
);

relaxRouter.delete(
  "/souscriptions/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscription.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    if (s.waveStatut === "confirme") {
      return res.status(409).json({ error: "Impossible de supprimer un contrat émis." });
    }
    await prisma.souscription.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "souscription",
      objetId: req.params.id,
    });
    res.status(204).end();
  })
);
