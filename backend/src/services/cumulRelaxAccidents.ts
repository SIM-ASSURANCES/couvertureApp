// Un seul produit RelaxAccidents par client (2026-11-12).
//
// Règle : un même client ne peut pas détenir deux produits de la famille RelaxAccidents —
// RelaxAccidents Frais Médicaux, RelaxAccidents Frais Médicaux Livreurs/MotoTaxis et RelaxAccidents
// (générale, classe + CNPS). RelaxVoyage n'en fait pas partie : il reste souscriptible en plus, et
// RelaxMoto / RelaxAuto ne sont pas concernés non plus.
//
// Le client est identifié par son numéro de téléphone normalisé (modèle Client, voir
// services/clients.ts). Seule une souscription CONFIRMÉE (payée, ou confirmée sans paiement) compte :
// une tentative restée en attente ne bloque rien, comme pour la règle « une fois par produit »
// (routes/public.ts::souscriptionDejaExistante). Une souscription expirée compte aussi : le client la
// renouvelle depuis son espace (avec le choix de la formule), il n'en prend pas une nouvelle d'un autre
// produit de la famille.

import { prisma } from "../db.js";
import { normaliserTelephone } from "./clients.js";

export const PRODUITS_RELAXACCIDENTS = [
  "relaxaccidents",
  "relaxaccidents_fraismedicaux",
  "relaxaccidents_fraismedicaux_livreurs",
] as const;

export function estProduitRelaxAccidents(code: string): boolean {
  return (PRODUITS_RELAXACCIDENTS as readonly string[]).includes(code);
}

export const CODE_CUMUL_RELAXACCIDENTS = "cumul_relaxaccidents";

export const MESSAGE_CUMUL_RELAXACCIDENTS =
  "Vous avez déjà souscrit un produit RelaxAccidents. Un client ne peut détenir qu'un seul produit RelaxAccidents : vous pouvez le renouveler depuis votre espace client. RelaxVoyage reste disponible en plus.";

/** Produit RelaxAccidents confirmé que ce numéro détient déjà, ou `null` s'il n'en a aucun. */
export async function produitRelaxAccidentsDuClient(telephone: string): Promise<{ code: string; libelle: string } | null> {
  const cle = normaliserTelephone(telephone);
  if (!cle) return null;
  const client = await prisma.client.findUnique({ where: { telephone: cle }, select: { id: true } });
  if (!client) return null;
  const s = await prisma.souscription.findFirst({
    where: {
      clientId: client.id,
      waveStatut: "confirme",
      produit: { code: { in: [...PRODUITS_RELAXACCIDENTS] } },
    },
    select: { produit: { select: { code: true, libelle: true } } },
    orderBy: { createdAt: "desc" },
  });
  return s ? s.produit : null;
}

/**
 * Refus à renvoyer en 409 quand `produitCode` appartient à la famille RelaxAccidents et que ce numéro
 * en détient déjà un ; `null` quand la souscription peut se poursuivre (autre famille, RelaxVoyage inclus).
 */
export async function refusSiCumulRelaxAccidents(
  produitCode: string,
  telephone: string
): Promise<{ error: string; code: string } | null> {
  if (!estProduitRelaxAccidents(produitCode)) return null;
  if (!(await produitRelaxAccidentsDuClient(telephone))) return null;
  return { error: MESSAGE_CUMUL_RELAXACCIDENTS, code: CODE_CUMUL_RELAXACCIDENTS };
}
