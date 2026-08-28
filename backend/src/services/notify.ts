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

const DELAI_GRACE_RENOUVELLEMENT_MS = 2 * 24 * 60 * 60 * 1000;

// Délai d'attente entre la souscription et la prise d'effet du contrat,
// pour les produits Assurances Accidents — RelaxMoto, RelaxAuto,
// RelaxAccidents Frais Médicaux/générale et Accident historique. RelaxVoyage
// (trajet ponctuel, couverture nécessairement immédiate) et les produits
// Dommages (Incendie, SecurHome+, SecurPro) n'ont pas ce délai.
const DELAI_ATTENTE_PRISE_EFFET_MS = 72 * 60 * 60 * 1000;
const PRODUITS_ACCIDENTS_AVEC_DELAI_ATTENTE = new Set([
  "relaxmoto",
  "relaxauto",
  "relaxaccidents_fraismedicaux",
  "relaxaccidents",
  "accident",
]);

/**
 * Date de prise d'effet d'un contrat Accidents à sa PREMIÈRE activation
 * (jamais au renouvellement, qui prolonge une couverture déjà en cours sans
 * nouvelle attente) — décalée de 72h après la confirmation du paiement pour
 * les produits concernés (voir PRODUITS_ACCIDENTS_AVEC_DELAI_ATTENTE),
 * immédiate sinon. Centralise la règle pour rester cohérente entre le
 * modèle générique (paiementWave.ts) et Accident historique (accident.ts).
 */
export function dateDebutPremiereActivation(produitCode: string): Date {
  if (!PRODUITS_ACCIDENTS_AVEC_DELAI_ATTENTE.has(produitCode)) return new Date();
  return new Date(Date.now() + DELAI_ATTENTE_PRISE_EFFET_MS);
}

/**
 * Numéro de police à appliquer lors d'une confirmation (première activation
 * OU renouvellement) : reconduit l'ancien numéro si le renouvellement est
 * confirmé au plus 2 jours après l'ancienne échéance (grâce), sinon (ou à la
 * première activation, où `ancienNumeroPolice`/`ancienneDateFin` sont null)
 * génère un numéro neuf. Centralise la règle pour rester cohérente entre le
 * modèle générique (paiementWave.ts) et Accident historique (accident.ts).
 */
export function numeroPoliceRenouvellement(
  ancienNumeroPolice: string | null,
  ancienneDateFin: Date | null
): string {
  const horsDelai = ancienneDateFin
    ? Date.now() - ancienneDateFin.getTime() > DELAI_GRACE_RENOUVELLEMENT_MS
    : false;
  if (!horsDelai && ancienNumeroPolice) return ancienNumeroPolice;
  return newNumeroPolice();
}

/**
 * Numéro de police synthétique Incendie (ce modèle n'a pas de champ
 * `numeroPolice` stocké — la prime étant payée à l'achat, sans paiement Wave
 * à confirmer). Recalculé à la volée partout où il est affiché/envoyé —
 * gardé identique aux 3 endroits qui en ont besoin (aperçu public, carte
 * PNG, SMS d'activation de l'espace client).
 */
export function numeroPoliceIncendieSynthetique(id: string, dateDebut: Date): string {
  return `POL-INC-${dateDebut.getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

/**
 * Mot de passe client (RelaxMoto/RelaxAuto) — généré à l'activation du
 * contrat, envoyé en clair par SMS une seule fois puis jamais reconstitué
 * (seul le hash est stocké). Alphabet sans caractères ambigus (0/O, 1/I/l)
 * pour rester lisible dans un SMS.
 */
export function genererMotDePasseClient(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const octets = randomBytes(8);
  let mdp = "";
  for (let i = 0; i < 8; i++) mdp += alphabet[octets[i] % alphabet.length];
  return mdp;
}

export function lienClientRelax() {
  return `${BASE}/client/connexion`;
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

/** Relance admin du renouvellement Incendie — pas de paiement Wave, juste une nouvelle réf.facture à fournir. */
export function messageRelanceRenouvellementIncendie(lien: string) {
  return `SIM Assurances : votre assurance incendie arrive à échéance. Renouvelez en indiquant votre nouvelle réf.facture : ${lien}`;
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

/** Relance admin d'un paiement Wave en attente, avec le montant exact de la prime. */
export function messageRelancePaiement(montant: number, lienPaiement: string) {
  return `SIM Assurances : payez ${montant} FCFA : ${lienPaiement}`;
}

/** Relance admin du renouvellement d'un contrat Accident proche de son échéance. */
export function messageRelanceRenouvellement(prenom: string, montant: number, lienPaiement: string) {
  return `SIM Assurances : ${prenom}, votre assurance accident arrive à échéance. Renouvelez (${montant} FCFA) : ${lienPaiement}`;
}

/**
 * Activation RelaxMoto/RelaxAuto : contrat confirmé + accès à l'espace client
 * (identifiant = numéro de téléphone) envoyés en un seul SMS.
 */
export function messageClientRelax(
  numeroPolice: string,
  motDePasse: string,
  lien: string
) {
  return `SIM Assurances : contrat activé, N° ${numeroPolice}. Accès espace client : mot de passe ${motDePasse} sur ${lien}`;
}

/**
 * Réinitialisation du mot de passe client par un admin (à la demande du
 * client, ou pour tout autre motif) — texte dédié, distinct de
 * `messageClientRelax` dont le "contrat activé" serait trompeur ici.
 */
export function messageReinitialisationMotDePasse(numeroPolice: string, motDePasse: string, lien: string) {
  return `SIM Assurances : nouveau mot de passe pour votre contrat N° ${numeroPolice} : ${motDePasse}. Connexion : ${lien}`;
}

/**
 * Rappel automatique d'échéance (relances programmées J-5 et jour J — voir
 * services/relances.ts), quel que soit le produit — pointe toujours vers
 * l'espace client (jamais un lien de paiement direct), le renouvellement se
 * faisant depuis là.
 */
export function messageRappelEcheance(prenom: string, joursRestants: number, lien: string) {
  return joursRestants <= 0
    ? `SIM Assurances : ${prenom}, votre contrat arrive à échéance aujourd'hui. Renouvelez depuis votre espace : ${lien}`
    : `SIM Assurances : ${prenom}, votre contrat arrive à échéance dans ${joursRestants} jours. Renouvelez depuis votre espace : ${lien}`;
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
