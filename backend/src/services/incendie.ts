import { prisma } from "../db.js";

/** Nombre maximum de souscriptions incendie pouvant partager la même réf.facture. */
export const MAX_USAGES_REF_FACTURE = 3;

/**
 * Vérifie que la réf.facture n'a pas déjà atteint son quota d'utilisation
 * (3 souscriptions incendie au total, tous clients confondus).
 * `excludeId` permet d'exclure la souscription en cours de mise à jour du comptage.
 */
export async function refFactureDisponible(
  refFacture: string,
  excludeId?: string
): Promise<boolean> {
  const count = await prisma.souscriptionIncendie.count({
    where: {
      refFacture,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return count < MAX_USAGES_REF_FACTURE;
}
