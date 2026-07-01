import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest, type AuthUser } from "../auth.js";
import { asyncHandler } from "../util.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth("admin", "partenaire"));

function whereFor(user: AuthUser) {
  return user.type === "partenaire"
    ? { cible: "partenaire", partenaireId: user.sub }
    : { cible: "admin" };
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
