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

export type SexeSante = "masculin" | "feminin";

export interface PersonneAssureeSante {
  lien: "conjoint" | "enfant";
  nom: string;
  prenom: string;
  /** AAAA-MM-JJ */
  dateNaissance: string;
  // Fiche complète d'après le bulletin d'adhésion du 2026-10-15 (facultatifs
  // ici : les demandes antérieures n'en ont pas).
  sexe?: SexeSante;
  lieuResidence?: string;
  profession?: string;
  numeroCmu?: string;
  telephone?: string;
}

/** Saisie en cours d'une personne couverte (formulaire de souscription). */
export interface SaisiePersonneSante {
  nom: string;
  prenom: string;
  dateNaissance: string;
  sexe: SexeSante | "";
  lieuResidence: string;
  profession: string;
  numeroCmu: string;
  telephone: string;
}

export const SAISIE_PERSONNE_SANTE_VIDE: SaisiePersonneSante = {
  nom: "",
  prenom: "",
  dateNaissance: "",
  sexe: "",
  lieuResidence: "",
  profession: "",
  numeroCmu: "",
  telephone: "",
};

/** Sexe, lieu de résidence et date de naissance pour tous ; profession en plus pour le conjoint (facultative pour un enfant). */
function saisieComplete(p: SaisiePersonneSante, lien: PersonneAssureeSante["lien"]): boolean {
  return (
    !!p.nom.trim() &&
    !!p.prenom.trim() &&
    !!p.dateNaissance &&
    !!p.sexe &&
    p.lieuResidence.trim().length >= 2 &&
    (lien === "enfant" || p.profession.trim().length >= 2)
  );
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

  if (conjointDeclare && !saisieComplete(saisie.conjoint, "conjoint")) return null;
  if (enfants.some((e) => !saisieComplete(e, "enfant"))) return null;

  const nettoyer = (lien: PersonneAssureeSante["lien"], p: SaisiePersonneSante): PersonneAssureeSante => ({
    lien,
    nom: p.nom.trim(),
    prenom: p.prenom.trim(),
    dateNaissance: p.dateNaissance,
    ...(p.sexe ? { sexe: p.sexe } : {}),
    lieuResidence: p.lieuResidence.trim(),
    ...(p.profession.trim() ? { profession: p.profession.trim() } : {}),
    ...(p.numeroCmu.trim() ? { numeroCmu: p.numeroCmu.trim() } : {}),
    // Téléphone facultatif : envoyé seulement s'il est complet (+225 et 10 chiffres).
    ...(p.telephone.replace(/\D/g, "").length >= 13 ? { telephone: p.telephone.trim() } : {}),
  });
  return [
    ...(conjointDeclare ? [nettoyer("conjoint", saisie.conjoint)] : []),
    ...enfants.map((e) => nettoyer("enfant", e)),
  ];
}

// ── Questionnaire médical (bulletin d'adhésion du 2026-10-15) ────────────────
// Les questions elles-mêmes viennent du serveur (GET /public/sante/questionnaire,
// source unique : backend/src/services/assurancesSante.ts) — ce fichier n'en
// garde que les types et le contrôle de complétude, miroir de
// verifierQuestionnaireSante côté serveur (qui reste l'arbitre).

export type TypeQuestionSante = "oui_non" | "texte" | "nombre";

export interface QuestionSante {
  cle: string;
  libelle: string;
  type: TypeQuestionSante;
  /** Question réservée à un sexe : non posée aux autres personnes. */
  sexe?: SexeSante;
  /** Demandée seulement si cette question oui/non est « oui » (et alors obligatoire). */
  siOui?: string;
}

export interface RubriqueSante {
  numero: number;
  titre: string;
  questions: QuestionSante[];
}

/** Réponses d'une personne : booléen pour une question oui/non, texte sinon. */
export type ReponsesSante = Record<string, boolean | string>;

/** Questions à poser à une personne selon son sexe, dans l'ordre du bulletin. */
export function questionsApplicables(rubriques: RubriqueSante[], sexe: string | null | undefined): QuestionSante[] {
  return rubriques.flatMap((r) => r.questions).filter((q) => !q.sexe || q.sexe === sexe);
}

/** Question visible : sans condition, ou dont la question « oui/non » mère a reçu « oui ». */
export function questionDeclenchee(q: QuestionSante, reponses: ReponsesSante): boolean {
  return !q.siOui || reponses[q.siOui] === true;
}

/** Première question obligatoire restée sans réponse valide, ou `null` si la personne a tout renseigné. */
export function premiereQuestionManquante(
  rubriques: RubriqueSante[],
  sexe: string | null | undefined,
  reponses: ReponsesSante
): QuestionSante | null {
  for (const q of questionsApplicables(rubriques, sexe)) {
    if (!questionDeclenchee(q, reponses)) continue;
    const v = reponses[q.cle];
    if (q.type === "oui_non" && typeof v !== "boolean") return q;
    if (q.type === "nombre") {
      const n = typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 9) return q;
    }
    // Texte libre : obligatoire seulement quand il précise un « oui ».
    if (q.type === "texte" && q.siOui && (typeof v !== "string" || v.trim().length < 2)) return q;
  }
  return null;
}

/** Intitulé de chaque personne couverte, assuré principal en tête (même ordre que le serveur). */
export function libellesPersonnesSante(personnes: { lien: "conjoint" | "enfant" }[]): string[] {
  let enfant = 0;
  return ["Assuré principal", ...personnes.map((p) => (p.lien === "conjoint" ? "Conjoint(e)" : `Enfant ${++enfant}`))];
}
