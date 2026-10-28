// Option Décès en supplément de RelaxAccidents Frais Médicaux — s'ajoute au prix de
// la formule choisie, garantie pour une durée propre (distincte de la durée du
// contrat principal) : 2 mois pour le grand public, 1 mois pour la version
// Livreurs/MotoTaxis (2026-09-17, alignée sur la durée de son propre contrat —
// voir paiementWave.ts::dureeFormuleMois).
//
// Source unique pour la souscription directe (routes/public.ts) et les devis
// (services/cotations.ts). routes/partnerApi.ts en garde une copie locale
// (« alignée sur… ») : à tenir synchronisée si ces montants changent.

export type CleOptionDeces = "200000" | "100000";

export const OPTIONS_DECES_FRAIS_MEDICAUX: Record<CleOptionDeces, { prime: number; capital: number; dureeMois: number }> = {
  "200000": { prime: 500, capital: 200_000, dureeMois: 2 },
  "100000": { prime: 300, capital: 100_000, dureeMois: 2 },
};

/** Durée (mois) de l'option Décès pour un produit donné — voir OPTIONS_DECES_FRAIS_MEDICAUX. */
export function dureeOptionDecesMois(produitCode: string): number {
  return produitCode === "relaxaccidents_fraismedicaux_livreurs" ? 1 : 2;
}
