import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, hasBranche, type AuthedRequest, type BrancheAcces } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { notifyPartenaire } from "../services/notifications.js";

export const commissionsRouter = Router();
commissionsRouter.use(requireAuth("admin"));

/** Liste des demandes de commission */
commissionsRouter.get(
  "/demandes",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { statut } = req.query as { statut?: string };
    // Un admin ne voit que les demandes des partenaires de sa/ses branche(s)
    // (un SUPER_ADMIN voit tout) — les commissions sont un flux financier,
    // pas seulement une donnée de lecture.
    const branchesAutorisees = (["INCENDIE_ACCIDENT", "RELAX", "IMF"] as BrancheAcces[]).filter((b) =>
      hasBranche(req.user, b)
    );
    const rows = await prisma.demandeCommission.findMany({
      where: {
        statut: statut ? (statut as never) : undefined,
        partenaire: { branche: { in: branchesAutorisees } },
      },
      include: {
        partenaire: { select: { nomCommerce: true, nomResponsable: true } },
        agentDistribution: { select: { nom: true, telephone: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        partenaireId: r.partenaireId,
        partenaireNom: r.partenaire.nomCommerce,
        responsable: r.partenaire.nomResponsable,
        agentNom: r.agentDistribution?.nom ?? null,
        agentTelephone: r.agentDistribution?.telephone ?? null,
        montant: r.montant,
        statut: r.statut,
        createdAt: r.createdAt,
        traiteeAt: r.traiteeAt,
        motifRejet: r.motifRejet,
      }))
    );
  })
);

/** Valider une demande -> montant encaissé */
commissionsRouter.post(
  "/demandes/:id/valider",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = await prisma.demandeCommission.findUnique({
      where: { id: req.params.id },
      include: { partenaire: { select: { branche: true } } },
    });
    if (!d) return res.status(404).json({ error: "Demande introuvable" });
    if (!hasBranche(req.user, d.partenaire.branche ?? "INCENDIE_ACCIDENT")) {
      return res.status(403).json({ error: "Accès refusé pour cette branche" });
    }
    if (d.statut !== "en_attente")
      return res.status(409).json({ error: "Demande déjà traitée" });

    const updated = await prisma.demandeCommission.update({
      where: { id: d.id },
      data: { statut: "validee", traiteePar: req.user!.sub, traiteeAt: new Date() },
    });
    const agent = d.agentDistributionId
      ? await prisma.agentDistribution.findUnique({ where: { id: d.agentDistributionId }, select: { nom: true } })
      : null;
    await notifyPartenaire(
      d.partenaireId,
      "commission_validee",
      "Commission validée",
      agent
        ? `La demande de commission de ${Math.round(d.montant)} FCFA de votre agent ${agent.nom} a été validée.`
        : `Votre demande de commission de ${Math.round(d.montant)} FCFA a été validée.`,
      "/partenaire/commissions"
    );
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "commission",
      objetId: d.id,
      valeurApres: { statut: "validee", montant: d.montant },
    });
    res.json(updated);
  })
);

/** Rejeter une demande */
commissionsRouter.post(
  "/demandes/:id/rejeter",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { motif } = (req.body ?? {}) as { motif?: string };
    const d = await prisma.demandeCommission.findUnique({
      where: { id: req.params.id },
      include: { partenaire: { select: { branche: true } } },
    });
    if (!d) return res.status(404).json({ error: "Demande introuvable" });
    if (!hasBranche(req.user, d.partenaire.branche ?? "INCENDIE_ACCIDENT")) {
      return res.status(403).json({ error: "Accès refusé pour cette branche" });
    }
    if (d.statut !== "en_attente")
      return res.status(409).json({ error: "Demande déjà traitée" });

    const updated = await prisma.demandeCommission.update({
      where: { id: d.id },
      data: {
        statut: "rejetee",
        traiteePar: req.user!.sub,
        traiteeAt: new Date(),
        motifRejet: motif || null,
      },
    });
    const agent = d.agentDistributionId
      ? await prisma.agentDistribution.findUnique({ where: { id: d.agentDistributionId }, select: { nom: true } })
      : null;
    await notifyPartenaire(
      d.partenaireId,
      "commission_rejetee",
      "Demande de commission rejetée",
      agent
        ? `La demande de commission de votre agent ${agent.nom} a été rejetée.${motif ? " Motif : " + motif : ""}`
        : `Votre demande de commission a été rejetée.${motif ? " Motif : " + motif : ""}`,
      "/partenaire/commissions"
    );
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "commission",
      objetId: d.id,
      valeurApres: { statut: "rejetee", motif },
    });
    res.json(updated);
  })
);
