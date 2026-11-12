import type { Produit } from "@prisma/client";
import { prisma } from "../db.js";
import { SOUS_BRANCHES_ASSURANCES } from "./sousBranches.js";

// =====================================================================
// Catalogue « côté partenaire » pour l'API serveur-à-serveur.
//
// Remplace la résolution par QR code (routes/public.ts::resoudreQrCodeGenerique)
// par une résolution par (partenaire, code produit).
//
// Visibilité (2026-11-12) : TOUS les produits des trois Assurances — Accidents (6), Dommages (4) et
// Santé (3), soit 13 — pour toute clé API, quels que soient les QR codes du partenaire. Avant, le
// catalogue se déduisait de ses QR codes : un partenaire dont les QR étaient limités à quelques produits
// n'en voyait que 3, et la sous-branche Santé n'en faisait jamais partie (10 produits au mieux).
// Restreindre un partenaire reste possible produit par produit (`Produit.actif`, `produitsDesactives` :
// ils apparaissent alors avec `actifPourPartenaire: false`).
//
// NB : la logique de `produitDesactivePourPartenaire` / `souscriptionDejaExistante`
// de routes/public.ts est ré-implémentée ici (5 lignes) plutôt qu'importée —
// un service ne doit pas dépendre d'un module de routes.
// =====================================================================

const SOUS_BRANCHES_API = SOUS_BRANCHES_ASSURANCES;

/**
 * Produits dont la prime sort du moteur de devis (services/cotations.ts) : le partenaire envoie leurs
 * paramètres de tarification dans `entrees` (+ champs métier : trajet RelaxVoyage, fiche et
 * questionnaire Santé…), la prime est recalculée côté serveur, jamais transmise. Les quatre autres
 * produits (RelaxMoto, RelaxAuto, RelaxAccidents Frais Médicaux ×2) restent tarifés par `formule`.
 */
export const PRODUITS_API_CALCULES = new Set([
  "relaxvoyage",
  "relaxaccidents",
  "securhome",
  "securhome_dommages",
  "securpro_dommages",
  "securmoto",
  "sante_solo",
  "sante_duo",
  "sante_famille",
]);

/**
 * Produits que `POST /v1/souscriptions` sait créer : les 13 des trois Assurances (depuis le 2026-11-12,
 * les 9 produits « calculés » s'ajoutent aux 4 produits tarifés par formule). Garde-fou : un produit
 * ajouté au catalogue sans être branché ici répond 501 `produit_non_supporte_api`.
 */
export const PRODUITS_SOUSCRIPTION_API = new Set([
  "relaxmoto",
  "relaxauto",
  "relaxaccidents_fraismedicaux",
  "relaxaccidents_fraismedicaux_livreurs",
  ...PRODUITS_API_CALCULES,
]);

const TAUX_COMMISSION_API_REPLI = 0.1;

export type FormuleCatalogue = {
  /** Identifie la variante tarifaire (ex. "mensuel"/"annuel" pour Relax, null sinon). */
  libelleVariante: string | null;
  prime: number;
  primeHT: number | null;
  capitalGaranti: number;
  /** = libelleVariante pour les produits à cycle (RelaxMoto/RelaxAuto). */
  cycleFacturation: string | null;
  /** Garanties additionnelles propres à la formule (TarifProduit.donneesSpecifiques). */
  garanties: unknown;
};

export type ProduitCatalogue = {
  code: string;
  libelle: string;
  branche: string;
  sousBranche: string | null;
  typePaiement: string;
  /** `Produit.actif` global ET non désactivé pour ce partenaire. */
  actifPourPartenaire: boolean;
  /** Pièce d'identité + selfie exigés à la souscription (produits Accidents). */
  kycRequis: boolean;
  /** Taux commission « canal API » applicable (Produit.tauxCommissionApi ou repli global). */
  tauxCommissionApi: number;
  /** true = pas de TarifProduit → prime calculée dynamiquement (SecurHome+, SecurPro Dommages). */
  devisCalcule: boolean;
  /** true = `POST /v1/souscriptions` sait créer ce produit ; false = catalogue seulement (501 à la souscription). */
  souscriptionApi: boolean;
  formules: FormuleCatalogue[];
};

export type ResolutionProduit =
  | { ok: true; produit: Produit }
  | { ok: false; raison: "inconnu" | "non_autorise" | "desactive" };

/**
 * Ensemble des ids de produits que toute clé API peut voir : tous ceux des trois Assurances
 * (Accidents, Dommages, Santé) — AVANT filtre actif/désactivé. Ne dépend plus des QR codes du partenaire
 * (une clé API est un canal à part entière, pas un QR) ; `_partenaireId` est gardé pour que la restriction
 * par partenaire puisse revenir ici sans changer les appelants.
 */
async function produitIdsEligibles(_partenaireId: string): Promise<Set<string>> {
  const produits = await prisma.produit.findMany({
    where: { sousBranche: { in: [...SOUS_BRANCHES_API] } },
    select: { id: true },
  });
  return new Set(produits.map((p) => p.id));
}

/** true si `produitId` est explicitement désactivé pour ce partenaire. */
async function estDesactivePourPartenaire(partenaireId: string, produitId: string): Promise<boolean> {
  const p = await prisma.partenaire.findUnique({
    where: { id: partenaireId },
    select: { produitsDesactives: { where: { id: produitId }, select: { id: true } } },
  });
  return !!p && p.produitsDesactives.length > 0;
}

/**
 * Résout un `code` produit pour un partenaire donné. `raison` :
 *   - `inconnu`      : code inexistant ou `Produit.actif` faux
 *   - `non_autorise` : le partenaire ne distribue pas ce produit
 *   - `desactive`    : produit désactivé spécifiquement pour ce partenaire
 */
export async function resoudreProduitPourPartenaire(
  partenaireId: string,
  code: string
): Promise<ResolutionProduit> {
  const produit = await prisma.produit.findUnique({ where: { code } });
  if (!produit || !produit.actif) return { ok: false, raison: "inconnu" };

  const eligibles = await produitIdsEligibles(partenaireId);
  if (!eligibles.has(produit.id)) return { ok: false, raison: "non_autorise" };

  if (await estDesactivePourPartenaire(partenaireId, produit.id)) {
    return { ok: false, raison: "desactive" };
  }
  return { ok: true, produit };
}

/** Catalogue complet visible par le partenaire (produits actifs ET désactivés, avec le drapeau). */
export async function catalogueDuPartenaire(partenaireId: string): Promise<ProduitCatalogue[]> {
  const eligibles = await produitIdsEligibles(partenaireId);
  if (eligibles.size === 0) return [];

  const [produits, partenaire, parametre] = await Promise.all([
    prisma.produit.findMany({
      where: { id: { in: [...eligibles] } },
      orderBy: [{ sousBranche: "asc" }, { ordre: "asc" }],
      include: { tarifs: { orderBy: { prime: "asc" } } },
    }),
    prisma.partenaire.findUnique({
      where: { id: partenaireId },
      select: { produitsDesactives: { select: { id: true } } },
    }),
    prisma.parametre.findUnique({ where: { id: 1 } }),
  ]);

  const desactives = new Set((partenaire?.produitsDesactives ?? []).map((d) => d.id));
  const tauxDefaut = parametre?.tauxCommissionApiDefaut ?? TAUX_COMMISSION_API_REPLI;

  return produits.map((p) => ({
    code: p.code,
    libelle: p.libelle,
    branche: p.branche,
    sousBranche: p.sousBranche,
    typePaiement: p.typePaiement,
    actifPourPartenaire: p.actif && !desactives.has(p.id),
    kycRequis: p.sousBranche === "ASSURANCES_ACCIDENTS",
    tauxCommissionApi: p.tauxCommissionApi ?? tauxDefaut,
    devisCalcule: p.tarifs.length === 0,
    souscriptionApi: PRODUITS_SOUSCRIPTION_API.has(p.code),
    formules: p.tarifs.map((t) => ({
      libelleVariante: t.libelleVariante,
      prime: t.prime,
      primeHT: t.primeHT,
      capitalGaranti: t.capitalGaranti,
      cycleFacturation: t.libelleVariante,
      garanties: t.donneesSpecifiques ?? null,
    })),
  }));
}

/**
 * Part commission « canal API » (arrondie) pour une prime HT donnée —
 * figée sur la souscription à sa création (Souscription.montantCommissionApi).
 * Priorité : Produit.tauxCommissionApi, sinon Parametre.tauxCommissionApiDefaut.
 */
export async function calculerCommissionApi(
  produit: { tauxCommissionApi: number | null },
  primeHT: number
): Promise<number> {
  const parametre = await prisma.parametre.findUnique({ where: { id: 1 } });
  const taux = produit.tauxCommissionApi ?? parametre?.tauxCommissionApiDefaut ?? TAUX_COMMISSION_API_REPLI;
  return Math.round(primeHT * taux);
}

/**
 * true si une souscription générique CONFIRMÉE existe déjà pour ce couple
 * (nom, téléphone) sur ce produit — même règle anti-doublon que le parcours
 * public (routes/public.ts::souscriptionDejaExistante). Comparaison
 * insensible à la casse / aux espaces.
 */
export async function souscriptionGeneriqueDejaConfirmee(
  produitId: string,
  nom: string,
  telephone: string
): Promise<boolean> {
  const existante = await prisma.souscription.findFirst({
    where: {
      produitId,
      nom: { equals: nom.trim(), mode: "insensitive" },
      telephone: telephone.trim(),
      waveStatut: "confirme",
    },
    select: { id: true },
  });
  return !!existante;
}
