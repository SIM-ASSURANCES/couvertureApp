/**
 * Catalogue de référence des produits de la branche IMF (SECURPRO, SECURSTOCK,
 * COUPS DURS, SECURECOLTE, DÉCÈS, DÉCÈS EMPRUNTEUR, DÉCÈS PARRAINAGE) et de leurs garanties.
 *
 * Sert de gabarit au paramétrage PAR IMF (branche « IMF Partenaires », phase 2) :
 * à la création d'une IMF, une ligne `ImfProduit` est provisionnée par produit,
 * avec la liste de garanties copiée d'ici ; l'admin peut ensuite désactiver un
 * produit / une garantie ou plafonner un capital pour cette IMF précise.
 *
 * Les deux anciens codes `coupsdurs_classique` / `coupsdurs_incapacite` (fusionnés
 * dans `coupsdurs`) ne sont volontairement pas repris : plus jamais souscrits.
 */

import { CAPITAUX_PARRAINAGE } from "./decesCepeci.js";

export interface GarantieCatalogue {
  code: string;
  libelle: string;
  /** Sous-option : code de l'option (garantie) à laquelle elle se rattache — affichée sous elle. */
  parent?: string;
  /** Plafond du capital proposé par défaut (sous-options du Décès Parrainage). */
  plafondDefaut?: number;
}

/** Sous-options du Décès Parrainage (2026-11-24) : codes `<option>.<rôle>`, plafond = capital standard. */
const LIBELLES_ROLES_PARRAINAGE = {
  assure_principal: "Décès de l'assuré principal (détenteur du compte)",
  conjoint: "Décès du conjoint",
  enfant: "Décès d'un enfant",
  ascendant: "Décès d'un ascendant (père et mère du détenteur du compte)",
} as const;
function sousOptionsParrainage(option: string, roles: (keyof typeof LIBELLES_ROLES_PARRAINAGE)[]): GarantieCatalogue[] {
  return roles.map((r) => ({
    code: `${option}.${r}`,
    libelle: LIBELLES_ROLES_PARRAINAGE[r],
    parent: option,
    plafondDefaut: CAPITAUX_PARRAINAGE[r],
  }));
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
  {
    code: "deces",
    libelle: "Décès",
    aFormule: false,
    garanties: [
      { code: "standard", libelle: "Décès / IPT" },
    ],
  },
  // Produits négociés avec CEPE-CI (2026-11-17) — réservés à cette IMF, voir services/decesCepeci.ts.
  {
    code: "deces_emprunteur",
    libelle: "Décès Emprunteur",
    aFormule: false,
    garanties: [
      { code: "deces_toutes_causes", libelle: "Décès toutes causes" },
      { code: "deces_accidentel", libelle: "Décès accidentel" },
      { code: "ipt", libelle: "Invalidité Permanente Totale" },
    ],
  },
  {
    code: "deces_parrainage",
    libelle: "Décès Parrainage de Compte",
    aFormule: false,
    garanties: [
      { code: "individuelle", libelle: "Option Individuelle" },
      { code: "famille", libelle: "Option Famille" },
      ...sousOptionsParrainage("famille", ["assure_principal", "conjoint", "enfant"]),
      { code: "ascendants", libelle: "Option Assuré principal (détenteur du compte) + ascendants" },
      ...sousOptionsParrainage("ascendants", ["assure_principal", "ascendant"]),
      { code: "complete", libelle: "Option Complète" },
      ...sousOptionsParrainage("complete", ["assure_principal", "conjoint", "enfant", "ascendant"]),
    ],
  },
];

export const CODES_PRODUITS_IMF = CATALOGUE_PRODUITS_IMF.map((p) => p.code);

export function produitImfCatalogue(code: string): ProduitImfCatalogue | undefined {
  return CATALOGUE_PRODUITS_IMF.find((p) => p.code === code);
}

/** Bloc `garanties` initial d'un `ImfProduit` : toutes les garanties du catalogue, actives, plafond par défaut (souvent aucun). */
export function garantiesInitiales(code: string): { code: string; libelle: string; actif: boolean; plafond: number | null }[] {
  return (produitImfCatalogue(code)?.garanties ?? []).map((g) => ({
    code: g.code,
    libelle: g.libelle,
    actif: true,
    plafond: g.plafondDefaut ?? null,
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
