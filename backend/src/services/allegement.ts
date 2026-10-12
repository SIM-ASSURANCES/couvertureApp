// Allègement des listes d'administration (audit performance 2026-10-12).
//
// Les souscriptions portent en base des images en base64 (signature, pièce
// d'identité, selfie : 25 à 150 Ko chacune). Renvoyées dans une liste, elles
// pesaient des dizaines de Mo par chargement de page (mesuré : 37 Mo pour
// Contrats, 51 Mo pour Clients Accident, 102 Mo pour Assurances Accidents sur
// ~1 400 souscriptions) alors que les écrans n'en affichent aucune. Elles se
// relisent à la demande : GET /assurances-branche/clients/:type/:id/photos, et
// le PDF d'un contrat relit toujours la signature en base (routes/contrats.ts).

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Parmi `ids`, ceux dont la ligne a une photo (selfie) en base. Le test
 * `IS NOT NULL` ne lit pas le contenu de la colonne : on sait SI une photo
 * existe sans la rapatrier (les écrans n'ont besoin que de ce booléen, la
 * photo elle-même se charge à la demande).
 */
export async function idsAvecSelfie(modele: "souscriptionIncendie" | "souscriptionAccident", ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const lignes =
    modele === "souscriptionIncendie"
      ? await prisma.souscriptionIncendie.findMany({ where: { id: { in: ids }, selfieUrl: { not: null } }, select: { id: true } })
      : await prisma.souscriptionAccident.findMany({ where: { id: { in: ids }, selfieUrl: { not: null } }, select: { id: true } });
  return new Set(lignes.map((l) => l.id));
}

/** Colonnes d'images du modèle générique `Souscription` — à passer à `omit` sur toute liste. */
export const SANS_IMAGES_GENERIQUE = { pieceIdentiteUrl: true } as const;

/**
 * Comme SANS_IMAGES_GENERIQUE, et sans le JSON `donneesSpecifiques` : celui-ci
 * contient la signature (25 Ko et plus par ligne) et se relit par
 * `donneesSpecifiquesAllegees`, avec les images retirées PAR LA BASE. Mesuré
 * sur 800 souscriptions : 770 ms pour rapatrier le JSON avec ses images contre
 * 40 ms pour la version allégée.
 */
export const SANS_LOURD_GENERIQUE = { pieceIdentiteUrl: true, donneesSpecifiques: true } as const;

/** Clés de `donneesSpecifiques` qui portent une image (data URL) — retirées côté SQL. */
const CLES_IMAGES_JSON = ["signature", "selfie", "selfieUrl", "pieceIdentite", "pieceIdentiteUrl"];

/**
 * `donneesSpecifiques` de chaque souscription, SANS ses images : la base les
 * retire (opérateur jsonb `- text[]`) avant tout transfert. À utiliser avec
 * `omit: SANS_LOURD_GENERIQUE`, puis à rattacher aux lignes (voir
 * `avecDonneesAllegees`). Une ligne sans JSON donne `null`.
 */
export async function donneesSpecifiquesAllegees(ids: string[]): Promise<Map<string, Prisma.JsonValue>> {
  const resultat = new Map<string, Prisma.JsonValue>();
  if (ids.length === 0) return resultat;
  const lignes = await prisma.$queryRaw<{ id: string; ds: Prisma.JsonValue }[]>`
    SELECT s.id,
      CASE WHEN jsonb_typeof(s."donneesSpecifiques") = 'object'
           THEN s."donneesSpecifiques" - ${CLES_IMAGES_JSON}::text[]
           ELSE s."donneesSpecifiques" END AS ds
    FROM "Souscription" s
    WHERE s.id = ANY(${ids})`;
  for (const l of lignes) resultat.set(l.id, l.ds);
  return resultat;
}

/** Rattache `donneesSpecifiques` (allégé) à des lignes lues avec `omit: SANS_LOURD_GENERIQUE`. */
export async function avecDonneesAllegees<T extends { id: string }>(
  lignes: T[]
): Promise<(T & { donneesSpecifiques: Prisma.JsonValue })[]> {
  const donnees = await donneesSpecifiquesAllegees(lignes.map((l) => l.id));
  return lignes.map((l) => ({ ...l, donneesSpecifiques: donnees.get(l.id) ?? null }));
}

/** Colonnes d'images des modèles historiques Incendie et Accident — à passer à `omit` sur toute liste. */
export const SANS_IMAGES_HISTORIQUE = { pieceIdentiteUrl: true, selfieUrl: true, signature: true } as const;

/** En deçà de cette taille, une chaîne data URL est conservée (icône, miniature). */
const SEUIL_DATA_URL = 2_000;

/** Copie de `valeur` sans les chaînes « data:… » volumineuses, à tous les niveaux (les autres clés restent intactes). */
function sansDataUrls(valeur: unknown): unknown {
  if (typeof valeur === "string") return valeur.startsWith("data:") && valeur.length > SEUIL_DATA_URL ? undefined : valeur;
  if (Array.isArray(valeur)) return valeur.map(sansDataUrls);
  if (valeur && typeof valeur === "object") {
    const copie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur)) {
      const allege = sansDataUrls(v);
      if (allege !== undefined) copie[cle] = allege;
    }
    return copie;
  }
  return valeur;
}

/**
 * Retire les images base64 des champs JSON libres d'une souscription
 * (`donneesSpecifiques`, `formulaireComplement`, `resultat`), là où le modèle
 * générique range signature et selfie. N'altère aucun autre champ.
 */
export function allegerJsonSouscription<T extends { donneesSpecifiques?: unknown; formulaireComplement?: unknown; resultat?: unknown }>(
  ligne: T
): T {
  const sortie = { ...ligne };
  if (sortie.donneesSpecifiques != null) sortie.donneesSpecifiques = sansDataUrls(sortie.donneesSpecifiques);
  if (sortie.formulaireComplement != null) sortie.formulaireComplement = sansDataUrls(sortie.formulaireComplement);
  if (sortie.resultat != null) sortie.resultat = sansDataUrls(sortie.resultat);
  return sortie;
}
