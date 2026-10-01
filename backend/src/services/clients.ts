// Identité client unique (modèle Client, schema.prisma) — un même client
// (même numéro de téléphone) peut cumuler plusieurs polices sur des produits
// différents (RelaxMoto, SecurHome, Incendie historique...), toutes
// rattachées au même Client plutôt qu'identifiées individuellement par
// souscription. Voir resoudreOuCreerClient, point de passage unique appelé à
// chaque création de souscription (générique + historiques Incendie/Accident
// + canal API partenaire).

import { prisma } from "../db.js";

/**
 * Forme canonique du téléphone, utilisée UNIQUEMENT comme clé d'identification
 * du client (jamais pour l'affichage ni le SMS, qui gardent la valeur saisie
 * telle quelle) — même principe que services/djogana.ts::numeroLocal, en
 * indépendant pour ne pas coupler ce module à l'intégration Djogana. Sans
 * cette normalisation, "+2250700000011" et "0700000011" créeraient deux
 * clients distincts pour la même personne.
 */
export function normaliserTelephone(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  return chiffres.startsWith("225") && chiffres.length > 10 ? chiffres.slice(3) : chiffres;
}

/** "CL-" + 8 premiers caractères de l'id (sans tirets), majuscules — même ruse que notify.ts::numeroPoliceIncendieSynthetique : unique par construction (dérivé d'un uuid déjà unique), pas de compteur global à synchroniser. */
function genererIdentifiant(clientId: string): string {
  return `CL-${clientId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Trouve le client existant pour ce téléphone ou en crée un nouveau — à
 * appeler à CHAQUE création de souscription (quel que soit le produit/modèle).
 * `telephone` est la seule clé d'identification (jamais le nom, saisi
 * différemment d'une souscription à l'autre pour la même personne) ; `nom`/
 * `prenom` ne servent qu'à compléter une fiche encore vide, jamais à écraser
 * une valeur déjà connue.
 *
 * La création passe par un identifiant temporaire (`CL-PENDING-<téléphone>`,
 * unique tant que le téléphone l'est) le temps que l'id réel soit connu, pour
 * pouvoir en dériver l'identifiant définitif juste après — l'upsert Prisma
 * sur `telephone` (contrainte unique) rend la résolution atomique même en cas
 * de double soumission concurrente pour le même client.
 */
export async function resoudreOuCreerClient(
  telephone: string,
  nom?: string | null,
  prenom?: string | null
): Promise<{ id: string; identifiant: string }> {
  const key = normaliserTelephone(telephone);
  if (!key) throw new Error("Téléphone invalide pour l'identification du client.");

  let client = await prisma.client.upsert({
    where: { telephone: key },
    update: {},
    create: { telephone: key, nom: nom || null, prenom: prenom || null, identifiant: `CL-PENDING-${key}` },
  });

  if (client.identifiant.startsWith("CL-PENDING-")) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: { identifiant: genererIdentifiant(client.id) },
    });
  } else if ((nom && !client.nom) || (prenom && !client.prenom)) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: { nom: client.nom ?? nom ?? undefined, prenom: client.prenom ?? prenom ?? undefined },
    });
  }

  return { id: client.id, identifiant: client.identifiant };
}
