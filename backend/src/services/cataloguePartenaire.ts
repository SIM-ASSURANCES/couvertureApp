import type { Produit } from "@prisma/client";
import { prisma } from "../db.js";

// =====================================================================
// Catalogue « côté partenaire » pour l'API serveur-à-serveur.
//
// Remplace la résolution par QR code (routes/public.ts::resoudreQrCodeGenerique)
// par une résolution par (partenaire, code produit).
//
// Visibilité (2026-11-16) : une clé API n'expose que QUATRE produits — RelaxMoto, RelaxAuto,
// RelaxAccidents Frais Médicaux et RelaxAccidents FM Livreurs/MotoTaxis (`PRODUITS_EXPOSES_API`),
// quels que soient les QR codes du partenaire. Les neuf autres (RelaxAccidents, RelaxVoyage, SecurHome,
// SecurHome+, SecurPro, SecurMoto, Santé ×3) sont absents du catalogue et répondent 403
// `produit_non_autorise` au devis comme à la souscription. (Historique : le 2026-11-12 le catalogue
// affichait les 13 produits des trois Assurances ; avant, il se déduisait des QR codes du partenaire.)
// Restreindre un partenaire reste possible produit par produit (`Produit.actif`, `produitsDesactives` :
// ils apparaissent alors avec `actifPourPartenaire: false`).
//
// NB : la logique de `produitDesactivePourPartenaire` / `souscriptionDejaExistante`
// de routes/public.ts est ré-implémentée ici (5 lignes) plutôt qu'importée —
// un service ne doit pas dépendre d'un module de routes.
// =====================================================================

/**
 * Les seuls produits ouverts à l'API partenaire. Pour en rouvrir un (ex. un produit « calculé » dont le
 * code de souscription est conservé dans routes/partnerApi.ts), il suffit de l'ajouter ici.
 */
export const PRODUITS_EXPOSES_API = new Set([
  "relaxmoto",
  "relaxauto",
  "relaxaccidents_fraismedicaux",
  "relaxaccidents_fraismedicaux_livreurs",
]);

/**
 * Produits dont la prime sort du moteur de devis (services/cotations.ts) : le partenaire envoie leurs
 * paramètres de tarification dans `entrees` (+ champs métier : trajet RelaxVoyage, fiche et
 * questionnaire Santé…), la prime est recalculée côté serveur, jamais transmise. Parcours CONSERVÉ mais
 * INACCESSIBLE tant que ces produits ne figurent pas dans `PRODUITS_EXPOSES_API`.
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
 * Produits que `POST /v1/souscriptions` sait créer (les 4 tarifés par formule + les 9 « calculés »).
 * Garde-fou : un produit exposé (`PRODUITS_EXPOSES_API`) mais non branché ici répond 501
 * `produit_non_supporte_api`.
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
  /** true = `POST /v1/souscriptions` sait créer ce produit (toujours vrai pour les produits exposés). */
  souscriptionApi: boolean;
  formules: FormuleCatalogue[];
};

export type ResolutionProduit =
  | { ok: true; produit: Produit }
  | { ok: false; raison: "inconnu" | "non_autorise" | "desactive" };

/**
 * Ensemble des ids de produits que toute clé API peut voir : les quatre de `PRODUITS_EXPOSES_API` —
 * AVANT filtre actif/désactivé. Ne dépend pas des QR codes du partenaire (une clé API est un canal à
 * part entière, pas un QR) ; `_partenaireId` est gardé pour que la restriction par partenaire puisse
 * revenir ici sans changer les appelants.
 */
async function produitIdsEligibles(_partenaireId: string): Promise<Set<string>> {
  const produits = await prisma.produit.findMany({
    where: { code: { in: [...PRODUITS_EXPOSES_API] } },
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
