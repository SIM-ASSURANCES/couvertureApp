import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { getWaveSession, newNumeroPolice, genererMotDePasseClient, lienClientRelax, messageClientRelax, sendSMS } from "./notify.js";
import { genererCarte } from "./novelia.js";
import type { Paiement } from "@prisma/client";

/**
 * Confirme le paiement d'une échéance. Deux cas selon le produit (distingués
 * par `cycleFacturation`, renseigné uniquement pour un abonnement) :
 * - Abonnement (RelaxMoto/RelaxAuto) : 1ère échéance → police, couverture 1 an,
 *   espace client (identifiant/mot de passe envoyés par SMS) ; renouvellement
 *   (déclenché par le CLIENT, espace client) → prolonge dateFin d'un an.
 * - Formule à paiement unique (RelaxAccidents Frais Médicaux/générale,
 *   RelaxVoyage, SecurHome+, SecurPro Dommages) : pas d'abonnement ni d'espace
 *   client, couverture 3 mois (comme l'ancien produit Accident) ; renouvellement
 *   (déclenché par l'ADMIN, relance SMS) → prolonge dateFin de 3 mois sur la
 *   MÊME souscription (police conservée) — voir POST
 *   /assurances-branche/souscriptions/:id/relance-renouvellement.
 * Idempotent dans tous les cas.
 */
export async function confirmerEcheance(p: Paiement): Promise<void> {
  if (p.statut === "paye") return;

  await prisma.paiement.update({
    where: { id: p.id },
    data: { statut: "paye", datePaiement: new Date() },
  });

  if (p.estRenouvellement) {
    const s = await prisma.souscription.findUnique({ where: { id: p.souscriptionId } });
    if (!s) return;
    const base = s.dateFin && s.dateFin > new Date() ? s.dateFin : new Date();
    const dateFin = new Date(base);
    if (s.cycleFacturation) {
      dateFin.setFullYear(dateFin.getFullYear() + 1);
    } else {
      dateFin.setMonth(dateFin.getMonth() + 3);
    }
    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        dateFin,
        statutAbonnement: s.cycleFacturation ? "actif" : s.statutAbonnement,
        renouvellementEnCoursDepuis: null,
        renouveleAt: new Date(),
        nombrePaiements: { increment: 1 },
      },
    });
    return;
  }

  if (p.numeroEcheance === 1) {
    const s = await prisma.souscription.findUnique({ where: { id: p.souscriptionId } });
    if (!s || s.statutAbonnement || s.waveStatut === "confirme") return; // déjà activé (idempotence)

    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: s.produitId, prime: s.montantPrime },
    });
    const dateDebut = new Date();

    if (!s.cycleFacturation) {
      const dateFin = new Date(dateDebut);
      dateFin.setMonth(dateFin.getMonth() + 3);
      await prisma.souscription.update({
        where: { id: s.id },
        data: {
          waveStatut: "confirme",
          numeroPolice: newNumeroPolice(),
          dateDebut,
          dateFin,
          statut: "complet",
          commissionCalculee: tarif?.commission ?? null,
        },
      });
      await genererCarte(s.id);
      return;
    }

    const dateFin = new Date(dateDebut);
    dateFin.setFullYear(dateFin.getFullYear() + 1);

    // Crée l'accès de l'espace client (identifiant = téléphone) à l'activation.
    const motDePasse = genererMotDePasseClient();
    const numeroPolice = newNumeroPolice();

    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        waveStatut: "confirme",
        statutAbonnement: "actif",
        numeroPolice,
        dateDebut,
        dateFin,
        statut: "complet",
        whatsappEnvoyeAt: new Date(),
        commissionCalculee: tarif?.commission ?? null,
        clientPasswordHash: await bcrypt.hash(motDePasse, 10),
      },
    });

    await genererCarte(s.id);

    await sendSMS(s.telephone, messageClientRelax(numeroPolice, motDePasse, lienClientRelax()));
  }
}

/**
 * Interroge l'API Wave pour l'état réel du paiement d'une échéance et confirme
 * si réussi. Filet de sécurité indépendant du webhook.
 */
export async function verifierPaiementEcheance(
  p: Paiement
): Promise<"paye" | "echoue" | "en_attente"> {
  if (p.statut === "paye") return "paye";

  if (p.waveTransactionId) {
    const session = await getWaveSession(p.waveTransactionId);
    if (session) {
      const paye =
        session.payment_status === "succeeded" ||
        session.checkout_status === "complete";
      const montantOk =
        session.amount == null || Number(session.amount) === p.montant;
      if (paye && montantOk) {
        await confirmerEcheance(p);
        return "paye";
      }
      if (session.checkout_status === "expired") {
        return "echoue";
      }
    }
  }

  return (p.statut as "en_attente" | "echoue") ?? "en_attente";
}
