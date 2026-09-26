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
 * Sans DJOGANA_USERNAME/DJOGANA_PASSWORD (identifiants sandbox pas encore
 * fournis par la DGI/Peya Pay), toutes les fonctions tournent en mode stub :
 * compte toujours trouvé, OTP fixe "0000", paiement toujours accepté — pour
 * pouvoir développer/tester le parcours frontend en attendant les vrais
 * identifiants. Contrairement à WAVE_API_KEY, ce mode stub reste actif même
 * en production tant que les identifiants ne sont pas configurés : Djogana
 * est un moyen de paiement optionnel, pas le seul (Wave reste disponible).
 */

const DJOGANA_BASE_URL =
  process.env.DJOGANA_API_URL || "https://test1-pey-peya.djogana-pay.com";
const CODE_BANQUE = process.env.DJOGANA_CODE_BANQUE || "DPAY";
const CODE_AGENCE = process.env.DJOGANA_CODE_AGENCE || "11111";
// Durée de mise en cache du jeton JWT avant ré-authentification — la doc ne
// précise pas sa durée de validité réelle, 20 min reste prudent.
const DUREE_CACHE_TOKEN_MS = 20 * 60 * 1000;

function djoganaConfigure(): boolean {
  return !!(process.env.DJOGANA_USERNAME && process.env.DJOGANA_PASSWORD);
}

type DjoganaStatus = { code?: string; message?: string };
type DjoganaEnveloppe<T> = { hasError?: boolean; status?: DjoganaStatus } & T;

let tokenCache: { token: string; compteCredit: string; expiresAt: number } | null = null;

async function authentifierDjogana(): Promise<{ token: string; compteCredit: string }> {
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
    item?: { token?: string; userId?: string; telephone?: string };
  }> | null;
  if (!resp.ok || data?.hasError || !data?.item?.token) {
    const detail = data?.status?.message || `${resp.status}`;
    throw new Error(`Djogana authentification échouée: ${detail}`);
  }

  const compteCredit =
    process.env.DJOGANA_COMPTE_CREDIT || data.item.userId || data.item.telephone || "";
  tokenCache = { token: data.item.token, compteCredit, expiresAt: Date.now() + DUREE_CACHE_TOKEN_MS };
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
  const data = (await resp.json().catch(() => null)) as DjoganaEnveloppe<T> | null;
  if (!resp.ok || data?.hasError) {
    throw new Error(data?.status?.message || `Djogana ${path} ${resp.status}`);
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
 * Le numéro stocké en base n'est JAMAIS modifié : tout le reste de
 * l'application (SMS de confirmation et d'accès à l'espace client, contrôle
 * de cohérence des routes /paiement-djogana/*) continue de travailler sur le
 * "+225..." d'origine.
 */
function numeroLocal(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  return chiffres.startsWith("225") ? chiffres.slice(3) : chiffres;
}

// Compte introuvable : `gsm` (numéro réellement envoyé) et `reponse` (message
// brut de l'API) sont conservés pour le diagnostic avec le support Djogana.
type PayeurDjogana = { compte: string } | { compte: null; gsm: string; reponse: string };

/** API#2 — recherche du compte Djogana/Peya Pay associé à ce téléphone. */
export async function rechercherPayeurDjogana(telephone: string): Promise<PayeurDjogana> {
  const gsm = numeroLocal(telephone);
  if (!djoganaConfigure()) return { compte: gsm };

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
  if (!djoganaConfigure()) return; // mode stub : voir validerOtpDjogana
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

/** API#4 — validation du code OTP saisi par le client. */
export async function validerOtpDjogana(telephone: string, code: string): Promise<boolean> {
  if (!djoganaConfigure()) return code === "0000"; // mode stub : code de test fixe
  try {
    await djoganaFetch("/wClients/verifcode-partenaire", {
      data: { codeValid: code, login: numeroLocal(telephone) },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * API#6 — débite directement le compte Djogana du client (déjà validé par
 * OTP) du montant donné, au profit du compte marchand. Sans identifiants
 * configurés, simule systématiquement un paiement réussi (mode stub).
 */
export async function creerPaiementDjogana(
  telephone: string,
  montant: number,
  reference: string
): Promise<{ reussi: boolean; transactionId?: string; message?: string }> {
  if (!djoganaConfigure()) {
    return { reussi: true, transactionId: `DJOGANA-STUB-${reference.slice(0, 8)}` };
  }

  try {
    const payeur = await rechercherPayeurDjogana(telephone);
    if (payeur.compte === null) {
      return {
        reussi: false,
        message: `Compte Payapay introuvable pour le ${payeur.gsm} (réponse Payapay : ${payeur.reponse})`,
      };
    }

    const { compteCredit } = await authentifierDjogana();
    const data = await djoganaFetch<{ item?: { id?: string; reference?: string } }>(
      "/paiement-partenaire/create",
      {
        data: {
          compteDebit: payeur.compte,
          compteCredit,
          montant: String(montant),
          login: process.env.DJOGANA_USERNAME,
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
