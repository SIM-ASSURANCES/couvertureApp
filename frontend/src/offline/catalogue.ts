/**
 * Tarifs catalogue (COUPS DURS / SECURECOLTE) pour le mode hors-ligne.
 * Ces produits sont à prime fixe (pas de moteur de calcul) : la table
 * ci-dessous est une copie figée des valeurs de référence semées côté
 * serveur (backend/src/seed.ts). Si ces tarifs évoluent un jour, cette
 * table doit être mise à jour manuellement — elle ne se synchronise pas
 * automatiquement, contrairement aux barèmes SECURPRO/SECURSTOCK.
 */
export interface TarifCatalogue {
  libelleVariante: string;
  prime: number;
  capitalGaranti: number;
}

export const CATALOGUE_HORS_LIGNE: Record<string, TarifCatalogue[]> = {
  coupsdurs_classique: [
    { libelleVariante: "maladie", prime: 14000, capitalGaranti: 500_000 },
    { libelleVariante: "deces", prime: 4000, capitalGaranti: 500_000 },
  ],
  coupsdurs_incapacite: [
    { libelleVariante: "plafond_500000", prime: 4000, capitalGaranti: 500_000 },
    { libelleVariante: "plafond_1000000", prime: 6000, capitalGaranti: 1_000_000 },
  ],
  securecolte: [{ libelleVariante: "pack", prime: 31300, capitalGaranti: 250_000 }],
};

export function tarifCatalogueHorsLigne(produitCode: string, libelleVariante: string): TarifCatalogue | null {
  const tarifs = CATALOGUE_HORS_LIGNE[produitCode];
  return tarifs?.find((t) => t.libelleVariante === libelleVariante) ?? null;
}
