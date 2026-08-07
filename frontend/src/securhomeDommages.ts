// Aperçu en direct du devis SECURHOME+ — copie exacte des formules de
// backend/src/services/securhomeDommages.ts (source de vérité, qui recalcule
// systématiquement à la soumission). Ce module ne sert qu'à afficher un
// aperçu instantané pendant la saisie, jamais envoyé tel quel au serveur.

export type StatutOccupation = "proprietaire" | "locataire";

export const DDE_CAPITAUX = [1_000_000, 2_000_000] as const;
export const DE_CAPITAUX = [100_000, 250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;
export const BDG_CAPITAUX = [250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;

const TAUX_INCENDIE = 0.0005;
const TAUX_GARANTIE = 0.006;
const PLAFOND_VOL_1ER_RISQUE = 2_000_000;
const TAUX_VOL_1ER_RISQUE = 0.15;
const ACCESSOIRE_PAR_GARANTIE = 2500;
const TAUX_TAXE_INCENDIE = 0.125;
const TAUX_TAXE_AUTRES = 0.0725;

function coefficientPrevention(gardien: boolean, extincteur: boolean): number {
  if (gardien && extincteur) return 0.8;
  if (gardien || extincteur) return 0.9;
  return 1;
}

function coefficientVol(gardien: boolean, camera: boolean): number {
  if (gardien && camera) return 0.8;
  if (gardien || camera) return 0.9;
  return 1;
}

export function capitalDansListe(montant: number | undefined, liste: readonly number[]): boolean {
  return montant == null || liste.includes(montant);
}

export interface SecurhomeInput {
  statutOccupation: StatutOccupation;
  valeurBatiment?: number;
  loyerMensuel?: number;
  contenu: number;
  gardien: boolean;
  extincteur: boolean;
  camera: boolean;
  volContenu: boolean;
  ddeCapital?: number;
  deCapital?: number;
  bdgCapital?: number;
}

export interface LigneGarantieCalculee {
  garantie: string;
  capital?: number;
  prime: number;
}

export interface ResultatSecurhome {
  capitauxTotaux: number;
  lignes: LigneGarantieCalculee[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
}

const round = (n: number) => Math.round(n);

export function validerEntreesSecurhome(input: SecurhomeInput): void {
  if (input.contenu < 0) throw new Error("Le contenu déclaré ne peut pas être négatif.");
  if (!capitalDansListe(input.ddeCapital, DDE_CAPITAUX)) throw new Error("Capital Dégât des eaux invalide.");
  if (!capitalDansListe(input.deCapital, DE_CAPITAUX)) throw new Error("Capital Dommages électriques invalide.");
  if (!capitalDansListe(input.bdgCapital, BDG_CAPITAUX)) throw new Error("Capital Bris de glace invalide.");
}

export function calculerSecurhome(input: SecurhomeInput): ResultatSecurhome {
  validerEntreesSecurhome(input);

  const assietteBatiment =
    input.statutOccupation === "proprietaire" ? input.valeurBatiment ?? 0 : (input.loyerMensuel ?? 0) * 12 * 10;
  const capitauxTotaux = assietteBatiment + input.contenu;

  const lignes: LigneGarantieCalculee[] = [];

  const primeIncendie = capitauxTotaux * TAUX_INCENDIE * coefficientPrevention(input.gardien, input.extincteur);
  lignes.push({ garantie: "Incendie", capital: round(capitauxTotaux), prime: round(primeIncendie) });

  if (input.volContenu) {
    const premierRisque = Math.min(input.contenu * TAUX_VOL_1ER_RISQUE, PLAFOND_VOL_1ER_RISQUE);
    const primeVol = premierRisque * TAUX_GARANTIE * coefficientVol(input.gardien, input.camera);
    lignes.push({ garantie: "Vol contenu", capital: round(premierRisque), prime: round(primeVol) });
  }
  if (input.deCapital) {
    lignes.push({ garantie: "Dommages électriques", capital: input.deCapital, prime: round(input.deCapital * TAUX_GARANTIE) });
  }
  if (input.ddeCapital) {
    lignes.push({ garantie: "Dégât des eaux", capital: input.ddeCapital, prime: round(input.ddeCapital * TAUX_GARANTIE) });
  }
  if (input.bdgCapital) {
    lignes.push({ garantie: "Bris de glace", capital: input.bdgCapital, prime: round(input.bdgCapital * TAUX_GARANTIE) });
  }

  const primeNetteHT = lignes.reduce((s, l) => s + l.prime, 0);
  const lignesFacturables = lignes.filter((l) => l.prime > 0);
  const accessoires = lignesFacturables.length * ACCESSOIRE_PAR_GARANTIE;

  const primeIncendieFacturable = lignes[0].prime > 0 ? lignes[0].prime : 0;
  const autresLignesFacturables = lignesFacturables.filter((l) => l.garantie !== "Incendie");
  const autresPrimes = autresLignesFacturables.reduce((s, l) => s + l.prime, 0);
  const taxes = round(
    (primeIncendieFacturable + (lignes[0].prime > 0 ? ACCESSOIRE_PAR_GARANTIE : 0)) * TAUX_TAXE_INCENDIE +
      (autresPrimes + autresLignesFacturables.length * ACCESSOIRE_PAR_GARANTIE) * TAUX_TAXE_AUTRES
  );

  const primeTTC = primeNetteHT + accessoires + taxes;

  return { capitauxTotaux: round(capitauxTotaux), lignes, primeNetteHT, accessoires, taxes, primeTTC };
}
