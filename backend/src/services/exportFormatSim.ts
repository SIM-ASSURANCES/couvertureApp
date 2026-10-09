// Export Excel « format SIM Assurances » : les 25 colonnes de la feuille
// « PROPOSITION SIM ASSURANCES » du modèle fourni (TEMPLATE PLATEFORME QR
// CODE.xlsx), pour la liste des clients et la liste des contrats.
//
// Une ligne par police (état courant), tous modèles confondus : générique
// (dont les Assurances Santé), Incendie et Accident historiques. Toute donnée
// qui n'existe pas est écrite « NA », jamais laissée vide ni inventée.
//
// Lecture seule : rien n'est créé ni modifié (pas même un identifiant client
// manquant).

import type { Prisma, Produit, TarifProduit } from "@prisma/client";
import { prisma } from "../db.js";
import { detailDePrime } from "./facture.js";
import { numeroPoliceIncendieSynthetique } from "./notify.js";
import { PRODUITS_COMMISSION_DYNAMIQUE } from "./commission.js";
import { SOUS_BRANCHES_ASSURANCES, type SousBrancheAssurance } from "./sousBranches.js";

export const NA = "NA";

/** Colonnes, dans l'ordre du modèle. */
export const COLONNES_SIM = [
  "Identifiant client",
  "Nom Assuré",
  "Prénom Assuré",
  "Téléphone Assuré",
  "Partenaire",
  "Agent souscripteur",
  "Catégorie",
  "Produit",
  "N° police",
  // Le modèle porte « SMP (au lieu de Garanties) » : la parenthèse est une
  // consigne de rédaction (« écrire SMP et non Garanties »), pas le nom.
  "SMP",
  "Statut",
  "Type d'émission",
  "Date d'émission",
  "Période de couverture",
  "Date d'effet",
  "Date d'échéance",
  "Prime ht",
  "Accessoires",
  "Taxes",
  "Prime ttc",
  "Règlement",
  "Restant dû (Arriérés)",
  "Commission due",
  "Commission payée",
  "Année d'émission",
] as const;
export type Colonne = (typeof COLONNES_SIM)[number];

/** Colonnes qui portent des dates (AAAA-MM-JJ, ou « NA »), à écrire comme dates Excel. */
export const COLONNES_DATE: readonly Colonne[] = ["Date d'émission", "Date d'effet", "Date d'échéance"];

export type LigneSim = Record<Colonne, string | number>;

export const MODELES_EXPORT = ["generique", "incendie", "accident"] as const;
export type ModeleExport = (typeof MODELES_EXPORT)[number];

export interface FiltresExportSim {
  modeles: ModeleExport[];
  /** Restreint le modèle générique à une Assurance (Accidents, Dommages ou Santé). */
  sousBranche?: SousBrancheAssurance;
  /** Code produit ; « incendie » / « accident » désignent les modèles historiques. */
  produit?: string;
  partenaireId?: string;
  statut: "confirme" | "attente" | "tous";
  /** Filtre propre à Incendie historique (page Clients Dommages). */
  statutIncendie?: "en_cours" | "complet" | "expire";
  q?: string;
  /** Fenêtre sur la date d'effet (date de création pour Incendie, comme la page Contrats). */
  from?: Date;
  to?: Date;
}

const ASSURANCE_LIBELLE: Record<string, string> = {
  ASSURANCES_ACCIDENTS: "Assurances Accidents",
  ASSURANCES_DOMMAGES: "Assurances Dommages",
  ASSURANCES_SANTE: "Assurances Santé",
};

const TAUX_COMMISSION_DEFAUT = 0.2;
const TAILLE_LOT = 400;
const JOUR_MS = 24 * 60 * 60 * 1000;

// ── Utilitaires ─────────────────────────────────────────────────────────

const estVide = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
/** « NA » pour une valeur absente ; texte nettoyé (espaces de début/fin, doublons) sinon. */
const texteOuNA = (v: string | null | undefined) => (estVide(v) ? NA : v!.trim().replace(/\s+/g, " "));
const jourISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : NA);

/**
 * Durée d'une émission, dans le vocabulaire du modèle : Journalière,
 * Hebdomadaire, Mensuelle, Trimestrielle, Semestrielle, Annuelle — « ou en
 * nombre de jours » pour tout le reste (ex. 2 mois = 61 jours).
 */
export function periodeDeCouverture(jours: number | null): string {
  if (jours === null || !Number.isFinite(jours) || jours <= 0) return NA;
  const j = Math.round(jours);
  if (j === 1) return "Journalière";
  if (j === 7) return "Hebdomadaire";
  if (j >= 28 && j <= 31) return "Mensuelle";
  if (j >= 89 && j <= 92) return "Trimestrielle";
  if (j >= 181 && j <= 184) return "Semestrielle";
  if (j >= 365 && j <= 366) return "Annuelle";
  return `${j} jours`;
}

/** Durée en jours entre deux dates, ou `null` si l'une manque. */
function joursEntre(debut: Date | null | undefined, fin: Date | null | undefined, emissions = 1): number | null {
  if (!debut || !fin) return null;
  const j = (fin.getTime() - debut.getTime()) / JOUR_MS / Math.max(1, emissions);
  return j > 0 ? j : null;
}

/**
 * Prime HT / Accessoires / Taxes d'une ligne d'un barème historique
 * (Accident, Incendie). Même règle que le détail des factures : le barème suit
 * l'une de deux conventions — accessoires EN PLUS (HT + acc. + taxes = TTC) ou
 * COMPRIS dans le HT (HT + taxes = TTC) — reconnue par le calcul. Sinon (barème
 * incomplet, ou qui ne retombe pas sur le TTC payé) : « NA », jamais un détail
 * inventé.
 */
export function decomposerTarif(
  ttc: number,
  t: { primeHT: number | null; fg: number | null; taxes: number | null } | undefined
): { ht: number | string; accessoires: number | string; taxes: number | string } {
  const nul = { ht: NA, accessoires: NA, taxes: NA };
  if (!t || t.primeHT == null || t.taxes == null) return nul;
  const fg = t.fg ?? 0;
  const proche = (a: number, b: number) => Math.abs(a - b) <= 1.5;
  let htHorsAccessoires: number;
  if (proche(t.primeHT + fg + t.taxes, ttc)) htHorsAccessoires = t.primeHT;
  else if (proche(t.primeHT + t.taxes, ttc)) htHorsAccessoires = t.primeHT - fg;
  else return nul;
  const accessoires = Math.round(fg);
  const taxes = Math.round(t.taxes);
  const ht = ttc - accessoires - taxes; // le HT absorbe l'arrondi : la somme tombe juste
  if (ht < 0 || Math.abs(ht - htHorsAccessoires) > 2) return nul;
  return { ht, accessoires, taxes };
}

// ── Statut ─────────────────────────────────────────────────────────────
//
// La note du modèle (« Statut — à quoi cela correspond-il ? ») laissait la
// question ouverte : le statut est ici l'ÉTAT DU CONTRAT, pas le statut
// technique du paiement (« confirme », « en_attente »…) de l'ancien export.

export const STATUTS_SIM = [
  "Actif",
  "Expiré",
  "En attente de validation",
  "En attente de paiement",
  "Paiement échoué",
  "Demande refusée",
  "En cours de souscription",
] as const;

function statutEnCours(fin: Date | null | undefined, maintenant: Date): "Actif" | "Expiré" {
  // Sans échéance connue, une police confirmée est considérée active.
  return fin && fin.getTime() < maintenant.getTime() ? "Expiré" : "Actif";
}

// ── Chargement des références ───────────────────────────────────────────

interface References {
  produits: Map<string, Pick<Produit, "id" | "code" | "libelle" | "sousBranche" | "tauxCommission">>;
  tarifs: TarifProduit[];
  tarifParPrime: Map<string, TarifProduit>;
  baremeSecurpro: Map<number, number>;
  tarifAccident: Map<number, { primeHT: number | null; fg: number | null; taxes: number | null }>;
  tarifIncendie: Map<number, { primeHT: number | null; fg: number | null; taxes: number | null }>;
  tauxAccident: number;
  tauxIncendie: number;
  maintenant: Date;
}

async function chargerReferences(): Promise<References> {
  const [produits, tarifs, bareme, tAcc, tInc, params] = await Promise.all([
    prisma.produit.findMany({
      where: { sousBranche: { in: [...SOUS_BRANCHES_ASSURANCES] } },
      select: { id: true, code: true, libelle: true, sousBranche: true, tauxCommission: true },
    }),
    prisma.tarifProduit.findMany(),
    prisma.baremeSecurpro.findMany(),
    prisma.tarifAccident.findMany(),
    prisma.tarifIncendie.findMany(),
    prisma.parametre.findUnique({ where: { id: 1 } }),
  ]);
  const tarifParPrime = new Map<string, TarifProduit>();
  for (const t of tarifs) {
    const cle = `${t.produitId}:${t.prime}`;
    if (!tarifParPrime.has(cle)) tarifParPrime.set(cle, t);
  }
  return {
    produits: new Map(produits.map((p) => [p.id, p])),
    tarifs,
    tarifParPrime,
    baremeSecurpro: new Map(bareme.map((b) => [b.classe, b.tauxCommission])),
    tarifAccident: new Map(tAcc.map((t) => [t.prime, t])),
    tarifIncendie: new Map(tInc.map((t) => [t.prime, t])),
    tauxAccident: params?.tauxCommissionAccident ?? TAUX_COMMISSION_DEFAUT,
    tauxIncendie: params?.tauxCommissionIncendie ?? TAUX_COMMISSION_DEFAUT,
    maintenant: new Date(),
  };
}

// ── Modèle générique ───────────────────────────────────────────────────

type SouscriptionGenerique = Prisma.SouscriptionGetPayload<{
  include: {
    produit: { select: { code: true; libelle: true; sousBranche: true; tauxCommission: true } };
    partenaire: { select: { nomCommerce: true; nomResponsable: true; localisation: true } };
    agentDistribution: { select: { nom: true } };
    client: { select: { identifiant: true } };
    paiements: { select: { statut: true; montant: true; datePaiement: true; dateEcheance: true; periodeDebut: true; periodeFin: true } };
  };
}>;

/**
 * Commission brute de la police (avant partage avec un éventuel sous-agent) :
 * taux × prime nette × nombre de paiements confirmés — la règle de
 * services/commission.ts, appliquée police par police. « NA » tant que rien
 * n'est encaissé : aucune commission n'est due.
 */
function commissionGenerique(s: SouscriptionGenerique, ref: References): number | string {
  if (s.waveStatut !== "confirme") return NA;
  const n = s.nombrePaiements ?? 1;
  const code = s.produit.code;
  if ((PRODUITS_COMMISSION_DYNAMIQUE as readonly string[]).includes(code)) {
    const r = s.resultat as { primeNetteHT?: number; primeNetteHT2?: number } | null;
    if (!r) return NA;
    if (code === "securpro_dommages") {
      const classe = (s.donneesSpecifiques as { classe?: number } | null)?.classe;
      const taux = classe != null ? ref.baremeSecurpro.get(classe) ?? 0 : 0;
      return Math.round((r.primeNetteHT ?? 0) * taux * n);
    }
    return Math.round((r.primeNetteHT2 ?? r.primeNetteHT ?? 0) * (s.produit.tauxCommission ?? 0) * n);
  }
  const base = ref.tarifParPrime.get(`${s.produitId}:${s.montantPrime}`)?.primeHT ?? s.montantPrime;
  return Math.round(base * (s.produit.tauxCommission ?? TAUX_COMMISSION_DEFAUT) * n);
}

async function ligneGenerique(s: SouscriptionGenerique, ref: References): Promise<{ ligne: LigneSim; tri: number }> {
  const confirmee = s.waveStatut === "confirme";
  const nbPaiements = Math.max(1, s.nombrePaiements ?? 1);
  const payes = s.paiements.filter((p) => p.statut === "paye");
  const dernierPaye = [...payes].sort((a, b) => (b.datePaiement?.getTime() ?? 0) - (a.datePaiement?.getTime() ?? 0))[0];

  let statut: (typeof STATUTS_SIM)[number];
  if (confirmee) statut = statutEnCours(s.dateFin, ref.maintenant);
  else if (s.validationStatut === "en_attente") statut = "En attente de validation";
  else if (s.validationStatut === "refusee") statut = "Demande refusée";
  else if (s.waveStatut === "echoue") statut = "Paiement échoué";
  else statut = "En attente de paiement";

  const renouvelee = confirmee && nbPaiements > 1;
  const dateEmission = confirmee ? (dernierPaye?.datePaiement ?? s.renouveleAt ?? s.createdAt) : s.createdAt;

  // Durée d'une émission : la période figée sur le dernier paiement si elle
  // existe, sinon la durée totale de la police divisée par le nombre d'émissions.
  const jours =
    dernierPaye?.periodeDebut && dernierPaye?.periodeFin
      ? joursEntre(dernierPaye.periodeDebut, dernierPaye.periodeFin)
      : confirmee
      ? joursEntre(s.dateDebut, s.dateFin, nbPaiements)
      : null;

  // Prime HT / accessoires / taxes : même détail que les factures. L'option
  // Décès (RelaxAccidents Frais Médicaux) n'a pas de décomposition propre : sa
  // prime est comptée dans la Prime HT pour que HT + accessoires + taxes = TTC.
  const detail = await detailDePrime(s, s.montantPrime, ref.tarifs);

  const regle = payes.reduce((t, p) => t + p.montant, 0);
  const reglement = regle > 0 ? regle : confirmee ? s.montantPrime * nbPaiements : 0;
  // Arriérés = échéances échues et non réglées : une échéance à venir n'en est pas un.
  const echues = s.paiements
    .filter((p) => p.statut === "en_attente" && p.dateEcheance.getTime() <= ref.maintenant.getTime())
    .reduce((t, p) => t + p.montant, 0);
  const restant = confirmee ? echues : s.validationStatut === "refusee" ? 0 : s.montantPrime;

  const ligne: LigneSim = {
    "Identifiant client": texteOuNA(s.client?.identifiant),
    "Nom Assuré": texteOuNA(s.nom),
    "Prénom Assuré": texteOuNA(s.prenom),
    "Téléphone Assuré": texteOuNA(s.telephone),
    "Partenaire": texteOuNA(s.partenaire.nomResponsable || s.partenaire.nomCommerce),
    "Agent souscripteur": texteOuNA(s.agentDistribution?.nom),
    "Catégorie": ASSURANCE_LIBELLE[s.produit.sousBranche ?? ""] ?? NA,
    "Produit": texteOuNA(s.produit.libelle),
    "N° police": texteOuNA(s.numeroPolice),
    // Pas de capital en Santé (garantie = taux de prise en charge) : NA.
    "SMP": s.capitalGaranti > 0 ? s.capitalGaranti : NA,
    "Statut": statut,
    "Type d'émission": renouvelee ? "Renouvellement" : "Nouvelle affaire",
    "Date d'émission": jourISO(dateEmission),
    "Période de couverture": periodeDeCouverture(jours),
    "Date d'effet": jourISO(s.dateDebut),
    "Date d'échéance": jourISO(s.dateFin),
    "Prime ht": detail ? detail.primeHT + (detail.optionDeces ?? 0) : NA,
    "Accessoires": detail ? detail.accessoires : NA,
    "Taxes": detail ? detail.taxes : NA,
    "Prime ttc": s.montantPrime,
    "Règlement": reglement,
    "Restant dû (Arriérés)": restant,
    "Commission due": commissionGenerique(s, ref),
    // Les commissions versées sont enregistrées par partenaire (demandes de
    // commission validées), pas par police : donnée inexistante à ce niveau.
    "Commission payée": NA,
    "Année d'émission": dateEmission.getUTCFullYear(),
  };
  return { ligne, tri: s.createdAt.getTime() };
}

// ── Modèles historiques ────────────────────────────────────────────────

function ligneAccident(
  s: Prisma.SouscriptionAccidentGetPayload<{
    include: {
      partenaire: { select: { nomCommerce: true; nomResponsable: true } };
      agentDistribution: { select: { nom: true } };
      client: { select: { identifiant: true } };
    };
  }>,
  ref: References
): { ligne: LigneSim; tri: number } {
  const confirmee = s.waveStatut === "confirme";
  const nb = Math.max(1, s.nombrePaiements ?? 1);
  const detail = decomposerTarif(s.montantPrime, ref.tarifAccident.get(s.montantPrime));
  const dateEmission = confirmee ? (s.renouveleAt ?? s.createdAt) : s.createdAt;
  const renouvellementEnCours = !!s.renouvellementEnCoursDepuis;
  const primeNette = ref.tarifAccident.get(s.montantPrime)?.primeHT ?? s.montantPrime;

  const ligne: LigneSim = {
    "Identifiant client": texteOuNA(s.client?.identifiant),
    "Nom Assuré": texteOuNA(s.nom),
    "Prénom Assuré": texteOuNA(s.prenom),
    "Téléphone Assuré": texteOuNA(s.telephone),
    "Partenaire": texteOuNA(s.partenaire.nomResponsable || s.partenaire.nomCommerce),
    "Agent souscripteur": texteOuNA(s.agentDistribution?.nom),
    "Catégorie": ASSURANCE_LIBELLE.ASSURANCES_ACCIDENTS,
    "Produit": "Accidents (historique)",
    "N° police": texteOuNA(s.numeroPolice),
    "SMP": s.capitalGaranti > 0 ? s.capitalGaranti : NA,
    "Statut": confirmee
      ? statutEnCours(s.dateFin, ref.maintenant)
      : s.waveStatut === "echoue"
      ? "Paiement échoué"
      : "En attente de paiement",
    "Type d'émission": confirmee && nb > 1 ? "Renouvellement" : "Nouvelle affaire",
    "Date d'émission": jourISO(dateEmission),
    "Période de couverture": confirmee ? periodeDeCouverture(joursEntre(s.dateDebut, s.dateFin, nb)) : NA,
    "Date d'effet": jourISO(s.dateDebut),
    "Date d'échéance": jourISO(s.dateFin),
    "Prime ht": detail.ht,
    "Accessoires": detail.accessoires,
    "Taxes": detail.taxes,
    "Prime ttc": s.montantPrime,
    "Règlement": confirmee ? s.montantPrime * nb : 0,
    "Restant dû (Arriérés)": !confirmee || renouvellementEnCours ? s.montantPrime : 0,
    "Commission due": confirmee ? Math.round(primeNette * ref.tauxAccident * nb) : NA,
    "Commission payée": NA,
    "Année d'émission": dateEmission.getUTCFullYear(),
  };
  return { ligne, tri: s.createdAt.getTime() };
}

function ligneIncendie(
  s: Prisma.SouscriptionIncendieGetPayload<{
    include: {
      partenaire: { select: { nomCommerce: true; nomResponsable: true } };
      agentDistribution: { select: { nom: true } };
      client: { select: { identifiant: true } };
    };
  }>,
  ref: References
): { ligne: LigneSim; tri: number } {
  const complet = s.statut === "complet";
  const nb = Math.max(1, s.nombrePaiements ?? 1);
  const detail = decomposerTarif(s.montantPrime, ref.tarifIncendie.get(s.montantPrime));
  // Comme la page Contrats : l'effet est la date de souscription et, sans
  // échéance enregistrée, la couverture court sur un an.
  const debut = s.createdAt;
  const fin = s.dateFin ?? new Date(new Date(debut).setFullYear(debut.getFullYear() + 1));
  const dateEmission = complet ? (s.renouveleAt ?? s.createdAt) : s.createdAt;
  const primeNette = ref.tarifIncendie.get(s.montantPrime)?.primeHT ?? s.montantPrime;

  const ligne: LigneSim = {
    "Identifiant client": texteOuNA(s.client?.identifiant),
    "Nom Assuré": texteOuNA(s.nom),
    "Prénom Assuré": texteOuNA(s.prenom),
    "Téléphone Assuré": texteOuNA(s.telephone),
    "Partenaire": texteOuNA(s.partenaire.nomResponsable || s.partenaire.nomCommerce),
    "Agent souscripteur": texteOuNA(s.agentDistribution?.nom),
    "Catégorie": ASSURANCE_LIBELLE.ASSURANCES_DOMMAGES,
    "Produit": "Incendie Habitation en Inclusion",
    "N° police": numeroPoliceIncendieSynthetique(s.id, debut),
    "SMP": s.capitalGaranti > 0 ? s.capitalGaranti : NA,
    "Statut": s.statut === "expire" ? "Expiré" : complet ? statutEnCours(fin, ref.maintenant) : "En cours de souscription",
    "Type d'émission": complet && nb > 1 ? "Renouvellement" : "Nouvelle affaire",
    "Date d'émission": jourISO(dateEmission),
    "Période de couverture": complet ? periodeDeCouverture(joursEntre(debut, fin, nb)) : NA,
    "Date d'effet": jourISO(debut),
    "Date d'échéance": jourISO(fin),
    "Prime ht": detail.ht,
    "Accessoires": detail.accessoires,
    "Taxes": detail.taxes,
    "Prime ttc": s.montantPrime,
    // Réglé en boutique à l'achat (réf. facture) : encaissé dès que le dossier est complet.
    "Règlement": complet ? s.montantPrime * nb : NA,
    "Restant dû (Arriérés)": complet ? 0 : NA,
    "Commission due": complet ? Math.round(primeNette * ref.tauxIncendie * nb) : NA,
    "Commission payée": NA,
    "Année d'émission": dateEmission.getUTCFullYear(),
  };
  return { ligne, tri: s.createdAt.getTime() };
}

// ── Assemblage ─────────────────────────────────────────────────────────

const CODES_INCENDIE = ["incendie", "incendie_historique"];
const CODES_ACCIDENT = ["accident", "accident_historique"];

function correspondRecherche(l: LigneSim, q: string): boolean {
  const ql = q.toLowerCase();
  return (
    `${l["Prénom Assuré"]} ${l["Nom Assuré"]}`.toLowerCase().includes(ql) ||
    String(l["N° police"]).toLowerCase().includes(ql) ||
    String(l["Téléphone Assuré"]).toLowerCase().includes(ql) ||
    String(l["Partenaire"]).toLowerCase().includes(ql)
  );
}

export async function construireExportSim(
  f: FiltresExportSim
): Promise<{ colonnes: readonly Colonne[]; colonnesDate: readonly Colonne[]; lignes: LigneSim[] }> {
  const modeles = new Set<ModeleExport>(f.modeles.length ? f.modeles : MODELES_EXPORT);
  // Une Assurance précise écarte les modèles historiques d'une autre branche
  // (Incendie = Dommages, Accident historique = Accidents).
  if (f.sousBranche) {
    if (f.sousBranche !== "ASSURANCES_DOMMAGES") modeles.delete("incendie");
    if (f.sousBranche !== "ASSURANCES_ACCIDENTS") modeles.delete("accident");
  }
  // Un code produit ne désigne qu'un seul modèle : on retire les deux autres.
  if (f.produit) {
    const incendie = CODES_INCENDIE.includes(f.produit);
    const accident = CODES_ACCIDENT.includes(f.produit);
    if (!incendie) modeles.delete("incendie");
    if (!accident) modeles.delete("accident");
    if (incendie || accident) modeles.delete("generique");
  }

  const produitsGeneriques = modeles.has("generique")
    ? await prisma.produit.findMany({
        where: {
          sousBranche: f.sousBranche ?? { in: [...SOUS_BRANCHES_ASSURANCES] },
          ...(f.produit ? { code: f.produit } : {}),
        },
        select: { id: true },
      })
    : [];
  const ref = await chargerReferences();
  const plageDate = f.from || f.to ? { gte: f.from, lte: f.to } : undefined;
  const resultats: { ligne: LigneSim; tri: number }[] = [];

  // Modèle générique, par lots : les lignes complètes (signature comprise) sont
  // lourdes, on n'en garde jamais plus d'un lot en mémoire.
  if (modeles.has("generique") && produitsGeneriques.length) {
    const where: Prisma.SouscriptionWhereInput = {
      produitId: { in: produitsGeneriques.map((p) => p.id) },
      partenaireId: f.partenaireId,
      waveStatut: f.statut === "confirme" ? "confirme" : f.statut === "attente" ? { in: ["en_attente", "echoue"] } : undefined,
      dateDebut: plageDate,
    };
    let curseur: string | undefined;
    for (;;) {
      const lot = await prisma.souscription.findMany({
        where,
        include: {
          produit: { select: { code: true, libelle: true, sousBranche: true, tauxCommission: true } },
          partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
          agentDistribution: { select: { nom: true } },
          client: { select: { identifiant: true } },
          paiements: { select: { statut: true, montant: true, datePaiement: true, dateEcheance: true, periodeDebut: true, periodeFin: true } },
        },
        orderBy: { id: "asc" },
        take: TAILLE_LOT,
        ...(curseur ? { skip: 1, cursor: { id: curseur } } : {}),
      });
      if (lot.length === 0) break;
      for (const s of lot) resultats.push(await ligneGenerique(s, ref));
      curseur = lot[lot.length - 1].id;
      if (lot.length < TAILLE_LOT) break;
    }
  }

  const inclusHistoriques = {
    partenaire: { select: { nomCommerce: true, nomResponsable: true } },
    agentDistribution: { select: { nom: true } },
    client: { select: { identifiant: true } },
  } as const;

  if (modeles.has("incendie") && f.statut !== "attente") {
    const rows = await prisma.souscriptionIncendie.findMany({
      where: {
        partenaireId: f.partenaireId,
        statut: f.statutIncendie ?? (f.statut === "confirme" ? "complet" : undefined),
        createdAt: plageDate,
      },
      include: inclusHistoriques,
    });
    for (const s of rows) resultats.push(ligneIncendie(s, ref));
  }

  if (modeles.has("accident")) {
    const rows = await prisma.souscriptionAccident.findMany({
      where: {
        partenaireId: f.partenaireId,
        waveStatut: f.statut === "confirme" ? "confirme" : f.statut === "attente" ? { in: ["en_attente", "echoue"] } : undefined,
        dateDebut: plageDate,
        ...(f.statut === "confirme" ? { numeroPolice: { not: null } } : {}),
      },
      include: inclusHistoriques,
    });
    for (const s of rows) resultats.push(ligneAccident(s, ref));
  }

  let lignes = resultats.sort((a, b) => b.tri - a.tri).map((r) => r.ligne);
  if (f.q?.trim()) lignes = lignes.filter((l) => correspondRecherche(l, f.q!.trim()));
  return { colonnes: COLONNES_SIM, colonnesDate: COLONNES_DATE, lignes };
}

/** Lit les paramètres de requête de GET /export-sim — valeurs inconnues ignorées, jamais d'erreur. */
export function lireFiltresExportSim(query: Record<string, unknown>): FiltresExportSim {
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const modeles = (texte(query.modeles)?.split(",") ?? []).filter((m): m is ModeleExport => (MODELES_EXPORT as readonly string[]).includes(m));
  const sousBranche = texte(query.sousBranche);
  const statut = texte(query.statut);
  const statutIncendie = texte(query.statutIncendie);
  const date = (v: string | undefined, fin: boolean) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    const d = new Date(`${v}T${fin ? "23:59:59.999" : "00:00:00"}`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  return {
    modeles,
    sousBranche: (SOUS_BRANCHES_ASSURANCES as readonly string[]).includes(sousBranche ?? "") ? (sousBranche as SousBrancheAssurance) : undefined,
    produit: texte(query.produit),
    partenaireId: texte(query.partenaireId),
    statut: statut === "attente" || statut === "tous" ? statut : "confirme",
    statutIncendie: statutIncendie === "en_cours" || statutIncendie === "complet" || statutIncendie === "expire" ? statutIncendie : undefined,
    q: texte(query.q),
    from: date(texte(query.from), false),
    to: date(texte(query.to), true),
  };
}
