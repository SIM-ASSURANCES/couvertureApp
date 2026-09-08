/**
 * Catalogue de référence des produits de la branche IMF (SECURPRO, SECURSTOCK,
 * COUPS DURS, SECURECOLTE) et de leurs garanties.
 *
 * Sert de gabarit au paramétrage PAR IMF (branche « IMF Partenaires », phase 2) :
 * à la création d'une IMF, une ligne `ImfProduit` est provisionnée par produit,
 * avec la liste de garanties copiée d'ici ; l'admin peut ensuite désactiver un
 * produit / une garantie ou plafonner un capital pour cette IMF précise.
 *
 * Les deux anciens codes `coupsdurs_classique` / `coupsdurs_incapacite` (fusionnés
 * dans `coupsdurs`) ne sont volontairement pas repris : plus jamais souscrits.
 */

export interface GarantieCatalogue {
  code: string;
  libelle: string;
}

export interface ProduitImfCatalogue {
  code: string;
  libelle: string;
  /** true = tarif issu d'un barème à formule (SECURPRO/SECURSTOCK) ; false = prix fixe en catalogue. */
  aFormule: boolean;
  garanties: GarantieCatalogue[];
}

export const CATALOGUE_PRODUITS_IMF: ProduitImfCatalogue[] = [
  {
    code: "securpro",
    libelle: "SECURPRO",
    aFormule: true,
    garanties: [
      { code: "incendie", libelle: "Incendie / explosion" },
      { code: "vol", libelle: "Vol (contenu & caisse)" },
      { code: "degat_eaux", libelle: "Dégât des eaux" },
      { code: "dommages_electriques", libelle: "Dommages électriques" },
      { code: "bris_glace", libelle: "Bris de glace" },
    ],
  },
  {
    code: "securstock",
    libelle: "SECURSTOCK",
    aFormule: true,
    garanties: [
      { code: "package", libelle: "Package Securstock (incendie du stock nanti)" },
    ],
  },
  {
    code: "coupsdurs",
    libelle: "Coups Durs",
    aFormule: false,
    garanties: [
      { code: "maladie", libelle: "Frais médicaux (maladie / accident)" },
      { code: "deces", libelle: "Décès" },
      { code: "plafond_500000", libelle: "Incapacité temporaire — plafond 500 000" },
      { code: "plafond_1000000", libelle: "Incapacité temporaire — plafond 1 000 000" },
    ],
  },
  {
    code: "securecolte",
    libelle: "SECURECOLTE",
    aFormule: false,
    garanties: [
      { code: "secheresse", libelle: "Sécheresse (paliers indice ARC)" },
      { code: "deces", libelle: "Décès de l'exploitant" },
    ],
  },
];

export const CODES_PRODUITS_IMF = CATALOGUE_PRODUITS_IMF.map((p) => p.code);

export function produitImfCatalogue(code: string): ProduitImfCatalogue | undefined {
  return CATALOGUE_PRODUITS_IMF.find((p) => p.code === code);
}

/** Bloc `garanties` initial d'un `ImfProduit` : toutes les garanties du catalogue, actives, sans plafond. */
export function garantiesInitiales(code: string): { code: string; libelle: string; actif: boolean; plafond: number | null }[] {
  return (produitImfCatalogue(code)?.garanties ?? []).map((g) => ({
    code: g.code,
    libelle: g.libelle,
    actif: true,
    plafond: null,
  }));
}

/**
 * Documents paramétrables par IMF (phase 2c). Une IMF peut personnaliser le
 * HTML de chacun ; sinon le rendu retombe sur le document de la branche
 * (câblage phase 3). Mêmes principes que CLES_CONDITIONS_GENERALES.
 */
export const DOCUMENTS_IMF = [
  { cle: "conditions_generales", libelle: "Conditions Générales" },
  { cle: "notice_information", libelle: "Notice d'information (IPID)" },
  { cle: "attestation", libelle: "Mentions de l'attestation / police" },
] as const;

export const CLES_DOCUMENTS_IMF = DOCUMENTS_IMF.map((d) => d.cle);

export function documentImfCatalogue(cle: string): (typeof DOCUMENTS_IMF)[number] | undefined {
  return DOCUMENTS_IMF.find((d) => d.cle === cle);
}
