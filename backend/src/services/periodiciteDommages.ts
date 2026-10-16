// Périodicité de la prime des produits Assurances Dommages (SecurHome,
// SecurHome+, SecurPro, SecurMoto) — décision du 2026-10-16 : le souscripteur
// choisit OBLIGATOIREMENT entre « Annuelle » et « Mensuelle ». Tous les barèmes
// et moteurs de calcul produisent une prime ANNUELLE ; la prime mensuelle est
// la prime annuelle divisée par 10 (et non par 12), pour chaque produit.
//
// Un contrat mensuel couvre 1 mois (voir paiementWave.ts::dureeFormuleMois) et
// se renouvelle chaque mois au même montant : `Souscription.montantPrime`
// contient donc déjà la prime d'UNE période, ce que reprennent tels quels les
// renouvellements, les factures et la commission (taux × prime nette de la
// période × nombre de paiements). Le miroir frontend est
// frontend/src/periodiciteDommages.ts — à garder synchronisé.

import { z } from "zod";

export type CycleDommages = "annuel" | "mensuel";

/** Prime mensuelle = prime annuelle ÷ 10. */
export const DIVISEUR_PRIME_MENSUELLE = 10;

/** Produits Dommages concernés par le choix annuel/mensuel. */
export const PRODUITS_DOMMAGES_PERIODICITE = ["securhome", "securhome_dommages", "securpro_dommages", "securmoto"] as const;

export function estProduitDommagesAvecPeriodicite(code: string): boolean {
  return (PRODUITS_DOMMAGES_PERIODICITE as readonly string[]).includes(code);
}

/**
 * Champ `cycle` des requêtes de souscription/devis. Absent = annuel : les
 * clients d'avant le 2026-10-16 (onglet resté ouvert, APK ≤ 1.7) ne l'envoient
 * pas et ont toujours souscrit à la prime annuelle. Le caractère « impératif »
 * du choix est porté par les écrans, qui n'en présélectionnent aucun.
 */
export const cycleDommagesSchema = z.enum(["annuel", "mensuel"]).default("annuel");

/** Prime d'une période mensuelle, en FCFA entiers. */
export function primeMensuelle(primeAnnuelle: number): number {
  return Math.round(primeAnnuelle / DIVISEUR_PRIME_MENSUELLE);
}

interface ResultatPrimeScalable {
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  lignes?: { prime: number }[];
}

export type ResultatPeriodique<T> = T & {
  /** Présent seulement pour un contrat mensuel ; absent = annuel (historique). */
  periodicite?: "mensuel";
  /** Prime TTC annuelle d'origine, conservée pour mémoire sur un contrat mensuel. */
  primeTTCAnnuelle?: number;
};

/**
 * Ramène le détail d'un devis annuel à UNE période mensuelle : chaque montant
 * est divisé par 10 puis arrondi au franc, le HT absorbant l'arrondi pour que
 * Prime HT + Accessoires + Taxes = Prime TTC tombe toujours juste (même
 * exigence que la facture, voir services/facture.ts::detailDePrime). Les
 * capitaux ne changent pas : la garantie est la même, seule la durée couverte
 * par la prime diffère. Annuel : le résultat est rendu tel quel.
 */
export function appliquerPeriodicite<T extends ResultatPrimeScalable>(
  resultat: T,
  cycle: CycleDommages
): ResultatPeriodique<T> {
  if (cycle !== "mensuel") return resultat;

  const primeTTC = primeMensuelle(resultat.primeTTC);
  const accessoires = primeMensuelle(resultat.accessoires);
  const taxes = primeMensuelle(resultat.taxes);
  const primeNetteHT = primeTTC - accessoires - taxes;

  let lignes = resultat.lignes;
  if (lignes) {
    const somme = lignes.reduce((s, l) => s + l.prime, 0);
    const scalees = lignes.map((l) => ({ ...l, prime: primeMensuelle(l.prime) }));
    // Les lignes d'un devis s'additionnent en prime nette : on garde cette
    // propriété en reportant l'écart d'arrondi sur la ligne la plus élevée.
    if (somme === resultat.primeNetteHT && scalees.length > 0) {
      const ecart = primeNetteHT - scalees.reduce((s, l) => s + l.prime, 0);
      if (ecart !== 0) {
        const i = scalees.reduce((imax, l, k) => (l.prime > scalees[imax].prime ? k : imax), 0);
        scalees[i] = { ...scalees[i], prime: scalees[i].prime + ecart };
      }
    }
    lignes = scalees;
  }

  return {
    ...resultat,
    ...(lignes ? { lignes } : {}),
    primeNetteHT,
    accessoires,
    taxes,
    primeTTC,
    periodicite: "mensuel",
    primeTTCAnnuelle: resultat.primeTTC,
  };
}

/** Lit la périodicité d'une souscription (`donneesSpecifiques.cycle`) ; annuel par défaut. */
export function cycleDeSouscription(donneesSpecifiques: unknown): CycleDommages {
  return (donneesSpecifiques as { cycle?: unknown } | null)?.cycle === "mensuel" ? "mensuel" : "annuel";
}

/** Libellé affiché sur les contrats et les écrans. */
export function libellePeriodicite(cycle: CycleDommages): string {
  return cycle === "mensuel" ? "Mensuelle" : "Annuelle";
}

/**
 * Détail d'une prime mensuelle de SecurHome (tarif fixe, sans devis calculé) à
 * partir de la ligne de barème annuelle. Convention du barème SecurHome :
 * accessoires EN PLUS (HT + accessoires + taxes = TTC).
 */
export function detailMensuelTarifFixe(tarif: {
  prime: number;
  primeHT: number | null;
  fg: number | null;
  taxes: number | null;
}): { primeNetteHT: number; accessoires: number; taxes: number; primeTTC: number } | null {
  if (tarif.primeHT == null || tarif.taxes == null) return null;
  const primeTTC = primeMensuelle(tarif.prime);
  const accessoires = primeMensuelle(tarif.fg ?? 0);
  const taxes = primeMensuelle(tarif.taxes);
  return { primeNetteHT: primeTTC - accessoires - taxes, accessoires, taxes, primeTTC };
}
