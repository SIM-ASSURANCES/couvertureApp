import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import {
  calculerSecurpro,
  calculerSecurstock,
  calculerSecurecolte,
  type SecurproInput,
  type SecurstockInput,
} from "../services/tarificationImf.js";
import { ensureBaremesImf } from "../services/provisioningImf.js";

/**
 * Sérialise une souscription IMF pour l'espace admin en aplatissant le nom de
 * l'agent, de l'agence et de la/les zone(s). Une souscription faite
 * directement par l'admin n'a pas d'agent : agentNom/agenceNom/zoneNom
 * valent alors null et `directe` = true (elle sera regroupée à part, hors
 * des zones/agences). Un RESPONSABLE_ZONE affiche sa zone unique, un
 * CHEF_ZONE ses zones jointes par une virgule.
 */
export function mapSouscriptionAdmin(r: {
  agent: {
    nom: string; prenom: string;
    agence: { nom: string; zone: { nom: string } } | null;
    zone: { nom: string } | null;
    zones: { nom: string }[];
  } | null;
  admin: { nom: string } | null;
  [k: string]: unknown;
}) {
  return {
    ...r,
    agentNom: r.agent ? `${r.agent.prenom} ${r.agent.nom}` : null,
    agenceNom: r.agent?.agence?.nom ?? null,
    zoneNom:
      r.agent?.agence?.zone.nom ??
      (r.agent?.zones.length ? r.agent.zones.map((z) => z.nom).join(", ") : r.agent?.zone?.nom ?? null),
    adminNom: r.admin?.nom ?? null,
    directe: !r.agent,
  };
}

/**
 * Portée réseau d'un agent connecté : la liste des identifiants d'agents
 * dont il peut voir l'activité (lui-même, ou son équipe s'il est
 * responsable). Réutilisée par toutes les routes ci-dessous qui doivent
 * refléter cette portée (souscriptions, contrats, réseau).
 */
async function agentIdsDuReseau(agent: {
  id: string;
  roleImf: string;
  agenceId: string | null;
  zoneIds: string[];
}): Promise<string[]> {
  if (agent.roleImf === "AGENT") return [agent.id];

  // RESPONSABLE_AGENCE et FINANCE_COMPTABLE partagent la même portée (tous
  // les agents de l'agence) — seule la visibilité des commissions les distingue.
  if (agent.roleImf === "RESPONSABLE_AGENCE" || agent.roleImf === "FINANCE_COMPTABLE") {
    if (!agent.agenceId) return [agent.id];
    const membres = await prisma.agentImf.findMany({
      where: { agenceId: agent.agenceId },
      select: { id: true },
    });
    return membres.map((m) => m.id);
  }

  // RESPONSABLE_ZONE : lui-même + agents rattachés directement à l'une de ses
  // zones + agents de toutes les agences de ces zones (un responsable peut
  // désormais gérer plusieurs zones).
  if (!agent.zoneIds.length) return [agent.id];
  const agences = await prisma.agenceImf.findMany({
    where: { zoneId: { in: agent.zoneIds } },
    select: { id: true },
  });
  const membres = await prisma.agentImf.findMany({
    where: { OR: [{ zones: { some: { id: { in: agent.zoneIds } } } }, { agenceId: { in: agences.map((a) => a.id) } }] },
    select: { id: true },
  });
  return membres.map((m) => m.id);
}

/** Routeur séparé, monté avec requireAuth("agent_imf") : profil de l'agent connecté. */
export const agentImfRouter = Router();
agentImfRouter.use(requireAuth("agent_imf"));

/**
 * IMF partenaire de l'agent connecté (phase 4) : null pour un agent de la
 * branche « Assurances IMF » historique. Utilisé pour scoper barèmes, devis et
 * souscriptions de l'espace agent sur son IMF.
 */
const scopeImfAgent = (req: AuthedRequest): string | null => req.user!.imfId ?? null;

/**
 * Le finance comptable n'a accès qu'au tableau de bord et aux
 * souscriptions/contrats — jamais à la création de devis/souscriptions ni à
 * la déclaration de sinistres. Le chef de zone (CHEF_ZONE) a lui accès au
 * simulateur (voir bloquerSinistres pour la restriction qui lui reste
 * propre). Retourne true (et répond 403) si l'accès doit être bloqué.
 */
function bloquerFinanceComptable(req: AuthedRequest, res: Response): boolean {
  if (req.user!.roleImf === "FINANCE_COMPTABLE") {
    res.status(403).json({ error: "Action non disponible pour ce rôle." });
    return true;
  }
  return false;
}

/**
 * Le finance comptable et le chef de zone (CHEF_ZONE) n'ont jamais accès à la
 * déclaration/consultation de sinistres — le chef de zone supervise la
 * production de son réseau, il ne traite pas les sinistres individuellement.
 * Retourne true (et répond 403) si l'accès doit être bloqué.
 */
function bloquerSinistres(req: AuthedRequest, res: Response): boolean {
  if (req.user!.roleImf === "FINANCE_COMPTABLE" || req.user!.roleImf === "CHEF_ZONE") {
    res.status(403).json({ error: "Action non disponible pour ce rôle." });
    return true;
  }
  return false;
}

agentImfRouter.get(
  "/moi",
  asyncHandler(async (req: AuthedRequest, res) => {
    const a = await prisma.agentImf.findUnique({
      where: { id: req.user!.sub },
      include: { agence: { include: { zone: true } }, zone: true, zones: true },
    });
    if (!a) return res.status(404).json({ error: "Introuvable" });
    res.json({
      id: a.id,
      nom: a.nom,
      prenom: a.prenom,
      email: a.email,
      telephone: a.telephone,
      roleImf: a.roleImf,
      statut: a.statut,
      agenceNom: a.agence?.nom ?? null,
      zoneNom: a.agence?.zone.nom ?? (a.zones.length ? a.zones.map((z) => z.nom).join(", ") : a.zone?.nom ?? null),
      imfId: a.imfId ?? null,
    });
  })
);

/** Lecture seule pour le simulateur agent : barèmes en vigueur (ceux de l'IMF de l'agent si scopé). */
agentImfRouter.get(
  "/baremes/securpro",
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await baremesSecurproPourAgent(scopeImfAgent(req)));
  })
);

agentImfRouter.get(
  "/baremes/securstock",
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await baremesSecurstockPourAgent(scopeImfAgent(req)));
  })
);

/* ── Simulation de devis ── */

const securproInputSchema = z.object({
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  statutOccupation: z.enum(["proprietaire", "locataire"]),
  valeurBatiment: z.number().nonnegative().optional(),
  loyerMensuel: z.number().nonnegative().optional(),
  // Le contenu déclaré n'est plus saisi directement : il est recalculé côté
  // serveur comme la somme de ces 5 postes (seule source de vérité).
  materielExploitation: z.number().nonnegative(),
  mobilierMaterielBureau: z.number().nonnegative(),
  amenagement: z.number().nonnegative(),
  materielInformatique: z.number().nonnegative(),
  stocksMarchandises: z.number().nonnegative(),
  dansMarche: z.boolean(),
  gardien: z.boolean(),
  extincteur: z.boolean(),
  volContenu: z.boolean(),
  majorationVolContenu: z.boolean().optional(),
  volCaisseCapital: z.number().positive().optional(),
  majorationVolCaisse: z.boolean().optional(),
  ddeCapital: z.number().positive().optional(),
  deCapital: z.number().positive().optional(),
  bdgCapital: z.number().positive().optional(),
});

const securstockInputSchema = z.object({
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  capitalDeclare: z.number().positive(),
  densite: z.enum(["aere", "normal", "compact", "tres_compact", "entasse"]),
  localisation: z.enum(["hors_marche", "abords_marche", "marche_zone_industrielle"]),
  installationElectrique: z.enum(["securisee", "acceptable", "degradee", "dangereuse"]),
  prevention: z.enum(["extincteurs_alarme_formation_eau", "extincteurs_eau", "extincteurs_seuls", "aucun"]),
  gardien: z.boolean(),
  cameraSurveillance: z.boolean(),
});

const catalogueInputSchema = z.object({
  libelleVariante: z.string().min(1),
  // SECURECOLTE uniquement : la valeur du package saisie par le client est
  // la base du modèle actuariel ARC (voir calculerSecurecolte) — ce n'est
  // plus une donnée déclarative. 1 hectare = 1 pack : la prime et les
  // capitaux garantis par palier sont multipliés par la superficie déclarée.
  valeurPackage: z.number().positive(),
  superficieHa: z.number().positive(),
});

/**
 * COUPS DURS uniquement : déclaration de bonne santé (conditionne l'acceptation)
 * et répartition des bénéficiaires en cas de décès (parts en % du capital,
 * doivent totaliser 100 — exigé seulement pour la variante "deces", les
 * variantes "maladie"/IT ne versant pas à des bénéficiaires tiers).
 */
const santeSchema = z.object({
  taille: z.number().positive().optional(),
  poids: z.number().positive().optional(),
  fumeur: z.boolean(),
  cigarettesParJour: z.number().nonnegative().optional(),
  sportif: z.boolean(),
  sportifNiveau: z.enum(["amateur", "professionnel"]).optional(),
  infirmite: z.boolean(),
  infirmiteTaux: z.string().optional(),
  infirmiteNature: z.string().optional(),
  maladieRecente: z.boolean(),
  maladieRecentePrecisions: z.string().optional(),
  touxFievre: z.boolean(),
  diarrheeFrequente: z.boolean(),
  transfusion: z.boolean(),
  enceinte: z.boolean(),
  affections: z
    .array(
      z.enum([
        "cancer", "diabete", "hypertension", "cardiaque", "vih",
        "ulcere", "fatigue", "maladie_sang", "insuffisance_renale", "asthme",
      ])
    )
    .default([]),
  affectionsPrecisions: z.string().optional(),
});

const beneficiaireSchema = z.object({
  nom: z.string().min(1),
  contact: z.string().min(1),
  lien: z.string().min(1),
  pourcentage: z.number().positive(),
});

/**
 * COUPS DURS (produit unique fusionné) : Maladie Coups Durs est incluse
 * d'office (garantie socle, toujours facturée), Décès suite à Coups Durs est
 * une case à cocher facultative, Incapacité temporaire de l'emprunteur est un
 * plafond optionnel (500 000 OU 1 000 000, jamais les deux). La prime totale
 * est la somme des garanties retenues — voir calculerDevisImf().
 */
const coupsdursCombineSchema = z
  .object({
    deces: z.boolean().default(false),
    incapacite: z.enum(["plafond_500000", "plafond_1000000"]).nullable().optional(),
    sante: santeSchema,
    beneficiaires: z.array(beneficiaireSchema).optional(),
    // Couverture intermédiaire de moins d'un an (curseur 1-12 mois côté
    // agent) : la prime catalogue (annuelle) est proratisée linéairement.
    dureeMois: z.number().int().min(1).max(12).default(12),
  })
  .refine(
    (d) =>
      !d.deces ||
      (!!d.beneficiaires &&
        d.beneficiaires.length > 0 &&
        Math.round(d.beneficiaires.reduce((s, b) => s + b.pourcentage, 0)) === 100),
    { message: "La somme des parts des bénéficiaires doit être égale à 100%.", path: ["beneficiaires"] }
  )
  .refine((d) => !d.incapacite || d.deces, {
    message: "L'Incapacité temporaire n'est proposée que si la garantie Décès est cochée.",
    path: ["incapacite"],
  });

const LABEL_GARANTIE_COUPSDURS: Record<string, string> = {
  maladie: "Maladie Coups Durs",
  deces: "Décès suite à Coups Durs",
  plafond_500000: "Incapacité temporaire — plafond 500 000",
  plafond_1000000: "Incapacité temporaire — plafond 1 000 000",
};

export const simulationSchema = z.object({
  produitCode: z.enum(["securpro", "securstock", "coupsdurs", "securecolte"]),
  entrees: z.record(z.unknown()),
  // Clé d'idempotence PWA (mode hors-ligne) — voir SimulationImf.offlineId.
  offlineId: z.string().min(1).optional(),
});

type GarantieImfConfig = { code: string; actif: boolean; plafond: number | null };

/**
 * Configuration d'un produit pour une IMF partenaire (phase 2/3b) : la ligne
 * ImfProduit si `imfId` est fourni, sinon `null` (branche « Assurances IMF »
 * historique → barèmes/tarifs globaux, aucune restriction produit).
 */
async function chargerConfigProduitImf(imfId: string | null | undefined, produitCode: string) {
  if (!imfId) return null;
  const row = await prisma.imfProduit.findUnique({ where: { imfId_code: { imfId, code: produitCode } } });
  if (!row) return { actif: false, plafond: null, garanties: [] as GarantieImfConfig[] };
  const garanties = Array.isArray(row.garanties) ? (row.garanties as unknown as GarantieImfConfig[]) : [];
  return { actif: row.actif, plafond: row.plafond, garanties };
}

/**
 * Calcul d'un devis IMF à partir du produit et des entrées, partagé entre le
 * simulateur agent (`/agent-imf/simulations`), le simulateur admin
 * (`/imf/simulations`) et le simulateur d'une IMF partenaire
 * (`/imf-partenaires/:id/reseau/simulations`). Quand `imfId` est fourni, les
 * barèmes/tarifs lus sont ceux de l'IMF (tables Imf*), et le produit / la
 * garantie doivent être activés pour elle. Renvoie soit le résultat + la prime
 * TTC, soit un message d'erreur métier.
 */
export async function calculerDevisImf(
  produitCode: string,
  entrees: Record<string, unknown>,
  imfId?: string | null
): Promise<{ ok: true; resultat: unknown; primeTTC: number } | { ok: false; error: string }> {
  const cfg = await chargerConfigProduitImf(imfId, produitCode);
  if (cfg && !cfg.actif) return { ok: false, error: "Ce produit n'est pas proposé par cette IMF." };
  const plafondImf = cfg?.plafond ?? null;
  const garantieActive = (code: string) => !cfg || cfg.garanties.find((g) => g.code === code)?.actif !== false;

  if (produitCode === "securpro") {
    const parsed = securproInputSchema.parse(entrees);
    // Contenu déclaré = somme des 5 postes détaillés (jamais saisi directement).
    const contenu =
      parsed.materielExploitation +
      parsed.mobilierMaterielBureau +
      parsed.amenagement +
      parsed.materielInformatique +
      parsed.stocksMarchandises;
    const input = { ...parsed, contenu } as SecurproInput;
    const bareme = imfId
      ? await prisma.imfBaremeSecurpro.findUnique({ where: { imfId_classe: { imfId, classe: input.classe } } })
      : await prisma.baremeSecurpro.findUnique({ where: { classe: input.classe } });
    if (!bareme) return { ok: false, error: "Barème SECURPRO introuvable pour cette classe" };
    const limiteCapital = plafondImf != null ? Math.min(bareme.limiteCapital, plafondImf) : bareme.limiteCapital;
    const r = calculerSecurpro(input, { ...bareme, classe: input.classe, limiteCapital });
    return { ok: true, resultat: r, primeTTC: r.primeTTC };
  }
  if (produitCode === "securstock") {
    const input = securstockInputSchema.parse(entrees) as SecurstockInput;
    const bareme = imfId
      ? await prisma.imfBaremeSecurstock.findUnique({ where: { imfId_classe: { imfId, classe: input.classe } } })
      : await prisma.baremeSecurstock.findUnique({ where: { classe: input.classe } });
    if (!bareme) return { ok: false, error: "Barème SECURSTOCK introuvable pour cette classe" };
    const limiteCapital = plafondImf != null ? Math.min(bareme.limiteCapital, plafondImf) : bareme.limiteCapital;
    const r = calculerSecurstock(input, { ...bareme, classe: input.classe, limiteCapital });
    if ("nonAssurable" in r && r.nonAssurable) return { ok: false, error: r.motif };
    return { ok: true, resultat: r, primeTTC: (r as { primeTTC: number }).primeTTC };
  }
  if (produitCode === "coupsdurs") {
    const input = coupsdursCombineSchema.parse(entrees);
    const variantes = ["maladie", ...(input.deces ? ["deces"] : []), ...(input.incapacite ? [input.incapacite] : [])];
    const desactivee = variantes.find((v) => !garantieActive(v));
    if (desactivee) return { ok: false, error: `La garantie « ${LABEL_GARANTIE_COUPSDURS[desactivee] ?? desactivee} » n'est pas proposée par cette IMF.` };

    let tarifs: { libelleVariante: string | null; prime: number; capitalGaranti: number }[];
    if (imfId) {
      tarifs = await prisma.imfTarifFixe.findMany({
        where: { imfId, produitCode: "coupsdurs", libelleVariante: { in: variantes } },
      });
    } else {
      const produit = await prisma.produit.findUnique({ where: { code: "coupsdurs" } });
      if (!produit) return { ok: false, error: "Produit introuvable" };
      tarifs = await prisma.tarifProduit.findMany({
        where: { produitId: produit.id, libelleVariante: { in: variantes } },
      });
    }
    if (tarifs.length !== variantes.length) {
      return { ok: false, error: "Garantie introuvable dans le catalogue" };
    }
    const lignes = variantes.map((v) => {
      const t = tarifs.find((t) => t.libelleVariante === v)!;
      // Prorata linéaire sur la durée choisie — le tarif catalogue est la
      // prime annuelle de référence (12 mois).
      const prime = Math.round((t.prime * input.dureeMois) / 12);
      return { garantie: LABEL_GARANTIE_COUPSDURS[v] ?? v, capital: t.capitalGaranti, prime };
    });
    const primeTTC = lignes.reduce((s, l) => s + l.prime, 0);
    return { ok: true, resultat: { lignes, primeTTC, dureeMois: input.dureeMois }, primeTTC };
  }
  // Catalogue restant : SECURECOLTE — modèle actuariel ARC, prime calculée
  // à partir de la valeur du package (1 hectare = 1 pack).
  const { superficieHa, valeurPackage } = catalogueInputSchema.parse(entrees);
  const parPack = calculerSecurecolte(valeurPackage);
  const primeTTC = Math.round(parPack.primeTTC * superficieHa);
  return {
    ok: true,
    resultat: {
      capitalFaible: Math.round(parPack.capitalFaible * superficieHa),
      capitalMoyenne: Math.round(parPack.capitalMoyenne * superficieHa),
      capitalForte: Math.round(parPack.capitalForte * superficieHa),
      capitalDeces: Math.round(parPack.capitalDeces * superficieHa),
      capitalGaranti: Math.round(parPack.capitalForte * superficieHa),
      superficieHa,
      valeurPackage,
      primeTTC,
    },
    primeTTC,
  };
}

/**
 * Simulation + souscription PUBLIQUES, sans compte (2026-09-04) : un client
 * scanne le QR/lien personnel d'un agent (`${APP_PUBLIC_URL}/imf/:token`,
 * voir GET /imf/agents/:id/qr) et simule/souscrit seul, en autonomie — la
 * souscription lui est automatiquement rattachée à CET agent (agentId),
 * exactement comme s'il l'avait saisie lui-même. Pas de paiement Wave côté
 * IMF (la souscription est déjà le contrat, voir plus bas) : contrairement
 * au parcours public Accidents/Dommages, il n'y a donc aucune étape de
 * confirmation différée à sécuriser.
 *
 * Mêmes formes de requête/réponse que agentImfRouter (`/agent-imf/...`) —
 * le frontend réutilise d'ailleurs le même composant `Simulateur` (voir
 * pages/public/SimulationImf.tsx), simplement pointé sur `apiBase =
 * "/public/imf/:token"`.
 */
export const publicImfRouter = Router();

async function resolveAgentImfParToken(token: string) {
  return prisma.agentImf.findFirst({
    where: { qrImfToken: token, statut: "actif" },
    include: { agence: { select: { nom: true } } },
  });
}

// Barèmes lus par le simulateur public : ceux de l'IMF partenaire de l'agent
// (imfId renseigné) ou, à défaut, les barèmes globaux « Assurances IMF ».
async function baremesSecurproPourAgent(imfId: string | null) {
  if (imfId) {
    await ensureBaremesImf(imfId);
    return prisma.imfBaremeSecurpro.findMany({ where: { imfId }, orderBy: { classe: "asc" } });
  }
  return prisma.baremeSecurpro.findMany({ orderBy: { classe: "asc" } });
}
async function baremesSecurstockPourAgent(imfId: string | null) {
  if (imfId) {
    await ensureBaremesImf(imfId);
    return prisma.imfBaremeSecurstock.findMany({ where: { imfId }, orderBy: { classe: "asc" } });
  }
  return prisma.baremeSecurstock.findMany({ orderBy: { classe: "asc" } });
}

/** Infos d'affichage (en-tête de la page publique) — jamais l'email/téléphone de l'agent. */
publicImfRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const agent = await resolveAgentImfParToken(req.params.token);
    if (!agent) return res.status(404).json({ error: "Lien invalide ou expiré" });
    res.json({ nom: agent.nom, prenom: agent.prenom, agenceNom: agent.agence?.nom ?? null });
  })
);

publicImfRouter.get(
  "/:token/baremes/securpro",
  asyncHandler(async (req, res) => {
    const agent = await resolveAgentImfParToken(req.params.token);
    if (!agent) return res.status(404).json({ error: "Lien invalide ou expiré" });
    res.json(await baremesSecurproPourAgent(agent.imfId));
  })
);

publicImfRouter.get(
  "/:token/baremes/securstock",
  asyncHandler(async (req, res) => {
    const agent = await resolveAgentImfParToken(req.params.token);
    if (!agent) return res.status(404).json({ error: "Lien invalide ou expiré" });
    res.json(await baremesSecurstockPourAgent(agent.imfId));
  })
);

/**
 * Le simulateur (composant partagé) charge ses brouillons au montage : côté
 * public, ce serait exposer l'historique de simulations de l'AGENT (pas du
 * visiteur, qui n'a pas de session) à n'importe qui connaissant le lien —
 * on renvoie donc toujours une liste vide, sans jamais lire la table.
 */
publicImfRouter.get("/:token/simulations", (_req, res) => res.json([]));

publicImfRouter.post(
  "/:token/simulations",
  asyncHandler(async (req, res) => {
    const agent = await resolveAgentImfParToken(req.params.token);
    if (!agent) return res.status(404).json({ error: "Lien invalide ou expiré" });
    const { produitCode, entrees } = simulationSchema.parse(req.body);

    const calc = await calculerDevisImf(produitCode, entrees, agent.imfId);
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    const simulation = await prisma.simulationImf.create({
      data: {
        agentId: agent.id,
        imfId: agent.imfId,
        produitCode,
        entrees: JSON.parse(JSON.stringify(entrees)),
        resultat: JSON.parse(JSON.stringify(calc.resultat)),
        primeTTC: Math.round(calc.primeTTC),
      },
    });
    res.status(201).json(simulation);
  })
);

/** Supprime un brouillon — n'est jamais atteint par l'UI publique (GET simulations renvoie toujours []) ; gardé pour cohérence défensive. */
publicImfRouter.delete(
  "/:token/simulations/:id",
  asyncHandler(async (req, res) => {
    const agent = await resolveAgentImfParToken(req.params.token);
    if (!agent) return res.status(404).json({ error: "Lien invalide ou expiré" });
    const simulation = await prisma.simulationImf.findUnique({
      where: { id: req.params.id },
      include: { souscription: { select: { id: true } } },
    });
    if (!simulation || simulation.agentId !== agent.id) return res.status(404).json({ error: "Introuvable" });
    if (simulation.souscription) return res.status(409).json({ error: "Cette simulation a déjà été convertie en souscription." });
    await prisma.simulationImf.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

publicImfRouter.post(
  "/:token/souscriptions",
  asyncHandler(async (req, res) => {
    const agent = await resolveAgentImfParToken(req.params.token);
    if (!agent) return res.status(404).json({ error: "Lien invalide ou expiré" });
    const data = souscriptionSchema.parse(req.body);

    const simulation = await prisma.simulationImf.findUnique({
      where: { id: data.simulationId },
      include: { souscription: true },
    });
    if (!simulation || simulation.agentId !== agent.id) {
      return res.status(404).json({ error: "Simulation introuvable" });
    }
    if (simulation.souscription) {
      return res.status(409).json({ error: "Cette simulation a déjà été convertie en souscription." });
    }

    const annee = new Date().getFullYear();
    const numeroPolice = `IMF-${simulation.produitCode.toUpperCase()}-${annee}-${simulation.id.slice(0, 8).toUpperCase()}`;

    const souscription = await prisma.souscriptionImf.create({
      data: {
        numeroPolice,
        agentId: agent.id,
        imfId: agent.imfId,
        simulationId: simulation.id,
        produitCode: simulation.produitCode,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        typePiece: data.typePiece,
        numeroPiece: data.numeroPiece,
        ville: data.ville,
        communeQuartier: data.communeQuartier,
        signature: data.signature,
        entrees: simulation.entrees as object,
        resultat: simulation.resultat as object,
        primeTTC: simulation.primeTTC,
        // Pas de passerelle de paiement bloquante côté IMF (contrairement à
        // Wave pour Accident) : la souscription est déjà le contrat.
        statut: "active",
      },
    });
    res.status(201).json(souscription);
  })
);

agentImfRouter.post(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (bloquerFinanceComptable(req, res)) return;
    const { produitCode, entrees, offlineId } = simulationSchema.parse(req.body);

    // Idempotence (synchronisation PWA hors-ligne) : si cette simulation a déjà
    // été synchronisée (ex. requête rejouée après coupure réseau juste après
    // succès), on renvoie l'enregistrement existant plutôt que d'en créer un doublon.
    if (offlineId) {
      const existante = await prisma.simulationImf.findUnique({ where: { offlineId } });
      if (existante) return res.status(200).json(existante);
    }

    const imf = scopeImfAgent(req);
    const calc = await calculerDevisImf(produitCode, entrees, imf);
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    const simulation = await prisma.simulationImf.create({
      data: {
        agentId: req.user!.sub,
        imfId: imf,
        produitCode,
        entrees: JSON.parse(JSON.stringify(entrees)),
        resultat: JSON.parse(JSON.stringify(calc.resultat)),
        primeTTC: Math.round(calc.primeTTC),
        offlineId,
      },
    });
    res.status(201).json(simulation);
  })
);

/** Brouillons enregistrés par l'agent : simulations non encore converties en souscription. */
agentImfRouter.get(
  "/simulations",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.simulationImf.findMany({
      where: { agentId: req.user!.sub, souscription: null },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  })
);

/** Suppression d'un brouillon par son auteur — jamais si déjà converti en souscription. */
agentImfRouter.delete(
  "/simulations/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const simulation = await prisma.simulationImf.findUnique({
      where: { id: req.params.id },
      include: { souscription: { select: { id: true } } },
    });
    if (!simulation || simulation.agentId !== req.user!.sub) {
      return res.status(404).json({ error: "Introuvable" });
    }
    if (simulation.souscription) {
      return res.status(409).json({ error: "Cette simulation a déjà été convertie en souscription." });
    }
    await prisma.simulationImf.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

/* ── Conversion d'une simulation en souscription ── */

const souscriptionSchema = z.object({
  simulationId: z.string().min(1),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(1),
  email: z.string().email().optional(),
  typePiece: z.enum(["cni", "passeport", "permis_conduire"]),
  numeroPiece: z.string().min(1),
  ville: z.string().min(1),
  communeQuartier: z.string().min(1),
  // Signature manuscrite facultative, capturée au moment de la conversion en souscription.
  signature: z.string().min(1).optional(),
  // Clé d'idempotence PWA (mode hors-ligne) — voir SouscriptionImf.offlineId.
  offlineId: z.string().min(1).optional(),
});

agentImfRouter.post(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (bloquerFinanceComptable(req, res)) return;
    const data = souscriptionSchema.parse(req.body);

    if (data.offlineId) {
      const existante = await prisma.souscriptionImf.findUnique({ where: { offlineId: data.offlineId } });
      if (existante) return res.status(200).json(existante);
    }

    const simulation = await prisma.simulationImf.findUnique({
      where: { id: data.simulationId },
      include: { souscription: true },
    });
    if (!simulation || simulation.agentId !== req.user!.sub) {
      return res.status(404).json({ error: "Simulation introuvable" });
    }
    if (simulation.souscription) {
      return res.status(409).json({ error: "Cette simulation a déjà été convertie en souscription." });
    }

    const annee = new Date().getFullYear();
    const numeroPolice = `IMF-${simulation.produitCode.toUpperCase()}-${annee}-${simulation.id.slice(0, 8).toUpperCase()}`;

    const souscription = await prisma.souscriptionImf.create({
      data: {
        numeroPolice,
        agentId: req.user!.sub,
        imfId: scopeImfAgent(req),
        simulationId: simulation.id,
        produitCode: simulation.produitCode,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        email: data.email,
        typePiece: data.typePiece,
        numeroPiece: data.numeroPiece,
        ville: data.ville,
        communeQuartier: data.communeQuartier,
        signature: data.signature,
        offlineId: data.offlineId,
        entrees: simulation.entrees as object,
        resultat: simulation.resultat as object,
        primeTTC: simulation.primeTTC,
        // Pas de passerelle de paiement bloquante côté IMF (contrairement à
        // Wave pour Accident) : la souscription est déjà le contrat.
        statut: "active",
      },
    });

    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "souscription_imf",
      objetId: souscription.id,
      valeurApres: souscription,
    });

    res.status(201).json(souscription);
  })
);

agentImfRouter.get(
  "/souscriptions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneIds: req.user!.zoneIds ?? [],
    });
    const rows = await prisma.souscriptionImf.findMany({
      where: { agentId: { in: scope } },
      orderBy: { createdAt: "desc" },
      include: { agent: { select: { nom: true, prenom: true } } },
    });
    res.json(rows.map((r) => ({ ...r, agentNom: r.agent ? `${r.agent.prenom} ${r.agent.nom}` : null })));
  })
);

/* ── Réseau (supervision, réservé aux responsables) ── */

/** Agences de la/les zone(s) du responsable ou chef de zone connecté, chacune avec ses agents. */
agentImfRouter.get(
  "/reseau/agences",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (
      (req.user!.roleImf !== "RESPONSABLE_ZONE" && req.user!.roleImf !== "CHEF_ZONE") ||
      !req.user!.zoneIds?.length
    ) {
      return res.status(403).json({ error: "Réservé aux responsables et chefs de zone." });
    }
    const agences = await prisma.agenceImf.findMany({
      where: { zoneId: { in: req.user!.zoneIds } },
      orderBy: { nom: "asc" },
      include: {
        agents: {
          select: { id: true, nom: true, prenom: true, roleImf: true, statut: true, telephone: true, email: true },
        },
      },
    });
    res.json(agences);
  })
);

/** Agents dans la portée du responsable connecté, avec leur activité (nb souscriptions, prime totale). */
agentImfRouter.get(
  "/reseau/agents",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.user!.roleImf === "AGENT") {
      return res.status(403).json({ error: "Réservé aux responsables." });
    }
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneIds: req.user!.zoneIds ?? [],
    });
    const [agents, souscriptions] = await Promise.all([
      prisma.agentImf.findMany({
        where: { id: { in: scope } },
        orderBy: { nom: "asc" },
        include: {
          agence: { select: { nom: true, zone: { select: { nom: true } } } },
          zone: { select: { nom: true } },
          zones: { select: { nom: true } },
        },
      }),
      prisma.souscriptionImf.groupBy({
        by: ["agentId"],
        where: { agentId: { in: scope } },
        _count: { _all: true },
        _sum: { primeTTC: true },
      }),
    ]);
    const statsParAgent = new Map(souscriptions.map((s) => [s.agentId, s]));
    res.json(
      agents.map((a) => ({
        id: a.id,
        nom: a.nom,
        prenom: a.prenom,
        roleImf: a.roleImf,
        statut: a.statut,
        agenceNom: a.agence?.nom ?? null,
        zoneNom: a.agence?.zone.nom ?? (a.zones.length ? a.zones.map((z) => z.nom).join(", ") : a.zone?.nom ?? null),
        nbSouscriptions: statsParAgent.get(a.id)?._count._all ?? 0,
        primeTotale: statsParAgent.get(a.id)?._sum.primeTTC ?? 0,
      }))
    );
  })
);

agentImfRouter.get(
  "/contrats",
  asyncHandler(async (req: AuthedRequest, res) => {
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneIds: req.user!.zoneIds ?? [],
    });
    const rows = await prisma.souscriptionImf.findMany({
      where: { agentId: { in: scope }, statut: "active" },
      orderBy: { createdAt: "desc" },
      include: { agent: { select: { nom: true, prenom: true } } },
    });
    res.json(rows.map((r) => ({ ...r, agentNom: r.agent ? `${r.agent.prenom} ${r.agent.nom}` : null })));
  })
);

/**
 * Finance de l'agence — réservé au finance comptable (jamais au responsable
 * d'agence : c'est précisément le rôle qui ne doit pas voir les commissions).
 * Commission = taux courant (BaremeSecurpro/Securstock.tauxCommission ou
 * TarifProduit.commission) × prime HT de la souscription (jamais la TTC) —
 * calculée à la volée avec les taux EN VIGUEUR, pas ceux figés au moment du
 * devis, pour qu'une correction de barème se répercute sur tout l'historique.
 */
agentImfRouter.get(
  "/finance",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.user!.roleImf !== "FINANCE_COMPTABLE") {
      return res.status(403).json({ error: "Réservé au finance comptable de l'agence." });
    }
    const moi = await prisma.agentImf.findUnique({ where: { id: req.user!.sub } });
    if (!moi?.agenceId) return res.status(400).json({ error: "Aucune agence rattachée à ce compte." });

    const membres = await prisma.agentImf.findMany({
      where: { agenceId: moi.agenceId },
      select: { id: true, nom: true, prenom: true },
    });
    const agentIds = membres.map((m) => m.id);

    const [souscriptions, baremesSecurpro, baremesSecurstock, tarifsCatalogue] = await Promise.all([
      prisma.souscriptionImf.findMany({
        where: { agentId: { in: agentIds }, statut: "active" },
        select: { agentId: true, produitCode: true, entrees: true, resultat: true, primeTTC: true },
      }),
      prisma.baremeSecurpro.findMany(),
      prisma.baremeSecurstock.findMany(),
      prisma.tarifProduit.findMany({ include: { produit: { select: { code: true } } } }),
    ]);

    function commissionDe(s: (typeof souscriptions)[number]): number {
      const entrees = s.entrees as { classe?: number; libelleVariante?: string; deces?: boolean; incapacite?: string | null };
      const resultat = s.resultat as { primeNetteHT?: number; primeHT?: number; prime?: number };
      if (s.produitCode === "securpro") {
        const bareme = baremesSecurpro.find((b) => b.classe === entrees.classe);
        return Math.round((resultat.primeNetteHT ?? 0) * (bareme?.tauxCommission ?? 0));
      }
      if (s.produitCode === "securstock") {
        const bareme = baremesSecurstock.find((b) => b.classe === entrees.classe);
        return Math.round((resultat.primeNetteHT ?? 0) * (bareme?.tauxCommission ?? 0));
      }
      if (s.produitCode === "coupsdurs") {
        // Garanties combinées : commission = somme, garantie par garantie, de
        // (prime HT de la ligne × taux courant de la ligne) — jamais figée au devis.
        const variantes = ["maladie", ...(entrees.deces ? ["deces"] : []), ...(entrees.incapacite ? [entrees.incapacite] : [])];
        return variantes.reduce((sum, v) => {
          const t = tarifsCatalogue.find((t) => t.produit.code === "coupsdurs" && t.libelleVariante === v);
          if (!t) return sum;
          return sum + Math.round((t.primeHT ?? t.prime) * t.commission);
        }, 0);
      }
      // Catalogue (SECURECOLTE, anciens codes COUPS DURS) : la fiche tarifaire
      // source ne détaille pas toujours la prime HT — à défaut, on retient la
      // prime TTC comme base (voir remarque transmise à l'utilisateur).
      const tarif = tarifsCatalogue.find(
        (t) => t.produit.code === s.produitCode && t.libelleVariante === entrees.libelleVariante
      );
      const primeHT = resultat.primeHT ?? resultat.prime ?? s.primeTTC;
      return Math.round(primeHT * (tarif?.commission ?? 0));
    }

    const parAgentMap = new Map<
      string,
      { nom: string; prenom: string; nombreSouscriptions: number; primeTTC: number; commission: number }
    >();
    for (const m of membres) parAgentMap.set(m.id, { nom: m.nom, prenom: m.prenom, nombreSouscriptions: 0, primeTTC: 0, commission: 0 });

    const parProduitMap: Record<string, { nombreSouscriptions: number; primeTTC: number; commission: number }> = {};
    for (const f of FAMILLES) parProduitMap[f] = { nombreSouscriptions: 0, primeTTC: 0, commission: 0 };

    let totalPrime = 0;
    let totalCommission = 0;

    for (const s of souscriptions) {
      const c = commissionDe(s);
      totalPrime += s.primeTTC;
      totalCommission += c;
      if (s.agentId) {
        const a = parAgentMap.get(s.agentId);
        if (a) {
          a.nombreSouscriptions += 1;
          a.primeTTC += s.primeTTC;
          a.commission += c;
        }
      }
      const famille = FAMILLE_PRODUIT[s.produitCode] ?? s.produitCode;
      if (!parProduitMap[famille]) parProduitMap[famille] = { nombreSouscriptions: 0, primeTTC: 0, commission: 0 };
      parProduitMap[famille].nombreSouscriptions += 1;
      parProduitMap[famille].primeTTC += s.primeTTC;
      parProduitMap[famille].commission += c;
    }

    res.json({
      global: { nombreSouscriptions: souscriptions.length, primeTTC: totalPrime, commission: totalCommission },
      parAgent: [...parAgentMap.entries()].map(([id, v]) => ({ agentId: id, ...v })),
      parProduit: FAMILLES.map((f) => ({ famille: f, ...parProduitMap[f] })),
    });
  })
);

/**
 * Regroupe les 5 codes produit en 4 familles commerciales (les deux variantes
 * COUPS DURS sont fusionnées) pour le tableau de bord.
 */
export const FAMILLE_PRODUIT: Record<string, string> = {
  securpro: "SECURPRO",
  securstock: "SECURSTOCK",
  coupsdurs: "COUPS DURS",
  // Anciens codes produit (avant fusion) — conservés pour les souscriptions déjà émises.
  coupsdurs_classique: "COUPS DURS",
  coupsdurs_incapacite: "COUPS DURS",
  securecolte: "SECURECOLTE",
};
export const FAMILLES = ["SECURPRO", "SECURSTOCK", "COUPS DURS", "SECURECOLTE"];

/* ────────────────────────────────────────────────────────────────────────
 * Phase 6 — Sinistres IMF
 * ──────────────────────────────────────────────────────────────────────── */

export interface PieceChecklist {
  label: string;
  fournie: boolean;
}

/**
 * Checklist des pièces à fournir, d'après la lettre "LISTE DES PIECES
 * NECESSAIRES POUR LE PAIEMENT DES SINISTRES" (SIM Assurances) et les
 * Conditions Particulières SECURSTOCK pour ses exigences propres
 * (vidéosurveillance + registre de stock). SECURECOLTE n'a pas de checklist :
 * son indemnisation est automatique par palier de sécheresse (voir plus bas).
 */
export function checklistImf(produitCode: string, typeEvenement: string): string[] {
  if (produitCode === "securpro") {
    return [
      "Formulaire de déclaration de sinistre",
      "Pièce d'identité de l'assuré",
      "Facture CIE/SODECI ou quittance de loyer du local",
      "Photos des dommages et dégâts causés par les flammes",
      "Justificatifs de la valeur des biens (si nécessaire)",
    ];
  }
  if (produitCode === "securstock") {
    return [
      "Formulaire de déclaration de sinistre",
      "Pièce d'identité de l'assuré",
      "Déclaration du sinistre par l'institution bancaire (sous 48h)",
      "Enregistrements vidéo des 5 jours précédant le sinistre",
      "Registre de stock à jour (entrées/sorties)",
      "Justificatifs de la valeur du stock",
    ];
  }
  if (produitCode === "coupsdurs" || produitCode === "coupsdurs_classique" || produitCode === "coupsdurs_incapacite") {
    if (typeEvenement === "deces") {
      return [
        "Formulaire de déclaration de sinistre",
        "Carte d'assuré et pièce d'identité",
        "Acte de décès",
        "Certificat de genre de mort",
        "Extrait de naissance du (des) bénéficiaire(s)",
        "Pièce d'identité du (des) bénéficiaire(s)",
        "Acte de mariage du conjoint (si nécessaire)",
        "Procès-verbal de constat de gendarmerie/police (si accident de la circulation)",
        "Certificat d'individualité (si nécessaire)",
      ];
    }
    const commun = [
      "Formulaire de déclaration de sinistre",
      "Carte d'assuré ou pièce d'identité",
      "Reçus ou tickets de consultation médicale",
      "Ordonnances médicales",
      "Reçus ou tickets de caisse de pharmacie",
      "Certificat médical attestant l'événement Coups Durs",
    ];
    return typeEvenement === "incapacite_temporaire"
      ? [...commun, "Échéancier du prêt en cours auprès de l'institution financière"]
      : [...commun, "Certificat d'arrêt de travail (indemnité journalière), si applicable"];
  }
  return [];
}

export function numeroSinistre(produitCode: string, id: string) {
  const annee = new Date().getFullYear();
  return `SIN-${produitCode.toUpperCase()}-${annee}-${id.slice(0, 8).toUpperCase()}`;
}

export function mapSinistre(sin: {
  agent: { nom: string; prenom: string } | null;
  admin: { nom: string } | null;
  souscription: { numeroPolice: string; nom: string; prenom: string; telephone: string; produitCode: string; primeTTC: number };
  [k: string]: unknown;
}) {
  return {
    ...sin,
    agentNom: sin.agent ? `${sin.agent.prenom} ${sin.agent.nom}` : null,
    adminNom: sin.admin?.nom ?? null,
    numeroPolice: sin.souscription.numeroPolice,
    clientNom: sin.souscription.nom,
    clientPrenom: sin.souscription.prenom,
    clientTelephone: sin.souscription.telephone,
    produitCode: sin.souscription.produitCode,
  };
}

export const sinistreInclude = {
  agent: { select: { nom: true, prenom: true } },
  admin: { select: { nom: true } },
  souscription: { select: { numeroPolice: true, nom: true, prenom: true, telephone: true, produitCode: true, primeTTC: true } },
};

export const declarationSchema = z.object({
  souscriptionId: z.string().min(1),
  typeEvenement: z.string().min(1),
  dateSurvenance: z.coerce.date(),
  montantEstime: z.number().nonnegative().optional(),
});

/** Déclaration d'un sinistre par un agent, sur une souscription dans sa portée réseau. */
agentImfRouter.post(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (bloquerSinistres(req, res)) return;
    const data = declarationSchema.parse(req.body);
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneIds: req.user!.zoneIds ?? [],
    });
    const souscription = await prisma.souscriptionImf.findUnique({ where: { id: data.souscriptionId } });
    if (!souscription || !souscription.agentId || !scope.includes(souscription.agentId)) {
      return res.status(404).json({ error: "Souscription introuvable." });
    }
    if (souscription.produitCode === "securecolte") {
      return res.status(400).json({
        error: "SECURECOLTE n'a pas de déclaration individuelle : l'indemnisation est automatique par palier de sécheresse.",
      });
    }
    const pieces: PieceChecklist[] = checklistImf(souscription.produitCode, data.typeEvenement).map((label) => ({
      label, fournie: false,
    }));

    const created = await prisma.sinistreImf.create({
      data: {
        numeroSinistre: "TMP",
        souscriptionId: souscription.id,
        agentId: req.user!.sub,
        imfId: souscription.imfId,
        typeEvenement: data.typeEvenement,
        dateSurvenance: data.dateSurvenance,
        montantEstime: data.montantEstime ? Math.round(data.montantEstime) : undefined,
        pieces: pieces as unknown as object,
      },
    });
    const updated = await prisma.sinistreImf.update({
      where: { id: created.id },
      data: { numeroSinistre: numeroSinistre(souscription.produitCode, created.id) },
      include: sinistreInclude,
    });
    await logAction({
      adminId: req.user!.sub,
      typeAction: "creation",
      objetType: "sinistre_imf",
      objetId: updated.id,
      valeurApres: updated,
    });
    res.status(201).json(mapSinistre(updated));
  })
);

/** Sinistres dans la portée réseau de l'agent connecté. */
agentImfRouter.get(
  "/sinistres",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (bloquerSinistres(req, res)) return;
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneIds: req.user!.zoneIds ?? [],
    });
    const rows = await prisma.sinistreImf.findMany({
      where: { agentId: { in: scope } },
      orderBy: { createdAt: "desc" },
      include: sinistreInclude,
    });
    res.json(rows.map(mapSinistre));
  })
);

const piecesPatchSchema = z.object({
  pieces: z.array(z.object({ label: z.string(), fournie: z.boolean() })),
});

/** L'agent coche les pièces fournies après vérification physique ; passe le dossier à "complet" une fois tout coché. */
agentImfRouter.patch(
  "/sinistres/:id/pieces",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (bloquerSinistres(req, res)) return;
    const data = piecesPatchSchema.parse(req.body);
    const scope = await agentIdsDuReseau({
      id: req.user!.sub,
      roleImf: req.user!.roleImf!,
      agenceId: req.user!.agenceId ?? null,
      zoneIds: req.user!.zoneIds ?? [],
    });
    const sinistre = await prisma.sinistreImf.findUnique({ where: { id: req.params.id } });
    if (!sinistre || !sinistre.agentId || !scope.includes(sinistre.agentId)) {
      return res.status(404).json({ error: "Sinistre introuvable." });
    }
    const toutesFournies = data.pieces.length > 0 && data.pieces.every((p) => p.fournie);
    const updated = await prisma.sinistreImf.update({
      where: { id: sinistre.id },
      data: {
        pieces: data.pieces as unknown as object,
        statut: toutesFournies ? "complet" : "pieces_attente",
      },
      include: sinistreInclude,
    });
    res.json(mapSinistre(updated));
  })
);

export const transitionSchema = z.object({
  statut: z.enum(["instruction", "accepte", "rejete", "regle"]),
  montantRegle: z.number().nonnegative().optional(),
  montantIMF: z.number().nonnegative().optional(),
  montantSouscripteur: z.number().nonnegative().optional(),
  motifRejet: z.string().min(1).optional(),
});

/**
 * SECURECOLTE : pas de déclaration individuelle — indemnisation automatique
 * par palier de sécheresse (indice ARC). L'admin sélectionne les contrats
 * SECURECOLTE actifs concernés et le palier constaté ; un sinistre "réglé"
 * est créé directement pour chacun, au pourcentage du palier.
 */
export const indemnisationSecurecolteSchema = z.object({
  souscriptionIds: z.array(z.string().min(1)).min(1),
  palier: z.enum(["forte", "moyenne", "faible", "deces"]),
  region: z.string().min(1),
});

// Taux appliqué au capital garanti "forte" (= capitalGaranti) pour les
// souscriptions antérieures au modèle ARC (sans capitaux détaillés par palier).
export const TAUX_PALIER: Record<"forte" | "moyenne" | "faible" | "deces", number> = {
  forte: 1, moyenne: 0.5, faible: 0.2, deces: 1,
};

/* ────────────────────────────────────────────────────────────────────────
 * Phase 7 — Bordereaux & règlement IMF.
 * Une AgenceImf correspond en pratique à l'agence d'une institution de
 * microfinance dans ce modèle de données : c'est l'unité pour laquelle un
 * bordereau de production est généré.
 * ──────────────────────────────────────────────────────────────────────── */

export interface VirementBordereau {
  montant: number;
  date: string;
  reference: string;
}

export function numeroBordereau(agenceNom: string, periodeDebut: Date, id: string) {
  const code = agenceNom.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "AGENCE";
  const aaaamm = `${periodeDebut.getFullYear()}${String(periodeDebut.getMonth() + 1).padStart(2, "0")}`;
  return `BORD-${code}-${aaaamm}-${id.slice(0, 6).toUpperCase()}`;
}

export function statutBordereau(montantRecu: number, primeTotal: number): "emis" | "partiellement_regle" | "regle" {
  if (montantRecu <= 0) return "emis";
  if (montantRecu >= primeTotal) return "regle";
  return "partiellement_regle";
}

export function mapBordereau(b: { agence: { nom: string; zone: { nom: string } }; genereParAdmin: { nom: string } | null; [k: string]: unknown }) {
  return {
    ...b,
    agenceNom: b.agence.nom,
    zoneNom: b.agence.zone.nom,
    genereParNom: b.genereParAdmin?.nom ?? null,
  };
}

export const bordereauInclude = {
  agence: { select: { nom: true, zone: { select: { nom: true } } } },
  genereParAdmin: { select: { nom: true } },
};

export const genererBordereauSchema = z.object({
  agenceId: z.string().min(1),
  periodeDebut: z.coerce.date(),
  periodeFin: z.coerce.date(),
});

export const virementSchema = z.object({
  montant: z.number().positive(),
  date: z.coerce.date(),
  reference: z.string().min(1),
});
