import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../util.js";
import { initiateWavePayment } from "../services/notify.js";
import { confirmerEcheance } from "../services/paiementWave.js";
import {
  LIBELLES_PIECES_SANTE,
  QUESTIONNAIRE_SANTE,
  TYPES_PIECES_SANTE,
  VALIDATION_SANTE,
  estProduitSante,
  lirePersonnesAssureesSante,
  personnesPiecesSante,
  piecesCompletes,
} from "../services/assurancesSante.js";

/**
 * Assurances Santé — dépôt des pièces après validation de la demande
 * (2026-10-15). Le souscripteur arrive ici par le lien du SMS de validation
 * (jeton secret, sans compte) : il dépose, pour chaque personne couverte, les
 * pièces demandées (adultes : CNI recto + verso + photo ; enfants : extrait de
 * naissance + photo), puis un bouton de paiement apparaît, avec le montant
 * exact. Le lien Wave n'est créé qu'au clic, une fois toutes les pièces
 * déposées. Monté sous /api/public/sante (voir index.ts) — jamais de donnée de
 * santé dans ces réponses : seul l'admin lit le questionnaire.
 */
export const santePiecesRouter = Router();

/** Questions posées au souscripteur — texte seulement, aucune donnée personnelle. */
santePiecesRouter.get("/questionnaire", (_req, res) => {
  res.json(QUESTIONNAIRE_SANTE);
});

// Même régime que les autres images publiques (voir routes/public.ts::dataUrlImage),
// avec une borne un peu plus large : une photo de CNI ou d'extrait est dense.
const imageSchema = z
  .string()
  .max(4_000_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/, "Image invalide");

const depotSchema = z.object({
  personneIndex: z.number().int().min(0).max(5),
  type: z.enum(TYPES_PIECES_SANTE),
  image: imageSchema,
});

/** Demande Santé validée, retrouvée par son jeton secret — `null` sinon (jeton inconnu, produit autre, demande non validée). */
async function chargerParJeton(token: string) {
  if (!/^[a-f0-9]{32,96}$/.test(token)) return null;
  const s = await prisma.souscription.findUnique({
    where: { tokenPiecesSante: token },
    omit: { pieceIdentiteUrl: true },
    include: {
      produit: { select: { code: true, libelle: true } },
      piecesSante: { select: { personneIndex: true, type: true } },
    },
  });
  if (!s || !estProduitSante(s.produit.code) || s.validationStatut !== VALIDATION_SANTE.VALIDEE) return null;
  return s;
}

type Chargee = NonNullable<Awaited<ReturnType<typeof chargerParJeton>>>;

function etatPublic(s: Chargee) {
  const personnes = personnesPiecesSante(s.nom ?? "", lirePersonnesAssureesSante(s.donneesSpecifiques));
  const deposees = new Set(s.piecesSante.map((p) => `${p.personneIndex}:${p.type}`));
  const complet = piecesCompletes(personnes, s.piecesSante);
  const paye = s.waveStatut === "confirme";
  return {
    produit: s.produit.libelle,
    nomSouscripteur: s.nom,
    montant: s.montantPrime,
    statut: paye ? ("paye" as const) : complet ? ("a_payer" as const) : ("pieces" as const),
    complet,
    personnes: personnes.map((p) => ({
      index: p.index,
      intitule: p.intitule,
      nomComplet: p.nomComplet,
      adulte: p.adulte,
      pieces: p.pieces.map((type) => ({ type, libelle: LIBELLES_PIECES_SANTE[type], deposee: deposees.has(`${p.index}:${type}`) })),
    })),
  };
}

santePiecesRouter.get(
  "/pieces/:token",
  asyncHandler(async (req, res) => {
    const s = await chargerParJeton(req.params.token);
    if (!s) return res.status(404).json({ error: "Lien invalide ou expiré. Contactez SIM Assurances." });
    res.json(etatPublic(s));
  })
);

santePiecesRouter.post(
  "/pieces/:token",
  asyncHandler(async (req, res) => {
    const s = await chargerParJeton(req.params.token);
    if (!s) return res.status(404).json({ error: "Lien invalide ou expiré. Contactez SIM Assurances." });
    if (s.waveStatut === "confirme") return res.status(400).json({ error: "Votre contrat est déjà actif : aucune pièce supplémentaire n'est attendue." });

    const depot = depotSchema.parse(req.body);
    const personne = personnesPiecesSante(s.nom ?? "", lirePersonnesAssureesSante(s.donneesSpecifiques)).find((p) => p.index === depot.personneIndex);
    if (!personne) return res.status(400).json({ error: "Personne inconnue pour cette demande." });
    if (!personne.pieces.includes(depot.type)) {
      return res.status(400).json({ error: `Cette pièce n'est pas demandée pour ${personne.intitule.toLowerCase()}.` });
    }

    await prisma.pieceSante.upsert({
      where: { souscriptionId_personneIndex_type: { souscriptionId: s.id, personneIndex: depot.personneIndex, type: depot.type } },
      create: { souscriptionId: s.id, personneIndex: depot.personneIndex, type: depot.type, url: depot.image },
      update: { url: depot.image },
    });

    const rechargee = await chargerParJeton(req.params.token);
    res.json(etatPublic(rechargee ?? s));
  })
);

/**
 * Crée le lien de paiement Wave — uniquement quand toutes les pièces sont
 * déposées. Un lien Wave expire : chaque clic en crée un neuf. Sans clé Wave
 * (poste de développement), le paiement est confirmé aussitôt, comme partout
 * dans l'application en mode test.
 */
santePiecesRouter.post(
  "/pieces/:token/payer",
  asyncHandler(async (req, res) => {
    const s = await chargerParJeton(req.params.token);
    if (!s) return res.status(404).json({ error: "Lien invalide ou expiré. Contactez SIM Assurances." });
    if (s.waveStatut === "confirme") return res.status(400).json({ error: "Votre contrat est déjà actif." });

    const personnes = personnesPiecesSante(s.nom ?? "", lirePersonnesAssureesSante(s.donneesSpecifiques));
    if (!piecesCompletes(personnes, s.piecesSante)) {
      return res.status(400).json({ error: "Téléchargez d'abord toutes les pièces demandées pour chaque personne assurée." });
    }

    const echeance = await prisma.paiement.findFirst({
      where: { souscriptionId: s.id, statut: { not: "paye" } },
      orderBy: { numeroEcheance: "asc" },
    });
    if (!echeance) return res.status(400).json({ error: "Aucun paiement à régler pour cette demande." });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/sante/pieces/${req.params.token}?paid=1`;
    const errorUrl = `${appUrl}/sante/pieces/${req.params.token}?paiement=echec`;

    if (!process.env.WAVE_API_KEY) {
      const transactionId = `STUB-${echeance.id.slice(0, 8)}`;
      await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } });
      await confirmerEcheance({ ...echeance, waveTransactionId: transactionId });
      return res.json({ checkoutUrl: successUrl, montant: echeance.montant });
    }
    const wave = await initiateWavePayment(echeance.montant, echeance.id, successUrl, errorUrl);
    await prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: wave.transactionId } });
    res.json({ checkoutUrl: wave.checkoutUrl, montant: echeance.montant });
  })
);
