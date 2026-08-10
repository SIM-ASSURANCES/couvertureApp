import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";

/**
 * Vue unifiée, tous produits confondus, de la branche "Assurances Accidents
 * et Dommages" — combine le modèle générique Produit/Souscription (RelaxMoto,
 * RelaxAuto, RelaxAccidents Frais Médicaux/générale, RelaxVoyage, SecurHome+,
 * SecurPro Dommages) ET les deux modèles historiques (SouscriptionIncendie,
 * SouscriptionAccident) qui ne migrent pas vers le modèle générique (décision
 * assumée, voir mémoire de session). Sert les filtres "type d'assurance" /
 * "type de produit" du tableau de bord, des détails partenaire et de la page
 * Clients Dommages — jamais utilisée pour la persistance, uniquement en
 * lecture (+ une suppression générique pour le modèle générique).
 */
export const assurancesBrancheRouter = Router();
assurancesBrancheRouter.use(requireAuth("admin"));

type SousBranche = "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES";

const CODE_INCENDIE_HISTORIQUE = "incendie_historique";
const CODE_ACCIDENT_HISTORIQUE = "accident_historique";

interface SouscriptionBranche {
  id: string;
  sousBranche: SousBranche;
  produit: string;
  produitLibelle: string;
  telephone: string;
  nom: string;
  prenom: string;
  montantPrime: number;
  statut: string;
  partenaireId: string;
  partenaireNom: string;
  createdAt: string;
}

interface Filtres {
  sousBranche?: SousBranche;
  produit?: string;
  partenaireId?: string;
  from?: Date;
  to?: Date;
  // "confirme" : uniquement les souscriptions confirmées (paiement Wave
  // confirmé, ou statut "complet" pour Incendie). "attente" : uniquement les
  // souscriptions dont le paiement Wave est en attente/échoué — Incendie et
  // l'ancien Accident en sont exclus (Incendie n'a pas de paiement Wave à
  // proprement parler ; l'ancien Accident a sa propre page dédiée). Undefined
  // : tout, comportement historique de cet endpoint.
  statut?: "confirme" | "attente";
  // Exclut les deux modèles historiques (Incendie/Accident) — ne renvoie que
  // le modèle générique, utile pour un total qui ne doit jamais faire
  // doublon avec des compteurs déjà basés sur les modèles historiques.
  generiqueSeul?: boolean;
}

function parseFiltres(query: Record<string, string | undefined>): Filtres {
  const { sousBranche, produit, partenaireId, from, to, statut, generiqueSeul } = query;
  return {
    sousBranche: sousBranche === "ASSURANCES_ACCIDENTS" || sousBranche === "ASSURANCES_DOMMAGES" ? sousBranche : undefined,
    produit: produit || undefined,
    partenaireId: partenaireId || undefined,
    from: from ? new Date(`${from}T00:00:00`) : undefined,
    to: to ? new Date(`${to}T23:59:59.999`) : undefined,
    statut: statut === "confirme" || statut === "attente" ? statut : undefined,
    generiqueSeul: generiqueSeul === "1",
  };
}

const DELAI_EXPIRATION_ATTENTE_MS = 24 * 60 * 60 * 1000;

/**
 * Supprime les souscriptions du modèle générique (branche Accidents/Dommages)
 * encore en attente/échouées 24h après leur création — même politique que
 * l'ancien Accident (voir routes/souscriptions.ts). Appelé avant toute
 * lecture en mode "attente" pour que la liste affichée soit toujours à jour,
 * sans dépendre d'une tâche planifiée séparée.
 */
async function purgerAttentesExpirees(): Promise<void> {
  const produits = await prisma.produit.findMany({
    where: { sousBranche: { in: ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] } },
    select: { id: true },
  });
  if (produits.length === 0) return;
  await prisma.souscription.deleteMany({
    where: {
      produitId: { in: produits.map((p) => p.id) },
      waveStatut: { in: ["en_attente", "echoue"] },
      createdAt: { lt: new Date(Date.now() - DELAI_EXPIRATION_ATTENTE_MS) },
    },
  });
}

/** Catalogue des produits filtrables (modèle générique + les deux entrées historiques). */
assurancesBrancheRouter.get(
  "/catalogue",
  asyncHandler(async (_req, res) => {
    const produits = await prisma.produit.findMany({
      where: { sousBranche: { in: ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] } },
      orderBy: { ordre: "asc" },
    });
    res.json([
      { sousBranche: "ASSURANCES_ACCIDENTS", code: CODE_ACCIDENT_HISTORIQUE, libelle: "Accident (historique)" },
      { sousBranche: "ASSURANCES_DOMMAGES", code: CODE_INCENDIE_HISTORIQUE, libelle: "Incendie Habitation en Inclusion" },
      ...produits.map((p) => ({ sousBranche: p.sousBranche as SousBranche, code: p.code, libelle: p.libelle })),
    ]);
  })
);

async function fetchGenerique(f: Filtres): Promise<SouscriptionBranche[]> {
  if (f.produit && f.produit !== CODE_INCENDIE_HISTORIQUE && f.produit !== CODE_ACCIDENT_HISTORIQUE) {
    const produit = await prisma.produit.findUnique({ where: { code: f.produit } });
    if (!produit) return [];
    return fetchGeneriqueParProduitIds([produit.id], f);
  }
  if (f.produit === CODE_INCENDIE_HISTORIQUE || f.produit === CODE_ACCIDENT_HISTORIQUE) return [];

  const produits = await prisma.produit.findMany({
    where: { sousBranche: f.sousBranche ? f.sousBranche : { in: ["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] } },
  });
  return fetchGeneriqueParProduitIds(produits.map((p) => p.id), f);
}

async function fetchGeneriqueParProduitIds(produitIds: string[], f: Filtres): Promise<SouscriptionBranche[]> {
  if (produitIds.length === 0) return [];
  const rows = await prisma.souscription.findMany({
    where: {
      produitId: { in: produitIds },
      partenaireId: f.partenaireId,
      createdAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
      waveStatut:
        f.statut === "confirme"
          ? "confirme"
          : f.statut === "attente"
          ? { in: ["en_attente", "echoue"] }
          : undefined,
    },
    include: {
      partenaire: { select: { nomCommerce: true } },
      produit: { select: { code: true, libelle: true, sousBranche: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    sousBranche: r.produit.sousBranche as SousBranche,
    produit: r.produit.code,
    produitLibelle: r.produit.libelle,
    telephone: r.telephone,
    nom: r.nom ?? "",
    prenom: r.prenom ?? "",
    montantPrime: r.montantPrime,
    statut: r.waveStatut ?? "confirme",
    partenaireId: r.partenaireId,
    partenaireNom: r.partenaire.nomCommerce,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function fetchIncendieHistorique(f: Filtres): Promise<SouscriptionBranche[]> {
  if (f.generiqueSeul) return [];
  // Incendie n'a pas de paiement Wave en attente à proprement parler (la
  // prime est incluse dans l'achat) — exclu du mode "attente".
  if (f.statut === "attente") return [];
  if (f.sousBranche === "ASSURANCES_ACCIDENTS") return [];
  if (f.produit && f.produit !== CODE_INCENDIE_HISTORIQUE) return [];
  const rows = await prisma.souscriptionIncendie.findMany({
    where: {
      partenaireId: f.partenaireId,
      statut: f.statut === "confirme" ? "complet" : undefined,
      createdAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    },
    include: { partenaire: { select: { nomCommerce: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    sousBranche: "ASSURANCES_DOMMAGES",
    produit: CODE_INCENDIE_HISTORIQUE,
    produitLibelle: "Incendie Habitation en Inclusion",
    telephone: r.telephone,
    nom: r.nom ?? "",
    prenom: r.prenom ?? "",
    montantPrime: r.montantPrime,
    statut: r.statut,
    partenaireId: r.partenaireId,
    partenaireNom: r.partenaire.nomCommerce,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function fetchAccidentHistorique(f: Filtres): Promise<SouscriptionBranche[]> {
  if (f.generiqueSeul) return [];
  // L'ancien Accident a sa propre page "Paiement en attente" dédiée
  // (routes/souscriptions.ts) — pas de doublon ici en mode "attente".
  if (f.statut === "attente") return [];
  if (f.sousBranche === "ASSURANCES_DOMMAGES") return [];
  if (f.produit && f.produit !== CODE_ACCIDENT_HISTORIQUE) return [];
  const rows = await prisma.souscriptionAccident.findMany({
    where: {
      waveStatut: "confirme",
      partenaireId: f.partenaireId,
      createdAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    },
    include: { partenaire: { select: { nomCommerce: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    sousBranche: "ASSURANCES_ACCIDENTS",
    produit: CODE_ACCIDENT_HISTORIQUE,
    produitLibelle: "Accident (historique)",
    telephone: r.telephone,
    nom: r.nom,
    prenom: r.prenom,
    montantPrime: r.montantPrime,
    statut: r.waveStatut ?? "confirme",
    partenaireId: r.partenaireId,
    partenaireNom: r.partenaire.nomCommerce,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Liste unifiée, filtrable par sous-branche / produit / partenaire / période. */
assurancesBrancheRouter.get(
  "/souscriptions",
  asyncHandler(async (req, res) => {
    const f = parseFiltres(req.query as Record<string, string | undefined>);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    if (f.statut === "attente") await purgerAttentesExpirees();

    const [generique, incendie, accident] = await Promise.all([
      fetchGenerique(f),
      fetchIncendieHistorique(f),
      fetchAccidentHistorique(f),
    ]);

    let rows = [...generique, ...incendie, ...accident].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (limit) rows = rows.slice(0, limit);
    res.json(rows);
  })
);

/** Supprime une souscription du modèle générique (RelaxMoto/Auto, RelaxAccidents, RelaxVoyage, SecurHome+, SecurPro Dommages). */
assurancesBrancheRouter.delete(
  "/souscriptions/:id",
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
