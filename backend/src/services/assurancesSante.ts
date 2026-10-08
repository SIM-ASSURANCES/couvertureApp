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

/**
 * Qui est couvert, en plus du souscripteur. Solo : personne. Duo : le conjoint
 * (obligatoire). Famille : le conjoint et jusqu'à trois enfants — au moins une
 * personne, sans quoi c'est un Solo ; le conjoint reste facultatif pour ne pas
 * écarter un parent seul.
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
    conjoint: "aucun" | "requis" | "facultatif";
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
    conjoint: "facultatif",
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
  if (regle.conjoint === "requis" && conjoints !== 1) return `La formule ${regle.libelle} couvre le souscripteur et son conjoint : renseignez le conjoint.`;
  if (conjoints > 1) return "Un seul conjoint peut être couvert.";
  if (enfants > regle.enfantsMax) {
    return regle.enfantsMax === 0
      ? `La formule ${regle.libelle} ne couvre pas d'enfant.`
      : `La formule ${regle.libelle} couvre au plus ${regle.enfantsMax} enfants.`;
  }
  if (code === "sante_famille" && personnes.length === 0) {
    return "La formule Famille couvre le souscripteur et sa famille : renseignez au moins un conjoint ou un enfant.";
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
