/**
 * Garanties RelaxMoto/RelaxAuto — fixes par produit, indépendantes du cycle
 * annuel/mensuel souscrit. Partagées entre le formulaire de souscription
 * publique (pages/public/Souscription.tsx) et l'espace client
 * (pages/client/Dashboard.tsx), pour n'avoir qu'un seul endroit à mettre à
 * jour côté frontend si ces montants changent.
 *
 * À garder synchronisé avec la constante miroir GARANTIES_RELAX_MOTO_AUTO
 * côté backend (services/contractHtml.ts), qui affiche les mêmes montants
 * dans le contrat PDF — les deux projets étant séparés, cette duplication
 * entre front et back est irréductible.
 */
export const GARANTIES_RELAX_MOTO_AUTO = {
  relaxmoto: {
    indemniteJournaliere: 3_500,
    dureeMaxJours: 30,
    carenceJours: 3,
    fraisMedicaux: 250_000,
    invaliditePermanenteTotale: 500_000,
    deces: 500_000,
  },
  relaxauto: {
    indemniteJournaliere: 5_000,
    dureeMaxJours: 30,
    carenceJours: 3,
    fraisMedicaux: 300_000,
    invaliditePermanenteTotale: 1_000_000,
    deces: 1_000_000,
  },
} as const;
