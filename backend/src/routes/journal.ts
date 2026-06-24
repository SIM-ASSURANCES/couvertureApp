import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler } from "../util.js";

export const journalRouter = Router();
journalRouter.use(requireAuth("admin"));

journalRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { typeAction, objetType } = req.query as {
      typeAction?: string;
      objetType?: string;
    };
    const rows = await prisma.journalActivite.findMany({
      where: {
        typeAction: typeAction ? (typeAction as never) : undefined,
        objetType: objetType || undefined,
      },
      include: { admin: { select: { nom: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        date: r.createdAt,
        admin: r.admin?.nom ?? "—",
        adminEmail: r.admin?.email ?? "",
        typeAction: r.typeAction,
        objet: r.objetType,
        identifiant: r.objetId ?? "",
        valeurAvant: r.valeurAvant,
        valeurApres: r.valeurApres,
      }))
    );
  })
);
