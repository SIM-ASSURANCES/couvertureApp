// Assurances Santé (2026-10-08) — trois produits à formule fixe (Solo, Duo,
// Famille) bâtis sur le modèle générique Produit/TarifProduit/Souscription,
// comme SecurHome : le prix d'une formule vit dans TarifProduit, la route
// POST /public/souscriptions/:produit/initiate-formule fait le reste.
//
// Ce fichier est la source unique de ce qui est propre à la Santé : codes des
// produits, composition du foyer couvert, formules d'origine (pour le seed),
// garanties et durée du contrat. Fonctions pures uniquement (pas d'accès
// Prisma). Miroir côté client : frontend/src/assurancesSante.ts.

import { z } from "zod";

export const SOUS_BRANCHE_SANTE = "ASSURANCES_SANTE";

export const PRODUITS_SANTE = ["sante_solo", "sante_duo", "sante_famille"] as const;
export type ProduitSante = (typeof PRODUITS_SANTE)[number];

export function estProduitSante(code: string): code is ProduitSante {
  return (PRODUITS_SANTE as readonly string[]).includes(code);
}

/** Durée du contrat et de chacun de ses renouvellements (voir paiementWave.ts::dureeFormuleMois). */
export const DUREE_CONTRAT_SANTE_MOIS = 12;

/** Délai annoncé au client pour la remise de sa carte physique de prise en charge, après paiement. */
export const DELAI_CARTE_PHYSIQUE_JOURS = 7;

/**
 * Une souscription Santé n'est jamais payée directement : le client dépose une
 * demande, un admin la valide (le lien de paiement Wave part alors par SMS) ou
 * la refuse. Valeurs de `Souscription.validationStatut` — `null` pour les
 * autres produits.
 */
export const VALIDATION_SANTE = { EN_ATTENTE: "en_attente", VALIDEE: "validee", REFUSEE: "refusee" } as const;

/** Vrai si une souscription soumise à validation n'a pas (encore) été validée : aucun paiement ne doit alors aboutir. */
export function paiementBloqueParValidation(validationStatut: string | null | undefined): boolean {
  return !!validationStatut && validationStatut !== VALIDATION_SANTE.VALIDEE;
}

/**
 * Qui est couvert, en plus du souscripteur. Solo : personne. Duo : le conjoint.
 * Famille : le conjoint (obligatoire lui aussi — décision du 2026-10-08, pas
 * de parent seul) et jusqu'à trois enfants.
 */
// `libelle` est le nom court (Solo, Duo, Famille), affiché là où le contexte
// « Assurances Santé » est déjà donné ; `libelleProduit` est le nom enregistré
// en base (Produit.libelle), lu partout ailleurs — factures, listes
// d'administration, notifications — où « Famille » seul ne dirait pas de quoi
// il s'agit.
export const COMPOSITION_SANTE: Record<
  ProduitSante,
  {
    libelle: string;
    libelleProduit: string;
    ordre: number;
    personnes: number;
    description: string;
    conjoint: "aucun" | "requis";
    enfantsMax: number;
  }
> = {
  sante_solo: { libelle: "Solo", libelleProduit: "Santé Solo", ordre: 0, personnes: 1, description: "1 personne", conjoint: "aucun", enfantsMax: 0 },
  sante_duo: { libelle: "Duo", libelleProduit: "Santé Duo", ordre: 1, personnes: 2, description: "2 personnes — couple", conjoint: "requis", enfantsMax: 0 },
  sante_famille: {
    libelle: "Famille",
    libelleProduit: "Santé Famille",
    ordre: 2,
    personnes: 5,
    description: "5 personnes — couple + 3 enfants",
    conjoint: "requis",
    enfantsMax: 3,
  },
};

/**
 * Formules d'origine (tableau fourni le 2026-10-08), servies au seed. `cle` est
 * l'identifiant stable de la formule (TarifProduit.libelleVariante) : il ne
 * porte pas le prix, que l'admin peut modifier ensuite. Famille compte trois
 * formules à 80 % qui ne se distinguent, à ce jour, que par leur prix.
 */
export const FORMULES_SANTE: Record<ProduitSante, { cle: string; prime: number; tauxPriseEnCharge: number }[]> = {
  sante_solo: [
    { cle: "70", prime: 74_500, tauxPriseEnCharge: 70 },
    { cle: "80", prime: 101_000, tauxPriseEnCharge: 80 },
  ],
  sante_duo: [
    { cle: "70", prime: 146_000, tauxPriseEnCharge: 70 },
    { cle: "80", prime: 199_000, tauxPriseEnCharge: 80 },
  ],
  sante_famille: [
    { cle: "70", prime: 260_000, tauxPriseEnCharge: 70 },
    { cle: "80", prime: 354_000, tauxPriseEnCharge: 80 },
    { cle: "80-2", prime: 470_116, tauxPriseEnCharge: 80 },
    { cle: "80-3", prime: 612_282, tauxPriseEnCharge: 80 },
  ],
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

/**
 * Convention de nommage des formules Santé : la clé commence par le taux de
 * prise en charge, suivi au besoin d'un suffixe ("70", "80", "80-2"). Permet à
 * l'admin d'ajouter une formule depuis la page Tarifs sans champ dédié.
 */
export function tauxDepuisCleFormuleSante(cle: string | null | undefined): number | null {
  const m = /^(\d{1,3})(?:-.+)?$/.exec((cle ?? "").trim());
  const taux = m ? Number(m[1]) : NaN;
  return taux > 0 && taux <= 100 ? taux : null;
}

/** Taux de prise en charge porté par une ligne TarifProduit (`donneesSpecifiques.tauxPriseEnCharge`). */
export function tauxPriseEnChargeDuTarif(donneesSpecifiques: unknown): number | null {
  const taux = (donneesSpecifiques as { tauxPriseEnCharge?: unknown } | null)?.tauxPriseEnCharge;
  return typeof taux === "number" && taux > 0 && taux <= 100 ? taux : null;
}

// ── Fiche de l'assuré principal (formulaire de demande fourni le 2026-10-08) ──
// Nom complet (enregistré tel quel dans Souscription.nom, sans le découper),
// téléphone, email, sexe et date de naissance vivent dans les colonnes de la
// souscription ; le reste est ici. Poids, taille, tension et groupe sanguin
// sont des données de santé : elles ne servent qu'à l'admin qui valide la
// demande et ne doivent sortir par aucune route publique ni figurer au contrat.

/** L'assuré principal doit avoir entre 15 et 65 ans à la date de la demande. */
export const AGE_MIN_ASSURE_PRINCIPAL = 15;
export const AGE_MAX_ASSURE_PRINCIPAL = 65;

export const SITUATIONS_MATRIMONIALES = ["celibataire", "marie", "divorce", "veuf", "union_libre"] as const;
export const GROUPES_SANGUINS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "inconnu"] as const;

/** Tension « systolique/diastolique » (ex. 120/80), dans des bornes physiologiquement possibles. */
export function tensionArterielleValide(valeur: string): boolean {
  const m = /^(\d{2,3})\/(\d{2,3})$/.exec(valeur.trim());
  if (!m) return false;
  const systolique = Number(m[1]);
  const diastolique = Number(m[2]);
  return systolique >= 60 && systolique <= 300 && diastolique >= 30 && diastolique <= 200 && systolique > diastolique;
}

export const ficheSanteSchema = z.object({
  profession: z.string().trim().min(2).max(120),
  lieuResidence: z.string().trim().min(2).max(200),
  numeroCmu: z.string().trim().max(40).optional(),
  situationMatrimoniale: z.enum(SITUATIONS_MATRIMONIALES),
  poidsKg: z.number().min(20).max(300),
  tailleCm: z.number().min(80).max(250),
  tensionArterielle: z.string().trim().refine(tensionArterielleValide, "Tension artérielle invalide (ex. 120/80)"),
  groupeSanguin: z.enum(GROUPES_SANGUINS),
});
export type FicheSante = z.infer<typeof ficheSanteSchema>;

/** Âge révolu à une date donnée (aujourd'hui par défaut). */
export function ageRevolu(dateNaissance: Date, a: Date = new Date()): number {
  const anniversairePasse =
    a.getMonth() > dateNaissance.getMonth() ||
    (a.getMonth() === dateNaissance.getMonth() && a.getDate() >= dateNaissance.getDate());
  return a.getFullYear() - dateNaissance.getFullYear() - (anniversairePasse ? 0 : 1);
}

/** Relit la fiche stockée dans `Souscription.donneesSpecifiques.ficheSante` — `null` si absente ou abîmée. */
export function lireFicheSante(donneesSpecifiques: unknown): FicheSante | null {
  const lu = ficheSanteSchema.safeParse((donneesSpecifiques as { ficheSante?: unknown } | null)?.ficheSante);
  return lu.success ? lu.data : null;
}

export const SEXES_SANTE = ["masculin", "feminin"] as const;

// Fiche d'une personne couverte (conjoint, enfant) d'après le bulletin
// d'adhésion du 2026-10-15 : nom, prénoms, lieu de résidence, profession,
// N° CMU, date de naissance, sexe (+ téléphone du conjoint). Les champs ajoutés
// à cette date sont facultatifs ICI pour relire les demandes antérieures ;
// `validerFichesPersonnesSante` les exige pour toute nouvelle demande.
export const personneAssureeSanteSchema = z.object({
  lien: z.enum(["conjoint", "enfant"]),
  nom: z.string().trim().min(1).max(120),
  prenom: z.string().trim().min(1).max(120),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sexe: z.enum(SEXES_SANTE).optional(),
  lieuResidence: z.string().trim().max(200).optional(),
  profession: z.string().trim().max(120).optional(),
  numeroCmu: z.string().trim().max(40).optional(),
  telephone: z.string().trim().max(20).optional(),
});
export type PersonneAssureeSante = z.infer<typeof personneAssureeSanteSchema>;

/**
 * Fiches complètes exigées pour une NOUVELLE demande : sexe et lieu de
 * résidence pour toutes les personnes couvertes, profession en plus pour le
 * conjoint (facultative pour un enfant : élève, étudiant…). Retourne le message
 * d'erreur à afficher, ou `null`.
 */
export function validerFichesPersonnesSante(personnes: PersonneAssureeSante[]): string | null {
  for (const p of personnes) {
    const qui = p.lien === "conjoint" ? "du conjoint" : `de l'enfant ${p.prenom}`;
    if (!p.sexe) return `Sexe ${qui} manquant.`;
    if ((p.lieuResidence ?? "").length < 2) return `Lieu de résidence ${qui} manquant.`;
    if (p.lien === "conjoint" && (p.profession ?? "").length < 2) return "Profession du conjoint manquante.";
  }
  return null;
}

function dateNaissancePlausible(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getTime() <= Date.now();
}

/**
 * Vérifie que les personnes déclarées correspondent au produit choisi.
 * Retourne le message d'erreur à afficher au souscripteur, ou `null`.
 */
export function validerPersonnesAssureesSante(code: ProduitSante, personnes: PersonneAssureeSante[]): string | null {
  const regle = COMPOSITION_SANTE[code];
  const conjoints = personnes.filter((p) => p.lien === "conjoint").length;
  const enfants = personnes.filter((p) => p.lien === "enfant").length;

  if (regle.conjoint === "aucun" && conjoints > 0) return `La formule ${regle.libelle} ne couvre que le souscripteur.`;
  if (conjoints > 1) return "Un seul conjoint peut être couvert.";
  if (regle.conjoint === "requis" && conjoints !== 1) return `La formule ${regle.libelle} couvre le souscripteur et son conjoint : renseignez le conjoint.`;
  if (enfants > regle.enfantsMax) {
    return regle.enfantsMax === 0
      ? `La formule ${regle.libelle} ne couvre pas d'enfant.`
      : `La formule ${regle.libelle} couvre au plus ${regle.enfantsMax} enfants.`;
  }
  if (personnes.some((p) => !dateNaissancePlausible(p.dateNaissance))) {
    return "Date de naissance invalide pour l'une des personnes couvertes.";
  }
  return null;
}

/** Relit les personnes couvertes stockées dans `Souscription.donneesSpecifiques` — tolère une valeur absente ou abîmée. */
export function lirePersonnesAssureesSante(donneesSpecifiques: unknown): PersonneAssureeSante[] {
  const brut = (donneesSpecifiques as { personnesAssurees?: unknown } | null)?.personnesAssurees;
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((p) => {
    const lu = personneAssureeSanteSchema.safeParse(p);
    return lu.success ? [lu.data] : [];
  });
}

// ── Questionnaire médical (bulletin d'adhésion fourni le 2026-10-15) ──────────
// Une seule définition, servie au formulaire public par GET /public/sante/
// questionnaire et relue ici pour valider les réponses, produire le PDF et
// afficher la fiche à l'admin : ce que voit l'admin est exactement ce qui a été
// posé au souscripteur. Réservé à l'admin (données de santé) : aucune route
// publique ne renvoie les réponses.

export type TypeQuestionSante = "oui_non" | "texte" | "nombre";

export interface QuestionSante {
  cle: string;
  libelle: string;
  type: TypeQuestionSante;
  /** Question réservée à un sexe (prostate, grossesse…) : non posée aux autres personnes. */
  sexe?: (typeof SEXES_SANTE)[number];
  /** `texte`/`nombre` demandé seulement si cette question oui/non est « oui » (et alors obligatoire). */
  siOui?: string;
}

export interface RubriqueSante {
  numero: number;
  titre: string;
  questions: QuestionSante[];
}

export const QUESTIONNAIRE_SANTE: RubriqueSante[] = [
  {
    numero: 1,
    titre: "Cardiovasculaires (Cœur)",
    questions: [
      { cle: "hta", libelle: "Hypertension artérielle", type: "oui_non" },
      { cle: "cholesterol", libelle: "Taux de cholestérol élevé", type: "oui_non" },
      { cle: "autres_cardio", libelle: "Autres maladies cardiovasculaires", type: "texte" },
    ],
  },
  {
    numero: 2,
    titre: "Pulmonaires (poumons)",
    questions: [
      { cle: "asthme", libelle: "Asthme", type: "oui_non" },
      { cle: "autres_pulmonaires", libelle: "Autres maladies pulmonaires", type: "texte" },
    ],
  },
  {
    numero: 3,
    titre: "Oculaires (yeux)",
    questions: [
      { cle: "glaucome", libelle: "Glaucome", type: "oui_non" },
      { cle: "autres_oculaires", libelle: "Autres maladies oculaires", type: "texte" },
    ],
  },
  {
    numero: 4,
    titre: "Urinaires (appareil urinaire)",
    questions: [
      { cle: "prostate", libelle: "Maladie de la prostate (pas cancer)", type: "oui_non", sexe: "masculin" },
      { cle: "insuffisance_renale", libelle: "Insuffisance rénale chronique", type: "oui_non" },
      { cle: "autres_urinaires", libelle: "Autres maladies urinaires ou rénales", type: "texte" },
    ],
  },
  {
    numero: 5,
    titre: "Digestifs (+ foie)",
    questions: [
      { cle: "hepatite", libelle: "Hépatite virale", type: "oui_non" },
      { cle: "cirrhose", libelle: "Cirrhose du foie", type: "oui_non" },
      { cle: "autres_digestifs", libelle: "Autres maladies digestives", type: "texte" },
    ],
  },
  {
    numero: 6,
    titre: "Gynéco-obstétrique",
    questions: [
      { cle: "enceinte", libelle: "Êtes-vous enceinte ?", type: "oui_non", sexe: "feminin" },
      { cle: "mois_grossesse", libelle: "Si oui, combien de mois ?", type: "nombre", sexe: "feminin", siOui: "enceinte" },
      { cle: "fibrome", libelle: "Fibrome utérin", type: "oui_non", sexe: "feminin" },
      { cle: "kyste", libelle: "Kyste ovarien", type: "oui_non", sexe: "feminin" },
    ],
  },
  {
    numero: 7,
    titre: "Métaboliques et endocriniens",
    questions: [
      { cle: "diabete", libelle: "Diabète", type: "oui_non" },
      { cle: "thyroide", libelle: "Hyper ou hypothyroïdie ou goitre", type: "oui_non" },
      { cle: "autres_metaboliques", libelle: "Autres maladies métaboliques et endocriniennes", type: "texte" },
    ],
  },
  {
    numero: 8,
    titre: "Hématologiques (sang)",
    questions: [
      { cle: "drepanocytose", libelle: "Drépanocytose", type: "oui_non" },
      { cle: "autres_hematologiques", libelle: "Autres maladies hématologiques", type: "texte" },
    ],
  },
  {
    numero: 9,
    titre: "Neuro-rhumatologiques",
    questions: [
      { cle: "epilepsie", libelle: "Épilepsie", type: "oui_non" },
      { cle: "goutte", libelle: "Goutte", type: "oui_non" },
      { cle: "hernie_discale", libelle: "Hernie discale", type: "oui_non" },
      { cle: "autres_neuro", libelle: "Autres maladies neuro-rhumatologiques", type: "texte" },
    ],
  },
  {
    numero: 10,
    titre: "Tumeur",
    questions: [
      { cle: "tumeur_benigne", libelle: "Tumeur bénigne", type: "oui_non" },
      { cle: "cancer", libelle: "Cancer", type: "oui_non" },
    ],
  },
  {
    numero: 11,
    titre: "Autres maladies",
    questions: [
      { cle: "autres_maladies", libelle: "Autres maladies non citées plus haut", type: "oui_non" },
      { cle: "autres_maladies_precision", libelle: "Si oui, préciser", type: "texte", siOui: "autres_maladies" },
    ],
  },
  {
    numero: 12,
    titre: "Autres informations",
    questions: [
      { cle: "assure_avant", libelle: "Assuré précédemment en Santé ?", type: "oui_non" },
      { cle: "ancienne_assurance", libelle: "Si oui, quelle assurance ?", type: "texte", siOui: "assure_avant" },
    ],
  },
];

/** Réponses d'une personne : booléen pour une question oui/non, texte sinon. */
export type ReponsesSante = Record<string, boolean | string>;

export const questionnaireSanteSchema = z.object({
  /** Une entrée par personne couverte, dans l'ordre : assuré principal, conjoint, enfants. */
  personnes: z.array(z.object({ reponses: z.record(z.string().max(60), z.union([z.boolean(), z.string().trim().max(300)])) })).min(1).max(6),
  /** Case « Déclare exact et sincère » cochée par le souscripteur. */
  declareExactEtSincere: z.literal(true),
});
export type QuestionnaireSante = z.infer<typeof questionnaireSanteSchema>;

/** Questions posées à une personne, selon son sexe (prostate, grossesse… ne concernent pas tout le monde). */
export function questionsApplicables(sexe: string | null | undefined): QuestionSante[] {
  return QUESTIONNAIRE_SANTE.flatMap((r) => r.questions).filter((q) => !q.sexe || q.sexe === sexe);
}

/** Intitulé de chaque personne couverte, dans l'ordre du questionnaire. */
export function libellesPersonnesSante(personnes: PersonneAssureeSante[]): string[] {
  let enfant = 0;
  return [
    "Assuré principal",
    ...personnes.map((p) => (p.lien === "conjoint" ? "Conjoint(e)" : `Enfant ${++enfant}`)),
  ];
}

/**
 * Contrôle les réponses : toutes les questions applicables sont obligatoires
 * (« Répondre à toutes les questions est obligatoire »), sauf les lignes
 * « Autres maladies… » qui sont du texte libre. Retourne les réponses
 * nettoyées (clés connues uniquement) ou le message d'erreur à afficher.
 */
export function verifierQuestionnaireSante(
  sexePrincipal: string | null | undefined,
  personnes: PersonneAssureeSante[],
  questionnaire: QuestionnaireSante
): { erreur: string } | { reponses: ReponsesSante[] } {
  if (questionnaire.personnes.length !== 1 + personnes.length) {
    return { erreur: "Le questionnaire médical doit être rempli pour chaque personne assurée." };
  }
  const intitules = libellesPersonnesSante(personnes);
  const propres: ReponsesSante[] = [];
  for (let i = 0; i < questionnaire.personnes.length; i++) {
    const sexe = i === 0 ? sexePrincipal : personnes[i - 1].sexe;
    const brut = questionnaire.personnes[i].reponses;
    const reponses: ReponsesSante = {};
    for (const q of questionsApplicables(sexe)) {
      const v = brut[q.cle];
      if (q.siOui && brut[q.siOui] !== true) continue; // question conditionnelle non déclenchée
      if (q.type === "oui_non") {
        if (typeof v !== "boolean") return { erreur: `Questionnaire médical (${intitules[i]}) : répondez à « ${q.libelle} ».` };
        reponses[q.cle] = v;
      } else if (q.type === "nombre") {
        const n = typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > 9) return { erreur: `Questionnaire médical (${intitules[i]}) : indiquez le nombre de mois (1 à 9).` };
        reponses[q.cle] = String(n);
      } else {
        const t = typeof v === "string" ? v.trim() : "";
        // Texte libre : obligatoire quand il précise un « oui », sinon facultatif.
        if (q.siOui && t.length < 2) return { erreur: `Questionnaire médical (${intitules[i]}) : précisez « ${q.libelle.replace(/^Si oui, /, "")} ».` };
        if (t) reponses[q.cle] = t;
      }
    }
    propres.push(reponses);
  }
  return { reponses: propres };
}

/** Relit le questionnaire enregistré dans `donneesSpecifiques.questionnaireSante` — `null` si absent (demande antérieure) ou abîmé. */
export function lireQuestionnaireSante(donneesSpecifiques: unknown): { personnes: { reponses: ReponsesSante }[]; signeLe: string | null } | null {
  const brut = (donneesSpecifiques as { questionnaireSante?: { personnes?: unknown; signeLe?: unknown } } | null)?.questionnaireSante;
  if (!brut || !Array.isArray(brut.personnes)) return null;
  const personnes = brut.personnes.flatMap((p) => {
    const r = (p as { reponses?: unknown } | null)?.reponses;
    return r && typeof r === "object" ? [{ reponses: r as ReponsesSante }] : [];
  });
  return personnes.length ? { personnes, signeLe: typeof brut.signeLe === "string" ? brut.signeLe : null } : null;
}

// ── Pièces à fournir après validation de la demande ───────────────────────────
// Adultes (assuré principal, conjoint) : CNI recto + verso et photo numérique.
// Enfants : extrait de naissance et photo numérique.

export const TYPES_PIECES_SANTE = ["cni_recto", "cni_verso", "photo", "extrait_naissance"] as const;
export type TypePieceSante = (typeof TYPES_PIECES_SANTE)[number];

export const LIBELLES_PIECES_SANTE: Record<TypePieceSante, string> = {
  cni_recto: "CNI — recto",
  cni_verso: "CNI — verso",
  photo: "Photo numérique",
  extrait_naissance: "Extrait de naissance",
};

export interface PersonnePiecesSante {
  /** 0 = assuré principal, 1 = conjoint, puis les enfants. */
  index: number;
  intitule: string;
  nomComplet: string;
  adulte: boolean;
  pieces: TypePieceSante[];
}

/** Pièces attendues pour chaque personne couverte (le souscripteur en premier). */
export function personnesPiecesSante(nomPrincipal: string, personnes: PersonneAssureeSante[]): PersonnePiecesSante[] {
  const intitules = libellesPersonnesSante(personnes);
  const adulte: TypePieceSante[] = ["cni_recto", "cni_verso", "photo"];
  const enfant: TypePieceSante[] = ["extrait_naissance", "photo"];
  return [
    { index: 0, intitule: intitules[0], nomComplet: nomPrincipal, adulte: true, pieces: adulte },
    ...personnes.map((p, i) => ({
      index: i + 1,
      intitule: intitules[i + 1],
      nomComplet: `${p.prenom} ${p.nom}`.trim(),
      adulte: p.lien === "conjoint",
      pieces: p.lien === "conjoint" ? adulte : enfant,
    })),
  ];
}

/** Vrai quand chaque pièce attendue de chaque personne a été déposée. */
export function piecesCompletes(personnes: PersonnePiecesSante[], deposees: { personneIndex: number; type: string }[]): boolean {
  const cles = new Set(deposees.map((d) => `${d.personneIndex}:${d.type}`));
  return personnes.every((p) => p.pieces.every((t) => cles.has(`${p.index}:${t}`)));
}
