// Moteur de calcul de la prime — RelaxAccidents générale (police collective).
// Fonction pure (pas d'accès Prisma), sur le modèle de tarificationImf.ts —
// la route publique (routes/public.ts) recalcule systématiquement côté
// serveur à la soumission, jamais confiance dans un montant envoyé par le
// client (le frontend ne fait qu'un aperçu en direct avec la même formule,
// voir frontend/src/relaxAccidentsGenerale.ts).
//
// Barème d'après Tarif_de_base_v4.docx, section "COTATION RELAXACCIDENTS" +
// "CLASSE DE RISQUE — GRILLE DE CALCUL" — taux confirmés en pourcentage avec
// l'utilisateur (le document notait ‰ par erreur de transcription).

export type Classe = 1 | 2 | 3 | 4;
export type TypeCouverture = "vie_privee" | "vie_professionnelle" | "vie_privee_professionnelle";

export const MONTANTS_IJ = [1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000] as const;
export const MONTANTS_FRAIS_MEDICAUX = [50_000, 75_000, 100_000, 150_000, 200_000, 250_000, 300_000] as const;
export const MONTANT_IPT_MAX = 500_000;
export const MONTANT_DECES_ACCIDENTEL_MAX = 500_000;

const TAUX_CLASSE: Record<Classe, { decesAccidentel: number; ipt: number; ij: number }> = {
  1: { decesAccidentel: 0.009, ipt: 0.009, ij: 0.0074 },
  2: { decesAccidentel: 0.01125, ipt: 0.01125, ij: 0.013 },
  3: { decesAccidentel: 0.018, ipt: 0.018, ij: 0.026 },
  4: { decesAccidentel: 0.0215, ipt: 0.0215, ij: 0.03 },
};

const TAUX_DECES_TOUTES_CAUSES = 0.0055;

const TAUX_COUVERTURE: Record<TypeCouverture, number> = {
  vie_privee: 0.6,
  vie_professionnelle: 0.85,
  vie_privee_professionnelle: 1,
};

const FRAIS_MEDICAUX_PAR_CLASSE: Record<Classe, Record<number, number>> = {
  1: { 50_000: 2890, 75_000: 3900, 100_000: 4630, 150_000: 6310, 200_000: 7580, 250_000: 8520, 300_000: 9210 },
  2: { 50_000: 2890, 75_000: 3900, 100_000: 4630, 150_000: 6310, 200_000: 7580, 250_000: 8520, 300_000: 9210 },
  3: { 50_000: 3525, 75_000: 4760, 100_000: 5685, 150_000: 7705, 200_000: 9250, 250_000: 10_400, 300_000: 11_235 },
  4: { 50_000: 4160, 75_000: 5620, 100_000: 6740, 150_000: 9100, 200_000: 10_920, 250_000: 12_280, 300_000: 13_260 },
};

// Tranches d'effectif — réduction commerciale ET tarif accessoires (par
// personne) suivent des paliers différents, voir le document.
const REDUCTION_EFFECTIF: { max: number; taux: number }[] = [
  { max: 4, taux: 0 },
  { max: 10, taux: 0.05 },
  { max: 25, taux: 0.1 },
  { max: 50, taux: 0.15 },
  { max: 99, taux: 0.2 },
  { max: 150, taux: 0.3 },
  { max: Infinity, taux: 0.4 },
];

const ACCESSOIRES_PAR_PERSONNE: { max: number; montant: number }[] = [
  { max: 10, montant: 2500 },
  { max: 50, montant: 2000 },
  { max: 99, montant: 1500 },
  { max: Infinity, montant: 1000 },
];

const TAUX_TAXES = 0.0725;

export interface RelaxAccidentsGeneraleInput {
  classe: Classe;
  typeCouverture: TypeCouverture;
  effectif: number;
  montantIJ: number;
  montantFraisMedicaux: number;
  montantIPT: number;
  montantDecesAccidentel: number;
}

export interface LigneGarantieCalculee {
  garantie: string;
  montant: number;
  prime: number;
}

export interface ResultatRelaxAccidentsGenerale {
  lignes: LigneGarantieCalculee[];
  primeNetteParPersonne: number;
  effectif: number;
  primeNetteHT1: number;
  reductionPct: number;
  primeNetteHT2: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
}

const round = (n: number) => Math.round(n);

function reductionEffectif(effectif: number): number {
  return REDUCTION_EFFECTIF.find((r) => effectif <= r.max)!.taux;
}

function accessoiresParPersonne(effectif: number): number {
  return ACCESSOIRES_PAR_PERSONNE.find((a) => effectif <= a.max)!.montant;
}

/** Valide les entrées (plages autorisées) — lève une erreur avec un message utilisateur si invalide. */
export function validerEntreesRelaxAccidentsGenerale(input: RelaxAccidentsGeneraleInput): void {
  if (![1, 2, 3, 4].includes(input.classe)) throw new Error("Classe de risque invalide.");
  if (!(MONTANTS_IJ as readonly number[]).includes(input.montantIJ)) {
    throw new Error("Montant d'indemnité journalière invalide.");
  }
  if (!(MONTANTS_FRAIS_MEDICAUX as readonly number[]).includes(input.montantFraisMedicaux)) {
    throw new Error("Montant de frais médicaux invalide.");
  }
  if (input.montantIPT < 0 || input.montantIPT > MONTANT_IPT_MAX) {
    throw new Error(`Le montant Invalidité Permanente Totale ne doit pas dépasser ${MONTANT_IPT_MAX.toLocaleString("fr-FR")} FCFA.`);
  }
  if (input.montantDecesAccidentel < 0 || input.montantDecesAccidentel > MONTANT_DECES_ACCIDENTEL_MAX) {
    throw new Error(`Le montant Décès Accidentel ne doit pas dépasser ${MONTANT_DECES_ACCIDENTEL_MAX.toLocaleString("fr-FR")} FCFA.`);
  }
  if (!Number.isInteger(input.effectif) || input.effectif < 1) {
    throw new Error("L'effectif doit être un nombre entier d'au moins 1 personne.");
  }
}

export function calculerRelaxAccidentsGenerale(input: RelaxAccidentsGeneraleInput): ResultatRelaxAccidentsGenerale {
  validerEntreesRelaxAccidentsGenerale(input);
  const taux = TAUX_CLASSE[input.classe];

  const primeIJ = round(input.montantIJ * taux.ij);
  const primeFraisMedicaux = FRAIS_MEDICAUX_PAR_CLASSE[input.classe][input.montantFraisMedicaux];
  const primeIPT = round(input.montantIPT * taux.ipt);
  const primeDecesAccidentel = round(input.montantDecesAccidentel * taux.decesAccidentel);
  const primeDecesToutesCauses = round(input.montantDecesAccidentel * TAUX_DECES_TOUTES_CAUSES);

  const lignes: LigneGarantieCalculee[] = [
    { garantie: "Indemnité Journalière", montant: input.montantIJ, prime: primeIJ },
    { garantie: "Frais médicaux", montant: input.montantFraisMedicaux, prime: primeFraisMedicaux },
    { garantie: "Invalidité Permanente Totale", montant: input.montantIPT, prime: primeIPT },
    { garantie: "Décès Accidentel", montant: input.montantDecesAccidentel, prime: primeDecesAccidentel },
    { garantie: "Décès toutes causes", montant: input.montantDecesAccidentel, prime: primeDecesToutesCauses },
  ];

  const sommeLignes = lignes.reduce((s, l) => s + l.prime, 0);
  const primeNetteParPersonne = round(sommeLignes * TAUX_COUVERTURE[input.typeCouverture]);

  const primeNetteHT1 = primeNetteParPersonne * input.effectif;
  const reductionPct = reductionEffectif(input.effectif);
  const primeNetteHT2 = round(primeNetteHT1 * (1 - reductionPct));
  const accessoires = accessoiresParPersonne(input.effectif) * input.effectif;
  const taxes = round(primeNetteHT2 * TAUX_TAXES);
  const primeTTC = primeNetteHT2 + accessoires + taxes;

  return {
    lignes,
    primeNetteParPersonne,
    effectif: input.effectif,
    primeNetteHT1,
    reductionPct,
    primeNetteHT2,
    accessoires,
    taxes,
    primeTTC,
  };
}
