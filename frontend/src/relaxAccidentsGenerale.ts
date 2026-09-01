// Miroir exact de backend/src/services/relaxAccidentsGenerale.ts — voir ce
// fichier pour le contexte complet de la refonte (police collective à devis
// calculé -> police individuelle à tarif fixe). Utilisé pendant la
// souscription pour afficher l'activité/les garanties/le prix sans attendre
// un aller-retour serveur ; le prix réellement facturé vient toujours de
// TarifProduit (voir GET /public/tarifs/relaxaccidents).

export type Classe = 1 | 2 | 3 | 4;
export type CycleRelaxAccidentsGenerale = "annuel" | "mensuel";
export type MoyenDeplacementRelaxAccidentsGenerale = "voiture" | "moto_tricycle" | "autres";

export interface ActiviteRelaxAccidentsGenerale {
  classe: Classe;
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

/** Identifiant de formule (TarifProduit.libelleVariante) pour une classe, un statut CNPS et une périodicité donnés. */
export function formuleRelaxAccidentsGenerale(
  classe: Classe,
  cnpsDeclare: boolean,
  cycle: CycleRelaxAccidentsGenerale
): string {
  return `${classe}_${cnpsDeclare ? "declare" : "non_declare"}_${cycle}`;
}

// Moyen de déplacement — un supplément forfaitaire s'ajoute si "Moto /
// Tricycle" est choisi, IDENTIQUE quelle que soit la classe de risque.
export const MOYENS_DEPLACEMENT_RELAXACCIDENTS_GENERALE: { valeur: MoyenDeplacementRelaxAccidentsGenerale; libelle: string }[] = [
  { valeur: "voiture", libelle: "Voiture" },
  { valeur: "moto_tricycle", libelle: "Moto / Tricycle" },
  { valeur: "autres", libelle: "Autres" },
];

export const SURCHARGE_MOTO_TRICYCLE_RELAXACCIDENTS_GENERALE: Record<CycleRelaxAccidentsGenerale, number> = {
  annuel: 1_500,
  mensuel: 150,
};

/** Supplément dû au moyen de déplacement choisi — 0 sauf pour "moto_tricycle". */
export function surchargeMoyenDeplacementRelaxAccidentsGenerale(
  moyenDeplacement: string | null | undefined,
  cycle: CycleRelaxAccidentsGenerale
): number {
  return moyenDeplacement === "moto_tricycle" ? SURCHARGE_MOTO_TRICYCLE_RELAXACCIDENTS_GENERALE[cycle] : 0;
}
