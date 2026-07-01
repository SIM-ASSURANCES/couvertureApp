import { prisma } from "../db.js";
import { getWaveSession, newNumeroPolice } from "./notify.js";
import type { SouscriptionAccident } from "@prisma/client";

/**
 * Confirme une souscription accident : génère la police, les dates et la commission.
 * Idempotent : si déjà confirmée, ne fait rien.
 */
export async function confirmerAccident(s: SouscriptionAccident): Promise<void> {
  if (s.waveStatut === "confirme") return;
  const numeroPolice = newNumeroPolice();
  const tarifAcc = await prisma.tarifAccident.findFirst({
    where: { prime: s.montantPrime },
  });
  const dateDebut = new Date();
  const dateFin = new Date(dateDebut);
  dateFin.setMonth(dateFin.getMonth() + 3);

  await prisma.souscriptionAccident.update({
    where: { id: s.id },
    data: {
      waveStatut: "confirme",
      numeroPolice,
      dateDebut,
      dateFin,
      statutDossier: "complet",
      whatsappEnvoyeAt: new Date(),
      commissionCalculee: tarifAcc?.commission ?? null,
    },
  });
}

/**
 * Interroge l'API Wave pour l'état réel du paiement et confirme la souscription
 * si le paiement a réussi. Filet de sécurité indépendant du webhook.
 * Renvoie le statut final de la souscription.
 */
export async function verifierPaiementAccident(
  s: SouscriptionAccident
): Promise<"confirme" | "echoue" | "en_attente"> {
  if (s.waveStatut === "confirme") return "confirme";

  if (s.waveTransactionId) {
    const session = await getWaveSession(s.waveTransactionId);
    if (session) {
      const paye =
        session.payment_status === "succeeded" ||
        session.checkout_status === "complete";
      const montantOk =
        session.amount == null || Number(session.amount) === s.montantPrime;
      if (paye && montantOk) {
        await confirmerAccident(s);
        return "confirme";
      }
      if (session.checkout_status === "expired") {
        return "echoue";
      }
    }
  }

  return s.waveStatut as "en_attente" | "echoue";
}
