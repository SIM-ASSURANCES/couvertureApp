import { randomUUID } from "crypto";

const BASE = process.env.APP_PUBLIC_URL || "http://localhost:5173";

export function newNumeroPolice() {
  const year = new Date().getFullYear();
  return `POL-ACC-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function newFormulaireToken() {
  return randomUUID();
}

export function lienFormulaire(produit: string, token: string) {
  return `${BASE}/s/${produit}/complement/${token}`;
}

/**
 * Stub d'envoi WhatsApp. En production : appel à l'API WhatsApp Business.
 * Ici on journalise simplement le message qui serait envoyé.
 */
export async function sendWhatsApp(to: string, message: string) {
  console.log(`[WhatsApp -> ${to}] ${message}`);
  return { ok: true, sentAt: new Date() };
}

export function messageIncendie(prenom: string | null, lien: string) {
  return `Bonjour ${prenom ?? ""} ! Merci d'avoir souscrit à l'Assurance Incendie SIM Assurances. Pour finaliser, complétez votre formulaire : ${lien}. Vous aurez besoin de votre numéro de facture.`;
}

export function messageAccident(
  prenom: string,
  montant: number,
  numeroPolice: string,
  lien: string
) {
  return `Bonjour ${prenom} ! Votre paiement Wave de ${montant} FCFA a bien été reçu. Votre Assurance Accident est activée. Numéro de police : ${numeroPolice}. Complétez votre dossier ici : ${lien}.`;
}

/**
 * Stub d'initiation de paiement Wave. En production : API Wave CI.
 */
export async function initiateWavePayment(amount: number, reference: string) {
  return {
    transactionId: `WAVE-${randomUUID().slice(0, 12)}`,
    checkoutUrl: `${BASE}/wave/checkout?ref=${reference}&amount=${amount}`,
    reference,
  };
}
