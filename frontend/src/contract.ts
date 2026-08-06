// Génération des contrats (Conditions Particulières + Conditions Générales).
// Le rendu HTML → PDF se fait côté serveur (POST /contrats/pdf, voir
// backend/src/services/contractHtml.ts + services/pdf.ts) afin d'obtenir un
// vrai PDF texte (sélectionnable/copiable), pas une image du contrat.
// Ce module ne fait plus que préparer les données et déclencher le
// téléchargement du fichier renvoyé par l'API.

import { API_BASE } from "./api";
import type { SouscriptionImf } from "./types";

export interface LigneGarantie {
  garantie: string;
  capital?: number;
  prime: number;
}

export interface ContratIncendie {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  refFacture?: string | null;
  commune?: string | null;
  quartier?: string | null;
  numeroMaison?: string | null;
  montant: number;
  capitalGaranti: number;
  signature?: string | null;
}

export interface ContratAccident {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  dateNaissance?: string | null;
  montant: number;
  capitalGaranti: number;
  signature?: string | null;
}

export interface ContratRelaxVoyage {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  dateNaissance?: string | null;
  compagnie?: string | null;
  lieuDepart?: string | null;
  lieuArrivee?: string | null;
  numeroTicket?: string | null;
  dateDepart?: string | null;
  numeroPersonneContact?: string | null;
  montant: number;
  capitalGaranti: number;
  fraisSante?: number | null;
  bagages?: string | null;
  signature?: string | null;
}

export interface ContratRelaxAccidentsGenerale {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  telephone: string;
  raisonSociale?: string | null;
  profession?: string | null;
  classe: number;
  typeCouverture: "vie_privee" | "vie_professionnelle" | "vie_privee_professionnelle";
  effectif: number;
  lignes: LigneGarantie[];
  primeNetteHT1: number;
  reductionPct: number;
  primeNetteHT2: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  signature?: string | null;
}

export interface ContratSecurpro {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  classeLabel: string;
  statutOccupation: "proprietaire" | "locataire";
  valeurBatimentOuLoyer: number;
  contenu: number;
  dansMarche: boolean;
  lignes: LigneGarantie[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  signature?: string | null;
}

export interface ContratSecurstock {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  classeLabel: string;
  localisationLabel: string;
  montantStock: number;
  capitalRetenu: number;
  lignes: LigneGarantie[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  signature?: string | null;
}

export interface ContratSecurecolte {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  montantPack: number;
  valeurPackage?: number | null;
  superficieHa?: number | null;
  capitaux?: { label: string; montant: number }[];
  signature?: string | null;
}

export interface SanteCoupsdurs {
  taille?: number;
  poids?: number;
  fumeur?: boolean;
  cigarettesParJour?: number;
  sportif?: boolean;
  sportifNiveau?: "amateur" | "professionnel";
  infirmite?: boolean;
  infirmiteTaux?: string;
  infirmiteNature?: string;
  maladieRecente?: boolean;
  maladieRecentePrecisions?: string;
  touxFievre?: boolean;
  diarrheeFrequente?: boolean;
  transfusion?: boolean;
  enceinte?: boolean;
  affections?: string[];
  affectionsPrecisions?: string;
}

export interface BeneficiaireCoupsdurs {
  nom: string;
  contact: string;
  lien: string;
  pourcentage: number;
}

export interface LigneCoupsdurs {
  cle: string;
  garantieLabel: string;
  capital: number;
  prime: number;
}

export interface ContratCoupsdurs {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  // Une police COUPS DURS peut combiner plusieurs garanties (Maladie
  // toujours incluse, Décès et/ou Incapacité en options) — chaque garantie
  // retenue a sa propre ligne (capital + prime). Les polices émises avant la
  // fusion des produits n'ont qu'une seule ligne.
  lignes: LigneCoupsdurs[];
  primeTTC: number;
  sante?: SanteCoupsdurs | null;
  beneficiaires?: BeneficiaireCoupsdurs[] | null;
  signature?: string | null;
}

const SECURPRO_CLASSE_LABELS: Record<number, string> = {
  1: "Classe 1 — Bureau",
  2: "Classe 2 — Supérette / boutique de quartier, épicerie, salon de coiffure-beauté / couture, commerce de produits alimentaires",
  3: "Classe 3 — Pressing, pharmacie / dépôt, commerce d'électronique, petite fabrique alimentaire, buvette / restaurant, artisan métal, pâtisserie / boulangerie",
  4: "Classe 4 — Tissus / habillement, meubles, mèches & accessoires de coiffure, quincaillerie, jouets / plastique, librairie / papeterie, tapisserie / bois, cordonnier, réparation d'électroménager",
};

/** true si un contrat PDF est disponible pour ce produit IMF. */
export function contratImfDisponible(produitCode: string): boolean {
  return [
    "securpro", "securstock", "securecolte", "coupsdurs", "coupsdurs_classique", "coupsdurs_incapacite",
  ].includes(produitCode);
}

/** Génère et télécharge le contrat PDF adapté au produit d'une souscription IMF. */
export function genererContratImf(s: SouscriptionImf): void {
  if (s.produitCode === "securpro") genererContratSecurpro(souscriptionImfToContratSecurpro(s));
  else if (s.produitCode === "securstock") genererContratSecurstock(souscriptionImfToContratSecurstock(s));
  else if (s.produitCode === "securecolte") genererContratSecurecolte(souscriptionImfToContratSecurecolte(s));
  else if (s.produitCode === "coupsdurs" || s.produitCode === "coupsdurs_classique" || s.produitCode === "coupsdurs_incapacite")
    genererContratCoupsdurs(souscriptionImfToContratCoupsdurs(s));
}

const SECURSTOCK_CLASSE_LABELS: Record<number, string> = {
  1: "Classe 1 — Produits très peu inflammables (métaux, verre, céramique, électroménager, plastiques rigides)",
  2: "Classe 2 — Produits à combustion lente (bois, papier, cartons, vêtements, chaussures, alimentaire sec)",
  3: "Classe 3 — Produits inflammables usuels (produits de beauté, ménagers, plastiques souples, électronique à batterie)",
  4: "Classe 4 — Produits fortement inflammables (parfums en gros, peintures, solvants, tissus denses, mousse)",
};

const SECURSTOCK_LOCALISATION_LABELS: Record<string, string> = {
  hors_marche: "Hors d'un marché",
  abords_marche: "Abords d'un marché",
  marche_zone_industrielle: "Dans un marché / zone industrielle",
};

const COUPSDURS_VARIANTE_LABELS: Record<string, string> = {
  maladie: "Maladie Coups Durs",
  deces: "Décès suite à Coups Durs",
  plafond_500000: "Incapacité temporaire de l'emprunteur — plafond 500 000",
  plafond_1000000: "Incapacité temporaire de l'emprunteur — plafond 1 000 000",
};

// Les libellés de classe de risque (Simulateur) détaillent des exemples entre
// parenthèses, utiles à la saisie mais superflus sur le contrat imprimé.
const sansParentheses = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();

/** Reconstitue les champs du contrat COUPS DURS à partir d'une souscription IMF (produit catalogue). */
export function souscriptionImfToContratCoupsdurs(s: SouscriptionImf): ContratCoupsdurs {
  const entrees = s.entrees as {
    libelleVariante?: string;
    deces?: boolean;
    incapacite?: string | null;
    sante?: SanteCoupsdurs;
    beneficiaires?: BeneficiaireCoupsdurs[];
  };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);

  let lignes: LigneCoupsdurs[];
  if (s.produitCode === "coupsdurs") {
    // Produit fusionné : une ou plusieurs garanties combinées (Maladie
    // toujours incluse), reconstituées dans le même ordre que le serveur.
    const resultat = s.resultat as { lignes?: { capital: number; prime: number }[] };
    const cles = ["maladie", ...(entrees.deces ? ["deces"] : []), ...(entrees.incapacite ? [entrees.incapacite] : [])];
    lignes = cles.map((cle, i) => ({
      cle,
      garantieLabel: COUPSDURS_VARIANTE_LABELS[cle] ?? cle,
      capital: resultat.lignes?.[i]?.capital ?? 0,
      prime: resultat.lignes?.[i]?.prime ?? 0,
    }));
  } else {
    // Polices émises avant la fusion des produits : une seule garantie.
    const resultat = s.resultat as { capitalGaranti?: number; prime?: number };
    const variante = entrees.libelleVariante ?? "—";
    lignes = [{
      cle: variante,
      garantieLabel: COUPSDURS_VARIANTE_LABELS[variante] ?? variante,
      capital: resultat.capitalGaranti ?? 0,
      prime: resultat.prime ?? s.primeTTC,
    }];
  }

  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    lignes,
    primeTTC: s.primeTTC,
    sante: entrees.sante ?? null,
    beneficiaires: entrees.beneficiaires ?? null,
    signature: s.signature ?? null,
  };
}

/** Reconstitue les champs du contrat SECURECOLTE à partir d'une souscription IMF (produit catalogue). */
export function souscriptionImfToContratSecurecolte(s: SouscriptionImf): ContratSecurecolte {
  const entrees = s.entrees as { valeurPackage?: number; superficieHa?: number };
  const resultat = s.resultat as {
    capitalFaible?: number;
    capitalMoyenne?: number;
    capitalForte?: number;
    capitalDeces?: number;
  };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);
  const capitaux =
    resultat.capitalFaible !== undefined
      ? [
          { label: "Faible sécheresse (20%)", montant: resultat.capitalFaible },
          { label: "Moyenne sécheresse (50%)", montant: resultat.capitalMoyenne ?? 0 },
          { label: "Forte sécheresse (100%)", montant: resultat.capitalForte ?? 0 },
          { label: "Décès de l'agriculteur (100%)", montant: resultat.capitalDeces ?? 0 },
        ]
      : undefined;
  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    montantPack: s.primeTTC,
    valeurPackage: entrees.valeurPackage ?? null,
    superficieHa: entrees.superficieHa ?? null,
    capitaux,
    signature: s.signature ?? null,
  };
}

/** Reconstitue les champs du contrat SECURSTOCK à partir d'une souscription IMF. */
export function souscriptionImfToContratSecurstock(s: SouscriptionImf): ContratSecurstock {
  const entrees = s.entrees as { classe?: number; capitalDeclare?: number; localisation?: string };
  const resultat = s.resultat as { capitauxTotaux?: number; lignes?: LigneGarantie[]; primeNetteHT?: number; accessoires?: number; taxes?: number };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);
  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    classeLabel: entrees.classe ? sansParentheses(SECURSTOCK_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
    localisationLabel: entrees.localisation ? (SECURSTOCK_LOCALISATION_LABELS[entrees.localisation] ?? entrees.localisation) : "—",
    montantStock: entrees.capitalDeclare ?? 0,
    capitalRetenu: resultat.capitauxTotaux ?? 0,
    lignes: resultat.lignes ?? [],
    primeNetteHT: resultat.primeNetteHT ?? 0,
    accessoires: resultat.accessoires ?? 0,
    taxes: resultat.taxes ?? 0,
    primeTTC: s.primeTTC,
    signature: s.signature ?? null,
  };
}

/** Reconstitue les champs du contrat SECURPRO à partir d'une souscription IMF (entrees/resultat en JSON libre). */
export function souscriptionImfToContratSecurpro(s: SouscriptionImf): ContratSecurpro {
  const entrees = s.entrees as {
    classe?: number;
    statutOccupation?: "proprietaire" | "locataire";
    valeurBatiment?: number;
    loyerMensuel?: number;
    contenu?: number;
    dansMarche?: boolean;
  };
  const resultat = s.resultat as {
    lignes?: LigneGarantie[];
    primeNetteHT?: number;
    accessoires?: number;
    taxes?: number;
  };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);
  const statutOccupation = entrees.statutOccupation ?? "proprietaire";
  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    classeLabel: entrees.classe ? sansParentheses(SECURPRO_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
    statutOccupation,
    valeurBatimentOuLoyer: statutOccupation === "locataire" ? (entrees.loyerMensuel ?? 0) : (entrees.valeurBatiment ?? 0),
    contenu: entrees.contenu ?? 0,
    dansMarche: !!entrees.dansMarche,
    lignes: resultat.lignes ?? [],
    primeNetteHT: resultat.primeNetteHT ?? 0,
    accessoires: resultat.accessoires ?? 0,
    taxes: resultat.taxes ?? 0,
    primeTTC: s.primeTTC,
    signature: s.signature ?? null,
  };
}

type ContratType =
  | "incendie"
  | "accident"
  | "relaxaccidents_fraismedicaux"
  | "relaxvoyage"
  | "relaxaccidents_generale"
  | "securpro"
  | "securstock"
  | "securecolte"
  | "coupsdurs";

const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

/** Demande le PDF au serveur (texte réel) et déclenche son téléchargement — pas d'ouverture de fenêtre, pas d'impression. */
async function telechargerContratPdf(type: ContratType, numeroPolice: string, data: unknown) {
  const res = await fetch(`${API_BASE}/contrats/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, data }),
  });
  if (!res.ok) {
    let message = "Erreur lors de la génération du contrat.";
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* réponse non-JSON (ex: erreur serveur brute) */
    }
    alert(message);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contrat-${sanitizeFilename(numeroPolice)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function genererContratIncendie(c: ContratIncendie) {
  await telechargerContratPdf("incendie", c.numeroPolice, c);
}

export async function genererContratAccident(c: ContratAccident) {
  await telechargerContratPdf("accident", c.numeroPolice, c);
}

// RelaxAccidents Frais Médicaux reprend exactement le même contrat qu'Accident
// (dont il remplace les souscriptions) — mêmes champs (voir ContratAccident).
export async function genererContratRelaxAccidentsFraisMedicaux(c: ContratAccident) {
  await telechargerContratPdf("relaxaccidents_fraismedicaux", c.numeroPolice, c);
}

export async function genererContratRelaxVoyage(c: ContratRelaxVoyage) {
  await telechargerContratPdf("relaxvoyage", c.numeroPolice, c);
}

export async function genererContratRelaxAccidentsGenerale(c: ContratRelaxAccidentsGenerale) {
  await telechargerContratPdf("relaxaccidents_generale", c.numeroPolice, c);
}

export async function genererContratSecurpro(c: ContratSecurpro) {
  await telechargerContratPdf("securpro", c.numeroPolice, c);
}

export async function genererContratSecurecolte(c: ContratSecurecolte) {
  await telechargerContratPdf("securecolte", c.numeroPolice, c);
}

export async function genererContratSecurstock(c: ContratSecurstock) {
  await telechargerContratPdf("securstock", c.numeroPolice, c);
}

export async function genererContratCoupsdurs(c: ContratCoupsdurs) {
  await telechargerContratPdf("coupsdurs", c.numeroPolice, c);
}
