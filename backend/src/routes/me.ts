import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { qrDataUrl } from "../services/qr.js";
import { commissionStatsPartenaire } from "../services/commission.js";
import { notifyAdmins } from "../services/notifications.js";

export const meRouter = Router();
meRouter.use(requireAuth("partenaire"));

const JOURS_CYCLE = 14;

function parseDateRange(req: {
  query: { from?: string; to?: string };
}): { gte?: Date; lte?: Date } | undefined {
  const { from, to } = req.query;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00`);
  if (to) range.lte = new Date(`${to}T23:59:59.999`);
  return range.gte || range.lte ? range : undefined;
}

/** Primes (TTC), CA (Prime TTC − Taxes) et commission depuis le barème */
function depuisBareme(
  groups: { montantPrime: number; _count: { _all: number } }[],
  tarifs: { prime: number; taxes: number | null; commission: number }[]
) {
  const map = new Map(tarifs.map((t) => [t.prime, t]));
  let primes = 0;
  let ca = 0;
  let commission = 0;
  let count = 0;
  for (const g of groups) {
    const t = map.get(g.montantPrime);
    const tx = t?.taxes ?? 0;
    const com = t?.commission ?? 0;
    const n = g._count._all;
    primes += g.montantPrime * n;
    ca += (g.montantPrime - tx) * n;
    commission += com * n;
    count += n;
  }
  return { primes, ca, commission, count };
}

meRouter.get(
  "/overview",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const createdAt = parseDateRange(req as { query: { from?: string; to?: string } });
    const dateWhere = createdAt ? { createdAt } : {};

    const [p, incGroups, accCount, accGroups, tarifsInc, tarifsAcc] =
      await Promise.all([
        prisma.partenaire.findUnique({ where: { id } }),
        prisma.souscriptionIncendie.groupBy({
          by: ["montantPrime"],
          where: { partenaireId: id, ...dateWhere },
          _count: { _all: true },
        }),
        prisma.souscriptionAccident.count({ where: { partenaireId: id, ...dateWhere } }),
        prisma.souscriptionAccident.groupBy({
          by: ["montantPrime"],
          where: { partenaireId: id, ...dateWhere, waveStatut: "confirme" },
          _count: { _all: true },
        }),
        prisma.tarifIncendie.findMany(),
        prisma.tarifAccident.findMany(),
      ]);

    if (!p) return res.status(404).json({ error: "Introuvable" });

    const produit = p.produitIncendie ? "incendie" : "accident";
    const inc = depuisBareme(incGroups, tarifsInc);
    const acc = depuisBareme(accGroups, tarifsAcc);

    const estIncendie = produit === "incendie";

    res.json({
      partenaire: {
        id: p.id,
        nomCommerce: p.nomCommerce,
        nomResponsable: p.nomResponsable,
        localisation: p.localisation,
      },
      produit,
      clientsIncendie: inc.count,
      clientsAccident: accCount,
      primesIncendie: inc.primes,
      primesAccident: acc.primes,
      chiffreAffaires: Math.round(estIncendie ? inc.ca : acc.ca),
      commission: Math.round(estIncendie ? inc.commission : acc.commission),
    });
  })
);

meRouter.get(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const [incendie, accident] = await Promise.all([
      prisma.souscriptionIncendie.findMany({
        where: { partenaireId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.souscriptionAccident.findMany({
        where: { partenaireId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({ incendie, accident });
  })
);

meRouter.get(
  "/qr/:produit",
  asyncHandler(async (req: AuthedRequest, res) => {
    const produit = req.params.produit as "incendie1000" | "incendie2000" | "accident";
    const p = await prisma.partenaire.findUnique({ where: { id: req.user!.sub } });
    if (!p) return res.status(404).json({ error: "Introuvable" });

    const token =
      produit === "incendie1000" ? p.qrIncendie1000Token
      : produit === "incendie2000" ? p.qrIncendie2000Token
      : p.qrAccidentToken;

    if (!token) return res.status(404).json({ error: "QR non disponible" });

    const qrProduit: "incendie" | "accident" = produit === "accident" ? "accident" : "incendie";
    res.json({ produit, token, dataUrl: await qrDataUrl(qrProduit, token) });
  })
);

/* ── Commission : stats + cycle de demande (14 jours) ── */

function prochaineDate(derniere: Date): Date {
  const d = new Date(derniere);
  d.setDate(d.getDate() + JOURS_CYCLE);
  return d;
}

meRouter.get(
  "/commission",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const [stats, demandes] = await Promise.all([
      commissionStatsPartenaire(id),
      prisma.demandeCommission.findMany({
        where: { partenaireId: id },
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

meRouter.post(
  "/commission/demande",
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = req.user!.sub;
    const stats = await commissionStatsPartenaire(id);
    if (stats.due <= 0)
      return res.status(400).json({ error: "Aucune commission due actuellement." });

    const demandes = await prisma.demandeCommission.findMany({
      where: { partenaireId: id },
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

    const p = await prisma.partenaire.findUnique({ where: { id } });
    const demande = await prisma.demandeCommission.create({
      data: { partenaireId: id, montant: stats.due },
    });
    await notifyAdmins(
      "commission_demande",
      "Nouvelle demande de commission",
      `${p?.nomCommerce ?? "Un partenaire"} demande le versement de ${stats.due} FCFA.`,
      "/admin/performance"
    );
    res.status(201).json(demande);
  })
);

/* ── Édition du profil partenaire ── */

const profilSchema = z.object({
  nomResponsable: z.string().min(1).optional(),
  telephone: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  motDePasse: z.string().min(6).optional(),
});

meRouter.get(
  "/profile",
  asyncHandler(async (req: AuthedRequest, res) => {
    const p = await prisma.partenaire.findUnique({ where: { id: req.user!.sub } });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    res.json({
      id: p.id,
      nomCommerce: p.nomCommerce,
      nomResponsable: p.nomResponsable,
      telephone: p.telephone,
      localisation: p.localisation,
      email: p.email,
    });
  })
);

meRouter.patch(
  "/profile",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = profilSchema.parse(req.body);
    const updated = await prisma.partenaire.update({
      where: { id: req.user!.sub },
      data: {
        nomResponsable: data.nomResponsable,
        telephone: data.telephone,
        email: data.email === "" ? null : data.email,
        passwordHash: data.motDePasse
          ? await bcrypt.hash(data.motDePasse, 10)
          : undefined,
      },
    });
    res.json({
      id: updated.id,
      nomCommerce: updated.nomCommerce,
      nomResponsable: updated.nomResponsable,
      telephone: updated.telephone,
      localisation: updated.localisation,
      email: updated.email,
    });
  })
);
