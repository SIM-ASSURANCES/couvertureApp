import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";
import {
  sendWhatsApp,
  messageIncendie,
  lienFormulaire,
  newFormulaireToken,
} from "../services/notify.js";

export const souscriptionsRouter = Router();
souscriptionsRouter.use(requireAuth("admin"));

souscriptionsRouter.get(
  "/incendie",
  asyncHandler(async (req, res) => {
    const { statut, partenaireId } = req.query as {
      statut?: string;
      partenaireId?: string;
    };
    const rows = await prisma.souscriptionIncendie.findMany({
      where: {
        statut:
          statut === "en_cours" || statut === "complet" || statut === "expire"
            ? statut
            : undefined,
        partenaireId: partenaireId || undefined,
      },
      include: { partenaire: { select: { nomCommerce: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      rows.map((r) => ({ ...r, partenaireNom: r.partenaire.nomCommerce }))
    );
  })
);

souscriptionsRouter.get(
  "/accident",
  asyncHandler(async (req, res) => {
    const { waveStatut, partenaireId } = req.query as {
      waveStatut?: string;
      partenaireId?: string;
    };
    const rows = await prisma.souscriptionAccident.findMany({
      where: {
        waveStatut:
          waveStatut === "en_attente" ||
          waveStatut === "confirme" ||
          waveStatut === "echoue"
            ? waveStatut
            : undefined,
        partenaireId: partenaireId || undefined,
      },
      include: { partenaire: { select: { nomCommerce: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      rows.map((r) => ({ ...r, partenaireNom: r.partenaire.nomCommerce }))
    );
  })
);

souscriptionsRouter.post(
  "/incendie/:id/relance",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    const token = s.lienFormulaireToken ?? newFormulaireToken();
    await sendWhatsApp(
      s.telephone,
      messageIncendie(s.prenom, lienFormulaire("incendie", token))
    );
    await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: { lienFormulaireToken: token, whatsappEnvoyeAt: new Date() },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "souscription_incendie",
      objetId: s.id,
    });
    res.json({ ok: true });
  })
);

souscriptionsRouter.get(
  "/incendie/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.souscriptionIncendie.findMany({
      include: { partenaire: { select: { nomCommerce: true } } },
      orderBy: { createdAt: "desc" },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "souscription_incendie",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "clients_incendie.csv",
      toCsv(
        rows.map((r) => ({
          id: r.id,
          telephone: r.telephone,
          nom: r.nom ?? "",
          prenom: r.prenom ?? "",
          numeroFacture: r.numeroFacture ?? "",
          partenaire: r.partenaire.nomCommerce,
          statut: r.statut,
          date: r.createdAt.toISOString(),
        }))
      )
    );
  })
);

souscriptionsRouter.delete(
  "/incendie/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionIncendie.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    await prisma.souscriptionIncendie.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "souscription_incendie",
      objetId: req.params.id,
    });
    res.status(204).end();
  })
);

souscriptionsRouter.delete(
  "/accident/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionAccident.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    await prisma.souscriptionAccident.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "souscription_accident",
      objetId: req.params.id,
    });
    res.status(204).end();
  })
);

souscriptionsRouter.get(
  "/accident/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.souscriptionAccident.findMany({
      include: { partenaire: { select: { nomCommerce: true } } },
      orderBy: { createdAt: "desc" },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "souscription_accident",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "clients_accident.csv",
      toCsv(
        rows.map((r) => ({
          id: r.id,
          telephone: r.telephone,
          nom: r.nom,
          prenom: r.prenom,
          montantPrime: r.montantPrime,
          waveStatut: r.waveStatut,
          numeroPolice: r.numeroPolice ?? "",
          partenaire: r.partenaire.nomCommerce,
          statutDossier: r.statutDossier,
          date: r.createdAt.toISOString(),
        }))
      )
    );
  })
);
