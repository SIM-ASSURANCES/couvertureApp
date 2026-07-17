/**
 * Moteur de tarification SECURPRO / SECURSTOCK, d'après le document technique
 * "Spécification tarifaire SECURHOME+ & SECURPRO" et la fiche produit
 * SECURSTOCK (dossier TARIFS/). Fonctions pures : le routeur charge le
 * barème (BaremeSecurpro/BaremeSecurstock) en base et transmet les valeurs,
 * aucun accès Prisma ici.
 *
 * COUPS DURS et SECURECOLTE n'ont pas besoin de moteur : ce sont des prix
 * fixes en catalogue (TarifProduit), consultés par simple lookup.
 */

const ACCESSOIRE_PAR_GARANTIE = 2500;
const TAXE_INCENDIE = 0.125;
const TAXE_AUTRES_GARANTIES = 0.0725;
const PLAFOND_MARCHE = 5_000_000;

// ─── SECURPRO ───────────────────────────────────────────────────────────────

export interface BaremeClasseSecurpro {
  classe: 1 | 2 | 3 | 4;
  limiteCapital: number;
  tauxIncendie: number;
}

export interface SecurproInput {
  classe: 1 | 2 | 3 | 4;
  statutOccupation: "proprietaire" | "locataire";
  valeurBatiment?: number; // si proprietaire
  loyerMensuel?: number; // si locataire — RLO = loyerMensuel * 12 * 10
  contenu: number;
  dansMarche: boolean;
  gardien: boolean;
  extincteur: boolean;
  volContenu: boolean;
  majorationVolContenu?: boolean; // mèches/coiffure, électronique -> x1.2
  volCaisseCapital?: number; // 25000 | 50000 | 100000 | 250000 | 500000
  majorationVolCaisse?: boolean; // supérettes, quincailleries, électronique, tissus -> x1.25
  ddeCapital?: number; // 1000000 | 2000000
  deCapital?: number; // 100000..2000000
  bdgCapital?: number; // 250000..2000000
}

export interface LignePrime {
  garantie: string;
  capital?: number;
  prime: number;
}

export interface ResultatTarifImf {
  depassementPlafond: boolean;
  capitauxTotaux: number;
  limiteApplicable: number;
  lignes: LignePrime[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
}

function coefficientPrevention(gardien: boolean, extincteur: boolean): number {
  if (gardien && extincteur) return 0.8;
  if (gardien || extincteur) return 0.9;
  return 1;
}

export function calculerSecurpro(input: SecurproInput, bareme: BaremeClasseSecurpro): ResultatTarifImf {
  const assietteBatiment =
    input.statutOccupation === "proprietaire"
      ? input.valeurBatiment ?? 0
      : (input.loyerMensuel ?? 0) * 12 * 10;
  const capitauxTotaux = assietteBatiment + input.contenu;

  const limiteApplicable = input.dansMarche ? Math.min(bareme.limiteCapital, PLAFOND_MARCHE) : bareme.limiteCapital;
  const depassementPlafond = capitauxTotaux > limiteApplicable;

  const lignes: LignePrime[] = [];

  const primeIncendie = depassementPlafond
    ? 0
    : capitauxTotaux * bareme.tauxIncendie * coefficientPrevention(input.gardien, input.extincteur);
  lignes.push({ garantie: "Incendie", capital: capitauxTotaux, prime: round2(primeIncendie) });

  // Vol contenu + Vol caisse fusionnés en une seule ligne "Vol" (un seul accessoire).
  let primeVol = 0;
  let volSouscrit = false;
  if (input.volContenu) {
    volSouscrit = true;
    const premierRisque = Math.min(input.contenu * 0.15, 2_000_000);
    primeVol += premierRisque * 0.01 * (input.majorationVolContenu ? 1.2 : 1);
  }
  if (input.volCaisseCapital) {
    volSouscrit = true;
    primeVol += Math.max(input.volCaisseCapital * 0.025, 2500) * (input.majorationVolCaisse ? 1.25 : 1);
  }
  if (volSouscrit) lignes.push({ garantie: "Vol", prime: round2(primeVol) });

  if (input.ddeCapital) {
    lignes.push({ garantie: "Dégât des eaux", capital: input.ddeCapital, prime: round2(input.ddeCapital * 0.006) });
  }
  if (input.deCapital) {
    lignes.push({ garantie: "Dommages électriques", capital: input.deCapital, prime: round2(input.deCapital * 0.01) });
  }
  if (input.bdgCapital) {
    lignes.push({ garantie: "Bris de glace", capital: input.bdgCapital, prime: round2(input.bdgCapital * 0.02) });
  }

  const primeNetteHT = round2(lignes.reduce((s, l) => s + l.prime, 0));
  const accessoires = lignes.length * ACCESSOIRE_PAR_GARANTIE;

  const autresPrimes = primeNetteHT - primeIncendie;
  const nbAutresLignes = lignes.length - 1;
  const taxes = round2(
    (primeIncendie + ACCESSOIRE_PAR_GARANTIE) * TAXE_INCENDIE +
      (autresPrimes + nbAutresLignes * ACCESSOIRE_PAR_GARANTIE) * TAXE_AUTRES_GARANTIES
  );

  const primeTTC = round2(primeNetteHT + accessoires + taxes);

  return { depassementPlafond, capitauxTotaux, limiteApplicable, lignes, primeNetteHT, accessoires, taxes, primeTTC };
}

// ─── SECURSTOCK ─────────────────────────────────────────────────────────────

export interface BaremeClasseSecurstock {
  classe: 1 | 2 | 3 | 4;
  limiteCapital: number;
  tauxDommageElectrique: number;
  tauxAutreCause: number;
}

export type Densite = "aere" | "normal" | "compact" | "tres_compact" | "entasse";
export type Localisation = "hors_marche" | "abords_marche" | "marche_zone_industrielle";
export type InstallationElectrique = "securisee" | "acceptable" | "degradee" | "dangereuse";
export type Prevention = "extincteurs_alarme_formation_eau" | "extincteurs_eau" | "extincteurs_seuls" | "aucun";

export interface SecurstockInput {
  classe: 1 | 2 | 3 | 4;
  capitalDeclare: number;
  densite: Densite;
  localisation: Localisation;
  installationElectrique: InstallationElectrique;
  prevention: Prevention;
  gardien: boolean;
  cameraSurveillance: boolean;
}

const MAJORATION_DENSITE: Record<Densite, number> = {
  aere: 0,
  normal: 0.05,
  compact: 0.1,
  tres_compact: 0.15,
  entasse: 0.25,
};

const MAJORATION_LOCALISATION: Record<Localisation, number> = {
  hors_marche: 0,
  abords_marche: 0.3,
  marche_zone_industrielle: 0.35,
};

const MAJORATION_PREVENTION: Record<Prevention, number> = {
  extincteurs_alarme_formation_eau: -0.15,
  extincteurs_eau: -0.1,
  extincteurs_seuls: -0.05,
  aucun: 0,
};

export function calculerSecurstock(
  input: SecurstockInput,
  bareme: BaremeClasseSecurstock
): (ResultatTarifImf & { nonAssurable?: false }) | { nonAssurable: true; motif: string } {
  if (input.installationElectrique === "dangereuse") {
    return {
      nonAssurable: true,
      motif: "Installation électrique dangereuse — risque non assurable en l'état.",
    };
  }

  // Cl2 : plafond imposé par la localisation et/ou l'installation électrique.
  // Un local dans un marché ou à ses abords plafonne à 1 000 000, quelle que
  // soit la classe de risque.
  let cl2 = bareme.limiteCapital;
  if (input.localisation !== "hors_marche") cl2 = Math.min(cl2, 1_000_000);
  if (input.installationElectrique === "degradee") cl2 = Math.min(cl2, 2_500_000);

  const limiteApplicable = Math.min(bareme.limiteCapital, cl2);
  const depassementPlafond = input.capitalDeclare > limiteApplicable;

  if (depassementPlafond) {
    return {
      depassementPlafond: true,
      capitauxTotaux: input.capitalDeclare,
      limiteApplicable,
      lignes: [],
      primeNetteHT: 0,
      accessoires: 0,
      taxes: 0,
      primeTTC: 0,
    };
  }

  const capitalRetenu = input.capitalDeclare;

  const primeBase = (bareme.tauxDommageElectrique + bareme.tauxAutreCause) * capitalRetenu;

  const majorationInstallation = input.installationElectrique === "acceptable" ? 0.1 : 0; // "securisee" = 0
  const m =
    MAJORATION_DENSITE[input.densite] +
    MAJORATION_LOCALISATION[input.localisation] +
    majorationInstallation +
    MAJORATION_PREVENTION[input.prevention] +
    (input.gardien ? -0.05 : 0) +
    (input.cameraSurveillance ? -0.05 : 0);

  const accessoires = ACCESSOIRE_PAR_GARANTIE; // garantie unique "PACKAGE SECURSTOCK"
  const primeTTC = round2((primeBase * (1 + m) + accessoires) * (1 + TAXE_INCENDIE));

  return {
    depassementPlafond: false,
    capitauxTotaux: capitalRetenu,
    limiteApplicable,
    lignes: [{ garantie: "Package Securstock (incendie)", capital: capitalRetenu, prime: round2(primeBase) }],
    primeNetteHT: round2(primeBase),
    accessoires,
    taxes: round2(primeTTC - round2(primeBase * (1 + m)) - accessoires),
    primeTTC,
  };
}

// ─── SECURECOLTE : palier de sécheresse à partir de l'indice ARC ───────────

export function palierSecheresse(valeur: number, reference: number): "forte" | "moyenne" | "faible" | "aucune" {
  const ratio = valeur / reference;
  if (ratio < 0.75) return "forte";
  if (ratio <= 0.85) return "moyenne";
  if (ratio <= 0.95) return "faible";
  return "aucune";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
