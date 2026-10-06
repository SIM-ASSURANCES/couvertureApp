// Identifiants des partenaires et de leurs sous-agents :
//   partenaire  → "<catégorie>.<n° d'ordre dans la catégorie sur 4 chiffres>"  (ex. 1.0001)
//   sous-agent  → "<identifiant du partenaire>.<n° d'ordre sur 2 chiffres>"      (ex. 1.0001.01)
//
// Le n° d'ordre vient d'un compteur en base (CompteurIdentifiant), incrémenté
// par UNE requête SQL atomique : deux créations simultanées ne reçoivent jamais
// le même numéro, et un numéro supprimé n'est jamais réattribué. Même principe
// que les factures (services/facture.ts::prochainNumeroFacture).
//
// Un identifiant attribué est DÉFINITIF : la catégorie qui l'a produit est
// verrouillée avec lui (CategorieVerrouilleeError), puisque la changer
// modifierait un identifiant déjà communiqué.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

type Tx = Prisma.TransactionClient;

/**
 * Catégories d'intermédiaires. Le numéro est celui de la liste fournie par SIM
 * Assurances (1° à 16°) ; il entre dans l'identifiant et ne doit JAMAIS être
 * renuméroté. Libellés 3, 4, 7, 15 et 16 reconstitués à partir d'une photo
 * coupée sur la droite — à confirmer ; les corriger ne change aucun
 * identifiant (seul le numéro compte). Miroir côté frontend :
 * frontend/src/categoriesPartenaires.ts — à garder synchronisés.
 */
export const CATEGORIES_PARTENAIRES = [
  { numero: 1, libelle: "Courtiers agréés" },
  { numero: 2, libelle: "Agents généraux" },
  { numero: 3, libelle: "Personnes physiques mandataires" },
  { numero: 4, libelle: "Banques, La Poste et établissements financiers" },
  { numero: 5, libelle: "Institutions de microfinance" },
  { numero: 6, libelle: "Mutuelles de santé" },
  { numero: 7, libelle: "Coopératives et groupements" },
  { numero: 8, libelle: "Organisations non gouvernementales" },
  { numero: 9, libelle: "Agences de développement" },
  { numero: 10, libelle: "Associations et tontines" },
  { numero: 11, libelle: "Fonds funéraires" },
  { numero: 12, libelle: "Syndicats" },
  { numero: 13, libelle: "Sociétés et distributeurs de téléphonie mobile" },
  { numero: 14, libelle: "Responsables sanitaires" },
  { numero: 15, libelle: "Chaînes de distribution alimentaire" },
  { numero: 16, libelle: "Sociétés à forts potentiels d'affaires" },
] as const;

/** Catégorie des institutions de microfinance (branche IMF Partenaires). */
export const CATEGORIE_MICROFINANCE = 5;

/**
 * Catégorie des agents mandataires (personnes physiques mandataires) : tous les
 * partenaires créés avant l'introduction des identifiants en sont (décision de
 * SIM Assurances, 2026-10-06) — voir attribuerIdentifiantsEnAttente.
 */
export const CATEGORIE_MANDATAIRE = 3;

export function categorieValide(n: number): boolean {
  return Number.isInteger(n) && CATEGORIES_PARTENAIRES.some((c) => c.numero === n);
}

export class CategorieVerrouilleeError extends Error {
  constructor(public readonly identifiant: string) {
    super(
      `La catégorie ne peut plus être modifiée : l'identifiant ${identifiant} est déjà attribué.`
    );
  }
}

/** Exécute `fn` dans la transaction fournie, ou dans une nouvelle. */
function dansTransaction<T>(tx: Tx | undefined, fn: (t: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction(fn);
}

/**
 * N° d'ordre suivant pour une portée (`cat-<n>` ou `agent-<id partenaire>`).
 * INSERT … ON CONFLICT DO UPDATE … RETURNING : atomique, sans lecture préalable.
 */
async function prochainNumero(portee: string, tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<{ dernier: number }[]>`
    INSERT INTO "CompteurIdentifiant" ("portee", "dernier") VALUES (${portee}, 1)
    ON CONFLICT ("portee") DO UPDATE SET "dernier" = "CompteurIdentifiant"."dernier" + 1
    RETURNING "dernier"`;
  return rows[0].dernier;
}

// Les largeurs sont des MINIMUMS : au-delà (10 000e partenaire d'une catégorie,
// 100e agent d'un partenaire) le numéro s'allonge au lieu de faire échouer la
// création.
export function formaterIdentifiantPartenaire(categorie: number, numero: number): string {
  return `${categorie}.${String(numero).padStart(4, "0")}`;
}
export function formaterIdentifiantAgent(identifiantPartenaire: string, numero: number): string {
  return `${identifiantPartenaire}.${String(numero).padStart(2, "0")}`;
}

/** Donne leur identifiant aux agents du partenaire qui n'en ont pas, du plus ancien au plus récent. */
async function attribuerAgentsEnAttente(partenaireId: string, identifiantPartenaire: string, tx: Tx): Promise<void> {
  const agents = await tx.agentDistribution.findMany({
    where: { partenaireId, identifiant: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const { id } of agents) {
    const numero = await prochainNumero(`agent-${partenaireId}`, tx);
    await tx.agentDistribution.update({
      where: { id },
      data: { identifiant: formaterIdentifiantAgent(identifiantPartenaire, numero) },
    });
  }
}

/**
 * Attribue (ou confirme) la catégorie et l'identifiant d'un partenaire.
 * - Pas encore d'identifiant : numéro suivant de la catégorie ; les agents déjà
 *   créés sans identifiant reçoivent le leur dans la foulée.
 * - Identifiant déjà attribué : même catégorie → ne fait rien (idempotent) ;
 *   catégorie différente → CategorieVerrouilleeError.
 * La ligne du partenaire est verrouillée (FOR UPDATE) : deux appels simultanés
 * ne consomment jamais deux numéros.
 */
export async function attribuerIdentifiantPartenaire(
  partenaireId: string,
  categorie: number,
  tx?: Tx
): Promise<{ categorie: number; identifiant: string }> {
  if (!categorieValide(categorie)) throw new RangeError(`Catégorie inconnue : ${categorie}`);

  return dansTransaction(tx, async (t) => {
    await t.$queryRaw`SELECT "id" FROM "Partenaire" WHERE "id" = ${partenaireId} FOR UPDATE`;
    const p = await t.partenaire.findUnique({
      where: { id: partenaireId },
      select: { categorie: true, identifiant: true },
    });
    if (!p) throw new Error("Partenaire introuvable");

    if (p.identifiant) {
      if (p.categorie === categorie) return { categorie, identifiant: p.identifiant };
      throw new CategorieVerrouilleeError(p.identifiant);
    }

    const numero = await prochainNumero(`cat-${categorie}`, t);
    const identifiant = formaterIdentifiantPartenaire(categorie, numero);
    await t.partenaire.update({ where: { id: partenaireId }, data: { categorie, identifiant } });
    await attribuerAgentsEnAttente(partenaireId, identifiant, t);
    return { categorie, identifiant };
  });
}

/**
 * Attribue son identifiant à un agent, s'il n'en a pas et que son partenaire en
 * a un. Sinon ne fait rien : il l'obtiendra quand le partenaire recevra le sien
 * (voir attribuerIdentifiantPartenaire). Renvoie l'identifiant courant (ou null).
 */
export async function attribuerIdentifiantAgent(agentId: string, tx?: Tx): Promise<string | null> {
  return dansTransaction(tx, async (t) => {
    await t.$queryRaw`SELECT "id" FROM "AgentDistribution" WHERE "id" = ${agentId} FOR UPDATE`;
    const a = await t.agentDistribution.findUnique({
      where: { id: agentId },
      select: { identifiant: true, partenaireId: true, partenaire: { select: { identifiant: true } } },
    });
    if (!a) throw new Error("Agent introuvable");
    if (a.identifiant) return a.identifiant;
    if (!a.partenaire.identifiant) return null;

    const numero = await prochainNumero(`agent-${a.partenaireId}`, t);
    const identifiant = formaterIdentifiantAgent(a.partenaire.identifiant, numero);
    await t.agentDistribution.update({ where: { id: agentId }, data: { identifiant } });
    return identifiant;
  });
}

/**
 * Rattrapage au démarrage (seed.ts), idempotent :
 *  1. institutions de microfinance (branche IMF Partenaires) → catégorie 5° ;
 *  2. TOUS les autres partenaires encore sans catégorie → catégorie 3° (agents
 *     mandataires), du plus ancien au plus récent — c'est ce que sont les
 *     partenaires existants, selon SIM Assurances. `exclureEmails` écarte les
 *     comptes techniques qui ne sont pas des partenaires du réseau (partenaire
 *     de « souscription directe » de SIM Assurances elle-même) ;
 *  3. partenaires qui ont une catégorie mais pas d'identifiant (attribution
 *     interrompue) ;
 *  4. agents sans identifiant dont le partenaire en a un.
 * Un partenaire créé APRÈS ce rattrapage a toujours une catégorie (exigée à la
 * création) : ce passage 2 ne peut donc plus rien lui attribuer par défaut.
 */
export async function attribuerIdentifiantsEnAttente(
  options: { exclureEmails?: string[] } = {}
): Promise<{ partenaires: number; agents: number }> {
  // Institutions de microfinance (branche IMF Partenaires) créées avant les
  // identifiants : leur catégorie ne fait aucun doute (5°), contrairement aux
  // autres partenaires dont la catégorie reste un choix de l'admin.
  const institutions = await prisma.partenaire.findMany({
    where: { branche: "IMF_PARTENAIRES", categorie: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let nbInstitutions = 0;
  for (const { id } of institutions) {
    try {
      await attribuerIdentifiantPartenaire(id, CATEGORIE_MICROFINANCE);
      nbInstitutions++;
    } catch (err) {
      console.error("[identifiants] institution non traitée", id, err);
    }
  }

  // Partenaires existants sans catégorie → agents mandataires. Filtré en JS (et
  // non en SQL) : `branche` et `email` peuvent être NULL, et un `NOT IN`/`not`
  // SQL écarterait silencieusement ces lignes.
  const exclus = new Set((options.exclureEmails ?? []).map((e) => e.toLowerCase()));
  const sansCategorie = await prisma.partenaire.findMany({
    where: { categorie: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, branche: true },
  });
  for (const p of sansCategorie) {
    if (p.branche === "IMF_PARTENAIRES") continue; // déjà traité ci-dessus
    if (p.email && exclus.has(p.email.toLowerCase())) continue;
    try {
      await attribuerIdentifiantPartenaire(p.id, CATEGORIE_MANDATAIRE);
      nbInstitutions++; // compté avec les attributions « par défaut »
    } catch (err) {
      console.error("[identifiants] partenaire existant non traité", p.id, err);
    }
  }

  const partenaires = await prisma.partenaire.findMany({
    where: { categorie: { not: null }, identifiant: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, categorie: true },
  });
  let nbPartenaires = 0;
  for (const p of partenaires) {
    try {
      await attribuerIdentifiantPartenaire(p.id, p.categorie!);
      nbPartenaires++;
    } catch (err) {
      console.error("[identifiants] partenaire non traité", p.id, err);
    }
  }

  const agents = await prisma.agentDistribution.findMany({
    where: { identifiant: null, partenaire: { identifiant: { not: null } } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let nbAgents = 0;
  for (const { id } of agents) {
    try {
      if (await attribuerIdentifiantAgent(id)) nbAgents++;
    } catch (err) {
      console.error("[identifiants] agent non traité", id, err);
    }
  }
  return { partenaires: nbInstitutions + nbPartenaires, agents: nbAgents };
}
