import type { Produit } from "@prisma/client";
import { prisma } from "../db.js";

// =====================================================================
// Catalogue « côté partenaire » pour l'API serveur-à-serveur.
//
// Remplace la résolution par QR code (routes/public.ts::resoudreQrCodeGenerique)
// par une résolution par (partenaire, code produit) : mêmes règles de
// visibilité — produits de la ou des sous-branches couvertes par les QR du
// partenaire, `Produit.actif`, hors `produitsDesactives` du partenaire.
//
// NB : la logique de `produitDesactivePourPartenaire` / `souscriptionDejaExistante`
// de routes/public.ts est ré-implémentée ici (5 lignes) plutôt qu'importée —
// un service ne doit pas dépendre d'un module de routes.
// =====================================================================

const SOUS_BRANCHES_API = ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] as const;

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
  formules: FormuleCatalogue[];
};

export type ResolutionProduit =
  | { ok: true; produit: Produit }
  | { ok: false; raison: "inconnu" | "non_autorise" | "desactive" };

/**
 * Ensemble des ids de produits que ce partenaire peut distribuer, d'après
 * ses QR codes propres (agentDistributionId null) — AVANT filtre
 * actif/désactivé :
 *   - QR sur un produit précis        → ce produit
 *   - QR sur une sous-branche         → tous les produits de la sous-branche
 *   - QR unique (produitId + sousBranche null) → toutes les sous-branches
 */
async function produitIdsEligibles(partenaireId: string): Promise<Set<string>> {
  const qrs = await prisma.qrCode.findMany({
    where: { partenaireId, agentDistributionId: null, actif: true },
    select: { produitId: true, sousBranche: true },
  });
  if (qrs.length === 0) return new Set();

  const produitIds = new Set<string>();
  const sousBranches = new Set<string>();
  let toutesSousBranches = false;
  for (const qr of qrs) {
    if (qr.produitId) produitIds.add(qr.produitId);
    else if (qr.sousBranche) sousBranches.add(qr.sousBranche);
    else toutesSousBranches = true;
  }

  const filtre = toutesSousBranches ? [...SOUS_BRANCHES_API] : [...sousBranches];
  if (filtre.length > 0) {
    const parSousBranche = await prisma.produit.findMany({
      where: { sousBranche: { in: filtre } },
      select: { id: true },
    });
    for (const p of parSousBranche) produitIds.add(p.id);
  }
  return produitIds;
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
