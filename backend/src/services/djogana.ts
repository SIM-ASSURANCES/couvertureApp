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

type PayeurDjogana = { compte: string };

/** API#2 — recherche du compte Djogana/Peya Pay associé à ce téléphone. */
export async function rechercherPayeurDjogana(telephone: string): Promise<PayeurDjogana | null> {
  if (!djoganaConfigure()) return { compte: telephone };

  const data = await djoganaFetch<{
    items?: Array<{
      codeClient?: string;
      datasCompte?: Array<{ numerocomptecomplet?: string }>;
    }>;
  }>("/wClients/recherchePayeur", {
    data: { gsmPrincipale: telephone, codePaysResidence: "CI" },
  });
  const item = data.items?.[0];
  const compte = item?.datasCompte?.[0]?.numerocomptecomplet || item?.codeClient;
  return compte ? { compte } : null;
}

/** API#3/#5 — envoi du code OTP par SMS au numéro donné. */
export async function envoyerOtpDjogana(telephone: string): Promise<void> {
  if (!djoganaConfigure()) return; // mode stub : voir validerOtpDjogana
  await djoganaFetch("/wClients/code-partenaire", {
    data: {
      gsmPrincipale: telephone,
      // Champs pensés pour un client mobile natif (modèle/IMEI) — sans objet
      // ici puisque l'appel vient du backend web, valeurs génériques stables.
      modele: "web",
      imei: `web-${telephone}`,
      plateform: "web",
    },
  });
}

/** API#4 — validation du code OTP saisi par le client. */
export async function validerOtpDjogana(telephone: string, code: string): Promise<boolean> {
  if (!djoganaConfigure()) return code === "0000"; // mode stub : code de test fixe
  try {
    await djoganaFetch("/wClients/verifcode-partenaire", {
      data: { codeValid: code, login: telephone },
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
    if (!payeur) return { reussi: false, message: "Compte Djogana introuvable pour ce numéro" };

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
