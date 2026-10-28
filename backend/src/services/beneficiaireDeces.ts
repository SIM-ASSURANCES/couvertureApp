import { z } from "zod";

/**
 * Bénéficiaire de la garantie Décès (2026-10-29) — un nom et un numéro de téléphone,
 * demandés à la souscription de tout produit qui comporte cette garantie : RelaxMoto,
 * RelaxAuto, RelaxVoyage, RelaxAccidents générale, et RelaxAccidents Frais Médicaux
 * (grand public ou Livreurs/MotoTaxis) quand l'option Décès est choisie.
 * Stocké dans `Souscription.donneesSpecifiques.beneficiaire`, imprimé sur le contrat PDF.
 *
 * Les produits IMF (Décès, Coups durs) ont leur propre répartition en pourcentages
 * (routes/imf.ts) et ne passent pas par ici.
 */
// `type` et non `interface` : Prisma n'accepte dans une colonne JSON que des types à signature d'index implicite.
export type BeneficiaireDeces = {
  nom: string;
  telephone: string;
};

/** Champs ajoutés aux schémas de souscription — facultatifs au parsing, exigés par `verifierBeneficiaire`. */
export const champsBeneficiaire = {
  beneficiaireNom: z.string().trim().max(120).optional(),
  beneficiaireTelephone: z.string().trim().max(40).optional(),
};

const PRODUITS_AVEC_DECES = ["relaxmoto", "relaxauto", "relaxvoyage", "relaxaccidents"] as const;
const PRODUITS_RAF = ["relaxaccidents_fraismedicaux", "relaxaccidents_fraismedicaux_livreurs"] as const;

/** La souscription comporte-t-elle une garantie Décès ? (RAF : seulement avec l'option Décès.) */
export function aGarantieDeces(produitCode: string, optionDecesChoisie: boolean): boolean {
  if ((PRODUITS_AVEC_DECES as readonly string[]).includes(produitCode)) return true;
  return (PRODUITS_RAF as readonly string[]).includes(produitCode) && optionDecesChoisie;
}

/**
 * Message d'erreur si le bénéficiaire est exigé et absent ou invalide, sinon null.
 * Un numéro valide compte au moins 6 chiffres (les espaces, « + » et « - » sont tolérés).
 */
export function verifierBeneficiaire(
  data: { beneficiaireNom?: string; beneficiaireTelephone?: string },
  exige: boolean
): string | null {
  if (!exige) return null;
  const nom = (data.beneficiaireNom ?? "").trim();
  const telephone = (data.beneficiaireTelephone ?? "").trim();
  if (nom.length < 2) return "Indiquez le nom du bénéficiaire en cas de décès.";
  if (!/^[0-9+\-\s().]+$/.test(telephone) || telephone.replace(/\D/g, "").length < 6) {
    return "Indiquez un numéro de téléphone valide pour le bénéficiaire en cas de décès.";
  }
  return null;
}

/** Fragment à répandre dans `donneesSpecifiques` ; vide quand aucune garantie Décès n'est souscrite. */
export function beneficiaireAStocker(
  data: { beneficiaireNom?: string; beneficiaireTelephone?: string },
  exige: boolean
): { beneficiaire?: BeneficiaireDeces } {
  if (!exige) return {};
  return { beneficiaire: { nom: (data.beneficiaireNom ?? "").trim(), telephone: (data.beneficiaireTelephone ?? "").trim() } };
}

/** Ajoute le bénéficiaire à des `donneesSpecifiques` déjà construites (ou les crée si elles étaient absentes). */
export function avecBeneficiaire<T extends object | undefined>(
  donnees: T,
  fragment: { beneficiaire?: BeneficiaireDeces }
): T | (T & { beneficiaire: BeneficiaireDeces }) {
  if (!fragment.beneficiaire) return donnees;
  return { ...(donnees ?? {}), beneficiaire: fragment.beneficiaire } as T & { beneficiaire: BeneficiaireDeces };
}

/** Relit le bénéficiaire dans `donneesSpecifiques` (absent des souscriptions d'avant le 2026-10-29). */
export function lireBeneficiaire(donnees: unknown): BeneficiaireDeces | null {
  const b = (donnees as { beneficiaire?: Partial<BeneficiaireDeces> } | null | undefined)?.beneficiaire;
  if (!b || typeof b.nom !== "string" || !b.nom.trim()) return null;
  return { nom: b.nom, telephone: typeof b.telephone === "string" ? b.telephone : "" };
}
