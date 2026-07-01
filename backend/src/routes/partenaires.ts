import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { newQrToken, qrDataUrl } from "../services/qr.js";
import {
  commissionTotalePartenaire,
  commissionEncaisseePartenaire,
} from "../services/commission.js";
import { notifyAdmins } from "../services/notifications.js";

export const partenairesRouter = Router();
partenairesRouter.use(requireAuth("admin"));

function parseDateRange(req: {
  query: { from?: string; to?: string };
}): { gte?: Date; lte?: Date } | undefined {
  const { from, to } = req.query;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00`);
  if (to) range.lte = new Date(`${to}T23:59:59.999`);
  return range.gte || range.lte ? range : undefined;
}

function genMotDePasseProvisoire(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const part = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part(3)}-${part(4)}`;
}

const baseSchema = z.object({
  nomCommerce: z.string().min(1),
  nomResponsable: z.string().min(1),
  telephone: z.string().min(1),
  localisation: z.string().min(1),
  typeCommerce: z.enum(["Electronique", "Vulcanisateur", "MecaniqueGarage", "AccessoireAuto"]),
  produit: z.enum(["incendie", "accident"]),
  email: z.string().email().optional().or(z.literal("")),
});

const createSchema = baseSchema;

const patchSchema = baseSchema.partial().extend({
  motDePasse: z.string().min(1).optional(),
});

async function withCounts(id: string) {
  const [incendie, accident] = await Promise.all([
    prisma.souscriptionIncendie.count({ where: { partenaireId: id } }),
    prisma.souscriptionAccident.count({ where: { partenaireId: id } }),
  ]);
  return { clientsIncendie: incendie, clientsAccident: accident };
}

partenairesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, statut } = req.query as { q?: string; statut?: string };
    const list = await prisma.partenaire.findMany({
      where: {
        statut: statut === "actif" || statut === "inactif" ? statut : undefined,
        OR: q
          ? [
              { nomCommerce: { contains: q, mode: "insensitive" } },
              { localisation: { contains: q, mode: "insensitive" } },
              { nomResponsable: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { incendie: true, accident: true } },
      },
    });
    res.json(
      list.map((p) => ({
        ...p,
        passwordHash: undefined,
        clientsIncendie: p._count.incendie,
        clientsAccident: p._count.accident,
      }))
    );
  })
);

partenairesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const p = await prisma.partenaire.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    const counts = await withCounts(p.id);
    res.json({ ...p, passwordHash: undefined, ...counts });
  })
);

/** Détails d'un partenaire : souscripteurs + commission (totale / encaissée / due), avec filtre période */
partenairesRouter.get(
  "/:id/details",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const p = await prisma.partenaire.findUnique({ where: { id } });
    if (!p) return res.status(404).json({ error: "Introuvable" });

    const range = parseDateRange(req as { query: { from?: string; to?: string } });
    const dateWhere = range ? { createdAt: range } : {};

    const [incendie, accident, totaleAllTime, genereePeriode, encaissee] =
      await Promise.all([
        prisma.souscriptionIncendie.findMany({
          where: { partenaireId: id, ...dateWhere },
          orderBy: { createdAt: "desc" },
        }),
        prisma.souscriptionAccident.findMany({
          where: { partenaireId: id, ...dateWhere },
          orderBy: { createdAt: "desc" },
        }),
        commissionTotalePartenaire(id),
        commissionTotalePartenaire(id, dateWhere),
        commissionEncaisseePartenaire(id),
      ]);

    res.json({
      partenaire: {
        id: p.id,
        nomCommerce: p.nomCommerce,
        nomResponsable: p.nomResponsable,
        telephone: p.telephone,
        localisation: p.localisation,
        email: p.email,
        statut: p.statut,
        produitIncendie: p.produitIncendie,
        produitAccident: p.produitAccident,
      },
      souscripteursIncendie: incendie,
      souscripteursAccident: accident,
      commissionTotale: Math.round(totaleAllTime),
      commissionGenereePeriode: Math.round(genereePeriode),
      commissionEncaissee: Math.round(encaissee),
      commissionDue: Math.round(totaleAllTime - encaissee),
    });
  })
);

partenairesRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const isIncendie = data.produit === "incendie";

    const motDePasseProvisoire = data.email ? genMotDePasseProvisoire() : null;

    const created = await prisma.partenaire.create({
      data: {
        nomCommerce: data.nomCommerce,
        nomResponsable: data.nomResponsable,
        telephone: data.telephone,
        localisation: data.localisation,
        typeCommerce: data.typeCommerce,
        produitIncendie: isIncendie,
        produitAccident: !isIncendie,
        email: data.email || null,
        passwordHash: motDePasseProvisoire
          ? await bcrypt.hash(motDePasseProvisoire, 10)
          : null,
        qrIncendie1000Token: isIncendie ? newQrToken("i1k") : null,
        qrIncendie2000Token: isIncendie ? newQrToken("i2k") : null,
        qrAccidentToken: !isIncendie ? newQrToken("acc") : null,
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "partenaire",
      objetId: created.id,
      valeurApres: { ...created, passwordHash: undefined },
    });
    await notifyAdmins(
      "partenaire_cree",
      "Nouveau partenaire",
      `${created.nomCommerce} (${created.localisation}) a été ajouté au réseau.`,
      "/admin/partenaires"
    );
    res.status(201).json({
      ...created,
      passwordHash: undefined,
      motDePasseProvisoire,
    });
  })
);

partenairesRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const before = await prisma.partenaire.findUnique({
      where: { id: req.params.id },
    });
    if (!before) return res.status(404).json({ error: "Introuvable" });
    const data = patchSchema.parse(req.body);

    const isIncendie = data.produit != null
      ? data.produit === "incendie"
      : before.produitIncendie;

    const updated = await prisma.partenaire.update({
      where: { id: req.params.id },
      data: {
        nomCommerce: data.nomCommerce,
        nomResponsable: data.nomResponsable,
        telephone: data.telephone,
        localisation: data.localisation,
        typeCommerce: data.typeCommerce,
        produitIncendie: data.produit != null ? isIncendie : undefined,
        produitAccident: data.produit != null ? !isIncendie : undefined,
        email: data.email === "" ? null : data.email,
        qrIncendie1000Token:
          data.produit != null && isIncendie && !before.qrIncendie1000Token
            ? newQrToken("i1k")
            : undefined,
        qrIncendie2000Token:
          data.produit != null && isIncendie && !before.qrIncendie2000Token
            ? newQrToken("i2k")
            : undefined,
        qrAccidentToken:
          data.produit != null && !isIncendie && !before.qrAccidentToken
            ? newQrToken("acc")
            : undefined,
        passwordHash: data.motDePasse
          ? await bcrypt.hash(data.motDePasse, 10)
          : undefined,
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "partenaire",
      objetId: updated.id,
      valeurAvant: { ...before, passwordHash: undefined },
      valeurApres: { ...updated, passwordHash: undefined },
    });
    res.json({ ...updated, passwordHash: undefined });
  })
);

partenairesRouter.post(
  "/:id/statut",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { statut } = req.body as { statut: "actif" | "inactif" };
    const updated = await prisma.partenaire.update({
      where: { id: req.params.id },
      data: { statut },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "partenaire",
      objetId: updated.id,
      valeurApres: { statut },
    });
    await notifyAdmins(
      "partenaire_statut",
      "Statut partenaire modifié",
      `${updated.nomCommerce} est désormais ${statut}.`,
      "/admin/partenaires"
    );
    res.json({ ...updated, passwordHash: undefined });
  })
);

partenairesRouter.delete(
  "/:id",
  requireSuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const counts = await withCounts(req.params.id);
    if (counts.clientsIncendie + counts.clientsAccident > 0) {
      return res
        .status(409)
        .json({ error: "Impossible : des clients sont liés à ce partenaire" });
    }
    await prisma.partenaire.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "partenaire",
      objetId: req.params.id,
    });
    res.json({ ok: true });
  })
);

partenairesRouter.get(
  "/:id/qr/:produit",
  asyncHandler(async (req, res) => {
    const produit = req.params.produit as "incendie1000" | "incendie2000" | "accident";
    const p = await prisma.partenaire.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    const token =
      produit === "incendie1000" ? p.qrIncendie1000Token
      : produit === "incendie2000" ? p.qrIncendie2000Token
      : p.qrAccidentToken;
    if (!token)
      return res.status(404).json({ error: "QR non disponible pour ce produit" });
    const qrProduit: "incendie" | "accident" = produit === "accident" ? "accident" : "incendie";
    const dataUrl = await qrDataUrl(qrProduit, token);
    res.json({ produit, token, dataUrl });
  })
);
