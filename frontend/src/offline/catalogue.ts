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
  coupsdurs: [
    { libelleVariante: "maladie", prime: 14000, capitalGaranti: 500_000 },
    { libelleVariante: "deces", prime: 4000, capitalGaranti: 500_000 },
    { libelleVariante: "plafond_500000", prime: 4000, capitalGaranti: 500_000 },
    { libelleVariante: "plafond_1000000", prime: 6000, capitalGaranti: 1_000_000 },
  ],
  securecolte: [{ libelleVariante: "pack", prime: 31300, capitalGaranti: 250_000 }],
};

export function tarifCatalogueHorsLigne(produitCode: string, libelleVariante: string): TarifCatalogue | null {
  const tarifs = CATALOGUE_HORS_LIGNE[produitCode];
  return tarifs?.find((t) => t.libelleVariante === libelleVariante) ?? null;
}

const LABEL_GARANTIE_COUPSDURS: Record<string, string> = {
  maladie: "Maladie Coups Durs",
  deces: "Décès suite à Coups Durs",
  plafond_500000: "Incapacité temporaire — plafond 500 000",
  plafond_1000000: "Incapacité temporaire — plafond 1 000 000",
};

/**
 * COUPS DURS (produit fusionné) : Maladie est incluse d'office, Décès et
 * Incapacité (un seul plafond) sont facultatifs — la prime totale est la
 * somme des garanties retenues. Miroir hors-ligne de la branche "coupsdurs"
 * de calculerDevisImf() côté serveur.
 */
export function calculerCoupsdursHorsLigne(
  deces: boolean,
  incapacite: "plafond_500000" | "plafond_1000000" | null
): { lignes: { garantie: string; capital: number; prime: number }[]; primeTTC: number } | null {
  const variantes = ["maladie", ...(deces ? ["deces"] : []), ...(incapacite ? [incapacite] : [])];
  const lignes = variantes.map((v) => {
    const t = tarifCatalogueHorsLigne("coupsdurs", v);
    if (!t) return null;
    return { garantie: LABEL_GARANTIE_COUPSDURS[v] ?? v, capital: t.capitalGaranti, prime: t.prime };
  });
  if (lignes.some((l) => l === null)) return null;
  const bonnes = lignes as { garantie: string; capital: number; prime: number }[];
  return { lignes: bonnes, primeTTC: bonnes.reduce((s, l) => s + l.prime, 0) };
}
