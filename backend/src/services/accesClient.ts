// Souscrire un deuxième produit passe par l'espace client (refonte du 2026-11-10, élargie le 2026-11-17).
//
// Un client qui a déjà souscrit — donc qui possède un espace client, ouvert à la confirmation de sa
// première souscription avec un mot de passe envoyé par SMS — ne peut plus souscrire un autre
// produit depuis un parcours public (QR, application, lien de devis) : il doit d'abord se connecter
// à son espace, d'où il souscrit en étant authentifié.
//
// Le client est reconnu par ses informations personnelles, pas seulement par son numéro (un
// deuxième numéro suffisait à contourner la règle) :
//   1. le même numéro de téléphone (normalisé, clé du modèle Client) ;
//   2. le même numéro de pièce d'identité (CNI, passeport, permis — comparé sans espaces ni tirets) ;
//   3. les mêmes nom + prénoms + date de naissance (mots comparés sans accents ni casse, dans
//      n'importe quel ordre : « GOHORE Zah Bi » = « Zah Bi Gohore »). Le nom seul ne suffit pas :
//      les homonymes sont trop fréquents.
//
// Ne bloque jamais quelqu'un qui n'a PAS d'espace (première souscription, souscription restée en
// attente de paiement, client RelaxVoyage seul dont la couverture de 24 h n'ouvre pas d'espace) :
// il n'aurait aucun moyen de se connecter.

import { prisma } from "../db.js";
import { lireTokenOptionnel, type AuthUser } from "../auth.js";
import { normaliserTelephone } from "./clients.js";

export const CODE_CONNEXION_REQUISE = "connexion_requise";

export const MESSAGE_CONNEXION_REQUISE =
  "Vous avez déjà un espace client. Connectez-vous à votre espace avec votre numéro de téléphone et le mot de passe reçu par SMS pour souscrire à un autre produit.";

/** Informations personnelles saisies dans un formulaire de souscription (toutes facultatives sauf le téléphone). */
export interface IdentiteSouscripteur {
  telephone: string;
  nom?: string | null;
  prenom?: string | null;
  dateNaissance?: Date | string | null;
  numeroPieceIdentite?: string | null;
}

/** Un contrat déjà détenu (avec espace client) qui correspond à l'identité saisie. */
interface Correspondance {
  clientId: string | null;
  telephone: string;
}

/** Mots du nom complet, sans accents ni casse, triés : l'ordre nom/prénoms n'a pas d'importance. */
export function cleNomComplet(nom?: string | null, prenom?: string | null): string {
  const mots = `${nom ?? ""} ${prenom ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  return mots.sort().join(" ");
}

/** Numéro de pièce comparable : majuscules, lettres et chiffres seulement. */
export function clePiece(numero?: string | null): string {
  return (numero ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function dateValide(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

const AVEC_ESPACE = { clientPasswordHash: { not: null } } as const;

/** Contrats avec espace client qui correspondent à cette identité (téléphone, pièce, ou nom + prénoms + naissance). */
async function correspondances(identite: IdentiteSouscripteur): Promise<Correspondance[]> {
  const resultat: Correspondance[] = [];

  // 1. Téléphone.
  const cleTel = normaliserTelephone(identite.telephone);
  if (cleTel.length >= 8) {
    const client = await prisma.client.findUnique({ where: { telephone: cleTel }, select: { id: true } });
    if (client) {
      const filtre = { clientId: client.id, ...AVEC_ESPACE };
      const [generique, incendie, accident] = await Promise.all([
        prisma.souscription.count({ where: filtre }),
        prisma.souscriptionIncendie.count({ where: filtre }),
        prisma.souscriptionAccident.count({ where: filtre }),
      ]);
      if (generique + incendie + accident > 0) resultat.push({ clientId: client.id, telephone: cleTel });
    }
  }

  // 2. Numéro de pièce d'identité (seul le modèle générique le collecte).
  const piece = clePiece(identite.numeroPieceIdentite);
  if (piece.length >= 5) {
    const lignes = await prisma.$queryRaw<Correspondance[]>`
      SELECT "clientId", "telephone" FROM "Souscription"
      WHERE "clientPasswordHash" IS NOT NULL
        AND regexp_replace(upper("numeroPieceIdentite"), '[^A-Z0-9]', '', 'g') = ${piece}
      LIMIT 20`;
    resultat.push(...lignes);
  }

  // 3. Nom + prénoms + date de naissance (même jour calendaire).
  const naissance = dateValide(identite.dateNaissance);
  const cleNom = cleNomComplet(identite.nom, identite.prenom);
  if (naissance && cleNom.includes(" ")) {
    const debut = new Date(Date.UTC(naissance.getUTCFullYear(), naissance.getUTCMonth(), naissance.getUTCDate()));
    const fin = new Date(debut.getTime() + 24 * 3600 * 1000);
    const filtre = { dateNaissance: { gte: debut, lt: fin }, ...AVEC_ESPACE };
    const choix = { nom: true, prenom: true, clientId: true, telephone: true } as const;
    const [generique, incendie, accident] = await Promise.all([
      prisma.souscription.findMany({ where: filtre, select: choix, take: 200 }),
      prisma.souscriptionIncendie.findMany({ where: filtre, select: choix, take: 200 }),
      prisma.souscriptionAccident.findMany({ where: filtre, select: choix, take: 200 }),
    ]);
    for (const s of [...generique, ...incendie, ...accident]) {
      if (cleNomComplet(s.nom, s.prenom) === cleNom) resultat.push({ clientId: s.clientId, telephone: s.telephone });
    }
  }

  return resultat;
}

/** Ce numéro possède-t-il un espace client (au moins une souscription activée, avec ses accès) ? */
export async function clientADejaUnEspace(telephone: string): Promise<boolean> {
  return (await correspondances({ telephone })).length > 0;
}

/** Contrat sur lequel un client connecté a ouvert sa session (`sub` = id de la ligne du modèle `produitType`). */
async function contratDeLaSession(user: AuthUser): Promise<{ telephone: string; clientId: string | null } | null> {
  if (user.type !== "client") return null;
  const choix = { where: { id: user.sub }, select: { telephone: true, clientId: true } } as const;
  if (user.produitType === "incendie") return prisma.souscriptionIncendie.findUnique(choix);
  if (user.produitType === "accident") return prisma.souscriptionAccident.findUnique(choix);
  return prisma.souscription.findUnique(choix);
}

/** « 07 •• •• •• 21 » — assez pour que le client reconnaisse son numéro, sans le divulguer. */
function telephoneMasque(telephone: string): string {
  const chiffres = normaliserTelephone(telephone);
  return chiffres.length >= 4 ? `${chiffres.slice(0, 2)} •• •• •• ${chiffres.slice(-2)}` : "";
}

/**
 * Refus à renvoyer en 403 si ce souscripteur (reconnu par son téléphone, sa pièce d'identité, ou ses
 * nom + prénoms + date de naissance) a déjà un espace client et que la requête n'est pas celle de ce
 * client connecté ; `null` quand la souscription peut se poursuivre. Un jeton absent, expiré ou
 * appartenant à un autre client compte comme « non connecté ». Accepte un simple numéro (anciens appels).
 */
export async function refusSiEspaceClientExistant(
  authorization: string | undefined,
  identiteOuTelephone: IdentiteSouscripteur | string
): Promise<{ error: string; code: string } | null> {
  const identite = typeof identiteOuTelephone === "string" ? { telephone: identiteOuTelephone } : identiteOuTelephone;
  const trouves = await correspondances(identite);
  if (trouves.length === 0) return null;

  const session = lireTokenOptionnel(authorization);
  const contrat = session ? await contratDeLaSession(session) : null;
  if (contrat) {
    const telSession = normaliserTelephone(contrat.telephone);
    const memeClient = trouves.every(
      (t) => (contrat.clientId && t.clientId === contrat.clientId) || normaliserTelephone(t.telephone) === telSession
    );
    if (memeClient) return null;
  }

  // Reconnu sur un AUTRE numéro que celui saisi : on lui indique lequel (masqué) pour qu'il s'y connecte.
  const cleTel = normaliserTelephone(identite.telephone);
  const autreNumero = trouves.find((t) => normaliserTelephone(t.telephone) !== cleTel);
  const surCeNumero = trouves.some((t) => normaliserTelephone(t.telephone) === cleTel);
  const message =
    autreNumero && !surCeNumero
      ? `Vous avez déjà un espace client. Il a été ouvert avec le numéro ${telephoneMasque(autreNumero.telephone)} : connectez-vous à votre espace avec ce numéro et le mot de passe reçu par SMS pour souscrire à un autre produit.`
      : MESSAGE_CONNEXION_REQUISE;
  return { error: message, code: CODE_CONNEXION_REQUISE };
}
