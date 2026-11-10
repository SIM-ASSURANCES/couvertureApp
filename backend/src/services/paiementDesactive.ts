// Partenaire à paiement désactivé (2026-11-10).
//
// Le Super Administrateur peut désactiver, pour un partenaire, les moyens de paiement Wave et Djogana
// (Peya pay) : les clients de ce partenaire souscrivent alors SANS payer, quel que soit le produit.
// La souscription est confirmée immédiatement par le point d'entrée habituel
// (paiementWave.ts::confirmerEcheance) : police, dates d'effet, accès client, carte de prise en charge
// et contrat sont produits comme après un paiement. Le paiement porte une marque `SANS-PAIEMENT-…` à la
// place d'un identifiant de transaction : aucune facture n'est émise (rien n'a été encaissé), voir
// services/facture.ts.

import { prisma } from "../db.js";

export const MARQUE_SANS_PAIEMENT = "SANS-PAIEMENT-";

/** Identifiant à poser sur le paiement d'une souscription confirmée sans paiement. */
export function marqueSansPaiement(paiementId: string): string {
  return `${MARQUE_SANS_PAIEMENT}${paiementId.slice(0, 8)}`;
}

/** Ce paiement a-t-il été confirmé sans encaissement (partenaire à paiement désactivé) ? */
export function estPaiementSansEncaissement(paiement: {
  waveTransactionId?: string | null;
  djoganaTransactionId?: string | null;
}): boolean {
  return (
    !!paiement.waveTransactionId?.startsWith(MARQUE_SANS_PAIEMENT) ||
    !!paiement.djoganaTransactionId?.startsWith(MARQUE_SANS_PAIEMENT)
  );
}

/** Le paiement est-il désactivé pour ce partenaire ? */
export async function partenaireSansPaiement(partenaireId: string | null | undefined): Promise<boolean> {
  if (!partenaireId) return false;
  const p = await prisma.partenaire.findUnique({ where: { id: partenaireId }, select: { paiementDesactive: true } });
  return !!p?.paiementDesactive;
}
