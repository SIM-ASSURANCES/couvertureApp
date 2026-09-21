import { randomBytes } from "crypto";
import type { Carte, Document, Souscription } from "@prisma/client";
import { prisma } from "../db.js";

// =====================================================================
// Intégration NOVELIA (carte de prise en charge) — deux appels :
//   1. POST /eden/v1/interco/getToken  (email/mdp -> JWT, mis en cache)
//   2. POST /eden/v1/eden/souscription (déclare la souscription, reçoit en
//      retour le numéro de police, le numéro de carte et le lien de
//      téléchargement de la carte digitale)
// Mode stub (comportement historique conservé) tant que NOVELIA_EMAIL/
// NOVELIA_PASSWORD ne sont pas définis : la carte reste purement locale.
// En cas d'échec réseau/API, la carte locale sert de repli et une nouvelle
// tentative est reprogrammée (voir rejouerCartesNoveliaEnAttente, rejoué par
// cron dans index.ts) — même principe que services/partnerWebhook.ts.
// =====================================================================

const NOVELIA_BASE_URL = process.env.NOVELIA_BASE_URL || "https://sante.novelia-assurances.ci:9094";
const NOVELIA_SLUG = process.env.NOVELIA_SLUG || "novelia";
const NOVELIA_EMAIL = process.env.NOVELIA_EMAIL;
const NOVELIA_PASSWORD = process.env.NOVELIA_PASSWORD;
const TIMEOUT_REQUETE_MS = 15_000;

function noveliaConfigure(): boolean {
  return !!(NOVELIA_EMAIL && NOVELIA_PASSWORD);
}

/**
 * Correspondance code produit SIM -> valeur `offre` attendue par NOVELIA. Un
 * produit absent de cette table n'est pas couvert par NOVELIA (carte purement
 * locale, jamais synchronisée) — ajouter une ligne ici suffit pour étendre à
 * un nouveau produit.
 *
 * "LT" = Livreurs/MotoTaxis, "SGP" = grand public. La formule RelaxAccidents
 * générale (classe+CNPS) n'a pas de valeur dédiée côté NOVELIA à ce jour :
 * rattachée à SGP par hypothèse (à confirmer avec NOVELIA).
 */
const OFFRE_PAR_PRODUIT: Record<string, string> = {
  relaxmoto: "RELAXMOTO",
  relaxauto: "RELAXAUTO",
  relaxvoyage: "RELAXVOYAGE",
  relaxaccidents_fraismedicaux_livreurs: "RELAXACCIDENTLT",
  relaxaccidents_fraismedicaux: "RELAXACCIDENTSGP",
  relaxaccidents: "RELAXACCIDENTSGP",
};

/** Délais (minutes) avant la n-ième nouvelle tentative. Au-delà → abandon. */
const BACKOFF_MINUTES = [2, 10, 30, 120, 360];
const DELAI_ABANDON_MS = 24 * 60 * 60 * 1000;

function newNumeroCarte(): string {
  const year = new Date().getFullYear();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `CARTE-${year}-${suffix}`;
}

// ---- Authentification (token en cache mémoire, décodé du JWT) ----

let tokenCache: { token: string; exp: number } | null = null;

function decoderExpirationJwt(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const decoded = JSON.parse(json) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function obtenirToken(): Promise<string> {
  if (tokenCache && tokenCache.exp - Date.now() > 60_000) return tokenCache.token;

  const resp = await fetch(`${NOVELIA_BASE_URL}/eden/v1/interco/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", slug: NOVELIA_SLUG },
    body: JSON.stringify({ email: NOVELIA_EMAIL, mdp: NOVELIA_PASSWORD }),
    signal: AbortSignal.timeout(TIMEOUT_REQUETE_MS),
  });
  const texte = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Authentification NOVELIA échouée (${resp.status}) : ${texte.slice(0, 300)}`);
  }

  // Forme de la réponse non documentée (aucun exemple fourni) : on tente un
  // objet JSON avec le token sous une clé usuelle, puis en dernier recours le
  // corps brut lui-même si c'est directement le JWT.
  let token: string | null = null;
  try {
    const data = JSON.parse(texte) as Record<string, unknown>;
    const candidat = data.token ?? data.access_token ?? data.jwt ?? data.data;
    if (typeof candidat === "string") token = candidat;
    else if (candidat && typeof candidat === "object" && typeof (candidat as { token?: unknown }).token === "string") {
      token = (candidat as { token: string }).token;
    }
  } catch {
    if (texte.split(".").length === 3) token = texte.trim();
  }
  if (!token) throw new Error(`Authentification NOVELIA : token introuvable dans la réponse (${texte.slice(0, 300)}).`);

  tokenCache = { token, exp: decoderExpirationJwt(token) ?? Date.now() + 10 * 60_000 };
  return token;
}

// ---- Construction du corps de la requête souscription ----

type DonneesSouscriptionNovelia = {
  offre: string;
  dateEffet: string;
  dateExpiration: string;
  police: string;
  civilite: string;
  nom: string;
  prenoms: string;
  ville: string;
  commune: string;
  adresse: string;
  sexe: string;
  mobile: string;
  email: string;
  dateNaissance: string;
  piece: string;
  noPiece: string;
  photo: string;
};

const PIECE_NOVELIA: Record<string, string> = { CNI: "CNI", Passeport: "PASSEPORT", Permis: "PERMIS" };

function formatDateNovelia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dernierDocument(documents: Document[], types: string[]): Document | null {
  return documents.filter((d) => types.includes(d.type)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

type SouscriptionAvecDocuments = Souscription & { documents: Document[] };

/**
 * Vérifie que toutes les données requises par NOVELIA sont disponibles et
 * construit le corps de la requête. Des champs manquants ne sont pas une
 * erreur réseau : pas de nouvelle tentative programmée tant qu'ils ne sont
 * pas complétés (voir synchroniserNovelia).
 */
function construireDonneesCarte(
  s: SouscriptionAvecDocuments,
  offre: string
): { ok: true; donnees: DonneesSouscriptionNovelia } | { ok: false; manquants: string[] } {
  const pieceDoc = dernierDocument(s.documents, ["CNI", "Permis", "Passeport"]);
  const selfieDoc = dernierDocument(s.documents, ["Selfie"]);

  const manquants: string[] = [];
  if (!s.civilite) manquants.push("civilite");
  if (!s.nom) manquants.push("nom");
  if (!s.prenom) manquants.push("prenom");
  if (!s.ville) manquants.push("ville");
  if (!s.commune) manquants.push("commune");
  if (!s.adresse) manquants.push("adresse");
  if (!s.sexe) manquants.push("sexe");
  if (!s.telephone) manquants.push("mobile");
  if (!s.dateNaissance) manquants.push("dateNaissance");
  if (!s.numeroPieceIdentite) manquants.push("numeroPieceIdentite");
  if (!s.dateDebut) manquants.push("dateDebut");
  if (!s.dateFin) manquants.push("dateFin");
  if (!s.numeroPolice) manquants.push("numeroPolice");
  if (!pieceDoc) manquants.push("pièce d'identité (CNI/Permis/Passeport)");
  if (!selfieDoc) manquants.push("photo (selfie)");
  if (manquants.length > 0) return { ok: false, manquants };

  return {
    ok: true,
    donnees: {
      offre,
      dateEffet: formatDateNovelia(s.dateDebut!),
      dateExpiration: formatDateNovelia(s.dateFin!),
      police: s.numeroPolice!,
      civilite: s.civilite!,
      nom: s.nom!,
      prenoms: s.prenom!,
      ville: s.ville!,
      commune: s.commune!,
      adresse: s.adresse!,
      sexe: s.sexe === "masculin" ? "M" : "F",
      mobile: s.telephone,
      email: s.email || "",
      dateNaissance: formatDateNovelia(s.dateNaissance!),
      piece: PIECE_NOVELIA[pieceDoc!.type] ?? pieceDoc!.type.toUpperCase(),
      noPiece: s.numeroPieceIdentite!,
      photo: selfieDoc!.url,
    },
  };
}

// ---- Appel de l'API souscription ----

type ResultatSouscriptionNovelia =
  | { ok: true; numeroPolice: string; numeroCarte: string; lien: string }
  | {
      ok: false;
      erreur: string;
      // false = NOVELIA a déjà traité la demande (succès ou rejet métier
      // explicite) : renvoyer la MÊME requête créerait une police en double
      // côté NOVELIA. Seul un échec de transport (réseau/HTTP/token) est
      // rejouable sans risque — voir l'incident du 2026-09-21 où une clé de
      // réponse mal devinée ("lien" au lieu de "carteDigitale") a fait
      // rejouer un succès 4-5 fois de suite, créant autant de polices en
      // double chez NOVELIA pour les mêmes souscripteurs.
      rejouable: boolean;
      partiel?: { numeroPolice?: string; numeroCarte?: string; lien?: string };
    };

function extraireChaine(obj: Record<string, unknown>, cles: string[]): string | null {
  for (const cle of cles) {
    const v = obj[cle];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Le format exact de la réponse NOVELIA n'est documenté par aucun exemple
 * (collection Postman fournie sans réponse enregistrée) : on tente plusieurs
 * noms de clé usuels pour chaque valeur attendue. Si l'extraction échoue, le
 * corps brut est conservé (tronqué) dans l'erreur retournée pour ajuster
 * facilement ce mapping une fois la vraie forme connue (voir
 * Carte.syncDerniereErreur).
 */
async function appellerSouscriptionNovelia(donnees: DonneesSouscriptionNovelia): Promise<ResultatSouscriptionNovelia> {
  let token: string;
  try {
    token = await obtenirToken();
  } catch (e) {
    return { ok: false, erreur: (e as Error).message, rejouable: true };
  }

  let resp: Response;
  try {
    resp = await fetch(`${NOVELIA_BASE_URL}/eden/v1/eden/souscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        slug: NOVELIA_SLUG,
        token,
      },
      body: JSON.stringify(donnees),
      signal: AbortSignal.timeout(TIMEOUT_REQUETE_MS),
    });
  } catch (e) {
    return { ok: false, erreur: `Requête NOVELIA impossible : ${(e as Error).message}`, rejouable: true };
  }

  const texte = await resp.text().catch(() => "");
  let corps: Record<string, unknown> = {};
  try {
    corps = texte ? (JSON.parse(texte) as Record<string, unknown>) : {};
  } catch {
    // Réponse non-JSON : `corps` reste vide, traité comme un échec ci-dessous.
  }

  if (!resp.ok) {
    const message = extraireChaine(corps, ["message", "error", "erreur"]) ?? texte.slice(0, 300);
    return { ok: false, erreur: `Erreur NOVELIA (${resp.status}) : ${message}`, rejouable: true };
  }

  // `hasError` : rejet métier explicite malgré un HTTP 200 (format constaté en
  // prod le 2026-09-21 : { hasError, statutCode, statutMessage, data }). Un
  // rejet de ce type ne doit jamais être rejoué tel quel (même requête =
  // même rejet, ou pire, traitement en double si NOVELIA a côté elle déjà
  // partiellement enregistré la demande).
  if (corps.hasError === true) {
    const message = extraireChaine(corps, ["statutMessage", "message", "error", "erreur"]) ?? texte.slice(0, 500);
    return { ok: false, erreur: `NOVELIA a rejeté la demande : ${message}`, rejouable: false };
  }

  // La charge utile peut être imbriquée sous "data"/"resultat".
  const racineImbriquee = corps.data ?? corps.resultat;
  const racine = (racineImbriquee && typeof racineImbriquee === "object" ? racineImbriquee : corps) as Record<string, unknown>;

  const numeroPolice = extraireChaine(racine, ["numeroPolice", "police", "noPolice", "policeNumero"]);
  const numeroCarte = extraireChaine(racine, ["numeroCarte", "carte", "noCarte", "carteNumero"]);
  const lien = extraireChaine(racine, ["carteDigitale", "lienTelechargement", "lien", "lienCarte", "downloadUrl", "urlCarte", "url"]);

  if (!numeroPolice || !numeroCarte || !lien) {
    // NOVELIA a répondu sans indiquer d'erreur (`hasError` absent/false) :
    // elle a donc déjà traité la demande côté elle. Rejouer la même requête
    // créerait une police en double — on n'y touche plus, mais on conserve
    // tout ce qu'on a pu extraire pour ne rien perdre (voir syncDerniereErreur
    // pour ajuster le mapping de clé manquant).
    return {
      ok: false,
      erreur: `Réponse NOVELIA inattendue (champs introuvables) : ${texte.slice(0, 1500)}`,
      rejouable: false,
      partiel: {
        numeroPolice: numeroPolice ?? undefined,
        numeroCarte: numeroCarte ?? undefined,
        lien: lien ?? undefined,
      },
    };
  }
  return { ok: true, numeroPolice, numeroCarte, lien };
}

// ---- Cycle de synchronisation (création, renouvellement, retry) ----

/**
 * Tente une synchronisation NOVELIA pour la carte donnée et met à jour son
 * statut. Ne fait rien si le produit n'est pas couvert (ne devrait pas
 * arriver : vérifié avant la création de la carte).
 */
async function synchroniserNovelia(carte: Carte): Promise<void> {
  const s = await prisma.souscription.findUnique({
    where: { id: carte.souscriptionId },
    include: { documents: true, produit: { select: { code: true } } },
  });
  if (!s) return;
  const offre = OFFRE_PAR_PRODUIT[s.produit.code];
  if (!offre) return;

  const construction = construireDonneesCarte(s, offre);
  if (!construction.ok) {
    await prisma.carte.update({
      where: { id: carte.id },
      data: {
        syncNovelia: "echec",
        syncDerniereErreur: `Champs manquants pour NOVELIA : ${construction.manquants.join(", ")}`,
        syncProchaineTentativeAt: null,
      },
    });
    return;
  }

  const resultat = await appellerSouscriptionNovelia(construction.donnees);

  if (resultat.ok) {
    await prisma.carte.update({
      where: { id: carte.id },
      data: {
        noveliaRef: resultat.numeroCarte,
        numeroPoliceNovelia: resultat.numeroPolice,
        lienTelechargement: resultat.lien,
        syncNovelia: "ok",
        syncDerniereErreur: null,
        syncProchaineTentativeAt: null,
      },
    });
    return;
  }

  const tentatives = carte.syncTentatives + 1;
  const cycleDepuis = carte.syncCycleDepuis ?? carte.dateGeneration;
  const abandon =
    !resultat.rejouable ||
    tentatives > BACKOFF_MINUTES.length ||
    Date.now() - cycleDepuis.getTime() > DELAI_ABANDON_MS;
  const delaiMin = BACKOFF_MINUTES[Math.min(tentatives - 1, BACKOFF_MINUTES.length - 1)];

  await prisma.carte.update({
    where: { id: carte.id },
    data: {
      syncNovelia: abandon ? "echec" : "en_attente",
      syncTentatives: tentatives,
      syncDerniereErreur: resultat.erreur,
      syncProchaineTentativeAt: abandon ? null : new Date(Date.now() + delaiMin * 60_000),
      // Conservé même en échec définitif : évite de perdre un numéro de
      // police/carte déjà attribué par NOVELIA faute d'avoir pu lire le lien.
      ...(resultat.partiel?.numeroPolice ? { numeroPoliceNovelia: resultat.partiel.numeroPolice } : {}),
      ...(resultat.partiel?.numeroCarte ? { noveliaRef: resultat.partiel.numeroCarte } : {}),
      ...(resultat.partiel?.lien ? { lienTelechargement: resultat.partiel.lien } : {}),
    },
  });
}

/**
 * Génère la carte de prise en charge d'une souscription (produits Accidents)
 * dès l'activation de l'abonnement (1ère échéance payée). Idempotent. Crée
 * toujours la ligne locale (numéro stub) immédiatement, puis tente la
 * synchronisation NOVELIA si des identifiants sont configurés — voir
 * synchroniserNovelia pour le repli en cas d'échec.
 */
export async function genererCarte(souscriptionId: string): Promise<void> {
  const existante = await prisma.carte.findUnique({ where: { souscriptionId } });
  if (existante) return;

  const s = await prisma.souscription.findUnique({
    where: { id: souscriptionId },
    include: { produit: { select: { code: true } } },
  });
  if (!s || !OFFRE_PAR_PRODUIT[s.produit.code]) return; // produit non couvert par NOVELIA

  const carte = await prisma.carte.create({
    data: { souscriptionId, numero: newNumeroCarte(), statut: "generee", syncCycleDepuis: new Date() },
  });

  if (!noveliaConfigure()) return;
  await synchroniserNovelia(carte).catch((e) => console.error("[novelia] genererCarte", e));
}

/**
 * Renouvelle une carte existante (nouvelle période de couverture) : relance
 * une synchronisation NOVELIA complète avec les nouvelles dateDebut/dateFin.
 */
export async function renouvelerCarte(souscriptionId: string): Promise<void> {
  const existante = await prisma.carte.findUnique({ where: { souscriptionId } });
  if (!existante) return;

  const carte = await prisma.carte.update({
    where: { souscriptionId },
    data: {
      dateRenouvellement: new Date(),
      syncTentatives: 0,
      syncCycleDepuis: new Date(),
      syncNovelia: "en_attente",
      syncDerniereErreur: null,
      syncProchaineTentativeAt: null,
    },
  });

  if (!noveliaConfigure()) return;
  await synchroniserNovelia(carte).catch((e) => console.error("[novelia] renouvelerCarte", e));
}

/**
 * Rejoue les synchronisations NOVELIA en attente dont l'heure de nouvelle
 * tentative est passée. Appelé par un cron (index.ts) — même principe que
 * services/partnerWebhook.ts::rejouerWebhooksEnAttente.
 */
export async function rejouerCartesNoveliaEnAttente(): Promise<void> {
  if (!noveliaConfigure()) return;

  const enAttente = await prisma.carte.findMany({
    where: {
      syncNovelia: "en_attente",
      OR: [{ syncProchaineTentativeAt: null }, { syncProchaineTentativeAt: { lte: new Date() } }],
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  for (const carte of enAttente) {
    await synchroniserNovelia(carte).catch((e) => console.error("[novelia] rejeu", e));
  }
}
