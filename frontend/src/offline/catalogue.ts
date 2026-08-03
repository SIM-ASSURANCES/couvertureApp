/**
 * Tarifs catalogue (COUPS DURS) pour le mode hors-ligne. Prix fixe (pas de
 * moteur de calcul) : la table ci-dessous est une copie figée des valeurs de
 * référence semées côté serveur (backend/src/seed.ts). Si ces tarifs
 * évoluent un jour, cette table doit être mise à jour manuellement — elle ne
 * se synchronise pas automatiquement, contrairement aux barèmes
 * SECURPRO/SECURSTOCK. SECURECOLTE n'est plus ici : voir
 * calculerSecurecolteHorsLigne (formule, pas de catalogue).
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
};

// Fréquences de déclenchement — modèle ARC (sécheresse) et TD CIMA 45 ans (décès).
const FREQ_FAIBLE = 0.1307; // p
const FREQ_MOYENNE = 0.0366; // q
const FREQ_FORTE = 0.0043; // r
const FREQ_DECES = 0.0053; // s
const CHARGEMENT_DISTRIBUTION = 0.22; // g
const MARGE_FRAIS_ASSUREUR = 0.4; // h
const TAXE_SECHERESSE = 0.0725; // k

export interface ResultatSecurecolte {
  capitalFaible: number;
  capitalMoyenne: number;
  capitalForte: number;
  capitalDeces: number;
  primeTTC: number;
}

/**
 * SECURECOLTE (modèle actuariel ARC) : miroir hors-ligne exact de
 * calculerSecurecolte() côté serveur (backend/src/services/tarificationImf.ts).
 * 1 hectare = 1 pack — le résultat est déjà mis à l'échelle de la superficie.
 */
export function calculerSecurecolteHorsLigne(valeurPackage: number, superficieHa: number): ResultatSecurecolte {
  const a = 0.2 * valeurPackage;
  const b = 0.5 * valeurPackage;
  const c = valeurPackage;
  const d = c;

  const e = FREQ_FAIBLE * a + FREQ_MOYENNE * (b - a) + FREQ_FORTE * (c - b);
  const f = FREQ_DECES * c;

  const denom = 1 - CHARGEMENT_DISTRIBUTION - MARGE_FRAIS_ASSUREUR;
  const i = e / denom;
  const j = f / denom;
  const l = i * (1 + TAXE_SECHERESSE) + j;

  const vente = (Math.round((l / 1000) * 10) / 10 + 0.1) * 1000;

  return {
    capitalFaible: Math.round(a * superficieHa),
    capitalMoyenne: Math.round(b * superficieHa),
    capitalForte: Math.round(c * superficieHa),
    capitalDeces: Math.round(d * superficieHa),
    primeTTC: Math.round(vente * superficieHa),
  };
}

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
  incapacite: "plafond_500000" | "plafond_1000000" | null,
  dureeMois: number = 12
): { lignes: { garantie: string; capital: number; prime: number }[]; primeTTC: number } | null {
  const variantes = ["maladie", ...(deces ? ["deces"] : []), ...(incapacite ? [incapacite] : [])];
  const lignes = variantes.map((v) => {
    const t = tarifCatalogueHorsLigne("coupsdurs", v);
    if (!t) return null;
    // Prorata linéaire sur la durée choisie (1-12 mois) — miroir exact du
    // calcul serveur (calculerDevisImf).
    const prime = Math.round((t.prime * dureeMois) / 12);
    return { garantie: LABEL_GARANTIE_COUPSDURS[v] ?? v, capital: t.capitalGaranti, prime };
  });
  if (lignes.some((l) => l === null)) return null;
  const bonnes = lignes as { garantie: string; capital: number; prime: number }[];
  return { lignes: bonnes, primeTTC: bonnes.reduce((s, l) => s + l.prime, 0) };
}
