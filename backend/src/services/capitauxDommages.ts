// Listes de capitaux "1er risque" pour les garanties optionnelles SECURHOME+
// et SECURPRO — identiques pour DDE/DE/BDG entre les deux produits (voir
// TARIF SECURHOME+_SECURPRO.docx, section 4). Le souscripteur choisit dans
// ces listes plutôt que de saisir un montant libre.

export const DDE_CAPITAUX = [1_000_000, 2_000_000] as const;
export const DE_CAPITAUX = [100_000, 250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;
export const BDG_CAPITAUX = [250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;
// SECURPRO uniquement.
export const VOL_CAISSE_CAPITAUX = [25_000, 50_000, 100_000, 250_000, 500_000] as const;

export function capitalDansListe(montant: number | undefined, liste: readonly number[]): boolean {
  return montant == null || liste.includes(montant);
}
