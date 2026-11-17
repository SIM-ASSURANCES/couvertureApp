/**
 * Produits DÉCÈS négociés avec CEPE-CI (2026-11-17) — branche IMF Partenaires :
 *   - DÉCÈS EMPRUNTEUR (`deces_emprunteur`) : couvre l'encours d'un prêt CEPE-CI en cas de décès ou
 *     d'Invalidité Permanente Totale de l'emprunteur ; prime = montant du prêt × taux de la tranche.
 *   - DÉCÈS PARRAINAGE DE COMPTE (`deces_parrainage`) : capital versé aux ayants-droits au décès du
 *     titulaire d'un compte CEPE-CI (et, selon l'option, de son conjoint, d'un enfant ou d'un parent).
 *
 * Source : « TARIFICATION DECES EMPRUNTEUR CEPECI.docx » et « TARIF PARRAINAGE DE COMPTE CEPE CI.docx ».
 * Les grilles vivent ici (et dans leur miroir frontend `offline/catalogue.ts`) plutôt qu'en table
 * `ImfTarifFixe` : la prime Emprunteur est proportionnelle au prêt, et `ensureBaremesImf` ne copie les
 * tarifs fixes qu'à une IMF qui n'en a encore AUCUN (une IMF existante ne les recevrait jamais).
 *
 * Réservés à CEPE-CI (décision utilisateur) : activés à la provision pour l'IMF dont le nom/code
 * contient « CEPE », désactivés pour les autres (activables à la main dans la fiche de l'IMF).
 */

export const CODES_DECES_CEPECI = ["deces_emprunteur", "deces_parrainage"] as const;
export type CodeDecesCepeci = (typeof CODES_DECES_CEPECI)[number];

export function estProduitDecesCepeci(code: string): code is CodeDecesCepeci {
  return (CODES_DECES_CEPECI as readonly string[]).includes(code);
}

/** L'IMF est-elle CEPE-CI ? (nom ou code contenant « CEPE », casse et ponctuation ignorées). */
export function estImfCepeci(imf: { nom?: string | null; code?: string | null }): boolean {
  const cle = `${imf.nom ?? ""} ${imf.code ?? ""}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cle.includes("CEPE");
}

/** Commission de l'IMF sur ces deux produits : 20 % de la prime nette HT (taux standard de l'application). */
export const TAUX_COMMISSION_DECES_CEPECI = 0.2;

export interface LigneDevis {
  garantie: string;
  capital?: number;
  prime: number;
}
export interface GarantieCapital {
  garantie: string;
  capital: number;
}
export interface ResultatDecesCepeci {
  /** Toujours false : présent pour que le simulateur affiche le détail HT / accessoires / taxes. */
  depassementPlafond: false;
  lignes: LigneDevis[];
  garanties: GarantieCapital[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  capitalGaranti: number;
}

/* ───────────────────────────── DÉCÈS EMPRUNTEUR ───────────────────────────── */

export const DECES_EMPRUNTEUR = {
  capitalMax: 10_000_000,
  dureeMaxMois: 24,
  ageLimite: 65,
  tranches: [
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
  ],
} as const;

export const MESSAGE_HORS_LIMITES_EMPRUNTEUR =
  "Au-delà de 10 000 000 FCFA ou de 24 mois, l'accord préalable de SIM Assurances est requis : ce prêt ne peut pas être souscrit ici.";

export function trancheEmprunteur(dureeMois: number) {
  return DECES_EMPRUNTEUR.tranches.find((t) => dureeMois <= t.dureeMax) ?? null;
}

export function calculerDecesEmprunteur(
  montantPret: number,
  dureeMois: number
): { ok: true; resultat: ResultatDecesCepeci & { montantPret: number; dureeMois: number; tranche: string } } | { ok: false; error: string } {
  if (!Number.isFinite(montantPret) || montantPret <= 0) return { ok: false, error: "Indiquez le montant du prêt." };
  if (!Number.isInteger(dureeMois) || dureeMois < 1) return { ok: false, error: "Indiquez la durée du prêt (en mois)." };
  if (montantPret > DECES_EMPRUNTEUR.capitalMax || dureeMois > DECES_EMPRUNTEUR.dureeMaxMois) {
    return { ok: false, error: MESSAGE_HORS_LIMITES_EMPRUNTEUR };
  }
  const tranche = trancheEmprunteur(dureeMois)!;
  const tauxNet = tranche.risques.reduce((s, r) => s + r.taux, 0);
  // Un seul arrondi pour la prime TTC (M × 1 % ou M × 1,6 %, comme sur la grille), accessoires déduits.
  const primeTTC = Math.round(montantPret * (tauxNet + tranche.tauxAccessoires));
  const primeNetteHT = Math.round(montantPret * tauxNet);
  const accessoires = primeTTC - primeNetteHT;
  return {
    ok: true,
    resultat: {
      depassementPlafond: false,
      lignes: tranche.risques.map((r) => ({ garantie: r.garantie, capital: montantPret, prime: Math.round(montantPret * r.taux) })),
      garanties: [{ garantie: "Encours du prêt (bénéficiaire : CEPE-CI)", capital: montantPret }],
      primeNetteHT,
      accessoires,
      taxes: 0,
      primeTTC,
      capitalGaranti: montantPret,
      montantPret,
      dureeMois,
      tranche: tranche.libelle,
    },
  };
}

/* ──────────────────────────── DÉCÈS PARRAINAGE ──────────────────────────── */

export type OptionParrainage = "individuelle" | "famille" | "ascendants" | "complete";

const CAPITAL_PRINCIPAL = 500_000;
const CAPITAL_CONJOINT = 350_000;
const CAPITAL_ENFANT = 250_000;
const CAPITAL_ASCENDANT = 250_000;

export const MAX_ENFANTS_PARRAINAGE = 5;

export const OPTIONS_PARRAINAGE: Record<
  OptionParrainage,
  { libelle: string; primeNetteHT: number; accessoires: number; garanties: GarantieCapital[]; avecEnfants: boolean }
> = {
  individuelle: {
    libelle: "Individuelle",
    primeNetteHT: 4000,
    accessoires: 1000,
    garanties: [{ garantie: "Décès / IPT de l'assuré principal (titulaire du compte)", capital: CAPITAL_PRINCIPAL }],
    avecEnfants: false,
  },
  famille: {
    libelle: "Famille",
    primeNetteHT: 17000,
    accessoires: 2000,
    garanties: [
      { garantie: "Décès de l'assuré principal (titulaire du compte)", capital: CAPITAL_PRINCIPAL },
      { garantie: "Décès du conjoint", capital: CAPITAL_CONJOINT },
      { garantie: "Décès d'un enfant (12 à 21 ans)", capital: CAPITAL_ENFANT },
    ],
    avecEnfants: true,
  },
  ascendants: {
    libelle: "Assuré principal + ascendants",
    primeNetteHT: 17000,
    accessoires: 2000,
    garanties: [
      { garantie: "Décès de l'assuré principal (titulaire du compte)", capital: CAPITAL_PRINCIPAL },
      { garantie: "Décès d'un ascendant (père ou mère)", capital: CAPITAL_ASCENDANT },
    ],
    avecEnfants: false,
  },
  complete: {
    libelle: "Complète",
    primeNetteHT: 22500,
    accessoires: 2500,
    garanties: [
      { garantie: "Décès de l'assuré principal (titulaire du compte)", capital: CAPITAL_PRINCIPAL },
      { garantie: "Décès du conjoint", capital: CAPITAL_CONJOINT },
      { garantie: "Décès d'un enfant (12 à 21 ans)", capital: CAPITAL_ENFANT },
      { garantie: "Décès d'un ascendant (père ou mère)", capital: CAPITAL_ASCENDANT },
    ],
    avecEnfants: true,
  },
};

export function calculerDecesParrainage(
  option: OptionParrainage,
  nombreEnfants: number
): { ok: true; resultat: ResultatDecesCepeci & { option: OptionParrainage; optionLibelle: string; nombreEnfants: number } } | { ok: false; error: string } {
  const o = OPTIONS_PARRAINAGE[option];
  if (!o) return { ok: false, error: "Choisissez une option." };
  const enfants = o.avecEnfants ? Math.max(0, Math.floor(nombreEnfants || 0)) : 0;
  if (enfants > MAX_ENFANTS_PARRAINAGE) {
    return {
      ok: false,
      error: "La garantie couvre au plus 5 enfants. Au-delà, une surprime s'applique : contactez SIM Assurances.",
    };
  }
  const primeTTC = o.primeNetteHT + o.accessoires;
  return {
    ok: true,
    resultat: {
      depassementPlafond: false,
      lignes: [{ garantie: `Option ${o.libelle}`, prime: o.primeNetteHT }],
      garanties: o.garanties,
      primeNetteHT: o.primeNetteHT,
      accessoires: o.accessoires,
      taxes: 0,
      primeTTC,
      capitalGaranti: CAPITAL_PRINCIPAL,
      option,
      optionLibelle: o.libelle,
      nombreEnfants: enfants,
    },
  };
}

/* ─────────────────────────────── Contrat PDF ─────────────────────────────── */

/** Mentions des Conditions Générales de chaque produit (contrat PDF). */
export function conditionsGeneralesDecesCepeci(code: CodeDecesCepeci): string[] {
  if (code === "deces_emprunteur") {
    return [
      "<b>Objet :</b> couvrir l'assuré (emprunteur) en cas de Décès ou d'Invalidité Permanente Totale survenu avant l'échéance de remboursement d'un prêt accordé par CEPE-CI.",
      "<b>Bénéficiaire :</b> CEPE-CI, à hauteur de l'encours du prêt, net des intérêts et autres frais.",
      "<b>Capital maximum :</b> 10 000 000 FCFA ; au-delà, accord préalable de SIM Assurances.",
      "<b>Durée du prêt :</b> 24 mois au plus (court terme : 1 à 12 mois ; moyen terme : 13 à 24 mois) ; au-delà, validation obligatoire de SIM Assurances.",
      "<b>Prime TTC :</b> montant du prêt × 1 % (court terme) ou × 1,6 % (moyen terme), sans taxe.",
      "<b>Âge limite à la souscription :</b> 65 ans.",
      "<b>Territorialité :</b> Côte d'Ivoire.",
    ];
  }
  return [
    "<b>Risque couvert :</b> décès du titulaire d'un compte ouvert chez CEPE-CI et à jour de sa prime ; selon l'option, décès du conjoint, d'un enfant ou d'un ascendant (père ou mère).",
    "<b>Bénéficiaire(s) :</b> le titulaire du compte ou ses ayants-droits désignés au contrat.",
    "<b>Âge limite à la souscription (titulaire du compte) :</b> 60 ans.",
    "<b>Enfants :</b> couverts de 12 à 21 ans à la date du décès, dans la limite des 5 premiers enfants.",
    "<b>Ascendants :</b> 70 ans au plus à la souscription ; délai de carence de 3 mois sur leur garantie.",
    "<b>Durée :</b> 1 an, renouvelable par tacite reconduction par prélèvement sur le compte de l'assuré, sauf dénonciation au moins 2 mois avant l'échéance.",
    "<b>Délai d'indemnisation :</b> 10 jours à compter de la complétude du dossier de réclamation.",
    "<b>Territorialité :</b> Côte d'Ivoire.",
  ];
}
