import { prisma } from "../db.js";

/** Notifie tous les administrateurs (cible partagée) */
export async function notifyAdmins(
  type: string,
  titre: string,
  message: string,
  lien?: string
) {
  try {
    await prisma.notification.create({
      data: { cible: "admin", type, titre, message, lien: lien ?? null },
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
