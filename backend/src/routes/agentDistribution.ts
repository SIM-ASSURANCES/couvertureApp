import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { qrDataUrl } from "../services/qr.js";
import { commissionStatsAgent } from "../services/commission.js";
import { notifyAdmins } from "../services/notifications.js";

const JOURS_CYCLE = 14;

/** Espace agent de distribution (Incendie/Accident) : lecture seule de son activité + QR + mot de passe. */
export const agentDistributionRouter = Router();
agentDistributionRouter.use(requireAuth("agent_distribution"));

agentDistributionRouter.get(
  "/moi",
  asyncHandler(async (req: AuthedRequest, res) => {
    const a = await prisma.agentDistribution.findUnique({
      where: { id: req.user!.sub },
      include: { partenaire: { select: { nomCommerce: true, produitIncendie: true, produitAccident: true } } },
    });
    if (!a) return res.status(404).json({ error: "Introuvable" });
    // QR sélecteur de l'agent lui-même — filtré sur `produitId: null` pour
    // couvrir aussi bien l'ancien QR scopé à une Assurance que le nouveau QR
    // unique (`sousBranche` null, refonte 2026-08-07).
    const qrSelecteur = await prisma.qrCode.findFirst({
      where: { agentDistributionId: a.id, produitId: null },
      select: { sousBranche: true },
    });
    res.json({
      id: a.id,
      nom: a.nom,
      telephone: a.telephone,
      localisation: a.localisation,
      statut: a.statut,
      partenaireNom: a.partenaire.nomCommerce,
      produit: a.partenaire.produitIncendie ? "incendie" : "accident",
      sousBranche: qrSelecteur?.sousBranche ?? null,
      qrUnifie: !!qrSelecteur && qrSelecteur.sousBranche == null,
      forcerChangementMotDePasse: a.forcerChangementMotDePasse,
    });
  })
);

agentDistributionRouter.get(
  "/qr/:produit",
  asyncHandler(async (req: AuthedRequest, res) => {
    const a = await prisma.agentDistribution.findUnique({ where: { id: req.user!.sub } });
    if (!a) return res.status(404).json({ error: "Introuvable" });
    const produit = req.params.produit as
      | "incendie1000"
      | "incendie2000"
      | "accident"
      | "ASSURANCES_ACCIDENTS"
      | "ASSURANCES_DOMMAGES"
      | "UNIFIE";

    if (produit === "ASSURANCES_ACCIDENTS" || produit === "ASSURANCES_DOMMAGES") {
      const qr = await prisma.qrCode.findFirst({
        where: { agentDistributionId: a.id, sousBranche: produit },
      });
      if (!qr) return res.status(404).json({ error: "QR non disponible" });
      const couleur = produit === "ASSURANCES_ACCIDENTS" ? "#15803d" : "#b45309";
      return res.json({ produit, token: qr.token, dataUrl: await qrDataUrl("choisir", qr.token, couleur) });
    }

    if (produit === "UNIFIE") {
      const qr = await prisma.qrCode.findFirst({
        where: { agentDistributionId: a.id, produitId: null, sousBranche: null },
      });
      if (!qr) return res.status(404).json({ error: "QR non disponible" });
      return res.json({ produit, token: qr.token, dataUrl: await qrDataUrl("choisir", qr.token, "#004b9c") });
    }

    const token =
      produit === "incendie1000" ? a.qrIncendie1000Token
      : produit === "incendie2000" ? a.qrIncendie2000Token
      : a.qrAccidentToken;
    if (!token) return res.status(404).json({ error: "QR non disponible" });
    const qrProduit: "incendie" | "accident" = produit === "accident" ? "accident" : "incendie";
    res.json({ produit, token, dataUrl: await qrDataUrl(qrProduit, token) });
  })
);

agentDistributionRouter.get(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const agentDistributionId = req.user!.sub;
    const [incendie, accident, generique] = await Promise.all([
      prisma.souscriptionIncendie.findMany({
        where: { agentDistributionId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.souscriptionAccident.findMany({
        where: { agentDistributionId },
        orderBy: { createdAt: "desc" },
      }),
      // Modèle générique (RelaxMoto/Auto, RelaxAccidents, RelaxVoyage,
      // SecurHome+, SecurPro Dommages) — sans ceci, un agent dont les ventes
      // sont uniquement sur ces produits voyait toujours "0 souscription".
      prisma.souscription.findMany({
        where: { agentDistributionId, waveStatut: "confirme" },
        include: { produit: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({
      incendie: incendie.map((s) => ({
        id: s.id,
        produit: "incendie" as const,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        montantPrime: s.montantPrime,
        statut: s.statut,
        createdAt: s.createdAt,
      })),
      accident: accident.map((s) => ({
        id: s.id,
        produit: "accident" as const,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        montantPrime: s.montantPrime,
        statut: s.waveStatut,
        createdAt: s.createdAt,
      })),
      generique: generique.map((s) => ({
        id: s.id,
        produit: s.produit.code,
        nom: s.nom,
        prenom: s.prenom,
        telephone: s.telephone,
        montantPrime: s.montantPrime,
        statut: s.waveStatut,
        createdAt: s.createdAt,
      })),
    });
  })
);

const motDePasseSchema = z.object({
  ancienMotDePasse: z.string().min(1),
  nouveauMotDePasse: z.string().min(6),
});

agentDistributionRouter.patch(
  "/mot-de-passe",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = motDePasseSchema.parse(req.body);
    const a = await prisma.agentDistribution.findUnique({ where: { id: req.user!.sub } });
    if (!a || !a.passwordHash || !(await bcrypt.compare(data.ancienMotDePasse, a.passwordHash))) {
      return res.status(401).json({ error: "Ancien mot de passe incorrect" });
    }
    await prisma.agentDistribution.update({
      where: { id: a.id },
      data: {
        passwordHash: await bcrypt.hash(data.nouveauMotDePasse, 10),
        forcerChangementMotDePasse: false,
      },
    });
    res.json({ ok: true });
  })
);

/* ── Commission : stats + cycle de demande (14 jours), validées par l'admin ── */

function prochaineDate(derniere: Date): Date {
  const d = new Date(derniere);
  d.setDate(d.getDate() + JOURS_CYCLE);
  return d;
}

agentDistributionRouter.get(
  "/commission",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const [stats, demandes] = await Promise.all([
      commissionStatsAgent(id),
      prisma.demandeCommission.findMany({
        where: { agentDistributionId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const enAttente = demandes.some((d) => d.statut === "en_attente");
    const derniere = demandes[0];
    const prochaine = derniere ? prochaineDate(derniere.createdAt) : null;
    const cycleAtteint = !prochaine || prochaine <= new Date();
    const canRequest = stats.due > 0 && !enAttente && cycleAtteint;

    res.json({
      ...stats,
      canRequest,
      enAttente,
      prochaineDate: prochaine,
      demandes,
    });
  })
);

agentDistributionRouter.post(
  "/commission/demande",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const stats = await commissionStatsAgent(id);
    if (stats.due <= 0)
      return res.status(400).json({ error: "Aucune commission due actuellement." });

    const demandes = await prisma.demandeCommission.findMany({
      where: { agentDistributionId: id },
      orderBy: { createdAt: "desc" },
    });
    if (demandes.some((d) => d.statut === "en_attente"))
      return res.status(409).json({ error: "Une demande est déjà en attente de validation." });
    const derniere = demandes[0];
    if (derniere) {
      const prochaine = prochaineDate(derniere.createdAt);
      if (prochaine > new Date())
        return res.status(429).json({
          error: `Prochaine demande possible le ${prochaine.toLocaleDateString("fr-FR")}.`,
        });
    }

    const a = await prisma.agentDistribution.findUnique({
      where: { id },
      include: { partenaire: { select: { nomCommerce: true, branche: true } } },
    });
    if (!a) return res.status(404).json({ error: "Introuvable" });

    const demande = await prisma.demandeCommission.create({
      data: { partenaireId: a.partenaireId, agentDistributionId: id, montant: stats.due },
    });
    await notifyAdmins(
      a.partenaire.branche ?? "INCENDIE_ACCIDENT",
      "commission_demande",
      "Nouvelle demande de commission (agent)",
      `${a.nom}, agent de ${a.partenaire.nomCommerce}, demande le versement de ${stats.due} FCFA.`,
      "/admin/performance"
    );
    res.status(201).json(demande);
  })
);
