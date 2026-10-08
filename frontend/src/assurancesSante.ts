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

// ── Fiche de l'assuré principal (formulaire de demande) ──
// Miroir de ficheSanteSchema côté serveur, qui revalide tout. Poids, taille,
// tension et groupe sanguin sont des données de santé : elles ne sont montrées
// qu'à l'admin qui valide la demande.

export const AGE_MIN_ASSURE_PRINCIPAL = 15;
export const AGE_MAX_ASSURE_PRINCIPAL = 65;

export const SITUATIONS_MATRIMONIALES = [
  { valeur: "celibataire", libelle: "Célibataire" },
  { valeur: "marie", libelle: "Marié(e)" },
  { valeur: "divorce", libelle: "Divorcé(e)" },
  { valeur: "veuf", libelle: "Veuf / Veuve" },
  { valeur: "union_libre", libelle: "Union libre" },
] as const;
export type SituationMatrimoniale = (typeof SITUATIONS_MATRIMONIALES)[number]["valeur"];

export const GROUPES_SANGUINS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "inconnu"] as const;
export type GroupeSanguin = (typeof GROUPES_SANGUINS)[number];
export const libelleGroupeSanguin = (g: string) => (g === "inconnu" ? "Je ne connais pas mon groupe" : g);
export const libelleSituationMatrimoniale = (s: string) =>
  SITUATIONS_MATRIMONIALES.find((x) => x.valeur === s)?.libelle ?? s;

export interface FicheSante {
  profession: string;
  lieuResidence: string;
  numeroCmu?: string;
  situationMatrimoniale: SituationMatrimoniale;
  poidsKg: number;
  tailleCm: number;
  tensionArterielle: string;
  groupeSanguin: GroupeSanguin;
}

/** Saisie en cours de la fiche (tout en texte, comme les champs du formulaire). */
export interface SaisieFicheSante {
  profession: string;
  lieuResidence: string;
  numeroCmu: string;
  email: string;
  situationMatrimoniale: SituationMatrimoniale | "";
  poidsKg: string;
  tailleCm: string;
  tensionArterielle: string;
  groupeSanguin: GroupeSanguin | "";
}

export const SAISIE_FICHE_SANTE_VIDE: SaisieFicheSante = {
  profession: "",
  lieuResidence: "",
  numeroCmu: "",
  email: "",
  situationMatrimoniale: "",
  poidsKg: "",
  tailleCm: "",
  tensionArterielle: "",
  groupeSanguin: "",
};

/** Tension « systolique/diastolique » (ex. 120/80), dans des bornes physiologiquement possibles. */
export function tensionArterielleValide(valeur: string): boolean {
  const m = /^(\d{2,3})\/(\d{2,3})$/.exec(valeur.trim());
  if (!m) return false;
  const systolique = Number(m[1]);
  const diastolique = Number(m[2]);
  return systolique >= 60 && systolique <= 300 && diastolique >= 30 && diastolique <= 200 && systolique > diastolique;
}

/** Âge révolu aujourd'hui pour une date AAAA-MM-JJ — `null` si la date est vide ou invalide. */
export function ageRevolu(dateNaissance: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateNaissance);
  if (!m) return null;
  const a = new Date();
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const anniversairePasse = a.getMonth() > mois || (a.getMonth() === mois && a.getDate() >= jour);
  return a.getFullYear() - annee - (anniversairePasse ? 0 : 1);
}

export function ageAssurePrincipalValide(dateNaissance: string): boolean {
  const age = ageRevolu(dateNaissance);
  return age != null && age >= AGE_MIN_ASSURE_PRINCIPAL && age <= AGE_MAX_ASSURE_PRINCIPAL;
}

/** Email facultatif : vide accepté, sinon forme minimale d'une adresse. */
export function emailFacultatifValide(email: string): boolean {
  return !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Fiche prête à envoyer, ou `null` tant qu'un champ obligatoire manque ou est hors bornes. */
export function ficheSanteDepuisSaisie(s: SaisieFicheSante): FicheSante | null {
  const poidsKg = Number(s.poidsKg.replace(",", "."));
  const tailleCm = Number(s.tailleCm.replace(",", "."));
  if (s.profession.trim().length < 2 || s.lieuResidence.trim().length < 2) return null;
  if (!s.situationMatrimoniale || !s.groupeSanguin) return null;
  if (!s.poidsKg.trim() || !(poidsKg >= 20 && poidsKg <= 300)) return null;
  if (!s.tailleCm.trim() || !(tailleCm >= 80 && tailleCm <= 250)) return null;
  if (!tensionArterielleValide(s.tensionArterielle)) return null;
  return {
    profession: s.profession.trim(),
    lieuResidence: s.lieuResidence.trim(),
    ...(s.numeroCmu.trim() ? { numeroCmu: s.numeroCmu.trim() } : {}),
    situationMatrimoniale: s.situationMatrimoniale,
    poidsKg,
    tailleCm,
    tensionArterielle: s.tensionArterielle.trim(),
    groupeSanguin: s.groupeSanguin,
  };
}

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
