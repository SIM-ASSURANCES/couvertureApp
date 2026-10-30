// Garantie Décès incluse dans RelaxAccidents Frais Médicaux (grand public et
// Livreurs/MotoTaxis) — décision du 2026-10-30. Elle REMPLACE l'ancienne option Décès
// facultative (500 F → 200 000, 300 F → 100 000) : plus aucun supplément, le Décès fait
// partie de la formule. Durée du contrat : voir paiementWave.ts::dureeFormuleMois
// (grand public 2 mois, Livreurs/MotoTaxis 1 mois).
//
//   Formule 1 000 FCFA : frais médicaux 200 000 · Décès 50 000
//   Formule   500 FCFA : frais médicaux  75 000 · Décès 25 000
//
// Source de vérité en base : `TarifProduit.capitalGaranti` porte le plafond de frais
// médicaux (comme avant) et `TarifProduit.donneesSpecifiques.capitalDeces` le capital Décès.
// Les constantes ci-dessous servent à poser ces valeurs une fois (seed.ts), jamais à les
// relire à la souscription : un admin garde la main sur les montants.

/** Produits RelaxAccidents Frais Médicaux : grand public et Livreurs/MotoTaxis. */
const PRODUITS_RAF = ["relaxaccidents_fraismedicaux", "relaxaccidents_fraismedicaux_livreurs"] as const;

export function estProduitRaf(produitCode: string): boolean {
  return (PRODUITS_RAF as readonly string[]).includes(produitCode);
}

/** Garanties par formule (clé = libellé de la formule = sa prime en FCFA). */
export const GARANTIES_RAF_PAR_FORMULE: Record<string, { fraisMedicaux: number; deces: number }> = {
  "1000": { fraisMedicaux: 200_000, deces: 50_000 },
  "500": { fraisMedicaux: 75_000, deces: 25_000 },
};

/** Capital Décès de la formule, tel que posé sur la ligne de barème ; `null` si elle n'en porte pas. */
export function capitalDecesDuTarif(tarif: { donneesSpecifiques: unknown }): number | null {
  const c = (tarif.donneesSpecifiques as { capitalDeces?: unknown } | null)?.capitalDeces;
  return typeof c === "number" && c > 0 ? c : null;
}

/** Message renvoyé quand un client d'avant le 2026-10-30 (onglet resté ouvert, APK ≤ 1.12) envoie encore l'option. */
export const MESSAGE_OPTION_DECES_SUPPRIMEE =
  "L'option Décès n'existe plus : la garantie Décès est incluse dans la formule. Rechargez la page ou mettez à jour l'application.";
