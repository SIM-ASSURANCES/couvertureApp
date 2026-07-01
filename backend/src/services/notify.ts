import { randomUUID, randomBytes } from "crypto";

const BASE = process.env.APP_PUBLIC_URL || "http://localhost:5173";

export function newNumeroPolice() {
  const year = new Date().getFullYear();
  // Suffixe aléatoire cryptographique (10 caractères hex) : ~1 000 milliards de
  // valeurs possibles → collisions improbables et numéro non prédictible.
  const suffix = randomBytes(5).toString("hex").toUpperCase();
  return `POL-ACC-${year}-${suffix}`;
}

export function newFormulaireToken() {
  return randomUUID();
}

export function lienFormulaire(produit: string, token: string) {
  return `${BASE}/s/${produit}/complement/${token}`;
}

/**
 * Envoi de SMS via l'API Sayele Send.
 * Format officiel (doc api.sayelesend.com) :
 *   POST https://api.sayelesend.com/api/v1/sms/send
 *   Authorization: Bearer sk_live_...
 *   Content-Type: application/json
 *   { "to": "+225...", "message": "...", "channel": "sms" }
 *
 * Variables d'environnement :
 *  - SMS_API_KEY  : clé API Sayele (ex. sk_live_...) — OBLIGATOIRE
 *  - SMS_API_URL  : URL d'envoi (optionnel, défaut = endpoint officiel)
 *  - SMS_SENDER   : Sender ID affiché (optionnel, ajoute senderId si défini)
 *
 * Sans SMS_API_KEY, le message est journalisé en console (mode stub).
 */
export async function sendSMS(to: string, message: string) {
  const apiUrl =
    process.env.SMS_API_URL || "https://api.sayelesend.com/api/v1/sms/send";
  const apiKey = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER;

  if (!apiKey) {
    console.log(`[SMS STUB -> ${to}] ${message}`);
    return { ok: true };
  }

  // Format international avec « + » (ex. +2250705920996)
  const recipient = `+${to.replace(/\D/g, "")}`;

  const payload: Record<string, string> = {
    to: recipient,
    message,
    channel: "sms",
  };
  if (senderId) payload.senderId = senderId;

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = (await resp.text().catch(() => "")).trim();
    if (resp.ok) {
      console.log(`[SMS OK -> ${recipient}] ${text.slice(0, 200)}`);
    } else {
      console.error(
        `[SMS ECHEC ${resp.status} -> ${recipient}] ${text.slice(0, 300)}`
      );
    }
    return { ok: resp.ok };
  } catch (e) {
    console.error("[SMS] erreur réseau", e);
    return { ok: false };
  }
}

// Messages courts (≤ 160 caractères) pour tenir dans un seul SMS.
// Le lien occupant ~90-100 caractères, le texte est réduit à l'essentiel.

export function messageIncendie(_prenom: string | null, lien: string) {
  return `SIM Assurances : finalisez votre souscription incendie : ${lien}`;
}

export function messageAccidentEchec(
  _prenom: string,
  _montant: number,
  lienRetry: string
) {
  return `SIM Assurances : paiement échoué. Réessayez : ${lienRetry}`;
}

export function messageAccident(
  prenom: string,
  _montant: number,
  numeroPolice: string,
  _lien: string
) {
  return `SIM Assurances : ${prenom}, assurance accident activée. N° police : ${numeroPolice}`;
}

/**
 * Initiation d'un paiement Wave CI.
 * Nécessite WAVE_API_KEY ; l'appelant gère le mode stub si la clé est absente.
 */
export async function initiateWavePayment(
  amount: number,
  reference: string,
  successUrl: string,
  errorUrl: string
): Promise<{ transactionId: string; checkoutUrl: string; reference: string }> {
  const resp = await fetch("https://api.wave.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WAVE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(amount),
      currency: "XOF",
      client_reference: reference,
      success_url: successUrl,
      error_url: errorUrl,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Wave API ${resp.status}: ${detail}`);
  }

  const data = (await resp.json()) as {
    id: string;
    wave_launch_url: string;
    client_reference: string;
  };

  return {
    transactionId: data.id,
    checkoutUrl: data.wave_launch_url,
    reference,
  };
}

/**
 * Récupère l'état d'une session de paiement Wave.
 * Utilisé au retour du client pour confirmer le paiement sans dépendre du webhook.
 * Renvoie null si la clé API est absente ou en cas d'erreur réseau.
 */
export async function getWaveSession(sessionId: string): Promise<{
  payment_status?: string;
  checkout_status?: string;
  amount?: string;
  client_reference?: string;
} | null> {
  if (!process.env.WAVE_API_KEY) return null;
  try {
    const resp = await fetch(
      `https://api.wave.com/v1/checkout/sessions/${sessionId}`,
      { headers: { Authorization: `Bearer ${process.env.WAVE_API_KEY}` } }
    );
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error(`[Wave session ${resp.status}] ${detail}`);
      return null;
    }
    return (await resp.json()) as {
      payment_status?: string;
      checkout_status?: string;
      amount?: string;
      client_reference?: string;
    };
  } catch (e) {
    console.error("[Wave session] erreur réseau", e);
    return null;
  }
}
