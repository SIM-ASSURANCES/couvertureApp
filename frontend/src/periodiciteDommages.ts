// Périodicité de la prime des produits Assurances Dommages (SecurHome,
// SecurHome+, SecurPro, SecurMoto) — décision du 2026-10-16 : le souscripteur
// choisit OBLIGATOIREMENT entre « Annuelle » et « Mensuelle ». Les barèmes
// donnent la prime ANNUELLE ; la prime mensuelle est la prime annuelle ÷ 10
// (et non ÷ 12), pour chaque produit.
//
// Miroir de backend/src/services/periodiciteDommages.ts — à garder
// synchronisé. Le serveur recalcule toujours la prime : ce miroir ne sert qu'à
// l'aperçu avant paiement.

export type CycleDommages = "annuel" | "mensuel";

/** Prime mensuelle = prime annuelle ÷ 10. */
export const DIVISEUR_PRIME_MENSUELLE = 10;

export const PRODUITS_DOMMAGES_PERIODICITE = ["securhome", "securhome_dommages", "securpro_dommages", "securmoto"] as const;

export function estProduitDommagesAvecPeriodicite(code?: string | null): boolean {
  return !!code && (PRODUITS_DOMMAGES_PERIODICITE as readonly string[]).includes(code);
}

/** Prime d'une période mensuelle, en FCFA entiers. */
export function primeMensuelle(primeAnnuelle: number): number {
  return Math.round(primeAnnuelle / DIVISEUR_PRIME_MENSUELLE);
}

/** Prime à payer selon la périodicité choisie ; `null` tant que rien n'est choisi ou que la prime n'est pas calculable. */
export function primeSelonPeriodicite(primeAnnuelle: number | null, cycle: "" | CycleDommages): number | null {
  if (primeAnnuelle == null || cycle === "") return null;
  return cycle === "mensuel" ? primeMensuelle(primeAnnuelle) : primeAnnuelle;
}

export function libellePeriodicite(cycle: CycleDommages): string {
  return cycle === "mensuel" ? "Mensuelle" : "Annuelle";
}
