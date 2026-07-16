import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest, type AuthUser } from "../auth.js";
import { asyncHandler } from "../util.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth("admin", "partenaire"));

/**
 * Un admin ne voit que les notifications de ses branches (comportement
 * identique à requireBranche) : un SUPER_ADMIN, ou un jeton émis avant
 * l'introduction des branches (claim absent), voit tout. Les notifications
 * sans branche renseignée (branche = null — anciennes lignes, ou une
 * éventuelle notification transverse future) restent visibles par tous.
 */
function whereFor(user: AuthUser): Prisma.NotificationWhereInput {
  if (user.type === "partenaire") {
    return { cible: "partenaire", partenaireId: user.sub };
  }
  if (user.role === "SUPER_ADMIN" || user.branches === undefined) {
    return { cible: "admin" };
  }
  return { cible: "admin", OR: [{ branche: { in: user.branches } }, { branche: null }] };
}

notificationsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const where = whereFor(req.user!);
    const [items, nonLues] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { ...where, lu: false } }),
    ]);
    res.json({ items, nonLues });
  })
);

notificationsRouter.post(
  "/:id/lu",
  asyncHandler(async (req: AuthedRequest, res) => {
    const where = whereFor(req.user!);
    await prisma.notification.updateMany({
      where: { ...where, id: req.params.id },
      data: { lu: true },
    });
    res.json({ ok: true });
  })
);

notificationsRouter.post(
  "/lues",
  asyncHandler(async (req: AuthedRequest, res) => {
    const where = whereFor(req.user!);
    await prisma.notification.updateMany({
      where: { ...where, lu: false },
      data: { lu: true },
    });
    res.json({ ok: true });
  })
);
