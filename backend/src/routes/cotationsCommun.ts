// Routes "Mes devis" (Cotation) — partagées entre l'espace partenaire
// (routes/me.ts) et l'espace agent de distribution (routes/agentDistribution.ts),
// chacun montant ce module sur son propre routeur déjà protégé par
// requireAuth("partenaire") / requireAuth("agent_distribution"). Un
// partenaire voit et gère les devis créés par lui-même ET par ses agents ;
// un agent ne voit et ne gère que les siens — même principe de visibilité
// que /me/souscriptions vs /agent-distribution/souscriptions.
//
// La conversion en souscription (paiement par le client) se fait côté
// public — voir GET/POST /public/cotations/:token dans routes/public.ts.

import type { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../util.js";
import type { AuthedRequest, AuthUser } from "../auth.js";
import {
  estProduitCotation,
  calculerCotation,
  ErreurCotation,
  LIBELLES_PRODUIT_COTATION,
  DUREE_VALIDITE_JOURS,
  type ProduitCotation,
} from "../services/cotations.js";

interface Auteur {
  partenaireId: string;
  agentDistributionId: string | null;
}

async function resoudreAuteur(req: AuthedRequest): Promise<Auteur | null> {
  if (req.user!.type === "partenaire") {
    return { partenaireId: req.user!.sub, agentDistributionId: null };
  }
  const agent = await prisma.agentDistribution.findUnique({
    where: { id: req.user!.sub },
    select: { partenaireId: true },
  });
  if (!agent) return null;
  return { partenaireId: agent.partenaireId, agentDistributionId: req.user!.sub };
}

/** Un partenaire gère tout devis sous son enseigne (siens + ceux de ses agents) ; un agent ne gère que les siens. */
function appartientA(
  cotation: { partenaireId: string; agentDistributionId: string | null },
  auteur: Auteur,
  user: AuthUser
) {
  if (user.type === "agent_distribution") return cotation.agentDistributionId === auteur.agentDistributionId;
  return cotation.partenaireId === auteur.partenaireId;
}

function formatCotation(c: {
  id: string;
  token: string;
  produitCode: string;
  entrees: unknown;
  resultat: unknown;
  primeTTC: number;
  capitalGaranti: number;
  libelleFormule: string;
  clientNom: string | null;
  clientTelephone: string | null;
  statut: string;
  dateExpiration: Date | null;
  createdAt: Date;
  souscriptionId: string | null;
}) {
  const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
  return {
    id: c.id,
    token: c.token,
    produitCode: c.produitCode,
    libelleProduit: LIBELLES_PRODUIT_COTATION[c.produitCode as ProduitCotation] ?? c.produitCode,
    entrees: c.entrees,
    resultat: c.resultat,
    primeTTC: c.primeTTC,
    capitalGaranti: c.capitalGaranti,
    libelleFormule: c.libelleFormule,
    clientNom: c.clientNom,
    clientTelephone: c.clientTelephone,
    statut: c.statut,
    dateExpiration: c.dateExpiration,
    createdAt: c.createdAt,
    souscriptionId: c.souscriptionId,
    lien: c.statut !== "brouillon" ? `${appUrl}/devis/${c.token}` : null,
  };
}

const creerCotationSchema = z.object({
  produitCode: z.string(),
  entrees: z.record(z.unknown()),
  clientNom: z.string().max(120).optional(),
  clientTelephone: z.string().max(40).optional(),
});

const modifierCotationSchema = z.object({
  entrees: z.record(z.unknown()).optional(),
  clientNom: z.string().max(120).optional(),
  clientTelephone: z.string().max(40).optional(),
});

export function registerCotationRoutes(router: Router) {
  router.get(
    "/cotations",
    asyncHandler(async (req: AuthedRequest, res) => {
      const auteur = await resoudreAuteur(req);
      if (!auteur) return res.status(404).json({ error: "Introuvable" });
      const cotations = await prisma.cotation.findMany({
        where:
          req.user!.type === "agent_distribution"
            ? { agentDistributionId: auteur.agentDistributionId }
            : { partenaireId: auteur.partenaireId },
        orderBy: { createdAt: "desc" },
      });
      res.json(cotations.map(formatCotation));
    })
  );

  router.post(
    "/cotations",
    asyncHandler(async (req: AuthedRequest, res) => {
      const auteur = await resoudreAuteur(req);
      if (!auteur) return res.status(404).json({ error: "Introuvable" });
      const data = creerCotationSchema.parse(req.body);
      if (!estProduitCotation(data.produitCode)) {
        return res.status(400).json({ error: "Produit non pris en charge pour les devis." });
      }
      let calcul;
      try {
        calcul = await calculerCotation(data.produitCode, data.entrees);
      } catch (err) {
        if (err instanceof ErreurCotation) return res.status(400).json({ error: err.message });
        throw err;
      }
      const cotation = await prisma.cotation.create({
        data: {
          partenaireId: auteur.partenaireId,
          agentDistributionId: auteur.agentDistributionId,
          produitCode: data.produitCode,
          entrees: JSON.parse(JSON.stringify(calcul.entrees)),
          resultat: JSON.parse(JSON.stringify(calcul.resultat)),
          primeTTC: calcul.primeTTC,
          capitalGaranti: calcul.capitalGaranti,
          libelleFormule: calcul.libelleFormule,
          clientNom: data.clientNom || null,
          clientTelephone: data.clientTelephone || null,
        },
      });
      res.status(201).json(formatCotation(cotation));
    })
  );

  router.patch(
    "/cotations/:id",
    asyncHandler(async (req: AuthedRequest, res) => {
      const auteur = await resoudreAuteur(req);
      if (!auteur) return res.status(404).json({ error: "Introuvable" });
      const existant = await prisma.cotation.findUnique({ where: { id: req.params.id } });
      if (!existant || !appartientA(existant, auteur, req.user!)) return res.status(404).json({ error: "Devis introuvable" });
      if (existant.statut === "converti") return res.status(409).json({ error: "Ce devis a déjà été converti en souscription." });

      const data = modifierCotationSchema.parse(req.body);
      const updateData: Record<string, unknown> = {};
      if (data.entrees) {
        let calcul;
        try {
          calcul = await calculerCotation(existant.produitCode as ProduitCotation, data.entrees);
        } catch (err) {
          if (err instanceof ErreurCotation) return res.status(400).json({ error: err.message });
          throw err;
        }
        updateData.entrees = JSON.parse(JSON.stringify(calcul.entrees));
        updateData.resultat = JSON.parse(JSON.stringify(calcul.resultat));
        updateData.primeTTC = calcul.primeTTC;
        updateData.capitalGaranti = calcul.capitalGaranti;
        updateData.libelleFormule = calcul.libelleFormule;
      }
      if (data.clientNom !== undefined) updateData.clientNom = data.clientNom || null;
      if (data.clientTelephone !== undefined) updateData.clientTelephone = data.clientTelephone || null;

      const cotation = await prisma.cotation.update({ where: { id: existant.id }, data: updateData });
      res.json(formatCotation(cotation));
    })
  );

  router.delete(
    "/cotations/:id",
    asyncHandler(async (req: AuthedRequest, res) => {
      const auteur = await resoudreAuteur(req);
      if (!auteur) return res.status(404).json({ error: "Introuvable" });
      const existant = await prisma.cotation.findUnique({ where: { id: req.params.id } });
      if (!existant || !appartientA(existant, auteur, req.user!)) return res.status(404).json({ error: "Devis introuvable" });
      if (existant.statut === "converti") return res.status(409).json({ error: "Ce devis a déjà été converti en souscription." });
      await prisma.cotation.delete({ where: { id: existant.id } });
      res.json({ ok: true });
    })
  );

  /** Génère/renouvelle le lien public — 7 jours de validité à partir de maintenant. */
  router.post(
    "/cotations/:id/partager",
    asyncHandler(async (req: AuthedRequest, res) => {
      const auteur = await resoudreAuteur(req);
      if (!auteur) return res.status(404).json({ error: "Introuvable" });
      const existant = await prisma.cotation.findUnique({ where: { id: req.params.id } });
      if (!existant || !appartientA(existant, auteur, req.user!)) return res.status(404).json({ error: "Devis introuvable" });
      if (existant.statut === "converti") return res.status(409).json({ error: "Ce devis a déjà été converti en souscription." });

      const dateExpiration = new Date();
      dateExpiration.setDate(dateExpiration.getDate() + DUREE_VALIDITE_JOURS);
      const cotation = await prisma.cotation.update({
        where: { id: existant.id },
        data: { statut: "envoye", dateExpiration },
      });
      res.json(formatCotation(cotation));
    })
  );
}
