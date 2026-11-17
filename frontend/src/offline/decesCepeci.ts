/**
 * Miroir écran / hors-ligne de backend/src/services/decesCepeci.ts — produits négociés avec CEPE-CI :
 * DÉCÈS EMPRUNTEUR (prime = montant du prêt × taux) et DÉCÈS PARRAINAGE DE COMPTE (4 options à prix
 * fixe). Sert au devis en direct du simulateur ; le serveur recalcule à la souscription (seule source
 * de vérité). Toute modification de grille doit être reportée dans les DEUX fichiers.
 */

export const CODES_DECES_CEPECI = ["deces_emprunteur", "deces_parrainage"] as const;

export function estProduitDecesCepeci(code: string): boolean {
  return (CODES_DECES_CEPECI as readonly string[]).includes(code);
}

export interface ResultatDecesCepeci {
  depassementPlafond: false;
  lignes: { garantie: string; capital?: number; prime: number }[];
  garanties: { garantie: string; capital: number }[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  capitalGaranti: number;
}

/* ── DÉCÈS EMPRUNTEUR ── */

export const CAPITAL_MAX_EMPRUNTEUR = 10_000_000;
export const DUREE_MAX_EMPRUNTEUR = 24;

const TRANCHES_EMPRUNTEUR = [
  {
    dureeMax: 12,
    libelle: "Prêt à court terme (1 à 12 mois)",
    risques: [
      { garantie: "Décès toutes causes", taux: 0.0032 },
      { garantie: "Décès accidentel", taux: 0.0032 },
      { garantie: "Invalidité Permanente Totale", taux: 0.0031 },
    ],
    tauxAccessoires: 0.0005,
  },
  {
    dureeMax: 24,
    libelle: "Prêt à moyen terme (13 à 24 mois)",
    risques: [
      { garantie: "Décès toutes causes", taux: 0.005 },
      { garantie: "Décès accidentel", taux: 0.005 },
      { garantie: "Invalidité Permanente Totale", taux: 0.005 },
    ],
    tauxAccessoires: 0.001,
  },
];

export const MESSAGE_HORS_LIMITES_EMPRUNTEUR =
  "Au-delà de 10 000 000 FCFA ou de 24 mois, l'accord préalable de SIM Assurances est requis : ce prêt ne peut pas être souscrit ici.";

export function trancheEmprunteurLibelle(dureeMois: number): string | null {
  return TRANCHES_EMPRUNTEUR.find((t) => dureeMois <= t.dureeMax)?.libelle ?? null;
}

export function calculerDecesEmprunteurHorsLigne(
  montantPret: number,
  dureeMois: number
): { ok: true; resultat: ResultatDecesCepeci } | { ok: false; error: string } {
  if (!Number.isFinite(montantPret) || montantPret <= 0) return { ok: false, error: "Indiquez le montant du prêt." };
  if (!Number.isInteger(dureeMois) || dureeMois < 1) return { ok: false, error: "Indiquez la durée du prêt (en mois)." };
  if (montantPret > CAPITAL_MAX_EMPRUNTEUR || dureeMois > DUREE_MAX_EMPRUNTEUR) {
    return { ok: false, error: MESSAGE_HORS_LIMITES_EMPRUNTEUR };
  }
  const tranche = TRANCHES_EMPRUNTEUR.find((t) => dureeMois <= t.dureeMax)!;
  const tauxNet = tranche.risques.reduce((s, r) => s + r.taux, 0);
  const primeTTC = Math.round(montantPret * (tauxNet + tranche.tauxAccessoires));
  const primeNetteHT = Math.round(montantPret * tauxNet);
  return {
    ok: true,
    resultat: {
      depassementPlafond: false,
      lignes: tranche.risques.map((r) => ({ garantie: r.garantie, capital: montantPret, prime: Math.round(montantPret * r.taux) })),
      garanties: [{ garantie: "Encours du prêt (bénéficiaire : CEPE-CI)", capital: montantPret }],
      primeNetteHT,
      accessoires: primeTTC - primeNetteHT,
      taxes: 0,
      primeTTC,
      capitalGaranti: montantPret,
    },
  };
}

/* ── DÉCÈS PARRAINAGE DE COMPTE ── */

export type OptionParrainage = "individuelle" | "famille" | "ascendants" | "complete";

export const MAX_ENFANTS_PARRAINAGE = 5;

export const OPTIONS_PARRAINAGE: Record<
  OptionParrainage,
  { libelle: string; primeNetteHT: number; accessoires: number; garanties: { garantie: string; capital: number }[]; avecEnfants: boolean }
> = {
  individuelle: {
    libelle: "Individuelle",
    primeNetteHT: 4000,
    accessoires: 1000,
    garanties: [{ garantie: "Décès / IPT de l'assuré principal (titulaire du compte)", capital: 500_000 }],
    avecEnfants: false,
  },
  famille: {
    libelle: "Famille",
    primeNetteHT: 17000,
    accessoires: 2000,
    garanties: [
      { garantie: "Décès de l'assuré principal (titulaire du compte)", capital: 500_000 },
      { garantie: "Décès du conjoint", capital: 350_000 },
      { garantie: "Décès d'un enfant (12 à 21 ans)", capital: 250_000 },
    ],
    avecEnfants: true,
  },
  ascendants: {
    libelle: "Assuré principal + ascendants",
    primeNetteHT: 17000,
    accessoires: 2000,
    garanties: [
      { garantie: "Décès de l'assuré principal (titulaire du compte)", capital: 500_000 },
      { garantie: "Décès d'un ascendant (père ou mère)", capital: 250_000 },
    ],
    avecEnfants: false,
  },
  complete: {
    libelle: "Complète",
    primeNetteHT: 22500,
    accessoires: 2500,
    garanties: [
      { garantie: "Décès de l'assuré principal (titulaire du compte)", capital: 500_000 },
      { garantie: "Décès du conjoint", capital: 350_000 },
      { garantie: "Décès d'un enfant (12 à 21 ans)", capital: 250_000 },
      { garantie: "Décès d'un ascendant (père ou mère)", capital: 250_000 },
    ],
    avecEnfants: true,
  },
};

export function calculerDecesParrainageHorsLigne(
  option: OptionParrainage,
  nombreEnfants: number
): { ok: true; resultat: ResultatDecesCepeci } | { ok: false; error: string } {
  const o = OPTIONS_PARRAINAGE[option];
  if (!o) return { ok: false, error: "Choisissez une option." };
  const enfants = o.avecEnfants ? Math.max(0, Math.floor(nombreEnfants || 0)) : 0;
  if (enfants > MAX_ENFANTS_PARRAINAGE) {
    return { ok: false, error: "La garantie couvre au plus 5 enfants. Au-delà, une surprime s'applique : contactez SIM Assurances." };
  }
  return {
    ok: true,
    resultat: {
      depassementPlafond: false,
      lignes: [{ garantie: `Option ${o.libelle}`, prime: o.primeNetteHT }],
      garanties: o.garanties,
      primeNetteHT: o.primeNetteHT,
      accessoires: o.accessoires,
      taxes: 0,
      primeTTC: o.primeNetteHT + o.accessoires,
      capitalGaranti: 500_000,
    },
  };
}
