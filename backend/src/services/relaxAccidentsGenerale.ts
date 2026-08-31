// RelaxAccidents générale — refonte 2026-08-31 : passage d'une police
// collective à devis calculé dynamiquement (entreprise, effectif, montants
// choisis par garantie) à une police INDIVIDUELLE à tarif fixe, comme les
// autres produits Accidents (RelaxMoto, RelaxAuto, RelaxAccidents Frais
// Médicaux, RelaxVoyage). Le prospect choisit :
//   1. son activité (4 choix, chacun rattaché à une classe de risque 1 à 4) ;
//   2. s'il est déclaré CNPS ou non (retire/ajoute l'Indemnité Journalière).
// Ces deux choix déterminent une formule fixe (TarifProduit.libelleVariante,
// voir formuleRelaxAccidentsGenerale ci-dessous) — 8 formules au total,
// éditables depuis l'admin (page Tarifs, comme RelaxMoto/RelaxVoyage). Les
// garanties elles-mêmes (hors prix) ne dépendent que du GROUPE de classe
// (1-2 ou 3-4), pas de la classe précise — voir garantiesRelaxAccidentsGenerale.
//
// Miroir exact de frontend/src/relaxAccidentsGenerale.ts (aperçu pendant la
// souscription) — à garder synchronisé si ces montants changent.

export type Classe = 1 | 2 | 3 | 4;

export interface ActiviteRelaxAccidentsGenerale {
  classe: Classe;
  // Déjà sans le préfixe "Classe X :" — affiché tel quel au souscripteur.
  libelle: string;
}

export const ACTIVITES_RELAXACCIDENTS_GENERALE: ActiviteRelaxAccidentsGenerale[] = [
  {
    classe: 1,
    libelle:
      "Bureau et commerce sans manutention (Fonctionnaire, employé de bureau, enseignant, commerçant en boutique, gérant de maquis ou de cabine, pharmacien, avocat)",
  },
  {
    classe: 2,
    libelle:
      "Petit commerce et artisanat sans outils dangereux (Commerçant ambulant, vendeur au marché, tailleur, coiffeur, cordonnier, boulanger, chauffeur, agent commercial)",
  },
  {
    classe: 3,
    libelle:
      "Agriculture, transport et métiers manuels avec engins (Planteur (cacao, café, hévéa, palmier), éleveur, mécanicien, électricien, ouvrier d'usine, vigile)",
  },
  {
    classe: 4,
    libelle: "Chantier et métiers à haut risque (Maçon et ouvrier BTP, charpentier, menuisier, boucher, docker, pompier, forces de l'ordre)",
  },
];

/** Indemnité Journalière — uniquement pour un souscripteur NON déclaré CNPS, quelle que soit sa classe. */
export const INDEMNITE_JOURNALIERE_RELAXACCIDENTS_GENERALE = {
  montant: 3_500,
  dureeMaxJours: 30,
  carenceJours: 3,
} as const;

export interface GarantiesRelaxAccidentsGenerale {
  fraisMedicaux: number;
  invaliditePermanenteTotale: number;
  decesNonAccidentel: number;
  decesAccidentel: number;
}

// Les garanties (hors IJ) ne dépendent que du groupe de classe, identiques
// que le souscripteur soit déclaré CNPS ou non — seul le prix (voir
// PRIX_RELAXACCIDENTS_GENERALE, seed.ts) varie par classe précise ET par
// statut CNPS.
const GARANTIES_PAR_GROUPE: Record<"bas" | "haut", GarantiesRelaxAccidentsGenerale> = {
  bas: { fraisMedicaux: 300_000, invaliditePermanenteTotale: 1_000_000, decesNonAccidentel: 500_000, decesAccidentel: 1_000_000 },
  haut: { fraisMedicaux: 250_000, invaliditePermanenteTotale: 500_000, decesNonAccidentel: 250_000, decesAccidentel: 500_000 },
};

/** Classes 1 et 2 = groupe "bas" risque, classes 3 et 4 = groupe "haut" risque. */
export function groupeClasseRelaxAccidentsGenerale(classe: Classe): "bas" | "haut" {
  return classe <= 2 ? "bas" : "haut";
}

export function garantiesRelaxAccidentsGenerale(classe: Classe): GarantiesRelaxAccidentsGenerale {
  return GARANTIES_PAR_GROUPE[groupeClasseRelaxAccidentsGenerale(classe)];
}

/** Identifiant de formule (TarifProduit.libelleVariante) pour une classe et un statut CNPS donnés. */
export function formuleRelaxAccidentsGenerale(classe: Classe, cnpsDeclare: boolean): string {
  return `${classe}_${cnpsDeclare ? "declare" : "non_declare"}`;
}

/** Inverse de formuleRelaxAccidentsGenerale — `null` si la chaîne ne correspond à aucune formule valide. */
export function parseFormuleRelaxAccidentsGenerale(formule: string): { classe: Classe; cnpsDeclare: boolean } | null {
  const m = /^([1-4])_(declare|non_declare)$/.exec(formule);
  if (!m) return null;
  return { classe: Number(m[1]) as Classe, cnpsDeclare: m[2] === "declare" };
}
