import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { requireAuth, requireAnySuperAdmin, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import {
  sendSMS,
  initiateWavePayment,
  messageRelanceRenouvellement,
  genererMotDePasseClient,
  lienClientRelax,
  messageReinitialisationMotDePasse,
  numeroPoliceIncendieSynthetique,
} from "../services/notify.js";

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

export const CODE_INCENDIE_HISTORIQUE = "incendie_historique";
export const CODE_ACCIDENT_HISTORIQUE = "accident_historique";

export interface SouscriptionBranche {
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
  // Échéance/renouvellement — voir services/paiementWave.ts::confirmerEcheance
  // (générique, cycleFacturation null) et routes/public.ts (Incendie). null
  // pour un abonnement RelaxMoto/Auto (cycleFacturation non-null, son propre
  // renouvellement côté espace client, hors périmètre de ces champs) tant que
  // non demandé — dateDebut/dateFin y existent mais ne sont pas exposés ici.
  dateDebut?: string | null;
  dateFin?: string | null;
  renouvellementEnCoursDepuis?: string | null;
  renouveleAt?: string | null;
  cycleFacturation?: string | null;
  // Espace client (voir refonte "espace client universel") — permet à l'admin
  // de savoir si une réinitialisation de mot de passe est pertinente.
  espaceClientActif?: boolean;
}

export interface Filtres {
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
  // Ne renvoie que les souscriptions dont l'échéance (dateFin) tombe dans les
  // 2 semaines à venir — pour la section d'alerte "Renouvellements à venir".
  // N'inclut jamais un abonnement RelaxMoto/Auto (cycleFacturation non-null,
  // son propre renouvellement côté espace client) ni Incendie (traité à part
  // via routes/souscriptions.ts, même politique que Accident historique).
  renouvellementProche?: boolean;
}

export function parseFiltres(query: Record<string, string | undefined>): Filtres {
  const { sousBranche, produit, partenaireId, from, to, statut, generiqueSeul, renouvellementProche } = query;
  return {
    sousBranche: sousBranche === "ASSURANCES_ACCIDENTS" || sousBranche === "ASSURANCES_DOMMAGES" ? sousBranche : undefined,
    produit: produit || undefined,
    partenaireId: partenaireId || undefined,
    from: from ? new Date(`${from}T00:00:00`) : undefined,
    to: to ? new Date(`${to}T23:59:59.999`) : undefined,
    statut: statut === "confirme" || statut === "attente" ? statut : undefined,
    generiqueSeul: generiqueSeul === "1",
    renouvellementProche: renouvellementProche === "1",
  };
}

const RENOUVELLEMENT_FENETRE_MS = 14 * 24 * 60 * 60 * 1000;

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

export async function fetchGenerique(f: Filtres): Promise<SouscriptionBranche[]> {
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
      ...(f.renouvellementProche
        ? {
            cycleFacturation: null,
            dateFin: { gte: new Date(), lte: new Date(Date.now() + RENOUVELLEMENT_FENETRE_MS) },
          }
        : {}),
    },
    include: {
      partenaire: { select: { nomCommerce: true } },
      produit: { select: { code: true, libelle: true, sousBranche: true } },
    },
    orderBy: f.renouvellementProche ? { dateFin: "asc" } : { createdAt: "desc" },
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
    dateDebut: r.dateDebut ? r.dateDebut.toISOString() : null,
    dateFin: r.dateFin ? r.dateFin.toISOString() : null,
    renouvellementEnCoursDepuis: r.renouvellementEnCoursDepuis ? r.renouvellementEnCoursDepuis.toISOString() : null,
    renouveleAt: r.renouveleAt ? r.renouveleAt.toISOString() : null,
    cycleFacturation: r.cycleFacturation,
    espaceClientActif: !!r.clientPasswordHash,
  }));
}

export async function fetchIncendieHistorique(f: Filtres): Promise<SouscriptionBranche[]> {
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
      ...(f.renouvellementProche
        ? { dateFin: { gte: new Date(), lte: new Date(Date.now() + RENOUVELLEMENT_FENETRE_MS) } }
        : {}),
    },
    include: { partenaire: { select: { nomCommerce: true } } },
    orderBy: f.renouvellementProche ? { dateFin: "asc" } : { createdAt: "desc" },
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
    dateDebut: r.dateDebut ? r.dateDebut.toISOString() : null,
    dateFin: r.dateFin ? r.dateFin.toISOString() : null,
    renouvellementEnCoursDepuis: r.renouvellementEnCoursDepuis ? r.renouvellementEnCoursDepuis.toISOString() : null,
    renouveleAt: r.renouveleAt ? r.renouveleAt.toISOString() : null,
    espaceClientActif: !!r.clientPasswordHash,
  }));
}

export async function fetchAccidentHistorique(f: Filtres): Promise<SouscriptionBranche[]> {
  if (f.generiqueSeul) return [];
  // L'ancien Accident a sa propre page "Paiement en attente" ET sa propre
  // alerte de renouvellement dédiées (routes/souscriptions.ts) — pas de
  // doublon ici.
  if (f.statut === "attente") return [];
  if (f.renouvellementProche) return [];
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
    espaceClientActif: !!r.clientPasswordHash,
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

    let rows = [...generique, ...incendie, ...accident].sort((a, b) =>
      f.renouvellementProche
        ? new Date(a.dateFin ?? 0).getTime() - new Date(b.dateFin ?? 0).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (limit) rows = rows.slice(0, limit);
    res.json(rows);
  })
);

/**
 * Relance le RENOUVELLEMENT d'une souscription générique à formule unique
 * (RelaxAccidents Frais Médicaux/générale, RelaxVoyage, SecurHome+, SecurPro
 * Dommages — jamais RelaxMoto/Auto, qui ont leur propre renouvellement côté
 * espace client) : crée une nouvelle échéance (Paiement estRenouvellement)
 * pour la même prime, envoie le lien Wave par SMS. Ne touche jamais
 * `Souscription.waveStatut` (reste "confirme" tout du long, contrairement à
 * SouscriptionAccident qui n'a pas de table Paiement séparée) — la couverture
 * en cours n'est donc jamais interrompue pendant l'attente du paiement.
 */
assurancesBrancheRouter.post(
  "/souscriptions/:id/relance-renouvellement",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await prisma.souscription.findUnique({
      where: { id: req.params.id },
      include: { produit: { select: { code: true } } },
    });
    if (!s) return res.status(404).json({ error: "Introuvable" });
    if (s.cycleFacturation) {
      return res.status(400).json({ error: "Ce produit se renouvelle depuis l'espace client, pas via l'admin." });
    }
    if (s.waveStatut !== "confirme" || !s.numeroPolice) {
      return res.status(400).json({ error: "Cette souscription n'est pas encore confirmée." });
    }
    if (!process.env.WAVE_API_KEY) {
      return res.status(400).json({ error: "Wave n'est pas configuré (WAVE_API_KEY manquant)." });
    }
    const qr = await prisma.qrCode.findFirst({
      where: { partenaireId: s.partenaireId, produitId: s.produitId },
    });
    if (!qr) return res.status(400).json({ error: "QR introuvable pour ce partenaire/produit." });

    const dejaExistantes = await prisma.paiement.count({ where: { souscriptionId: s.id } });
    const paiement = await prisma.paiement.create({
      data: {
        souscriptionId: s.id,
        numeroEcheance: dejaExistantes + 1,
        montant: s.montantPrime,
        dateEcheance: new Date(),
        estRenouvellement: true,
      },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    const successUrl = `${appUrl}/s/${s.produit.code}/${qr.token}?paid=${paiement.id}`;
    const errorUrl = `${appUrl}/s/${s.produit.code}/${qr.token}?paiement=echec`;
    const wave = await initiateWavePayment(paiement.montant, paiement.id, successUrl, errorUrl);
    await prisma.paiement.update({ where: { id: paiement.id }, data: { waveTransactionId: wave.transactionId } });
    const updated = await prisma.souscription.update({
      where: { id: s.id },
      data: {
        renouvellementEnCoursDepuis: new Date(),
        relanceRenouvellementCount: { increment: 1 },
      },
    });

    await sendSMS(s.telephone, messageRelanceRenouvellement(s.prenom ?? "", paiement.montant, wave.checkoutUrl));
    await logAction({
      adminId: req.user!.sub,
      typeAction: "relance",
      objetType: "souscription_renouvellement",
      objetId: s.id,
    });
    res.json({ ok: true, relanceRenouvellementCount: updated.relanceRenouvellementCount });
  })
);

// Même régime que les data URL image validées ailleurs (contrats.ts,
// public.ts) : regex stricte (pas startsWith, qui ne borne que le début),
// bornée en taille — voir la note de sécurité correspondante dans ces fichiers.
const dataUrlImage = z
  .string()
  .max(2_000_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/, "Image invalide");

const photoCarteSchema = z.object({
  selfieUrl: dataUrlImage,
  produit: z.string().min(1),
});

/**
 * Remplace la photo (selfie) utilisée sur la carte virtuelle de prise en
 * charge d'un client — réservé au Super Administrateur (global ou de la
 * branche Assurances Accidents/Dommages, déjà garanti par le montage du
 * routeur dans index.ts), pour corriger une photo de mauvaise qualité ou
 * incorrecte sans repasser par le parcours public (verrouillé côté client
 * une fois la photo déposée, voir routes/public.ts).
 */
assurancesBrancheRouter.patch(
  "/souscriptions/:id/photo-carte",
  requireAnySuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { selfieUrl, produit } = photoCarteSchema.parse(req.body);

    if (produit === CODE_INCENDIE_HISTORIQUE) {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id: req.params.id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      await prisma.souscriptionIncendie.update({ where: { id: s.id }, data: { selfieUrl } });
    } else if (produit === CODE_ACCIDENT_HISTORIQUE) {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id: req.params.id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      await prisma.souscriptionAccident.update({ where: { id: s.id }, data: { selfieUrl } });
    } else {
      const s = await prisma.souscription.findUnique({ where: { id: req.params.id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      // Le modèle générique n'a pas de champ selfieUrl direct : la carte lit
      // le document "Selfie" le plus récent (voir routes/cartes.ts) — en
      // déposer un nouveau le remplace donc naturellement pour la carte.
      await prisma.document.create({
        data: { souscriptionId: s.id, type: "Selfie", url: selfieUrl },
      });
    }

    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "souscription_photo_carte",
      objetId: req.params.id,
    });
    res.json({ ok: true });
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

// ─── Sinistres (SinistreRelax, tous produits confondus) ───

type ProduitTypeClient = "generique" | "incendie" | "accident";

async function enrichirSinistres(
  rows: Awaited<ReturnType<typeof prisma.sinistreRelax.findMany>>
) {
  const idsIncendie = rows.filter((r) => r.produitType === "incendie").map((r) => r.souscriptionIncendieId!);
  const idsAccident = rows.filter((r) => r.produitType === "accident").map((r) => r.souscriptionAccidentId!);
  const idsGenerique = rows.filter((r) => r.produitType === "generique").map((r) => r.souscriptionId!);

  const [incendies, accidents, generiques] = await Promise.all([
    idsIncendie.length ? prisma.souscriptionIncendie.findMany({ where: { id: { in: idsIncendie } } }) : [],
    idsAccident.length ? prisma.souscriptionAccident.findMany({ where: { id: { in: idsAccident } } }) : [],
    idsGenerique.length
      ? prisma.souscription.findMany({
          where: { id: { in: idsGenerique } },
          include: { produit: { select: { libelle: true } } },
        })
      : [],
  ]);
  const mapInc = new Map(incendies.map((s) => [s.id, s]));
  const mapAcc = new Map(accidents.map((s) => [s.id, s]));
  const mapGen = new Map(generiques.map((s) => [s.id, s]));

  return rows.map((r) => {
    const souscriptionId = r.souscriptionIncendieId ?? r.souscriptionAccidentId ?? r.souscriptionId ?? "";
    let clientNom: string | null = null;
    let clientPrenom: string | null = null;
    let clientTelephone = "";
    let numeroPolice: string | null = null;
    let produitLibelle = r.produitType;
    let pieceIdentiteUrl: string | null = null;

    if (r.produitType === "incendie") {
      const s = mapInc.get(souscriptionId);
      if (s) {
        clientNom = s.nom;
        clientPrenom = s.prenom;
        clientTelephone = s.telephone;
        numeroPolice = numeroPoliceIncendieSynthetique(s.id, s.dateDebut ?? s.createdAt);
        pieceIdentiteUrl = s.pieceIdentiteUrl;
      }
      produitLibelle = "Incendie Habitation en Inclusion";
    } else if (r.produitType === "accident") {
      const s = mapAcc.get(souscriptionId);
      if (s) {
        clientNom = s.nom;
        clientPrenom = s.prenom;
        clientTelephone = s.telephone;
        numeroPolice = s.numeroPolice;
        pieceIdentiteUrl = s.pieceIdentiteUrl;
      }
      produitLibelle = "Accident (historique)";
    } else {
      const s = mapGen.get(souscriptionId);
      if (s) {
        clientNom = s.nom;
        clientPrenom = s.prenom;
        clientTelephone = s.telephone;
        numeroPolice = s.numeroPolice;
        produitLibelle = s.produit.libelle;
        pieceIdentiteUrl = s.pieceIdentiteUrl;
      }
    }

    return {
      id: r.id,
      produitType: r.produitType,
      souscriptionId,
      numeroSinistre: r.numeroSinistre,
      typeEvenement: r.typeEvenement,
      dateSurvenance: r.dateSurvenance,
      description: r.description,
      photosAccidentUrls: r.photosAccidentUrls,
      statut: r.statut,
      motifRejet: r.motifRejet,
      analyseIA: r.analyseIA,
      analyseIAAt: r.analyseIAAt,
      createdAt: r.createdAt,
      clientNom,
      clientPrenom,
      clientTelephone,
      numeroPolice,
      produitLibelle,
      pieceIdentiteUrl,
    };
  });
}

/** Liste unifiée des sinistres, tous produits confondus (filtrable statut/produitType/souscriptionId). */
assurancesBrancheRouter.get(
  "/sinistres",
  asyncHandler(async (req, res) => {
    const { statut, produitType, souscriptionId } = req.query as {
      statut?: string;
      produitType?: string;
      souscriptionId?: string;
    };
    const rows = await prisma.sinistreRelax.findMany({
      where: {
        statut: (statut as "declare" | "en_cours" | "traite" | "rejete") || undefined,
        produitType: produitType || undefined,
        ...(souscriptionId
          ? {
              OR: [
                { souscriptionId },
                { souscriptionIncendieId: souscriptionId },
                { souscriptionAccidentId: souscriptionId },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(await enrichirSinistres(rows));
  })
);

/** Transition manuelle du statut d'un sinistre — l'analyse IA (voir services/fraudeIA.ts) est purement indicative, jamais automatisée. */
const statutSinistreSchema = z.object({
  statut: z.enum(["traite", "rejete"]),
  motifRejet: z.string().min(1).max(1000).optional(),
});
assurancesBrancheRouter.patch(
  "/sinistres/:id/statut",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = statutSinistreSchema.parse(req.body);
    if (data.statut === "rejete" && !data.motifRejet?.trim()) {
      return res.status(400).json({ error: "Le motif de rejet est obligatoire." });
    }
    const sinistre = await prisma.sinistreRelax.findUnique({ where: { id: req.params.id } });
    if (!sinistre) return res.status(404).json({ error: "Introuvable" });
    const updated = await prisma.sinistreRelax.update({
      where: { id: sinistre.id },
      data: {
        statut: data.statut,
        motifRejet: data.statut === "rejete" ? data.motifRejet!.trim() : null,
      },
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "sinistre",
      objetId: updated.id,
      valeurApres: { statut: updated.statut, motifRejet: updated.motifRejet },
    });
    res.json(updated);
  })
);

// ─── Accès client (réinitialisation de mot de passe) ───

/**
 * Réinitialise le mot de passe de l'espace client d'une souscription, à la
 * demande du client ou à tout moment — envoyé par SMS, jamais affiché à
 * l'admin (voir services/notify.ts::messageReinitialisationMotDePasse).
 * Réservé au Super Administrateur (global ou de cette branche), même niveau
 * que PATCH .../photo-carte.
 */
assurancesBrancheRouter.post(
  "/clients/:produitType/:id/reinitialiser-mot-de-passe",
  requireAnySuperAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const produitType = req.params.produitType as ProduitTypeClient;
    const id = req.params.id;
    const motDePasse = genererMotDePasseClient();
    const hash = await bcrypt.hash(motDePasse, 10);

    let telephone: string;
    let numeroPolice: string | null;

    if (produitType === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      await prisma.souscriptionIncendie.update({ where: { id }, data: { clientPasswordHash: hash } });
      telephone = s.telephone;
      numeroPolice = numeroPoliceIncendieSynthetique(s.id, s.dateDebut ?? s.createdAt);
    } else if (produitType === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      await prisma.souscriptionAccident.update({ where: { id }, data: { clientPasswordHash: hash } });
      telephone = s.telephone;
      numeroPolice = s.numeroPolice;
    } else {
      const s = await prisma.souscription.findUnique({ where: { id } });
      if (!s) return res.status(404).json({ error: "Introuvable" });
      await prisma.souscription.update({ where: { id }, data: { clientPasswordHash: hash } });
      telephone = s.telephone;
      numeroPolice = s.numeroPolice;
    }

    await sendSMS(telephone, messageReinitialisationMotDePasse(numeroPolice ?? "—", motDePasse, lienClientRelax()));
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "client_mot_de_passe",
      objetId: id,
    });
    res.json({ ok: true });
  })
);
