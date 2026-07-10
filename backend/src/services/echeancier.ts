import type { CycleFacturation } from "@prisma/client";

export interface EcheanceCalculee {
  numeroEcheance: number;
  montant: number;
  dateEcheance: Date;
}

const NB_ECHEANCES: Record<CycleFacturation, number> = {
  hebdo5semaines: 5,
  mensuel: 12,
  annuel: 1,
};

const INTERVALLE_JOURS: Record<CycleFacturation, number> = {
  hebdo5semaines: 7,
  mensuel: 30,
  annuel: 365,
};

export function nombreEcheances(cycle: CycleFacturation): number {
  return NB_ECHEANCES[cycle];
}

/**
 * Découpe une prime annuelle de référence (TarifProduit.prime) en échéances
 * selon le cycle de facturation choisi par le souscripteur. Le dernier montant
 * absorbe l'arrondi de division pour que la somme des échéances soit exacte.
 */
export function genererEcheancier(
  primeAnnuelle: number,
  cycle: CycleFacturation,
  dateDepart: Date = new Date()
): EcheanceCalculee[] {
  const n = NB_ECHEANCES[cycle];
  const intervalle = INTERVALLE_JOURS[cycle];
  const montantBase = Math.floor(primeAnnuelle / n);

  const echeances: EcheanceCalculee[] = [];
  let cumule = 0;
  for (let i = 1; i <= n; i++) {
    const montant = i === n ? primeAnnuelle - cumule : montantBase;
    cumule += montant;
    const dateEcheance = new Date(dateDepart);
    dateEcheance.setDate(dateEcheance.getDate() + (i - 1) * intervalle);
    echeances.push({ numeroEcheance: i, montant, dateEcheance });
  }
  return echeances;
}
