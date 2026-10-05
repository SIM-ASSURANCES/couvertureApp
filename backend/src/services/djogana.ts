/**
 * Intégration Djogana Pay (marque "Peya Pay", plateforme djogana-pay.com) —
 * second moyen de paiement, alternatif à Wave (voir services/paiementWave.ts).
 *
 * Flux très différent de Wave : pas de page de paiement hébergée. Le client
 * doit déjà posséder un compte Peya Pay/Djogana (recherché par téléphone),
 * reçoit un code OTP par SMS, et son compte est débité directement dès la
 * validation du code — aucun webhook, la confirmation est synchrone (voir
 * routes /public/paiement-djogana/*).
 *
 * Sans DJOGANA_USERNAME/DJOGANA_PASSWORD, toutes les fonctions tournent en
 * mode stub HORS PRODUCTION uniquement : compte toujours trouvé, OTP fixe
 * "0000", paiement toujours accepté — pour pouvoir développer/tester le
 * parcours frontend sans identifiants. En production (NODE_ENV=production),
 * l'absence d'identifiants rend au contraire Peya pay INDISPONIBLE (voir
 * modeStub/djoganaDisponible) : sinon une variable d'environnement perdue lors
 * d'un redéploiement ouvrirait des polices gratuites à quiconque connaît le
 * code public "0000" (audit sécurité 2026-10-05). Wave, lui, reste disponible
 * — Peya pay est un moyen de paiement optionnel, pas le seul.
 */

// Bac à sable Djogana : valeur par défaut PRATIQUE en développement, mais jamais
// acceptable en production — un paiement "réussi" sur le bac à sable ne déplace
// aucun argent réel alors que la police serait émise (audit sécurité
// 2026-10-05). En production, DJOGANA_API_URL doit donc être déclarée
// explicitement et différer de cet hôte (voir urlApiAcceptable).
const DJOGANA_URL_BAC_A_SABLE = "https://test1-pey-peya.djogana-pay.com";
const DJOGANA_BASE_URL = process.env.DJOGANA_API_URL || DJOGANA_URL_BAC_A_SABLE;
const CODE_BANQUE = process.env.DJOGANA_CODE_BANQUE || "DPAY";
const CODE_AGENCE = process.env.DJOGANA_CODE_AGENCE || "11111";
// Durée de mise en cache du jeton JWT avant ré-authentification — la doc ne
// précise pas sa durée de validité réelle, 20 min reste prudent.
const DUREE_CACHE_TOKEN_MS = 20 * 60 * 1000;

function djoganaConfigure(): boolean {
  return !!(process.env.DJOGANA_USERNAME && process.env.DJOGANA_PASSWORD);
}

export const MESSAGE_DJOGANA_INDISPONIBLE = "Peya pay est momentanément indisponible. Merci de payer avec Wave.";

/** Erreur "service non utilisable" — distincte d'une panne de l'API Djogana (voir modeStub). */
export class DjoganaIndisponibleError extends Error {
  constructor() {
    super(MESSAGE_DJOGANA_INDISPONIBLE);
  }
}

/**
 * Peya pay est-il réellement utilisable ? Vrai avec des identifiants
 * configurés, ou hors production (mode stub de développement). Faux en
 * production sans identifiants : le moyen de paiement est alors refusé côté
 * serveur et masqué côté client (GET /public/moyens-paiement).
 */
export function djoganaDisponible(): boolean {
  if (djoganaConfigure()) return urlApiAcceptable();
  return process.env.NODE_ENV !== "production";
}

/**
 * En production, l'URL de l'API doit être déclarée explicitement ET différer du
 * bac à sable. Hors production, tout est accepté (défaut = bac à sable).
 */
function urlApiAcceptable(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const url = process.env.DJOGANA_API_URL;
  if (!url) return false;
  try {
    return new URL(url).hostname !== new URL(DJOGANA_URL_BAC_A_SABLE).hostname;
  } catch {
    return false;
  }
}

// Signalé UNE fois au démarrage (pas à chaque requête) : Peya pay va disparaître
// du choix de paiement et l'exploitant doit en connaître la cause.
if (process.env.NODE_ENV === "production" && djoganaConfigure() && !urlApiAcceptable()) {
  console.error(
    "[Djogana] Peya pay DÉSACTIVÉ : en production, DJOGANA_API_URL doit être définie et ne pas pointer vers le bac à sable " +
      `(${new URL(DJOGANA_URL_BAC_A_SABLE).hostname}). Les identifiants sont présents mais l'URL ne convient pas.`
  );
}

/**
 * Point de décision UNIQUE du mode stub : `true` = stub de développement
 * (jamais en production), `false` = vraie API. Lève DjoganaIndisponibleError
 * en production (identifiants ou URL manquants/inadaptés) au lieu de
 * "réussir" silencieusement.
 */
function modeStub(): boolean {
  if (djoganaConfigure()) {
    if (!urlApiAcceptable()) throw new DjoganaIndisponibleError();
    return false;
  }
  if (!djoganaDisponible()) throw new DjoganaIndisponibleError();
  return true;
}

type DjoganaStatus = { code?: string; message?: string };
type DjoganaEnveloppe<T> = { hasError?: boolean; status?: DjoganaStatus } & T;

type SessionDjogana = { token: string; compteCredit: string; login: string };
let tokenCache: (SessionDjogana & { expiresAt: number }) | null = null;

async function authentifierDjogana(): Promise<SessionDjogana> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;

  const resp = await fetch(`${DJOGANA_BASE_URL}/authclient/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: process.env.DJOGANA_USERNAME,
      password: process.env.DJOGANA_PASSWORD,
    }),
  });
  const data = (await resp.json().catch(() => null)) as DjoganaEnveloppe<{
    item?: {
      token?: string;
      userId?: string;
      username?: string;
      telephone?: string;
      codeAgence?: string;
      codeCaisse?: string;
    };
  }> | null;
  if (!resp.ok || data?.hasError || !data?.item?.token) {
    const detail = data?.status?.message || `${resp.status}`;
    throw new Error(`Djogana authentification échouée: ${detail}`);
  }

  const { userId, username, telephone, codeAgence, codeCaisse } = data.item;
  console.log(
    `[Djogana] authentifié : userId=${userId} username=${username} telephone=${telephone} codeAgence=${codeAgence} codeCaisse=${codeCaisse}`
  );
  const compteCredit = process.env.DJOGANA_COMPTE_CREDIT || userId || telephone || "";
  // `login` du paiement : identifiant lisible de l'utilisateur marchand (comme
  // le `login` numéro de téléphone des autres appels), PAS le username chiffré
  // envoyé à l'authentification — que la base Djogana refuse (code 1005).
  const login = process.env.DJOGANA_LOGIN || userId || telephone || "";
  tokenCache = { token: data.item.token, compteCredit, login, expiresAt: Date.now() + DUREE_CACHE_TOKEN_MS };
  return tokenCache;
}

async function djoganaFetch<T>(path: string, body: unknown): Promise<T> {
  const { token } = await authentifierDjogana();
  const resp = await fetch(`${DJOGANA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const brut = await resp.text().catch(() => "");
  let data: DjoganaEnveloppe<T> | null = null;
  try {
    data = JSON.parse(brut) as DjoganaEnveloppe<T>;
  } catch {
    // réponse non JSON : `brut` est journalisé ci-dessous
  }
  if (!resp.ok || data?.hasError) {
    // Les messages d'erreur Djogana sont parfois tronqués ("...a refuse la
    // requete:") : requête et réponse complètes en logs pour le support.
    console.error(
      `[Djogana] ${path} HTTP ${resp.status}\n  requête : ${JSON.stringify(body)}\n  réponse : ${brut.slice(0, 2000)}`
    );
    const message = data?.status?.message?.trim();
    const code = data?.status?.code;
    throw new Error(
      message ? `${message}${code ? ` (code ${code})` : ""}` : `Djogana ${path} HTTP ${resp.status}`
    );
  }
  return data as T;
}

/**
 * Numéro au format attendu par Djogana : national, SANS indicatif pays. Les
 * numéros sont saisis et stockés avec "+225" côté SIM (PHONE_PREFIX du
 * formulaire de souscription), mais l'API Djogana ne retrouve le compte du
 * client que sur le numéro local — d'où la normalisation ici, au seul point
 * de contact avec leur API.
 *
 * Le numéro stocké en base n'est JAMAIS modifié : les SMS de confirmation et
 * d'accès à l'espace client, envoyés une fois le paiement confirmé, gardent le
 * "+225..." d'origine. Tout le parcours Djogana (écran OTP, routes
 * /paiement-djogana/*) travaille, lui, sur le numéro local.
 */
export function numeroLocal(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  return chiffres.startsWith("225") ? chiffres.slice(3) : chiffres;
}

// Compte introuvable : `gsm` (numéro réellement envoyé) et `reponse` (message
// brut de l'API) sont conservés pour le diagnostic avec le support Djogana.
type PayeurDjogana = { compte: string } | { compte: null; gsm: string; reponse: string };

/** API#2 — recherche du compte Djogana/Peya Pay associé à ce téléphone. */
export async function rechercherPayeurDjogana(telephone: string): Promise<PayeurDjogana> {
  const gsm = numeroLocal(telephone);
  if (modeStub()) return { compte: gsm };

  let data: {
    items?: Array<{
      codeClient?: string;
      datasCompte?: Array<{ numerocomptecomplet?: string }>;
    }>;
  };
  try {
    data = await djoganaFetch("/wClients/recherchePayeur", {
      data: { gsmPrincipale: gsm, codePaysResidence: "CI" },
    });
  } catch (e) {
    // L'API répond hasError:true avec un message du type "Donnee inexistante:
    // Le N° telephone est inconnu" quand ce numéro n'a simplement pas de
    // compte Djogana — un cas normal (le client doit alors en créer un),
    // pas une panne. Seul un échec d'AUTHENTIFICATION (jeton, identifiants)
    // est une vraie erreur d'intégration à remonter.
    if (e instanceof Error && e.message.startsWith("Djogana authentification échouée")) throw e;
    return { compte: null, gsm, reponse: e instanceof Error ? e.message : String(e) };
  }
  const item = data.items?.[0];
  const compte = item?.datasCompte?.[0]?.numerocomptecomplet || item?.codeClient;
  return compte ? { compte } : { compte: null, gsm, reponse: "réponse sans compte associé" };
}

/** API#3/#5 — envoi du code OTP par SMS au numéro donné. */
export async function envoyerOtpDjogana(telephone: string): Promise<void> {
  if (modeStub()) return; // mode stub (hors production) : voir validerOtpDjogana
  const gsm = numeroLocal(telephone);
  await djoganaFetch("/wClients/code-partenaire", {
    data: {
      gsmPrincipale: gsm,
      // Champs pensés pour un client mobile natif (modèle/IMEI) — sans objet
      // ici puisque l'appel vient du backend web, valeurs génériques stables.
      modele: "web",
      imei: `web-${gsm}`,
      plateform: "web",
    },
  });
}

/**
 * API#4 — validation du code OTP saisi par le client. En cas de refus,
 * renvoie le message réel de Djogana (code erroné, expiré, numéro refusé…)
 * plutôt qu'un "code incorrect" générique qui masquait la vraie cause.
 */
export async function validerOtpDjogana(
  telephone: string,
  code: string
): Promise<{ valide: true } | { valide: false; message: string }> {
  // Ne lève jamais : ce type de retour est consommé tel quel par la route
  // /paiement-djogana/confirmer, qui n'a pas de try/catch autour.
  let stub: boolean;
  try {
    stub = modeStub();
  } catch (e) {
    return { valide: false, message: e instanceof Error ? e.message : MESSAGE_DJOGANA_INDISPONIBLE };
  }
  if (stub) {
    return code === "0000" ? { valide: true } : { valide: false, message: "Code incorrect ou expiré" };
  }
  try {
    await djoganaFetch("/wClients/verifcode-partenaire", {
      data: { codeValid: code, login: numeroLocal(telephone) },
    });
    return { valide: true };
  } catch (e) {
    return { valide: false, message: e instanceof Error ? e.message : "Code incorrect ou expiré" };
  }
}

/**
 * API#6 — débite directement le compte Djogana du client (déjà validé par
 * OTP) du montant donné, au profit du compte marchand. Sans identifiants
 * configurés, simule un paiement réussi (mode stub) HORS PRODUCTION
 * seulement ; en production, refuse (jamais de police "payée" sans débit).
 */
export async function creerPaiementDjogana(
  telephone: string,
  montant: number,
  reference: string
): Promise<{ reussi: boolean; transactionId?: string; message?: string }> {
  let stub: boolean;
  try {
    stub = modeStub();
  } catch (e) {
    return { reussi: false, message: e instanceof Error ? e.message : MESSAGE_DJOGANA_INDISPONIBLE };
  }
  if (stub) {
    return { reussi: true, transactionId: `DJOGANA-STUB-${reference.slice(0, 8)}` };
  }

  try {
    const payeur = await rechercherPayeurDjogana(telephone);
    if (payeur.compte === null) {
      return {
        reussi: false,
        message: `Compte Peya pay introuvable pour le ${payeur.gsm} (réponse Peya pay : ${payeur.reponse})`,
      };
    }

    const { compteCredit, login } = await authentifierDjogana();
    const data = await djoganaFetch<{ item?: { id?: string; reference?: string } }>(
      "/paiement-partenaire/create",
      {
        data: {
          compteDebit: payeur.compte,
          compteCredit,
          montant: String(montant),
          login,
          codeBanque: CODE_BANQUE,
          codeAgence: CODE_AGENCE,
          infos: [
            {
              nom: "montant",
              label: "Montant",
              type: "Number",
              ordre: 1,
              obligatoire: true,
              montantMin: null,
              valeur: String(montant),
              typeselection: null,
            },
          ],
        },
      }
    );
    const transactionId = data.item?.id || data.item?.reference || `DJOGANA-${Date.now()}`;
    return { reussi: true, transactionId };
  } catch (e) {
    return { reussi: false, message: e instanceof Error ? e.message : "Erreur Djogana" };
  }
}
