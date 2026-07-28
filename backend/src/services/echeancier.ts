import type { CycleFacturation } from "@prisma/client";

export interface EcheanceCalculee {
  numeroEcheance: number;
  montant: number;
  dateEcheance: Date;
}

const NB_ECHEANCES: Record<CycleFacturation, number> = {
  mensuel: 12,
  annuel: 1,
};

const INTERVALLE_JOURS: Record<CycleFacturation, number> = {
  mensuel: 30,
  annuel: 365,
};

export function nombreEcheances(cycle: CycleFacturation): number {
  return NB_ECHEANCES[cycle];
}

/**
 * Construit l'échéancier d'un abonnement à partir du montant PAR échéance
 * (TarifProduit.prime pour le libelléVariante = cycle choisi) — ce montant
 * n'est jamais divisé : le mensuel (12 échéances) a son propre prix fixe,
 * indépendant de l'annuel (1 échéance), reflétant le surcoût réel de payer
 * mensuellement plutôt qu'en une fois.
 */
export function genererEcheancier(
  montantParEcheance: number,
  cycle: CycleFacturation,
  dateDepart: Date = new Date()
): EcheanceCalculee[] {
  const n = NB_ECHEANCES[cycle];
  const intervalle = INTERVALLE_JOURS[cycle];

  const echeances: EcheanceCalculee[] = [];
  for (let i = 1; i <= n; i++) {
    const dateEcheance = new Date(dateDepart);
    dateEcheance.setDate(dateEcheance.getDate() + (i - 1) * intervalle);
    echeances.push({ numeroEcheance: i, montant: montantParEcheance, dateEcheance });
  }
  return echeances;
}
