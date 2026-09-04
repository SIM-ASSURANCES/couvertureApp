import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireSuperAdminBranche, type AuthedRequest } from "../auth.js";
import { asyncHandler, toCsv, sendCsv } from "../util.js";
import { logAction } from "../journal.js";

/**
 * Routes admin pour la sous-branche "Assurances Accidents" (refonte
 * Incendie/Accident) — mêmes patrons que relax.ts (modèle générique
 * Produit/Souscription), mais filtrées par `Produit.sousBranche` plutôt que
 * par `Produit.branche` : ces produits restent rattachés à
 * Branche.INCENDIE_ACCIDENT (permissions super-admin inchangées), l'ancien
 * Incendie/Accident et cette sous-branche cohabitant sous la même branche.
 */
export const assurancesAccidentsRouter = Router();
assurancesAccidentsRouter.use(requireAuth("admin"));

const SOUS_BRANCHE = "ASSURANCES_ACCIDENTS";

async function produitsSousBranche() {
  return prisma.produit.findMany({ where: { sousBranche: SOUS_BRANCHE } });
}

async function resolveProduitId(code: string) {
  const p = await prisma.produit.findUnique({ where: { code } });
  return p && p.sousBranche === SOUS_BRANCHE ? p.id : undefined;
}

/**
 * Produits Assurances Dommages à tarif fixe (TarifProduit), édités depuis
 * cette même page admin "Tarifs" bien qu'ils ne soient pas de la sous-branche
 * ASSURANCES_ACCIDENTS — même exception explicite que
 * PRODUITS_COMMISSION_TAUX_UNIQUE ci-dessous pour la commission SecurHome+.
 */
const PRODUITS_DOMMAGES_TARIF_FIXE = ["securhome"] as const;

function produitAutoriseTarifs(p: { sousBranche: string | null; code: string }) {
  return p.sousBranche === SOUS_BRANCHE || (PRODUITS_DOMMAGES_TARIF_FIXE as readonly string[]).includes(p.code);
}

async function resolveProduitIdTarifs(code: string) {
  const p = await prisma.produit.findUnique({ where: { code } });
  return p && produitAutoriseTarifs(p) ? p.id : undefined;
}

/** Vue d'ensemble de la sous-branche (pour le tableau de bord dédié) */
assurancesAccidentsRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const produits = await produitsSousBranche();
    const counts = await Promise.all(
      produits.map(async (p) => ({
        produit: p.code,
        libelle: p.libelle,
        confirmes: await prisma.souscription.count({ where: { produitId: p.id, waveStatut: "confirme" } }),
        enAttente: await prisma.souscription.count({ where: { produitId: p.id, waveStatut: { in: ["en_attente", "echoue"] } } }),
      }))
    );
    // Compte les partenaires ayant soit un QR précis pour l'un de ces
    // produits (comportement historique), soit un QR "sélecteur" scopé à
    // cette sous-branche, soit le nouveau QR unique (refonte 2026-08-07 —
    // ni produit précis ni sousBranche, un partenaire au QR unique peut
    // vendre dans les deux Assurances donc compte pour les deux dashboards).
    const partenaires = await prisma.partenaire.count({
      where: {
        qrCodes: {
          some: {
            OR: [
              { produitId: { in: produits.map((p) => p.id) } },
              { sousBranche: SOUS_BRANCHE },
              { produitId: null, sousBranche: null },
            ],
          },
        },
      },
    });
    const derniers = await prisma.souscription.findMany({
      where: { produitId: { in: produits.map((p) => p.id) }, waveStatut: "confirme" },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { partenaire: { select: { nomCommerce: true } }, produit: { select: { code: true, libelle: true } } },
    });
    res.json({ partenaires, produits: counts, derniers });
  })
);

const RENOUVELLEMENT_FENETRE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Liste des souscriptions de la sous-branche, filtrable par produit /
 * partenaire / attente. `renouvellementProche=1` : uniquement les échéances
 * (dateFin) dans les 2 semaines à venir, pour la section d'alerte — exclut
 * toujours RelaxMoto/Auto (cycleFacturation non-null, leur propre
 * renouvellement se fait côté espace client, pas via relance admin).
 */
assurancesAccidentsRouter.get(
  "/souscriptions",
  asyncHandler(async (req, res) => {
    const { produit, attente, partenaireId, renouvellementProche } = req.query as {
      produit?: string;
      attente?: string;
      partenaireId?: string;
      renouvellementProche?: string;
    };
    const produitId = produit ? await resolveProduitId(produit) : undefined;
    if (produit && !produitId) return res.status(404).json({ error: "Produit inconnu" });

    const produits = await produitsSousBranche();
    const produitIds = produitId ? [produitId] : produits.map((p) => p.id);
    const procheDeLecheance = renouvellementProche === "1";

    const rows = await prisma.souscription.findMany({
      where: {
        produitId: { in: produitIds },
        waveStatut: attente === "1" ? { in: ["en_attente", "echoue"] } : "confirme",
        partenaireId: partenaireId || undefined,
        ...(procheDeLecheance
          ? {
              cycleFacturation: null,
              // RelaxVoyage (trajet ponctuel de 24h) ne se renouvelle jamais —
              // ne doit donc jamais apparaître dans l'alerte "renouvellements
              // à venir" (voir aussi POST .../relance-renouvellement).
              produit: { code: { not: "relaxvoyage" } },
              dateFin: { gte: new Date(), lte: new Date(Date.now() + RENOUVELLEMENT_FENETRE_MS) },
            }
          : {}),
      },
      include: {
        partenaire: { select: { nomCommerce: true, nomResponsable: true } },
        produit: { select: { code: true, libelle: true } },
      },
      orderBy: procheDeLecheance ? { dateFin: "asc" } : { createdAt: "desc" },
    });
    res.json(
      rows.map((r) => ({
        ...r,
        clientPasswordHash: undefined,
        espaceClientActif: !!r.clientPasswordHash,
        partenaireNom: r.partenaire.nomCommerce,
        partenaireResponsable: r.partenaire.nomResponsable,
      }))
    );
  })
);

assurancesAccidentsRouter.get(
  "/souscriptions/export.csv",
  asyncHandler(async (req: AuthedRequest, res) => {
    const produits = await produitsSousBranche();
    const rows = await prisma.souscription.findMany({
      where: { produitId: { in: produits.map((p) => p.id) } },
      include: { partenaire: { select: { nomCommerce: true, nomResponsable: true } }, produit: { select: { libelle: true } } },
      orderBy: { createdAt: "desc" },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "export",
      objetType: "souscription",
      objetId: "CSV",
    });
    sendCsv(
      res,
      "clients_assurances_accidents.csv",
      toCsv(
        rows.map((r) => ({
          id: r.id,
          produit: r.produit.libelle,
          telephone: r.telephone,
          nom: r.nom ?? "",
          prenom: r.prenom ?? "",
          montantPrime: r.montantPrime,
          waveStatut: r.waveStatut ?? "",
          numeroPolice: r.numeroPolice ?? "",
          partenaire: r.partenaire.nomResponsable || r.partenaire.nomCommerce,
          date: r.createdAt.toISOString(),
        }))
      )
    );
  })
);

/** Documents (CNI/Permis/Selfie) déposés pour une souscription */
assurancesAccidentsRouter.get(
  "/souscriptions/:id/documents",
  asyncHandler(async (req, res) => {
    const documents = await prisma.document.findMany({
      where: { souscriptionId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(documents);
  })
);

assurancesAccidentsRouter.delete(
  "/souscriptions/:id",
  requireSuperAdminBranche("INCENDIE_ACCIDENT"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscription.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    await prisma.souscription.delete({ where: { id: req.params.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "souscription",
      objetId: req.params.id,
    });
    res.status(204).end();
  })
);

/**
 * Tarifs (formules) éditables d'un produit de la sous-branche — commission
 * réglable indépendamment de la prime, sur le modèle des barèmes IMF.
 */
assurancesAccidentsRouter.get(
  "/produits/:code/tarifs",
  asyncHandler(async (req, res) => {
    const produitId = await resolveProduitIdTarifs(req.params.code);
    if (!produitId) return res.status(404).json({ error: "Produit inconnu" });
    const tarifs = await prisma.tarifProduit.findMany({
      where: { produitId },
      orderBy: { prime: "desc" },
    });
    res.json(tarifs);
  })
);

const tarifChampsSchema = {
  libelleVariante: z.string().min(1).max(60).nullish(),
  prime: z.number().finite().min(0),
  primeHT: z.number().finite().min(0).nullish(),
  fg: z.number().finite().min(0).nullish(),
  taxes: z.number().finite().min(0).nullish(),
  capitalGaranti: z.number().finite().min(0),
  commission: z.number().finite().min(0),
};

const tarifPatchSchema = z.object(tarifChampsSchema).partial();

assurancesAccidentsRouter.patch(
  "/tarifs/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = tarifPatchSchema.parse(req.body);
    const tarif = await prisma.tarifProduit.findUnique({
      where: { id: Number(req.params.id) },
      include: { produit: true },
    });
    if (!tarif || !produitAutoriseTarifs(tarif.produit)) {
      return res.status(404).json({ error: "Tarif introuvable" });
    }
    const updated = await prisma.tarifProduit.update({
      where: { id: tarif.id },
      data,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "tarif_produit",
      objetId: String(updated.id),
      valeurApres: updated,
    });
    res.json(updated);
  })
);

const tarifCreateSchema = z.object(tarifChampsSchema);

/** Ajoute une nouvelle formule (ligne TarifProduit) à un produit de la sous-branche. */
assurancesAccidentsRouter.post(
  "/produits/:code/tarifs",
  asyncHandler(async (req: AuthedRequest, res) => {
    const produitId = await resolveProduitIdTarifs(req.params.code);
    if (!produitId) return res.status(404).json({ error: "Produit inconnu" });
    const data = tarifCreateSchema.parse(req.body);
    const existante = await prisma.tarifProduit.findFirst({
      where: { produitId, libelleVariante: data.libelleVariante ?? null },
    });
    if (existante) return res.status(409).json({ error: "Une formule avec ce libellé existe déjà pour ce produit." });
    const created = await prisma.tarifProduit.create({
      data: { produitId, ...data },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "tarif_produit",
      objetId: String(created.id),
      valeurApres: created,
    });
    res.status(201).json(created);
  })
);

/** Supprime une formule (ligne TarifProduit) — réservé au Super Administrateur de la branche. */
assurancesAccidentsRouter.delete(
  "/tarifs/:id",
  requireSuperAdminBranche("INCENDIE_ACCIDENT"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const tarif = await prisma.tarifProduit.findUnique({
      where: { id: Number(req.params.id) },
      include: { produit: true },
    });
    if (!tarif || !produitAutoriseTarifs(tarif.produit)) {
      return res.status(404).json({ error: "Tarif introuvable" });
    }
    await prisma.tarifProduit.delete({ where: { id: tarif.id } });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "suppression",
      objetType: "tarif_produit",
      objetId: String(tarif.id),
      valeurAvant: tarif,
    });
    res.status(204).end();
  })
);

/**
 * Commission des produits à devis calculé dynamiquement — pas de
 * TarifProduit pour SecurHome+/SecurPro (prime recalculée à chaque
 * souscription, jamais une table de formules), donc pas de colonne
 * "commission" par formule à éditer comme ci-dessus. Le taux (décimal,
 * appliqué sur la prime nette HT) est réglé ici — voir
 * services/commission.ts::commissionSouscriptionsDynamiques. RelaxAccidents
 * générale a rejoint ProduitTarifsTable (tarif fixe, refonte 2026-08-31).
 */
const PRODUITS_COMMISSION_TAUX_UNIQUE = ["securhome_dommages"] as const;
type ProduitCommissionTauxUnique = (typeof PRODUITS_COMMISSION_TAUX_UNIQUE)[number];
function estProduitCommissionTauxUnique(code: string): code is ProduitCommissionTauxUnique {
  return (PRODUITS_COMMISSION_TAUX_UNIQUE as readonly string[]).includes(code);
}

const commissionTauxSchema = z.object({ tauxCommission: z.number().min(0).max(1) });

assurancesAccidentsRouter.get(
  "/produits/:code/commission",
  asyncHandler(async (req, res) => {
    if (!estProduitCommissionTauxUnique(req.params.code)) {
      return res.status(404).json({ error: "Produit inconnu" });
    }
    const produit = await prisma.produit.findUnique({ where: { code: req.params.code } });
    if (!produit) return res.status(404).json({ error: "Produit inconnu" });
    res.json({ code: produit.code, tauxCommission: produit.tauxCommission ?? 0 });
  })
);

assurancesAccidentsRouter.patch(
  "/produits/:code/commission",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!estProduitCommissionTauxUnique(req.params.code)) {
      return res.status(404).json({ error: "Produit inconnu" });
    }
    const { tauxCommission } = commissionTauxSchema.parse(req.body);
    const produit = await prisma.produit.findUnique({ where: { code: req.params.code } });
    if (!produit) return res.status(404).json({ error: "Produit inconnu" });
    const updated = await prisma.produit.update({
      where: { id: produit.id },
      data: { tauxCommission },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "produit_commission",
      objetId: updated.id,
      valeurApres: { code: updated.code, tauxCommission: updated.tauxCommission },
    });
    res.json({ code: updated.code, tauxCommission: updated.tauxCommission });
  })
);

/** SecurPro : taux de commission par classe de risque (réutilise BaremeSecurpro.tauxCommission, déjà en base). */
assurancesAccidentsRouter.get(
  "/baremes/securpro-commission",
  asyncHandler(async (_req, res) => {
    const baremes = await prisma.baremeSecurpro.findMany({ orderBy: { classe: "asc" } });
    res.json(baremes.map((b) => ({ classe: b.classe, tauxCommission: b.tauxCommission })));
  })
);

assurancesAccidentsRouter.patch(
  "/baremes/securpro/:classe/commission",
  asyncHandler(async (req: AuthedRequest, res) => {
    const classe = Number(req.params.classe);
    const { tauxCommission } = commissionTauxSchema.parse(req.body);
    const bareme = await prisma.baremeSecurpro.findUnique({ where: { classe } });
    if (!bareme) return res.status(404).json({ error: "Classe introuvable" });
    const updated = await prisma.baremeSecurpro.update({
      where: { classe },
      data: { tauxCommission },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "bareme_securpro_commission",
      objetId: String(updated.id),
      valeurApres: { classe: updated.classe, tauxCommission: updated.tauxCommission },
    });
    res.json({ classe: updated.classe, tauxCommission: updated.tauxCommission });
  })
);
