/**
 * Valeurs de départ des barèmes / tarifs IMF, utilisées pour provisionner une
 * IMF partenaire (branche « IMF Partenaires », phase 2b) quand les tables
 * globales correspondantes sont vides. En fonctionnement normal le provisioning
 * copie les valeurs *live* des tables globales (BaremeSecurpro, BaremeSecurstock,
 * PalierSecurecolte, TarifProduit) — éventuellement déjà ajustées par un admin
 * depuis la branche « Assurances IMF » — et ne retombe ici qu'en dernier ressort.
 *
 * Source : dossier TARIFS (voir backend/src/seed.ts::seedTarificationImf).
 */

export const SECURPRO_DEFAUT = [
  { classe: 1, limiteCapital: 50_000_000, tauxIncendie: 0.00072, tauxCommission: 0.2 },
  { classe: 2, limiteCapital: 40_000_000, tauxIncendie: 0.000864, tauxCommission: 0.2 },
  { classe: 3, limiteCapital: 30_000_000, tauxIncendie: 0.0010368, tauxCommission: 0.2 },
  { classe: 4, limiteCapital: 20_000_000, tauxIncendie: 0.00124416, tauxCommission: 0.2 },
];

export const SECURSTOCK_DEFAUT = [
  { classe: 1, limiteCapital: 20_000_000, tauxDommageElectrique: 0.0014, tauxAutreCause: 0.001, tauxCommission: 0.2 },
  { classe: 2, limiteCapital: 15_000_000, tauxDommageElectrique: 0.0019, tauxAutreCause: 0.001, tauxCommission: 0.2 },
  { classe: 3, limiteCapital: 10_000_000, tauxDommageElectrique: 0.0024, tauxAutreCause: 0.0013, tauxCommission: 0.2 },
  { classe: 4, limiteCapital: 5_000_000, tauxDommageElectrique: 0.0034, tauxAutreCause: 0.0017, tauxCommission: 0.2 },
];

export const PALIERS_SECURECOLTE_DEFAUT = [
  { seuil: "forte", pourcentageIndice: 0.75, montantIndemnite: 100_000 },
  { seuil: "moyenne", pourcentageIndice: 0.85, montantIndemnite: 50_000 },
  { seuil: "faible", pourcentageIndice: 0.95, montantIndemnite: 10_000 },
];

export interface TarifFixeDefaut {
  produitCode: "coupsdurs" | "securecolte";
  libelleVariante: string;
  prime: number;
  primeHT?: number;
  fg?: number;
  taxes?: number;
  capitalGaranti: number;
  commission: number;
}

export const TARIFS_FIXES_DEFAUT: TarifFixeDefaut[] = [
  { produitCode: "coupsdurs", libelleVariante: "maladie", prime: 14000, capitalGaranti: 500_000, commission: 0.1 },
  { produitCode: "coupsdurs", libelleVariante: "deces", prime: 4000, capitalGaranti: 500_000, commission: 0.1 },
  { produitCode: "coupsdurs", libelleVariante: "plafond_500000", prime: 4000, primeHT: 3229, fg: 1500, taxes: 271, capitalGaranti: 500_000, commission: 0.1 },
  { produitCode: "coupsdurs", libelleVariante: "plafond_1000000", prime: 6000, primeHT: 5094, fg: 1500, taxes: 406, capitalGaranti: 1_000_000, commission: 0.1 },
  { produitCode: "securecolte", libelleVariante: "pack", prime: 31300, capitalGaranti: 250_000, commission: 0.22 },
];

/** Produits IMF à prix fixe (par opposition aux produits à formule SECURPRO/SECURSTOCK). */
export const PRODUITS_TARIF_FIXE_IMF = ["coupsdurs", "securecolte"] as const;
