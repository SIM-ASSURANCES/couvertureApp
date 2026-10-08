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

export const personneAssureeSanteSchema = z.object({
  lien: z.enum(["conjoint", "enfant"]),
  nom: z.string().trim().min(1).max(120),
  prenom: z.string().trim().min(1).max(120),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type PersonneAssureeSante = z.infer<typeof personneAssureeSanteSchema>;

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
