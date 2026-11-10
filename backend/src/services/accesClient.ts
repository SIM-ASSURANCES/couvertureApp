// Souscrire un deuxième produit passe par l'espace client (refonte du 2026-11-10).
//
// Un client qui a déjà souscrit — donc qui possède un espace client, ouvert à la confirmation de sa
// première souscription avec un mot de passe envoyé par SMS — ne peut plus souscrire un autre
// produit depuis un parcours public (QR, application, lien de devis) : il doit d'abord se connecter
// à son espace, d'où il souscrit en étant authentifié. Le client est identifié par son numéro de
// téléphone normalisé (voir services/clients.ts), seule clé d'identité du modèle Client.
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

/** Ce numéro possède-t-il un espace client (au moins une souscription activée, avec ses accès) ? */
export async function clientADejaUnEspace(telephone: string): Promise<boolean> {
  const cle = normaliserTelephone(telephone);
  if (!cle) return false;
  const client = await prisma.client.findUnique({ where: { telephone: cle }, select: { id: true } });
  if (!client) return false;
  const filtre = { clientId: client.id, clientPasswordHash: { not: null } };
  const [generique, incendie, accident] = await Promise.all([
    prisma.souscription.count({ where: filtre }),
    prisma.souscriptionIncendie.count({ where: filtre }),
    prisma.souscriptionAccident.count({ where: filtre }),
  ]);
  return generique + incendie + accident > 0;
}

/** Téléphone du contrat sur lequel un client connecté a ouvert sa session (`sub` = id de la ligne du modèle `produitType`). */
async function telephoneDeLaSession(user: AuthUser): Promise<string | null> {
  if (user.type !== "client") return null;
  const choix = { where: { id: user.sub }, select: { telephone: true } } as const;
  if (user.produitType === "incendie") return (await prisma.souscriptionIncendie.findUnique(choix))?.telephone ?? null;
  if (user.produitType === "accident") return (await prisma.souscriptionAccident.findUnique(choix))?.telephone ?? null;
  return (await prisma.souscription.findUnique(choix))?.telephone ?? null;
}

/**
 * Refus à renvoyer en 403 si ce numéro a déjà un espace client et que la requête n'est pas celle du
 * client lui-même connecté ; `null` quand la souscription peut se poursuivre. Un jeton absent,
 * expiré ou appartenant à un autre numéro compte comme « non connecté ».
 */
export async function refusSiEspaceClientExistant(
  authorization: string | undefined,
  telephone: string
): Promise<{ error: string; code: string } | null> {
  if (!(await clientADejaUnEspace(telephone))) return null;
  const session = lireTokenOptionnel(authorization);
  const telephoneSession = session ? await telephoneDeLaSession(session) : null;
  if (telephoneSession && normaliserTelephone(telephoneSession) === normaliserTelephone(telephone)) return null;
  return { error: MESSAGE_CONNEXION_REQUISE, code: CODE_CONNEXION_REQUISE };
}
