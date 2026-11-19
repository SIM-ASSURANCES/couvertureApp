/**
 * Champs complémentaires des produits Assurances Dommages (demande du 2026-11-19) :
 *   - SecurHome (`securhome`) et SecurHome+ (`securhome_dommages`) : référence CIE (obligatoire),
 *     référence SODECI (facultative — tous les logements n'ont pas de compteur d'eau au nom de
 *     l'occupant), lieu d'habitation précis (obligatoire), photo de la facture (obligatoire) ;
 *   - SecurMoto (`securmoto`) : numéro de plaque d'immatriculation et photo de la carte grise
 *     (obligatoires).
 *
 * Une seule règle pour les quatre chemins de création (QR SecurHome+, QR SecurMoto, QR SecurHome par
 * formule, conversion d'un devis) : sans elle, un client passé par un devis y échapperait. Les photos
 * sont enregistrées comme `Document` (types `Facture` / `CarteGrise`) DANS la création de la
 * souscription, jamais en dépôt séparé « au mieux » : une souscription ne peut exister sans elles.
 */
import { z } from "zod";

// Même contrôle que `dataUrlImage` de routes/public.ts (image en data URL, 2 Mo au plus).
const imageDataUrl = z
  .string()
  .max(2_000_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/, "Image invalide");

const texteOptionnel = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

/** Champs à ajouter aux schémas des routes de création (tous facultatifs ici, exigés par produit ci-dessous). */
export const champsDommagesSchema = {
  refFacture: texteOptionnel(120),
  refSodeci: texteOptionnel(120),
  lieuHabitation: texteOptionnel(300),
  photoFacture: imageDataUrl.optional(),
  plaqueImmatriculation: texteOptionnel(20),
  photoCarteGrise: imageDataUrl.optional(),
};

export interface ChampsDommages {
  refFacture?: string | null;
  refSodeci?: string | null;
  lieuHabitation?: string | null;
  photoFacture?: string | null;
  plaqueImmatriculation?: string | null;
  photoCarteGrise?: string | null;
}

const PRODUITS_LOGEMENT = ["securhome", "securhome_dommages"];

export function estProduitLogement(code: string): boolean {
  return PRODUITS_LOGEMENT.includes(code);
}

/** « 1234 ab 01 » → « 1234 AB 01 » : la recherche admin la retrouve quelle que soit la saisie. */
export function normaliserPlaque(plaque: string): string {
  return plaque.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Message d'erreur si un champ obligatoire de ce produit manque ; `null` si tout est fourni. */
export function verifierChampsDommages(code: string, c: ChampsDommages): string | null {
  if (estProduitLogement(code)) {
    if (!c.refFacture?.trim()) return "Indiquez la référence de votre facture CIE.";
    if (!c.lieuHabitation?.trim() || c.lieuHabitation.trim().length < 5) {
      return "Indiquez le lieu d'habitation précis (quartier, rue, repère…).";
    }
    if (!c.photoFacture) return "Ajoutez la photo de votre facture (CIE ou SODECI).";
  }
  if (code === "securmoto") {
    const plaque = c.plaqueImmatriculation ? normaliserPlaque(c.plaqueImmatriculation) : "";
    if (plaque.replace(/[^A-Z0-9]/g, "").length < 4) return "Indiquez le numéro de plaque d'immatriculation de l'engin.";
    if (!c.photoCarteGrise) return "Ajoutez la photo de la carte grise de l'engin.";
  }
  return null;
}

/** Champs texte à fusionner dans `Souscription.donneesSpecifiques` (relus par le contrat PDF et l'admin). */
export function donneesChampsDommages(code: string, c: ChampsDommages): Record<string, unknown> {
  if (estProduitLogement(code)) {
    return {
      refFacture: c.refFacture?.trim() ?? null,
      refSodeci: c.refSodeci?.trim() || null,
      lieuHabitation: c.lieuHabitation?.trim() ?? null,
    };
  }
  if (code === "securmoto") {
    return { plaqueImmatriculation: c.plaqueImmatriculation ? normaliserPlaque(c.plaqueImmatriculation) : null };
  }
  return {};
}

/** Photos à créer avec la souscription (`documents: { create: … }`). */
export function documentsChampsDommages(code: string, c: ChampsDommages): { type: "Facture" | "CarteGrise"; url: string }[] {
  if (estProduitLogement(code) && c.photoFacture) return [{ type: "Facture", url: c.photoFacture }];
  if (code === "securmoto" && c.photoCarteGrise) return [{ type: "CarteGrise", url: c.photoCarteGrise }];
  return [];
}
