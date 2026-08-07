import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireAnySuperAdmin, requireSuperAdminBranche, estSuperAdminBranche, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { newQrToken, qrDataUrl } from "../services/qr.js";
import {
  commissionTotalePartenaire,
  commissionEncaisseePartenaire,
  commissionMensuellePartenaire,
} from "../services/commission.js";
import { notifyAdmins } from "../services/notifications.js";
import { commissionTotaleAgent } from "../services/commission.js";

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
  // Nom de l'entreprise : requis pour Incendie/Accident (imposé par ce
  // formulaire dédié), facultatif pour Relax (formulaire dédié, replié sur
  // nomResponsable si absent — voir POST /).
  nomCommerce: z.string().optional(),
  nomResponsable: z.string().min(1),
  telephone: z.string().min(1),
  // Facultatifs : ne concernent pas la branche Relax.
  localisation: z.string().min(1).optional(),
  typeCommerce: z.enum(["Electronique", "Vulcanisateur", "MecaniqueGarage", "AccessoireAuto"]).optional(),
  // Trois façons (mutuellement exclusives) d'assigner un partenaire :
  // - `produit` (historique) : un produit précis (Incendie/Accident restants,
  //   ou Relax) — un QR précis par produit.
  // - `sousBranche` (Phase 2, conservé pour rétrocompatibilité API) : une
  //   Assurance entière figée à la création (Accidents OU Dommages) — un QR
  //   "sélecteur" scopé à cette seule Assurance. Le formulaire admin ne
  //   propose plus ce choix (voir POST / ci-dessous) mais un appel API direct
  //   peut encore l'utiliser.
  // - ni l'un ni l'autre (défaut du formulaire admin depuis la refonte QR
  //   unique) : un seul QrCode entièrement générique (produitId et
  //   sousBranche tous deux null) — le prospect choisit son Assurance
  //   (Accidents ou Dommages) PUIS son produit après le scan (voir routes
  //   publiques /qr/:token).
  produit: z.enum(["incendie", "accident", "relaxmoto", "relaxauto", "relaxaccidents_fraismedicaux"]).optional(),
  sousBranche: z.enum(["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"]).optional(),
  email: z.string().min(1, "Email requis").email("Email invalide"),
});

const PRODUITS_RELAX = ["relaxmoto", "relaxauto"] as const;
type ProduitRelax = (typeof PRODUITS_RELAX)[number];
function isProduitRelax(p: string): p is ProduitRelax {
  return (PRODUITS_RELAX as readonly string[]).includes(p);
}

// Sous-branche "Assurances Accidents" (refonte Incendie/Accident) : reste
// rattachée à Branche.INCENDIE_ACCIDENT (permissions super-admin inchangées),
// mais utilise le modèle générique QrCode/Souscription comme Relax, pas les
// colonnes qrAccidentToken/produitAccident historiques.
const PRODUITS_ACCIDENTS_GENERIQUE = ["relaxaccidents_fraismedicaux"] as const;
type ProduitAccidentsGenerique = (typeof PRODUITS_ACCIDENTS_GENERIQUE)[number];
function isProduitAccidentsGenerique(p: string): p is ProduitAccidentsGenerique {
  return (PRODUITS_ACCIDENTS_GENERIQUE as readonly string[]).includes(p);
}
function isProduitGenerique(p: string): p is ProduitRelax | ProduitAccidentsGenerique {
  return isProduitRelax(p) || isProduitAccidentsGenerique(p);
}
function prefixeQr(produit: string): string {
  if (produit === "relaxmoto") return "rmo";
  if (produit === "relaxauto") return "rau";
  return "raf"; // relaxaccidents_fraismedicaux
}

const createSchema = baseSchema.refine((d) => !(d.produit != null && d.sousBranche != null), {
  message: "Indiquer soit un produit, soit une Assurance (sousBranche), jamais les deux.",
});

const patchSchema = baseSchema.partial().extend({
  motDePasse: z.string().min(1).optional(),
});

async function withCounts(id: string) {
  const [incendie, accident, relax] = await Promise.all([
    prisma.souscriptionIncendie.count({ where: { partenaireId: id } }),
    // Un accident n'est compté comme client qu'une fois le paiement Wave confirmé.
    prisma.souscriptionAccident.count({ where: { partenaireId: id, waveStatut: "confirme" } }),
    // Produits génériques (RelaxMoto/RelaxAuto, tous à paiement Wave)
    prisma.souscription.count({ where: { partenaireId: id, waveStatut: "confirme" } }),
  ]);
  return { clientsIncendie: incendie, clientsAccident: accident, clientsRelax: relax };
}

partenairesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, statut, branche, produit } = req.query as { q?: string; statut?: string; branche?: string; produit?: string };
    const list = await prisma.partenaire.findMany({
      where: {
        statut: statut === "actif" || statut === "inactif" ? statut : undefined,
        branche: branche === "INCENDIE_ACCIDENT" || branche === "RELAX" ? branche : undefined,
        // Filtre par produit générique précis (ex. "relaxaccidents_fraismedicaux")
        // — nécessaire quand plusieurs produits génériques partagent la même
        // branche (Assurances Accidents reste rattachée à INCENDIE_ACCIDENT).
        qrCodes: produit ? { some: { produit: { code: produit } } } : undefined,
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
        // Un accident/relax n'est compté comme client qu'une fois le paiement Wave confirmé.
        _count: {
          select: {
            incendie: true,
            accident: { where: { waveStatut: "confirme" } },
            souscriptionsGen: { where: { waveStatut: "confirme" } },
          },
        },
        // QR sélecteur (au plus un par partenaire, voir contrainte d'unicité
        // sur QrCode) : filtré sur `produitId: null` (et non plus
        // `sousBranche: { not: null }`) pour couvrir aussi bien l'ancien QR
        // scopé à une seule Assurance (`sousBranche` renseigné) que le nouveau
        // QR unique (`sousBranche` null) — voir `qrUnifie` ci-dessous.
        qrCodes: { where: { produitId: null }, select: { sousBranche: true }, take: 1 },
      },
    });
    res.json(
      list.map((p) => ({
        ...p,
        passwordHash: undefined,
        clientsIncendie: p._count.incendie,
        clientsAccident: p._count.accident,
        clientsRelax: p._count.souscriptionsGen,
        sousBranche: p.qrCodes[0]?.sousBranche ?? null,
        // Vrai si le partenaire a un QR sélecteur mais qu'il n'est PAS figé
        // sur une Assurance précise (nouveau QR unique, refonte 2026-08-07).
        qrUnifie: p.qrCodes.length > 0 && p.qrCodes[0].sousBranche == null,
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

    const [incendie, accident, totaleAllTime, genereePeriode, encaissee, mensuelle] =
      await Promise.all([
        prisma.souscriptionIncendie.findMany({
          where: { partenaireId: id, ...dateWhere },
          orderBy: { createdAt: "desc" },
        }),
        prisma.souscriptionAccident.findMany({
          where: { partenaireId: id, ...dateWhere, waveStatut: "confirme" },
          orderBy: { createdAt: "desc" },
        }),
        commissionTotalePartenaire(id),
        commissionTotalePartenaire(id, dateWhere),
        commissionEncaisseePartenaire(id),
        commissionMensuellePartenaire(id),
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
      commissionMensuelle: mensuelle,
    });
  })
);

partenairesRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const relax = data.produit ? isProduitRelax(data.produit) : false;
    const generique = data.produit ? isProduitGenerique(data.produit) : false;
    const isIncendie = data.produit === "incendie";
    const isAccident = data.produit === "accident";

    const motDePasseProvisoire = data.email ? genMotDePasseProvisoire() : null;

    const created = await prisma.partenaire.create({
      data: {
        // Replié sur le nom du responsable si aucun nom d'entreprise n'est fourni (branche Relax).
        nomCommerce: data.nomCommerce?.trim() || data.nomResponsable,
        nomResponsable: data.nomResponsable,
        telephone: data.telephone,
        localisation: data.localisation,
        typeCommerce: data.typeCommerce,
        branche: relax ? "RELAX" : "INCENDIE_ACCIDENT",
        produitIncendie: data.produit === "incendie",
        produitAccident: isAccident,
        email: data.email || null,
        passwordHash: motDePasseProvisoire
          ? await bcrypt.hash(motDePasseProvisoire, 10)
          : null,
        qrIncendie1000Token: isIncendie ? newQrToken("i1k") : null,
        qrIncendie2000Token: isIncendie ? newQrToken("i2k") : null,
        qrAccidentToken: isAccident ? newQrToken("acc") : null,
      },
    });

    if (generique && data.produit) {
      const produit = await prisma.produit.findUnique({ where: { code: data.produit } });
      if (produit) {
        await prisma.qrCode.create({
          data: {
            partenaireId: created.id,
            produitId: produit.id,
            token: newQrToken(prefixeQr(data.produit)),
          },
        });
      }
    }

    // Un seul QR "sélecteur" pour toute l'Assurance choisie (le prospect
    // scanne, puis choisit son produit — voir GET /public/qr/:token).
    // Rétrocompatibilité API uniquement : le formulaire admin n'envoie plus
    // `sousBranche` (voir le cas générique juste en dessous).
    if (data.sousBranche) {
      await prisma.qrCode.create({
        data: {
          partenaireId: created.id,
          sousBranche: data.sousBranche,
          token: newQrToken(data.sousBranche === "ASSURANCES_ACCIDENTS" ? "acc" : "dom"),
        },
      });
    }

    // Nouveau QR unique (refonte 2026-08-07) : ni produit précis ni Assurance
    // figée — le prospect choisit son Assurance (Accidents ou Dommages) PUIS
    // son produit après le scan (voir GET /public/qr/:token, branche
    // `!produitId && !sousBranche`).
    if (!data.produit && !data.sousBranche) {
      await prisma.qrCode.create({
        data: {
          partenaireId: created.id,
          token: newQrToken("qr"),
        },
      });
    }

    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "partenaire",
      objetId: created.id,
      valeurApres: { ...created, passwordHash: undefined },
    });
    await notifyAdmins(
      created.branche ?? "INCENDIE_ACCIDENT",
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
    const relax = data.produit != null ? isProduitRelax(data.produit) : before.branche === "RELAX";
    const generique = data.produit != null ? isProduitGenerique(data.produit) : false;

    const isIncendie = data.produit != null
      ? data.produit === "incendie"
      : before.produitIncendie;
    const isAccident = data.produit != null
      ? data.produit === "accident"
      : before.produitAccident;

    const updated = await prisma.partenaire.update({
      where: { id: req.params.id },
      data: {
        nomCommerce: data.nomCommerce,
        nomResponsable: data.nomResponsable,
        telephone: data.telephone,
        localisation: data.localisation,
        typeCommerce: data.typeCommerce,
        branche: data.produit != null ? (relax ? "RELAX" : "INCENDIE_ACCIDENT") : undefined,
        produitIncendie: data.produit != null ? isIncendie : undefined,
        produitAccident: data.produit != null ? isAccident : undefined,
        email: data.email,
        qrIncendie1000Token:
          data.produit != null && isIncendie && !before.qrIncendie1000Token
            ? newQrToken("i1k")
            : undefined,
        qrIncendie2000Token:
          data.produit != null && isIncendie && !before.qrIncendie2000Token
            ? newQrToken("i2k")
            : undefined,
        qrAccidentToken:
          data.produit != null && isAccident && !before.qrAccidentToken
            ? newQrToken("acc")
            : undefined,
        passwordHash: data.motDePasse
          ? await bcrypt.hash(data.motDePasse, 10)
          : undefined,
      },
    });

    if (data.produit != null && generique) {
      const produit = await prisma.produit.findUnique({ where: { code: data.produit } });
      if (produit) {
        const existing = await prisma.qrCode.findFirst({
          where: { partenaireId: updated.id, produitId: produit.id, libelleVariante: null },
        });
        if (!existing) {
          await prisma.qrCode.create({
            data: {
              partenaireId: updated.id,
              produitId: produit.id,
              token: newQrToken(prefixeQr(data.produit)),
            },
          });
        }
      }
    }

    if (data.sousBranche != null) {
      const existing = await prisma.qrCode.findFirst({
        where: { partenaireId: updated.id, sousBranche: data.sousBranche },
      });
      if (!existing) {
        await prisma.qrCode.create({
          data: {
            partenaireId: updated.id,
            sousBranche: data.sousBranche,
            token: newQrToken(data.sousBranche === "ASSURANCES_ACCIDENTS" ? "acc" : "dom"),
          },
        });
      }
      if (data.sousBranche === "ASSURANCES_DOMMAGES" && !updated.qrIncendie1000Token) {
        await prisma.partenaire.update({
          where: { id: updated.id },
          data: { qrIncendie1000Token: newQrToken("i1k") },
        });
      }
    }

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
      updated.branche ?? "INCENDIE_ACCIDENT",
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
  requireAnySuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const p = await prisma.partenaire.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    if (!estSuperAdminBranche(req.user, p.branche ?? "INCENDIE_ACCIDENT")) {
      return res.status(403).json({ error: "Réservé au Super Administrateur de cette branche" });
    }
    const counts = await withCounts(req.params.id);
    if (counts.clientsIncendie + counts.clientsAccident + counts.clientsRelax > 0) {
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

/**
 * Agents de distribution d'un partenaire (Incendie/Accident) — vue et
 * suppression réservées au Super Administrateur de la branche, pour lui
 * donner un contrôle total sur les agents créés par ses partenaires.
 */
partenairesRouter.get(
  "/:id/agents",
  requireSuperAdminBranche("INCENDIE_ACCIDENT"),
  asyncHandler(async (req, res) => {
    const agents = await prisma.agentDistribution.findMany({
      where: { partenaireId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    const rows = await Promise.all(
      agents.map(async (a) => {
        const [nbIncendie, nbAccident, commissionTotale] = await Promise.all([
          prisma.souscriptionIncendie.count({ where: { agentDistributionId: a.id } }),
          prisma.souscriptionAccident.count({ where: { agentDistributionId: a.id, waveStatut: "confirme" } }),
          commissionTotaleAgent(a.id),
        ]);
        return {
          id: a.id,
          nom: a.nom,
          telephone: a.telephone,
          localisation: a.localisation,
          statut: a.statut,
          createdAt: a.createdAt,
          nombreSouscriptions: nbIncendie + nbAccident,
          commissionTotale: Math.round(commissionTotale),
        };
      })
    );
    res.json(rows);
  })
);

partenairesRouter.delete(
  "/:partenaireId/agents/:agentId",
  requireSuperAdminBranche("INCENDIE_ACCIDENT"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const agent = await prisma.agentDistribution.findUnique({ where: { id: req.params.agentId } });
    if (!agent || agent.partenaireId !== req.params.partenaireId) {
      return res.status(404).json({ error: "Introuvable" });
    }
    await prisma.agentDistribution.delete({ where: { id: agent.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "agent_distribution",
      objetId: agent.id,
    });
    res.status(204).end();
  })
);

partenairesRouter.get(
  "/:id/qr/:produit",
  asyncHandler(async (req, res) => {
    const produit = req.params.produit as
      | "incendie1000"
      | "incendie2000"
      | "accident"
      | ProduitRelax
      | ProduitAccidentsGenerique
      | "ASSURANCES_ACCIDENTS"
      | "ASSURANCES_DOMMAGES"
      | "UNIFIE";

    // QR "sélecteur" scopé à une seule Assurance (figé à la création,
    // rétrocompatibilité) : pointe vers l'écran de choix de produit.
    if (produit === "ASSURANCES_ACCIDENTS" || produit === "ASSURANCES_DOMMAGES") {
      const qr = await prisma.qrCode.findFirst({
        where: { partenaireId: req.params.id, sousBranche: produit },
      });
      if (!qr) return res.status(404).json({ error: "QR non disponible pour cette Assurance" });
      const couleur = produit === "ASSURANCES_ACCIDENTS" ? "#15803d" : "#b45309";
      const dataUrl = await qrDataUrl("choisir", qr.token, couleur);
      return res.json({ produit, token: qr.token, dataUrl });
    }

    // QR unique (refonte 2026-08-07) : ni produit précis ni Assurance figée —
    // pointe vers l'écran de choix d'Assurance puis de produit.
    if (produit === "UNIFIE") {
      const qr = await prisma.qrCode.findFirst({
        where: { partenaireId: req.params.id, produitId: null, sousBranche: null },
      });
      if (!qr) return res.status(404).json({ error: "QR non disponible" });
      const dataUrl = await qrDataUrl("choisir", qr.token, "#004b9c");
      return res.json({ produit, token: qr.token, dataUrl });
    }

    if (isProduitGenerique(produit)) {
      const prod = await prisma.produit.findUnique({ where: { code: produit } });
      if (!prod) return res.status(404).json({ error: "Produit inconnu" });
      const qr = await prisma.qrCode.findFirst({
        where: { partenaireId: req.params.id, produitId: prod.id, libelleVariante: null },
      });
      if (!qr) return res.status(404).json({ error: "QR non disponible pour ce produit" });
      const dataUrl = await qrDataUrl(produit, qr.token, prod.couleurQr);
      return res.json({ produit, token: qr.token, dataUrl });
    }

    const p = await prisma.partenaire.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: "Introuvable" });
    const token =
      produit === "incendie1000" ? p.qrIncendie1000Token
      : produit === "incendie2000" ? p.qrIncendie2000Token
      : p.qrAccidentToken;
    if (!token)
      return res.status(404).json({ error: "QR non disponible pour ce produit" });
    const qrProduit: "incendie" | "accident" = produit === "accident" ? "accident" : "incendie";
    const couleur = qrProduit === "incendie" ? "#b45309" : "#004b9c";
    const dataUrl = await qrDataUrl(qrProduit, token, couleur);
    res.json({ produit, token, dataUrl });
  })
);
