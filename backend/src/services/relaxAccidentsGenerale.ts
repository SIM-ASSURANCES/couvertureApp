// RelaxAccidents générale — refonte 2026-08-31 : passage d'une police
// collective à devis calculé dynamiquement (entreprise, effectif, montants
// choisis par garantie) à une police INDIVIDUELLE à tarif fixe, comme les
// autres produits Accidents (RelaxMoto, RelaxAuto, RelaxAccidents Frais
// Médicaux, RelaxVoyage). Le prospect choisit :
//   1. son activité (4 choix, chacun rattaché à une classe de risque 1 à 4) ;
//   2. s'il est déclaré CNPS ou non (retire/ajoute l'Indemnité Journalière) ;
//   3. (2026-09-01) la périodicité de la prime — annuelle ou mensuelle,
//      chacune à son propre tarif (la mensuelle n'est jamais l'annuelle
//      divisée par 12, ce sont deux barèmes indépendants — même principe que
//      RelaxMoto/RelaxAuto).
// Ces trois choix déterminent une formule fixe (TarifProduit.libelleVariante,
// voir formuleRelaxAccidentsGenerale ci-dessous) — 16 formules au total,
// éditables depuis l'admin (page Tarifs, comme RelaxMoto/RelaxVoyage). Les
// garanties elles-mêmes (hors prix) ne dépendent que du GROUPE de classe
// (1-2 ou 3-4), pas de la classe précise ni de la périodicité — voir
// garantiesRelaxAccidentsGenerale.
//
// Contrairement à RelaxMoto/RelaxAuto, ce n'est PAS un abonnement : une seule
// échéance payée à la souscription (comme les autres produits à formule),
// couvrant 1 mois ou 1 an selon la périodicité choisie ; le renouvellement se
// fait ensuite via la relance admin, comme RelaxAccidents Frais Médicaux
// (voir services/paiementWave.ts::dureeFormuleMois).
//
// Miroir exact de frontend/src/relaxAccidentsGenerale.ts (aperçu pendant la
// souscription) — à garder synchronisé si ces montants changent.

export type Classe = 1 | 2 | 3 | 4;
export type CycleRelaxAccidentsGenerale = "annuel" | "mensuel";
export type MoyenDeplacementRelaxAccidentsGenerale = "voiture" | "moto_tricycle" | "autres";

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

/** Identifiant de formule (TarifProduit.libelleVariante) pour une classe, un statut CNPS et une périodicité donnés. */
export function formuleRelaxAccidentsGenerale(
  classe: Classe,
  cnpsDeclare: boolean,
  cycle: CycleRelaxAccidentsGenerale
): string {
  return `${classe}_${cnpsDeclare ? "declare" : "non_declare"}_${cycle}`;
}

/** Inverse de formuleRelaxAccidentsGenerale — `null` si la chaîne ne correspond à aucune formule valide. */
export function parseFormuleRelaxAccidentsGenerale(
  formule: string
): { classe: Classe; cnpsDeclare: boolean; cycle: CycleRelaxAccidentsGenerale } | null {
  const m = /^([1-4])_(declare|non_declare)_(annuel|mensuel)$/.exec(formule);
  if (!m) return null;
  return { classe: Number(m[1]) as Classe, cnpsDeclare: m[2] === "declare", cycle: m[3] as CycleRelaxAccidentsGenerale };
}

// Moyen de déplacement (2026-09-01) — question posée juste après le secteur
// d'activité. Un moyen "Moto / Tricycle" ajoute un supplément forfaitaire à
// la prime, IDENTIQUE quelle que soit la classe de risque, contrairement au
// reste de la tarification qui varie par classe — voiture/autres n'ajoutent
// rien.
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
