import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";
import {
  sendSMS,
  messageIncendie,
  lienFormulaire,
  newFormulaireToken,
} from "../services/notify.js";
import { verifierPaiementAccident } from "../services/accident.js";
import { refFactureDisponible, MAX_USAGES_REF_FACTURE } from "../services/incendie.js";

export const souscriptionsRouter = Router();
souscriptionsRouter.use(requireAuth("admin"));

/** Liste unifiée des contrats : incendie complets + accident confirmés */
souscriptionsRouter.get(
  "/contrats",
  asyncHandler(async (req, res) => {
    const { q, type } = req.query as { q?: string; type?: string };

    type Contrat = {
      id: string;
      type: "incendie" | "accident";
      numeroPolice: string;
      nom: string;
      prenom: string;
      telephone: string;
      montant: number;
      capitalGaranti: number;
      partenaire: string;
      dateDebut: Date | null;
      dateFin: Date | null;
      date: Date;
      refFacture?: string | null;
    };

    const out: Contrat[] = [];

    if (type !== "accident") {
      const inc = await prisma.souscriptionIncendie.findMany({
        where: { statut: "complet" },
        include: { partenaire: { select: { nomCommerce: true } } },
        orderBy: { createdAt: "desc" },
      });
      for (const s of inc) {
        const debut = s.createdAt;
        const fin = new Date(debut);
        fin.setFullYear(fin.getFullYear() + 1);
        out.push({
          id: s.id,
          type: "incendie",
          numeroPolice: `POL-INC-${debut.getFullYear()}-${s.id.slice(0, 8).toUpperCase()}`,
          nom: s.nom ?? "",
          prenom: s.prenom ?? "",
          telephone: s.telephone,
          montant: s.montantPrime,
          capitalGaranti: s.capitalGaranti,
          partenaire: s.partenaire.nomCommerce,
          dateDebut: debut,
          dateFin: fin,
          date: s.createdAt,
          refFacture: s.refFacture ?? null,
        });
      }
    }

    if (type !== "incendie") {
      const acc = await prisma.souscriptionAccident.findMany({
        where: { waveStatut: "confirme" },
        include: { partenaire: { select: { nomCommerce: true } } },
        orderBy: { createdAt: "desc" },
      });
      for (const s of acc) {
        out.push({
          id: s.id,
          type: "accident",
          numeroPolice: s.numeroPolice ?? "",
          nom: s.nom,
          prenom: s.prenom,
          telephone: s.telephone,
          montant: s.montantPrime,
          capitalGaranti: s.capitalGaranti,
          partenaire: s.partenaire.nomCommerce,
          dateDebut: s.dateDebut,
          dateFin: s.dateFin,
          date: s.createdAt,
        });
      }
    }

    let list = out;
    if (q) {
      const ql = q.toLowerCase();
      list = out.filter(
        (c) =>
          `${c.prenom} ${c.nom}`.toLowerCase().includes(ql) ||
          c.numeroPolice.toLowerCase().includes(ql) ||
          c.telephone.toLowerCase().includes(ql) ||
          c.partenaire.toLowerCase().includes(ql)
      );
    }

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(list);
  })
);

/** Re-vérifie un paiement Wave bloqué « en attente » et confirme si payé */
souscriptionsRouter.post(
  "/accident/:id/verifier",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    const statut = await verifierPaiementAccident(s);
    if (statut === "confirme" && s.waveStatut !== "confirme") {
      await logAction({
        adminId: req.user!.sub,
        typeAction: "modification",
        objetType: "souscription_accident",
        objetId: s.id,
        valeurApres: { waveStatut: "confirme", source: "verification_wave" },
      });
    }
    res.json({ statut });
  })
);

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

/** Saisie/màj de la réf.facture par l'admin (souscripteur l'a communiquée via un autre canal) */
souscriptionsRouter.patch(
  "/incendie/:id/facture",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { refFacture, commune, quartier, numeroMaison } = (req.body ?? {}) as {
      refFacture?: string;
      commune?: string;
      quartier?: string;
      numeroMaison?: string;
    };
    if (
      !refFacture?.trim() ||
      !commune?.trim() ||
      !quartier?.trim() ||
      !numeroMaison?.trim()
    )
      return res.status(400).json({
        error: "Réf.facture, commune, quartier et numéro de maison sont obligatoires.",
      });

    const s = await prisma.souscriptionIncendie.findUnique({
      where: { id: req.params.id },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });

    if (!(await refFactureDisponible(refFacture.trim(), s.id))) {
      return res.status(409).json({
        error: `Cette référence facture a déjà été utilisée ${MAX_USAGES_REF_FACTURE} fois.`,
      });
    }

    // Commission de référence depuis le barème Incendie
    const tarif = await prisma.tarifIncendie.findFirst({
      where: { prime: s.montantPrime },
    });

    const updated = await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: {
        refFacture: refFacture.trim(),
        commune: commune.trim(),
        quartier: quartier.trim(),
        numeroMaison: numeroMaison.trim(),
        statut: "complet",
        commissionCalculee: tarif?.commission ?? s.commissionCalculee,
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "souscription_incendie",
      objetId: s.id,
      valeurApres: { refFacture: updated.refFacture, statut: "complet" },
    });
    res.json({ ...updated, partenaireNom: undefined });
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
    await sendSMS(
      s.telephone,
      messageIncendie(s.prenom, lienFormulaire("incendie", token))
    );
    const updated = await prisma.souscriptionIncendie.update({
      where: { id: s.id },
      data: {
        lienFormulaireToken: token,
        whatsappEnvoyeAt: new Date(),
        relanceCount: { increment: 1 },
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "souscription_incendie",
      objetId: s.id,
    });
    res.json({ ok: true, relanceCount: updated.relanceCount });
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
          refFacture: r.refFacture ?? "",
          commune: r.commune ?? "",
          quartier: r.quartier ?? "",
          numeroMaison: r.numeroMaison ?? "",
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
          dateNaissance: r.dateNaissance ? r.dateNaissance.toISOString().slice(0, 10) : "",
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
