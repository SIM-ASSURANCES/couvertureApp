import { prisma } from "../db.js";
import { htmlToPng } from "./pdf.js";
import { renderCarteHtml, CARTE_WIDTH, CARTE_HEIGHT, type CarteData } from "./carteHtml.js";
import { GARANTIES_RELAX_MOTO_AUTO } from "./contractHtml.js";
import { garantiesRelaxAccidentsGenerale, type Classe } from "./relaxAccidentsGenerale.js";

// =====================================================================
// Rendu de la carte virtuelle de prise en charge à partir d'une
// souscription du modèle générique. Extrait de routes/cartes.ts pour être
// réutilisable hors contexte HTTP (API partenaire — GET
// /v1/souscriptions/:id/carte.png).
// =====================================================================

export const SEXE_LABELS: Record<string, string> = { masculin: "Masculin", feminin: "Féminin" };

function classeValide(v: unknown): Classe | null {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : null;
}

/**
 * Libellé + montant de la garantie affichée dans la bannière de la carte
 * (refonte Novelia) — adapté par produit. `donneesSpecifiques` (le champ JSON
 * de la souscription) n'est nécessaire que pour RelaxAccidents générale, dont
 * le montant FMP dépend de la classe de risque choisie.
 *
 * Refonte 2026-09-15 : ce montant (FMP — Frais Médicaux/Pharmaceutiques) est
 * un plafond DISTINCT du capital décès/IPT du contrat (`capitalGaranti`),
 * repris des garanties déjà définies par produit ailleurs dans l'app
 * (GARANTIES_RELAX_MOTO_AUTO pour RelaxMoto/Auto, garantiesRelaxAccidentsGenerale
 * pour RelaxAccidents générale) plutôt que du capital du contrat — RelaxMoto
 * et RelaxAuto affichaient jusqu'ici à tort leur capital décès (500 000/1 000 000)
 * sous l'étiquette générique "CAPITAL GARANTI". RelaxAccidents Frais Médicaux
 * (et sa variante Livreurs/Taxis) n'ont pas besoin de ce traitement : leur
 * `capitalGaranti` stocké EST déjà le plafond FMP (500 frs → 100 000, 1000 frs
 * → 250 000).
 */
export function garantieAffichee(
  produitCode: string,
  capitalGaranti: number,
  donneesSpecifiques?: unknown
): { label: string; montant: number } {
  if (produitCode === "relaxmoto") return { label: "FMP", montant: GARANTIES_RELAX_MOTO_AUTO.relaxmoto.fraisMedicaux };
  if (produitCode === "relaxauto") return { label: "FMP", montant: GARANTIES_RELAX_MOTO_AUTO.relaxauto.fraisMedicaux };
  if (produitCode === "relaxaccidents_fraismedicaux" || produitCode === "relaxaccidents_fraismedicaux_livreurs")
    return { label: "FMP", montant: capitalGaranti };
  if (produitCode === "relaxaccidents") {
    const classe = classeValide((donneesSpecifiques as { classe?: unknown } | null)?.classe);
    const montant = classe ? garantiesRelaxAccidentsGenerale(classe).fraisMedicaux : capitalGaranti;
    return { label: "FMP", montant };
  }
  if (produitCode === "relaxvoyage") return { label: "DÉCÈS/IPT", montant: capitalGaranti };
  return { label: "CAPITAL GARANTI", montant: capitalGaranti };
}

/**
 * Date de naissance à afficher sur la carte. Certains contrats n'en portent
 * pas — on la reprend alors d'un AUTRE contrat du même client (même
 * téléphone), tous modèles confondus, plutôt que de laisser le champ vide.
 * Les numéros sont stockés tantôt avec l'indicatif, tantôt sans : on cherche
 * sur les deux formes.
 */
export async function resoudreDateNaissance(propre: Date | null, telephone: string): Promise<Date | null> {
  if (propre) return propre;

  const local = telephone.startsWith("+225") ? telephone.slice(4) : telephone;
  const telephones = [...new Set([telephone, local, `+225${local}`])];

  const [gen, acc, inc] = await Promise.all([
    prisma.souscription.findFirst({
      where: { telephone: { in: telephones }, dateNaissance: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { dateNaissance: true },
    }),
    prisma.souscriptionAccident.findFirst({
      where: { telephone: { in: telephones }, dateNaissance: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { dateNaissance: true },
    }),
    prisma.souscriptionIncendie.findFirst({
      where: { telephone: { in: telephones }, dateNaissance: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { dateNaissance: true },
    }),
  ]);
  return gen?.dateNaissance ?? acc?.dateNaissance ?? inc?.dateNaissance ?? null;
}

/** Erreur métier « carte pas encore disponible » — portée par un status/code HTTP. */
export class CarteIndisponibleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CarteIndisponibleError";
  }
}

/**
 * Génère la carte PNG d'une souscription générique confirmée. Lève
 * `CarteIndisponibleError` si la souscription n'existe pas / n'est pas
 * confirmée / n'a pas de selfie.
 */
export async function renderCartePngGenerique(
  souscriptionId: string
): Promise<{ png: Buffer; matricule: string }> {
  const s = await prisma.souscription.findUnique({
    where: { id: souscriptionId },
    include: { documents: true, produit: { select: { code: true } } },
  });
  if (!s || s.waveStatut !== "confirme") {
    throw new CarteIndisponibleError(404, "carte_indisponible", "Souscription non confirmée ou introuvable.");
  }

  const selfie = s.documents
    .filter((d) => d.type === "Selfie")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!selfie) {
    throw new CarteIndisponibleError(400, "selfie_absent", "Photo selfie introuvable pour cette souscription.");
  }

  const { label, montant } = garantieAffichee(s.produit.code, s.capitalGaranti, s.donneesSpecifiques);
  const carte: CarteData = {
    matricule: s.numeroPolice ?? "",
    nom: s.nom ?? "",
    prenom: s.prenom ?? "",
    dateNaissance: (await resoudreDateNaissance(s.dateNaissance, s.telephone))?.toISOString() ?? null,
    dateDebut: s.dateDebut ? s.dateDebut.toISOString() : null,
    sexeLabel: s.sexe ? SEXE_LABELS[s.sexe] ?? null : null,
    garantieLabel: label,
    garantieMontant: montant,
    photoDataUrl: selfie.url,
  };

  const html = renderCarteHtml(carte);
  const png = await htmlToPng(html, CARTE_WIDTH, CARTE_HEIGHT);
  return { png, matricule: carte.matricule };
}
