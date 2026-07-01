import { prisma } from "./db.js";
import type { TypeAction } from "@prisma/client";
import { currentIp } from "./context.js";

export async function logAction(params: {
  adminId?: string;
  typeAction: TypeAction;
  objetType: string;
  objetId?: string;
  ip?: string;
  valeurAvant?: unknown;
  valeurApres?: unknown;
}) {
  try {
    await prisma.journalActivite.create({
      data: {
        adminId: params.adminId,
        typeAction: params.typeAction,
        objetType: params.objetType,
        objetId: params.objetId,
        ip: params.ip ?? currentIp() ?? null,
        valeurAvant: params.valeurAvant
          ? JSON.parse(JSON.stringify(params.valeurAvant))
          : undefined,
        valeurApres: params.valeurApres
          ? JSON.parse(JSON.stringify(params.valeurApres))
          : undefined,
      },
    });
  } catch (e) {
    console.error("journal error", e);
  }
}
