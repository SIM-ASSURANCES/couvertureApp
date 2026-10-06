import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { lireTokenOptionnel } from "../auth.js";
import { asyncHandler } from "../util.js";
import { htmlToPdf } from "../services/pdf.js";
import { chargerDonneesFacture, emettreFacture } from "../services/facture.js";
import { renderFactureHtml } from "../services/factureHtml.js";
import { retourPaiementRecent } from "../services/retourPaiement.js";

export const facturesRouter = Router();

const pdfSchema = z.object({
  paiementId: z.string().min(10).max(60),
  // Preuve d'accès pour le parcours public juste après paiement (voir
  // autoriserAcces) ; inutile avec une session admin ou client.
  souscriptionId: z.string().min(10).max(60).optional(),
});

/**
 * Une facture porte nom, adresse et téléphone : elle n'est servie qu'à un
 * demandeur légitime — mêmes trois voies que la carte (routes/cartes.ts) :
 *   1. un admin authentifié ;
 *   2. le client connecté, pour SA souscription ;
 *   3. sans compte, uniquement juste après le paiement (retour Wave/Peya pay) :
 *      identifiant de souscription + paiement confirmé + moins de 48 h
 *      (audit sécurité 2026-10-05, voir services/retourPaiement.ts).
 */
function autoriserAcces(
  req: Request,
  p: { souscriptionId: string; statut: string; datePaiement: Date | null; updatedAt: Date },
  souscriptionIdFourni?: string
): boolean {
  const user = lireTokenOptionnel(req.headers.authorization);
  if (user?.type === "admin") return true;
  if (user?.type === "client" && user.sub === p.souscriptionId) return true;
  return (
    !!souscriptionIdFourni &&
    souscriptionIdFourni === p.souscriptionId &&
    p.statut === "paye" &&
    retourPaiementRecent(p.datePaiement ?? p.updatedAt)
  );
}

/** Facture d'un paiement, en PDF (texte réel). */
facturesRouter.post(
  "/pdf",
  asyncHandler(async (req, res) => {
    const body = pdfSchema.parse(req.body);

    const p = await prisma.paiement.findUnique({
      where: { id: body.paiementId },
      select: { souscriptionId: true, statut: true, datePaiement: true, updatedAt: true },
    });
    // Même réponse que le paiement soit inconnu ou refusé : ne pas révéler
    // quels identifiants existent.
    if (!p || !autoriserAcces(req, p, body.souscriptionId)) {
      return res.status(403).json({ error: "Accès non autorisé à cette facture." });
    }

    const donnees = await chargerDonneesFacture(body.paiementId);
    if (!donnees) {
      return res.status(404).json({ error: "Aucune facture : le paiement n'est pas encore confirmé." });
    }

    const pdf = await htmlToPdf(renderFactureHtml(donnees));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${donnees.numeroFacture}.pdf"`);
    res.send(pdf);
  })
);

/**
 * Factures d'une souscription (une par paiement confirmé : première
 * souscription et chaque renouvellement) — alimente la liste de l'espace client
 * et des fiches admin. Admin ou client propriétaire uniquement.
 */
facturesRouter.get(
  "/souscription/:souscriptionId",
  asyncHandler(async (req, res) => {
    const { souscriptionId } = req.params;
    const user = lireTokenOptionnel(req.headers.authorization);
    const autorise = user?.type === "admin" || (user?.type === "client" && user.sub === souscriptionId);
    if (!autorise) return res.status(403).json({ error: "Accès non autorisé." });

    // Paiements confirmés avant la fonctionnalité : numérotés à la première consultation.
    const sansNumero = await prisma.paiement.findMany({
      where: { souscriptionId, statut: "paye", numeroFacture: null },
      orderBy: { datePaiement: "asc" },
      select: { id: true },
    });
    for (const { id } of sansNumero) await emettreFacture(id, { rattrapage: true });

    const paiements = await prisma.paiement.findMany({
      where: { souscriptionId, statut: "paye", numeroFacture: { not: null } },
      orderBy: [{ datePaiement: "desc" }, { numeroEcheance: "desc" }],
      select: {
        id: true,
        numeroFacture: true,
        datePaiement: true,
        montant: true,
        estRenouvellement: true,
        periodeDebut: true,
        periodeFin: true,
      },
    });
    res.json(paiements.map((p) => ({ ...p, paiementId: p.id })));
  })
);
