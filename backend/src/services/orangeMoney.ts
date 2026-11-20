/**
 * Intégration Orange Money Web Payment (collection Postman « Web Payment (E-commerce) ») —
 * troisième moyen de paiement, à côté de Wave et de Peya pay.
 *
 * Même parcours que Wave (page de paiement hébergée), pas comme Peya pay :
 *  1. jeton OAuth2 « client_credentials » (POST /oauth/v3/token, en-tête Basic = clé consommateur
 *     du portail Orange Developer) — valable ~90 jours, mis en cache ;
 *  2. POST {API}/webpayment → pay_token, payment_url, notif_token ; le client est redirigé vers
 *     payment_url, saisit son numéro et un code OTP (obtenu par #144*82# en production, par le
 *     simulateur USSD en bac à sable) ;
 *  3. Orange notifie notif_url ({ status, notif_token, txnid }) quand la transaction se termine en
 *     SUCCESS ou FAILED ; POST {API}/transactionstatus sert de filet si la notification se perd.
 *
 * Ce fichier ne parle QU'À Orange : la confirmation des souscriptions est dans
 * services/paiementOrangeMoney.ts (sépare les dépendances, évite un import circulaire avec
 * paiementWave.ts).
 *
 * Variables d'environnement :
 *  - ORANGE_MONEY_CONSUMER_KEY : clé « Authorization » du portail (avec ou sans le préfixe "Basic ")
 *  - ORANGE_MONEY_MERCHANT_KEY : clé marchand (merchant_key) générée à l'ajout de l'API
 *  - ORANGE_MONEY_API_URL      : défaut = bac à sable ".../orange-money-webpay/dev/v1"
 *  - ORANGE_MONEY_CURRENCY     : défaut "OUV" en bac à sable, "XOF" sinon
 *  - ORANGE_MONEY_NOTIF_URL    : facultatif, force l'URL de notification (tests via webhook.site)
 *
 * Pas de mode stub : sans identifiants, Orange Money n'est simplement pas proposé. En production,
 * l'URL du bac à sable est refusée (même règle que Peya pay, audit sécurité 2026-10-05) : un paiement
 * « réussi » en bac à sable ne déplace aucun argent réel alors que la police serait émise.
 */

const OM_URL_BAC_A_SABLE = "https://api.orange.com/orange-money-webpay/dev/v1";
const OM_TOKEN_URL = process.env.ORANGE_MONEY_TOKEN_URL || "https://api.orange.com/oauth/v3/token";
const OM_BASE_URL = (process.env.ORANGE_MONEY_API_URL || OM_URL_BAC_A_SABLE).replace(/\/+$/, "");
const OM_CURRENCY = process.env.ORANGE_MONEY_CURRENCY || (estUrlBacASable(OM_BASE_URL) ? "OUV" : "XOF");
// Le jeton vit ~90 jours ; on le renouvelle bien avant, et dès qu'Orange répond 401.
const DUREE_MAX_CACHE_TOKEN_MS = 24 * 60 * 60 * 1000;
// Champs limités par Orange (voir la collection) : reference ≤ 30, URLs ≤ 120 caractères.
const REFERENCE_MARCHAND = "SIM Assurances";
export const LONGUEUR_MAX_URL_ORANGE = 120;

export const MESSAGE_ORANGE_MONEY_INDISPONIBLE =
  "Orange Money est momentanément indisponible. Merci de choisir un autre moyen de paiement.";

function estUrlBacASable(url: string): boolean {
  return /\/dev\//.test(`${url}/`);
}

function orangeMoneyConfigure(): boolean {
  return !!(process.env.ORANGE_MONEY_CONSUMER_KEY && process.env.ORANGE_MONEY_MERCHANT_KEY);
}

/** Orange Money est-il proposable ? Identifiants présents et, en production, URL hors bac à sable. */
export function orangeMoneyDisponible(): boolean {
  if (!orangeMoneyConfigure()) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return !!process.env.ORANGE_MONEY_API_URL && !estUrlBacASable(OM_BASE_URL);
}

// Signalé une fois au démarrage : Orange Money va disparaître du choix de paiement.
if (process.env.NODE_ENV === "production" && orangeMoneyConfigure() && !orangeMoneyDisponible()) {
  console.error(
    "[OrangeMoney] DÉSACTIVÉ : en production, ORANGE_MONEY_API_URL doit être définie et ne pas pointer vers le bac à sable (/dev/)."
  );
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function obtenirJeton(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const cle = (process.env.ORANGE_MONEY_CONSUMER_KEY ?? "").trim();
  const resp = await fetch(OM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: /^basic /i.test(cle) ? cle : `Basic ${cle}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await resp.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: string | number;
    error?: string;
    error_description?: string;
  } | null;
  if (!resp.ok || !data?.access_token) {
    throw new Error(`Orange Money authentification échouée : ${data?.error_description || data?.error || resp.status}`);
  }
  const dureeMs = Math.min(Number(data.expires_in) * 1000 || DUREE_MAX_CACHE_TOKEN_MS, DUREE_MAX_CACHE_TOKEN_MS);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + dureeMs - 60_000 };
  return tokenCache.token;
}

/** POST JSON authentifié ; un 401 (jeton révoqué/expiré) invalide le cache et réessaie une fois. */
async function orangeFetch<T>(chemin: string, corps: unknown, dejaReessaye = false): Promise<{ status: number; data: T | null; brut: string }> {
  const token = await obtenirJeton();
  const resp = await fetch(`${OM_BASE_URL}/${chemin}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(corps),
  });
  if (resp.status === 401 && !dejaReessaye) {
    tokenCache = null;
    return orangeFetch<T>(chemin, corps, true);
  }
  const brut = await resp.text().catch(() => "");
  let data: T | null = null;
  try {
    data = JSON.parse(brut) as T;
  } catch {
    // réponse non JSON : `brut` est journalisé par l'appelant
  }
  return { status: resp.status, data, brut };
}

export type SessionOrangeMoney = { payToken: string; paymentUrl: string; notifToken: string };

/** Crée la session de paiement Orange (étape 2). `orderId` ≤ 30 caractères, unique chez Orange. */
export async function initierPaiementOrangeMoney(params: {
  orderId: string;
  montant: number;
  returnUrl: string;
  cancelUrl: string;
  notifUrl: string;
}): Promise<SessionOrangeMoney> {
  for (const [nom, url] of [["return_url", params.returnUrl], ["cancel_url", params.cancelUrl], ["notif_url", params.notifUrl]]) {
    if (url.length > LONGUEUR_MAX_URL_ORANGE) throw new Error(`Orange Money : ${nom} dépasse ${LONGUEUR_MAX_URL_ORANGE} caractères`);
  }
  const { status, data, brut } = await orangeFetch<{
    status?: number;
    message?: string;
    pay_token?: string;
    payment_url?: string;
    notif_token?: string;
  }>("webpayment", {
    merchant_key: process.env.ORANGE_MONEY_MERCHANT_KEY,
    currency: OM_CURRENCY,
    order_id: params.orderId,
    amount: params.montant,
    return_url: params.returnUrl,
    cancel_url: params.cancelUrl,
    notif_url: params.notifUrl,
    lang: "fr",
    reference: REFERENCE_MARCHAND,
  });
  if (status !== 201 || !data?.pay_token || !data.payment_url || !data.notif_token) {
    console.error(`[OrangeMoney] webpayment HTTP ${status} order_id=${params.orderId} : ${brut.slice(0, 1000)}`);
    throw new Error(`Orange Money a refusé la demande de paiement : ${data?.message || `HTTP ${status}`}`);
  }
  return { payToken: data.pay_token, paymentUrl: data.payment_url, notifToken: data.notif_token };
}

/**
 * Statut d'une transaction (filet de sécurité de la notification). `null` si Orange ne répond pas
 * exploitablement — l'appelant laisse alors le paiement en attente, sans rien conclure.
 */
export async function statutTransactionOrangeMoney(params: {
  orderId: string;
  montant: number;
  payToken: string;
}): Promise<{ status: string; txnid?: string } | null> {
  try {
    const { status, data, brut } = await orangeFetch<{ status?: string; txnid?: string }>("transactionstatus", {
      order_id: params.orderId,
      amount: params.montant,
      pay_token: params.payToken,
    });
    if ((status !== 200 && status !== 201) || !data?.status) {
      console.error(`[OrangeMoney] transactionstatus HTTP ${status} order_id=${params.orderId} : ${brut.slice(0, 500)}`);
      return null;
    }
    return { status: data.status, txnid: data.txnid };
  } catch (e) {
    console.error("[OrangeMoney] transactionstatus", e);
    return null;
  }
}

export type IssueOrangeMoney = "paye" | "echoue" | "en_attente";

/**
 * Traduit un statut Orange (INITIATED, PENDING, EXPIRED, SUCCESS, FAILED — voir la collection) en
 * issue SIM. Seule "paye" déclenche l'activation du contrat.
 */
export function interpreterStatutOrangeMoney(status: string | undefined | null): IssueOrangeMoney {
  const s = (status ?? "").trim().toUpperCase();
  if (s === "SUCCESS") return "paye";
  // EXPIRED : validé trop tard, Orange n'a rien débité — échec définitif, le client recommence.
  // ERREUR : statut interne SIM, la session Orange n'a jamais pu être créée.
  if (s === "FAILED" || s === "EXPIRED" || s === "ERREUR") return "echoue";
  // INITIATED, PENDING et tout statut inconnu : en attente. Ne jamais confirmer par défaut — une
  // police émise sans encaissement coûte bien plus qu'un paiement laissé en attente.
  return "en_attente";
}
