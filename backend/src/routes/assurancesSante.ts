import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { initiateWavePayment, sendSMS, messageDemandeSanteValidee, messageDemandeSanteRefusee } from "../services/notify.js";
import { confirmerEcheance } from "../services/paiementWave.js";
import {
  COMPOSITION_SANTE,
  PRODUITS_SANTE,
  VALIDATION_SANTE,
  estProduitSante,
  lirePersonnesAssureesSante,
  tauxPriseEnChargeDuTarif,
} from "../services/assurancesSante.js";

/**
 * Demandes d'Assurances Santé (Solo, Duo, Famille) — le client ne paie pas à
 * la souscription : il dépose une demande, qu'un admin valide ou refuse ici.
 * La validation crée le lien de paiement Wave et l'envoie par SMS avec le
 * montant exact ; le contrat s'active au paiement (services/paiementWave.ts),
 * comme pour tout autre produit. Monté sous /api/assurances-sante, réservé aux
 * admins de la branche (voir index.ts).
 */
export const assurancesSanteRouter = Router();

const ETATS = ["a_valider", "a_payer", "refusees"] as const;
type Etat = (typeof ETATS)[number];

function filtreEtat(etat: Etat) {
  if (etat === "a_payer") return { validationStatut: VALIDATION_SANTE.VALIDEE, waveStatut: { not: "confirme" as const } };
  if (etat === "refusees") return { validationStatut: VALIDATION_SANTE.REFUSEE };
  return { validationStatut: VALIDATION_SANTE.EN_ATTENTE };
}

/** Demandes par état : à valider (défaut), validées en attente de paiement, refusées. Les demandes payées sont des contrats (page Contrats). */
assurancesSanteRouter.get(
  "/demandes",
  asyncHandler(async (req, res) => {
    const etat: Etat = (ETATS as readonly string[]).includes(String(req.query.etat)) ? (req.query.etat as Etat) : "a_valider";
    const [rows, compteurs] = await Promise.all([
      prisma.souscription.findMany({
        where: { produit: { code: { in: [...PRODUITS_SANTE] } }, ...filtreEtat(etat) },
        include: {
          produit: { select: { code: true, libelle: true } },
          partenaire: { select: { nomCommerce: true, nomResponsable: true } },
          agentDistribution: { select: { nom: true } },
        },
        orderBy: { createdAt: etat === "a_valider" ? "asc" : "desc" },
        take: 300,
      }),
      Promise.all(
        ETATS.map((e) => prisma.souscription.count({ where: { produit: { code: { in: [...PRODUITS_SANTE] } }, ...filtreEtat(e) } }))
      ),
    ]);
    res.json({
      compteurs: Object.fromEntries(ETATS.map((e, i) => [e, compteurs[i]])),
      demandes: rows.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        produitCode: s.produit.code,
        produitLibelle: s.produit.libelle,
        description: estProduitSante(s.produit.code) ? COMPOSITION_SANTE[s.produit.code].description : "",
        tauxPriseEnCharge: tauxPriseEnChargeDuTarif(s.donneesSpecifiques),
        montant: s.montantPrime,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        dateNaissance: s.dateNaissance,
        personnesAssurees: lirePersonnesAssureesSante(s.donneesSpecifiques),
        partenaire: s.partenaire.nomResponsable || s.partenaire.nomCommerce,
        agent: s.agentDistribution?.nom ?? null,
        validationStatut: s.validationStatut,
        validationAt: s.validationAt,
        validationMotif: s.validationMotif,
      })),
    });
  })
);

/** Demande Santé encore ouverte (ni payée, ni d'un autre produit) — sinon `null`. */
async function chargerDemande(id: string) {
  const s = await prisma.souscription.findUnique({
    where: { id },
    include: { produit: { select: { code: true, libelle: true, sousBranche: true } } },
  });
  if (!s || !estProduitSante(s.produit.code) || !s.validationStatut) return null;
  return s;
}

/**
 * Valide une demande : crée le lien de paiement Wave et l'envoie par SMS avec
 * le montant exact. Rejouable tant que le client n'a pas payé — un lien Wave
 * expire, « renvoyer le lien » en crée un neuf. Sans clé Wave (poste de
 * développement), le paiement est confirmé aussitôt, comme partout ailleurs
 * dans l'application en mode test.
 */
assurancesSanteRouter.post(
  "/demandes/:id/valider",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await chargerDemande(req.params.id);
    if (!s) return res.status(404).json({ error: "Demande introuvable." });
    if (s.waveStatut === "confirme") return res.status(400).json({ error: "Cette demande est déjà payée : le contrat est actif." });
    if (s.validationStatut === VALIDATION_SANTE.REFUSEE) {
      return res.status(400).json({ error: "Cette demande a été refusée. Le client doit en déposer une nouvelle." });
    }
    const renvoi = s.validationStatut === VALIDATION_SANTE.VALIDEE;

    const echeance = await prisma.paiement.findFirst({
      where: { souscriptionId: s.id, statut: { not: "paye" } },
      orderBy: { numeroEcheance: "asc" },
    });
    if (!echeance) return res.status(400).json({ error: "Aucun paiement à régler pour cette demande." });

    // Lien de retour après paiement : le QR d'origine, mémorisé à la demande —
    // à défaut, un QR du partenaire capable de servir ce produit (même
    // résolution que routes/public.ts::resoudreQrCodeGenerique).
    const qrToken =
      (s.donneesSpecifiques as { qrToken?: string } | null)?.qrToken ??
      (
        await prisma.qrCode.findFirst({
          where: {
            partenaireId: s.partenaireId,
            OR: [
              { produitId: s.produitId },
              ...(s.produit.sousBranche ? [{ produitId: null, sousBranche: s.produit.sousBranche }] : []),
              { produitId: null, sousBranche: null },
            ],
          },
          select: { token: true },
        })
      )?.token;
    if (!qrToken) return res.status(400).json({ error: "QR introuvable pour ce partenaire/produit." });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/${s.produit.code}/${qrToken}?paid=${echeance.id}`;
    const errorUrl = `${appUrl}/s/${s.produit.code}/${qrToken}?paiement=echec`;

    // Le lien Wave est créé AVANT de marquer la demande validée : si Wave
    // échoue, la demande reste à valider et l'admin voit l'erreur.
    const modeTest = !process.env.WAVE_API_KEY;
    const wave = modeTest ? null : await initiateWavePayment(echeance.montant, echeance.id, successUrl, errorUrl);
    const transactionId = wave?.transactionId ?? `STUB-${echeance.id.slice(0, 8)}`;

    await prisma.$transaction([
      prisma.paiement.update({ where: { id: echeance.id }, data: { waveTransactionId: transactionId } }),
      prisma.souscription.update({
        where: { id: s.id },
        data: {
          validationStatut: VALIDATION_SANTE.VALIDEE,
          validationAt: new Date(),
          validationParAdminId: req.user!.sub,
          validationMotif: null,
          relanceCount: renvoi ? { increment: 1 } : undefined,
        },
      }),
    ]);

    await sendSMS(
      s.telephone,
      messageDemandeSanteValidee(s.prenom ?? "", s.produit.libelle, echeance.montant, wave?.checkoutUrl ?? successUrl)
    );
    if (modeTest) await confirmerEcheance({ ...echeance, waveTransactionId: transactionId });

    await logAction({
      adminId: req.user!.sub,
      typeAction: renvoi ? "relance" : "modification",
      objetType: "demande_sante",
      objetId: s.id,
      valeurApres: { validationStatut: VALIDATION_SANTE.VALIDEE, montant: echeance.montant },
    });
    res.json({ ok: true, renvoi, montant: echeance.montant });
  })
);

const refusSchema = z.object({ motif: z.string().trim().max(300).optional() });

/** Refuse une demande (motif facultatif, interne) et en informe le client par SMS. */
assurancesSanteRouter.post(
  "/demandes/:id/refuser",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { motif } = refusSchema.parse(req.body ?? {});
    const s = await chargerDemande(req.params.id);
    if (!s) return res.status(404).json({ error: "Demande introuvable." });
    if (s.waveStatut === "confirme") return res.status(400).json({ error: "Cette demande est déjà payée : le contrat est actif." });
    if (s.validationStatut === VALIDATION_SANTE.REFUSEE) return res.json({ ok: true });

    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        validationStatut: VALIDATION_SANTE.REFUSEE,
        validationAt: new Date(),
        validationParAdminId: req.user!.sub,
        validationMotif: motif || null,
      },
    });
    await sendSMS(s.telephone, messageDemandeSanteRefusee(s.prenom ?? "", s.produit.libelle));
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "demande_sante",
      objetId: s.id,
      valeurApres: { validationStatut: VALIDATION_SANTE.REFUSEE, motif: motif || null },
    });
    res.json({ ok: true });
  })
);
