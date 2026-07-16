import type { Branche } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Notifie tous les administrateurs ayant accès à la branche concernée
 * (cf. routes/notifications.ts, qui filtre par `branches` du token — un
 * SUPER_ADMIN voit toujours tout, quelle que soit la branche indiquée ici).
 */
export async function notifyAdmins(
  branche: Branche,
  type: string,
  titre: string,
  message: string,
  lien?: string
) {
  try {
    await prisma.notification.create({
      data: { cible: "admin", branche, type, titre, message, lien: lien ?? null },
    });
  } catch (e) {
    console.error("notif admin error", e);
  }
}

/** Notifie un partenaire précis */
export async function notifyPartenaire(
  partenaireId: string,
  type: string,
  titre: string,
  message: string,
  lien?: string
) {
  try {
    await prisma.notification.create({
      data: { cible: "partenaire", partenaireId, type, titre, message, lien: lien ?? null },
    });
  } catch (e) {
    console.error("notif partenaire error", e);
  }
}
