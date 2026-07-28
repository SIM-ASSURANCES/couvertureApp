import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { getWaveSession, newNumeroPolice, genererMotDePasseClient, lienClientRelax, messageClientRelax, sendSMS } from "./notify.js";
import { genererCarte } from "./novelia.js";
import type { Paiement } from "@prisma/client";

/**
 * Confirme le paiement d'une échéance d'abonnement (RelaxMoto/RelaxAuto).
 * Si c'est la 1ère échéance, active l'abonnement : police, dates de couverture
 * (1 an), commission de référence. Un paiement de renouvellement (depuis
 * l'espace client) prolonge simplement dateFin d'un an. Idempotent.
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
    dateFin.setFullYear(dateFin.getFullYear() + 1);
    await prisma.souscription.update({
      where: { id: s.id },
      data: { dateFin, statutAbonnement: "actif" },
    });
    return;
  }

  if (p.numeroEcheance === 1) {
    const s = await prisma.souscription.findUnique({ where: { id: p.souscriptionId } });
    if (!s || s.statutAbonnement) return; // déjà activé (idempotence)

    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: s.produitId, prime: s.montantPrime },
    });
    const dateDebut = new Date();
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
