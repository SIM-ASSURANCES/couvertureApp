/**
 * Assurances de la branche « Assurances Accidents, Dommages et Santé » —
 * valeurs possibles de `Produit.sousBranche` pour le modèle générique.
 * Source unique des vues qui portent sur TOUTE la branche (liste unifiée des
 * souscriptions, catalogue filtrable, contrats, chiffre d'affaires) : ajouter
 * une Assurance ici l'y fait apparaître partout.
 *
 * Ne remplace pas les tests explicites `=== "ASSURANCES_DOMMAGES"` des écrans
 * à deux colonnes (performance et bonus mensuel des partenaires, commissions
 * par branche), qui répartissent encore tout entre Dommages et Accidents.
 */
export const SOUS_BRANCHES_ASSURANCES = ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES", "ASSURANCES_SANTE"] as const;
export type SousBrancheAssurance = (typeof SOUS_BRANCHES_ASSURANCES)[number];

export function estSousBrancheAssurance(v: unknown): v is SousBrancheAssurance {
  return typeof v === "string" && (SOUS_BRANCHES_ASSURANCES as readonly string[]).includes(v);
}
