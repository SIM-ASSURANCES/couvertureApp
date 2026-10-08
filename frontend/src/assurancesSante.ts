// Assurances Santé (2026-10-08) — Solo, Duo, Famille. Miroir de
// backend/src/services/assurancesSante.ts, qui fait foi : le serveur revalide
// les personnes couvertes et recalcule toujours le prix et le taux de prise en
// charge à partir de la formule en base. À garder synchronisés.

export const PRODUITS_SANTE = ["sante_solo", "sante_duo", "sante_famille"] as const;
export type ProduitSante = (typeof PRODUITS_SANTE)[number];

export function estProduitSante(code?: string | null): code is ProduitSante {
  return !!code && (PRODUITS_SANTE as readonly string[]).includes(code);
}

/** Durée du contrat (et de chaque renouvellement), en mois. */
export const DUREE_CONTRAT_SANTE_MOIS = 12;

/** Délai de remise de la carte physique de prise en charge par SIM Assurances, après paiement. */
export const DELAI_CARTE_PHYSIQUE_JOURS = 7;

// `libelle` est le nom court affiché au client une fois dans « Assurances
// Santé » (en base le produit s'appelle « Santé Solo », etc., pour rester
// lisible sur les factures et dans les listes d'administration).
export const COMPOSITION_SANTE: Record<
  ProduitSante,
  { libelle: string; pictogramme: string; personnes: number; description: string; conjoint: "aucun" | "requis"; enfantsMax: number }
> = {
  sante_solo: { libelle: "Solo", pictogramme: "👤", personnes: 1, description: "1 personne", conjoint: "aucun", enfantsMax: 0 },
  sante_duo: { libelle: "Duo", pictogramme: "👫", personnes: 2, description: "2 personnes — couple", conjoint: "requis", enfantsMax: 0 },
  sante_famille: {
    libelle: "Famille",
    pictogramme: "👨‍👩‍👧‍👦",
    personnes: 5,
    description: "5 personnes — couple + 3 enfants",
    // Conjoint obligatoire pour Famille aussi (décision du 2026-10-08).
    conjoint: "requis",
    enfantsMax: 3,
  },
};

/** Garanties, identiques pour toutes les formules : seul le taux de prise en charge change. */
export const GARANTIES_SANTE: { rubrique: string; actes: string[] }[] = [
  {
    rubrique: "Diagnostic",
    actes: ["Consultation généraliste", "Consultation spécialiste", "Radiologie & imagerie", "Analyses biologiques"],
  },
  {
    rubrique: "Produits pharmaceutiques et soins",
    actes: [
      "Frais pharmaceutiques & produits",
      "AMI (Actes médicaux infirmiers)",
      "Soins dentaires courants",
      "Verres & monture",
    ],
  },
  {
    rubrique: "Hospitalisation",
    actes: ["Hospitalisation médicale", "Hospitalisation chirurgicale", "Petite chirurgie ambulatoire"],
  },
];

export interface PersonneAssureeSante {
  lien: "conjoint" | "enfant";
  nom: string;
  prenom: string;
  /** AAAA-MM-JJ */
  dateNaissance: string;
}

/** Saisie en cours d'une personne couverte (formulaire de souscription). */
export interface SaisiePersonneSante {
  nom: string;
  prenom: string;
  dateNaissance: string;
}

export const SAISIE_PERSONNE_SANTE_VIDE: SaisiePersonneSante = { nom: "", prenom: "", dateNaissance: "" };

function saisieComplete(p: SaisiePersonneSante): boolean {
  return !!p.nom.trim() && !!p.prenom.trim() && !!p.dateNaissance;
}

/**
 * Personnes couvertes en plus du souscripteur, telles qu'envoyées au serveur —
 * ou `null` tant que la saisie ne correspond pas au produit (conjoint manquant
 * pour un Duo ou une Famille, fiche d'enfant incomplète…).
 */
export function personnesAssureesSante(
  produit: ProduitSante,
  saisie: { conjoint: SaisiePersonneSante; enfants: SaisiePersonneSante[] }
): PersonneAssureeSante[] | null {
  const regle = COMPOSITION_SANTE[produit];
  const conjointDeclare = regle.conjoint === "requis";
  const enfants = saisie.enfants.slice(0, regle.enfantsMax);

  if (conjointDeclare && !saisieComplete(saisie.conjoint)) return null;
  if (enfants.some((e) => !saisieComplete(e))) return null;

  const nettoyer = (lien: PersonneAssureeSante["lien"], p: SaisiePersonneSante): PersonneAssureeSante => ({
    lien,
    nom: p.nom.trim(),
    prenom: p.prenom.trim(),
    dateNaissance: p.dateNaissance,
  });
  return [
    ...(conjointDeclare ? [nettoyer("conjoint", saisie.conjoint)] : []),
    ...enfants.map((e) => nettoyer("enfant", e)),
  ];
}
