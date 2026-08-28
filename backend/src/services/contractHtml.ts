// Génération HTML des contrats (Conditions Particulières + Conditions Générales),
// rendue ensuite en PDF par Chromium headless (voir services/pdf.ts) — texte
// réel et sélectionnable dans le PDF final, contrairement à un rendu image.
//
// Port côté serveur de l'ancien frontend/src/contract.ts (qui générait le PDF
// dans le navigateur). La mise en page (CSS, structure) reste identique.

import { prisma } from "../db.js";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://localhost:5173";

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
  ville?: string | null;
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
  // RelaxAccidents Frais Médicaux uniquement — option Décès facultative,
  // garantie pour une durée propre (2 mois), distincte de la durée du
  // contrat principal (3 mois).
  optionDeces?: { capital: number; prime: number; dureeMois: number } | null;
}

/**
 * RelaxMoto / RelaxAuto — mêmes conditions particulières que RelaxAccidents,
 * avec en plus le cycle de facturation : ces deux produits sont des
 * abonnements reconductibles (mensuel ou annuel) et non des polices à durée
 * fixe, d'où la mention explicite de la périodicité de la prime.
 */
export interface ContratRelaxMotoAuto {
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
  produitLibelle: string;
  cycleFacturation?: "mensuel" | "annuel" | null;
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

export interface ContratSecurhome {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  ville?: string | null;
  communeQuartier?: string | null;
  referenceCIE?: string | null;
  nombrePieces?: number | null;
  statutOccupation: "proprietaire" | "locataire";
  valeurBatimentOuLoyer: number;
  contenu: number;
  lignes: LigneGarantie[];
  primeNetteHT: number;
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
  // SecurPro (Assurances Dommages, distribué via QR partenaire plutôt qu'agent
  // IMF) — absents des contrats IMF existants, affichés seulement s'ils sont fournis.
  nomCommercial?: string | null;
  referenceCIE?: string | null;
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
  lignes: LigneCoupsdurs[];
  primeTTC: number;
  sante?: SanteCoupsdurs | null;
  beneficiaires?: BeneficiaireCoupsdurs[] | null;
  signature?: string | null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const fcfa = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
const dfr = (s?: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");
const val = (s?: string | number | null) =>
  s === null || s === undefined || s === "" ? "—" : esc(String(s));
const sansParentheses = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();

function pieceLabel(t?: string | null) {
  if (t === "cni") return "CNI";
  if (t === "passeport") return "Passeport";
  if (t === "permis_conduire") return "Permis de conduire";
  return "";
}

const SECURPRO_CLASSE_LABELS: Record<number, string> = {
  1: "Classe 1 — Bureau",
  2: "Classe 2 — Supérette / boutique de quartier, épicerie, salon de coiffure-beauté / couture, commerce de produits alimentaires",
  3: "Classe 3 — Pressing, pharmacie / dépôt, commerce d'électronique, petite fabrique alimentaire, buvette / restaurant, artisan métal, pâtisserie / boulangerie",
  4: "Classe 4 — Tissus / habillement, meubles, mèches & accessoires de coiffure, quincaillerie, jouets / plastique, librairie / papeterie, tapisserie / bois, cordonnier, réparation d'électroménager",
};

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

const COUPSDURS_PRESTATIONS: Record<string, string> = {
  deces: "Décès : SIM Assurances verse aux bénéficiaires ci-dessus le capital garanti de cette garantie, selon la répartition indiquée.",
  maladie: "Maladie : prise en charge dans la limite du capital garanti via le réseau de soins, ou remboursement des dépenses de soins sur présentation des justificatifs.",
  plafond_500000: "Incapacité temporaire : paiement des échéances du prêt en cours (net d'intérêt) à l'institution financière pendant la période de convalescence indemnisable, dans la limite du plafond choisi et de la durée résiduelle du prêt, après une franchise de 2 mois.",
  plafond_1000000: "Incapacité temporaire : paiement des échéances du prêt en cours (net d'intérêt) à l'institution financière pendant la période de convalescence indemnisable, dans la limite du plafond choisi et de la durée résiduelle du prêt, après une franchise de 2 mois.",
};

const AFFECTIONS_LABELS: Record<string, string> = {
  cancer: "Cancer", diabete: "Diabète", hypertension: "Hypertension", cardiaque: "Maladies cardiaques",
  vih: "VIH", ulcere: "Ulcère", fatigue: "Fatigue", maladie_sang: "Maladie de sang",
  insuffisance_renale: "Insuffisance rénale", asthme: "Asthme",
};

const ouiNon = (b?: boolean) => (b ? "Oui" : "Non");

const CSS = `
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
  body{margin:0;color:#0f1b2d;padding:40px;font-size:13px;line-height:1.5;text-align:justify;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #004b9c;padding-bottom:16px;margin-bottom:20px;}
  .brand{display:flex;align-items:center;gap:16px;}
  .brand img.logo-sim{height:88px;display:block;}
  .brand img.logo-rcmec{height:50px;display:block;}
  .pol{text-align:right;font-size:12px;color:#5b6b80;}
  .pol b{display:block;font-size:17px;color:#0f1b2d;letter-spacing:1px;}
  h1{font-size:18px;margin:0 0 4px;color:#004b9c;}
  h2{font-size:14px;margin:16px 0 6px;color:#004b9c;border-bottom:1px solid #e3e9f1;padding-bottom:3px;}
  .sub{color:#5b6b80;font-size:12px;margin-bottom:14px;}
  table{width:100%;border-collapse:collapse;margin-bottom:10px;page-break-inside:avoid;}
  td{padding:5px 9px;border:1px solid #e3e9f1;font-size:12px;vertical-align:top;}
  td.k{background:#f5f8fc;font-weight:600;width:34%;color:#5b6b80;}
  .cg h3{font-size:13px;margin:14px 0 4px;color:#0f1b2d;}
  .cg p{margin:4px 0;font-size:11.5px;color:#25324a;}
  .cg ul{margin:4px 0 8px 18px;padding:0;}
  .cg li{font-size:11.5px;margin:2px 0;}
  .cg .cg-tbl td{font-size:11px;}
  .note{font-size:11px;color:#5b6b80;border-top:1px solid #e3e9f1;padding-top:10px;margin-top:12px;}
  .sign{display:flex;justify-content:space-between;margin-top:32px;font-size:12px;color:#5b6b80;page-break-inside:avoid;}
  .pagebreak{page-break-before:always;}
`;

// Le logo RCMEC-CI n'est affiché que sur les contrats de la branche IMF
// (partenariat propre à cette branche) — jamais sur Incendie/Accident/Relax.
function header(numeroPolice: string, avecLogoRcmec = false) {
  return `<div class="head">
    <div class="brand">
      <img class="logo-sim" src="${APP_PUBLIC_URL}/logo.webp" alt="SIM Assurances" />
      ${avecLogoRcmec ? `<img class="logo-rcmec" src="${APP_PUBLIC_URL}/LOGO_RCMEC_CI.png" alt="RCMEC CI" />` : ""}
    </div>
    <div class="pol">N° de police<b>${val(numeroPolice)}</b></div>
  </div>`;
}

const RECLAMATION = `<div class="note" style="font-weight:bold;font-style:italic;">
  Toute réclamation relative à l'exécution du contrat doit être adressée à « SIM ASSURANCES CÔTE D'IVOIRE »
  (courrier contre décharge, e-mail : info@simassurances.com, ou tout autre moyen faisant foi). La réclamation est gratuite ;
  une réponse est apportée sous cinq (05) jours ouvrés. En cas d'insatisfaction, le client peut saisir gratuitement
  l'OQSF-CI (www.oqsf.ci) ou la Médiation de l'Assurance (www.mediationassuranceci.net).
</div>`;

function signatures(sig?: string | null) {
  // `sig` est censée être une data URL image, mais provient in fine d'une
  // requête publique (voir contrats.ts) — toujours échappée avant interpolation
  // dans l'attribut src, pour ne jamais permettre une sortie d'attribut HTML.
  const gauche = sig
    ? `<img src="${esc(sig)}" style="height:60px;max-width:220px;display:block;margin-bottom:4px;" /><div style="border-top:1px solid #5b6b80;padding-top:4px;">LE SOUSCRIPTEUR</div>`
    : `<div>LE SOUSCRIPTEUR</div>`;
  const droite = `<img src="${APP_PUBLIC_URL}/signature-compagnie.png" alt="" style="height:60px;max-width:220px;display:inline-block;margin-bottom:4px;" /><div style="border-top:1px solid #5b6b80;padding-top:4px;">POUR LA COMPAGNIE</div>`;
  return `<div class="sign"><div>${gauche}</div><div style="text-align:right;">${droite}</div></div>`;
}

/**
 * Conditions Générales à insérer dans un contrat, par clé de famille
 * ("accident", "incendie"...). Priorité au texte saisi par l'administrateur
 * (table ConditionsGenerales) ; à défaut, on sert le fichier statique
 * historique `frontend/public/cg-<cle>.html`, de sorte que les contrats
 * restent inchangés tant que rien n'a été saisi.
 */
async function loadCG(cle: string, fichierRepli = `cg-${cle}.html`): Promise<string> {
  try {
    const saisie = await prisma.conditionsGenerales.findUnique({ where: { cle } });
    if (saisie?.contenuHtml.trim()) return saisie.contenuHtml;
  } catch {
    /* base indisponible : on retombe sur le fichier statique */
  }
  try {
    const r = await fetch(`${APP_PUBLIC_URL}/${fichierRepli}`);
    if (r.ok) return await r.text();
  } catch {
    /* ignore */
  }
  return "<p>Conditions Générales momentanément indisponibles.</p>";
}

/**
 * Clés éditables depuis l'admin et produits couverts par chacune. Les clés
 * dont le repli n'est pas leur propre fichier retombent sur les CG de la
 * famille Accidents, faute de fichier statique dédié.
 */
export const CLES_CONDITIONS_GENERALES = [
  { cle: "accident", libelle: "Accidents (Accidents historique, RelaxAccidents Frais Médicaux)" },
  { cle: "incendie", libelle: "Dommages (Incendie, SecurHome+, SecurPro, SecurStock)" },
  { cle: "relaxmoto", libelle: "RelaxMoto / RelaxAuto" },
  { cle: "relaxvoyage", libelle: "RelaxVoyage" },
  { cle: "relaxaccidents", libelle: "RelaxAccidents générale" },
] as const;

function document_(title: string, inner: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${CSS}</style></head><body>${inner}</body></html>`;
}

export async function renderContratIncendie(c: ContratIncendie): Promise<string> {
  const adresse = [c.numeroMaison, c.quartier, c.commune, c.ville].filter(Boolean).join(", ");
  const cp = `
  ${header(c.numeroPolice)}
  <h1>Bulletin de souscription — SECURDOMMAGE</h1>
  <div class="sub">Assurance Incendie / Explosion Habitation · Distribué via ${val(c.partenaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.partenaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td></tr>
    <tr><td class="k">Prime TTC</td><td>${fcfa(c.montant)}</td><td class="k">Capital garanti</td><td>${fcfa(c.capitalGaranti)}</td></tr>
  </table>

  <table>
    <tr><td class="k">Nom</td><td>${val(c.nom)}</td><td class="k">Prénom</td><td>${val(c.prenom)}</td></tr>
    <tr><td class="k">Référence CIE</td><td>${val(c.refFacture)}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Ville</td><td>${val(c.ville)}</td><td class="k">Commune</td><td>${val(c.commune)}</td></tr>
    <tr><td class="k">N° de maison</td><td>${val(c.numeroMaison)}</td><td class="k">Adresse</td><td>${val(adresse)}</td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales SECURDOMMAGE (MFB/DGTCP/DA/N° 01498 du 19 JUIN 2025) et le présent bulletin de souscription.
    <br/><br/>
    <b>Risques garantis :</b> Incendie / Explosion de l'habitation désignée. <b>Ne sont pas couvertes</b> les constructions
    en bois et le changement de domicile en cours de contrat. <b>Indemnisation :</b> <b>montant forfaitaire de ${fcfa(c.capitalGaranti)}</b>
    (SIM ASSURANCES pourra recourir à un expert pour la validation du montant à payer).
    Le souscripteur reconnaît avoir pris connaissance des Conditions Générales SECURDOMMAGE.
  </div>
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  const cg = await loadCG("incendie");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — SECURDOMMAGE</h2><div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function renderContratAccident(c: ContratAccident): Promise<string> {
  const cp = `
  ${header(c.numeroPolice)}
  <h1>Bulletin de souscription — RELAXACCIDENTS</h1>
  <div class="sub">Assurance Accidents · Distribué via ${val(c.partenaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.partenaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td></tr>
    <tr><td class="k">Prime TTC</td><td>${fcfa(c.montant)}</td><td class="k">Bénéficiaire</td><td>L'Assuré</td></tr>
  </table>

  <table>
    <tr><td class="k">Souscripteur / Assuré</td><td>${val(c.prenom)} ${val(c.nom)}</td><td class="k">Contact</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Date de naissance</td><td>${dfr(c.dateNaissance)}</td><td class="k">Frais médicaux &amp; pharmaceutiques</td><td>${fcfa(c.capitalGaranti)}</td></tr>
  </table>

  ${
    c.optionDeces
      ? `<h2>Option Décès</h2>
  <table>
    <tr><td class="k">Capital garanti</td><td>${fcfa(c.optionDeces.capital)}</td><td class="k">Prime</td><td>${fcfa(c.optionDeces.prime)}</td></tr>
    <tr><td class="k">Durée de la garantie</td><td colspan="3">${c.optionDeces.dureeMois} mois à compter de la date d'effet ci-dessus</td></tr>
  </table>`
      : ""
  }

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales police RELAXACCIDENTS (MFB/DGTCP/DA/N° 01507 du 19 JUIN 2025) et les présentes Conditions Particulières.
    <br/><br/>
    <b>En cas de sinistre :</b> le déclarer à SIM ASSURANCES (e-mail info@simassurances.com, 08 BP M4141 ABIDJAN 08,
    ou tél/WhatsApp 07 99 44 57 57), muni de la CNI, des ordonnances et factures médicales et du numéro Wave.
    Le paiement intervient sous 10 jours maximum après réception des pièces.
    Le souscripteur reconnaît avoir pris connaissance des Conditions Générales RELAXACCIDENTS.
  </div>
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  const cg = await loadCG("accident");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — RELAXACCIDENTS</h2><div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

// Garanties RelaxMoto/RelaxAuto — fixes par produit, indépendantes du cycle
// annuel/mensuel souscrit. À garder synchronisé avec la constante miroir
// GARANTIES_RELAX_MOTO_AUTO côté frontend (pages/public/Souscription.tsx),
// qui affiche les mêmes montants pendant la souscription.
const GARANTIES_RELAX_MOTO_AUTO = {
  relaxmoto: {
    indemniteJournaliere: 3_500,
    dureeMaxJours: 30,
    carenceJours: 3,
    fraisMedicaux: 250_000,
    invaliditePermanenteTotale: 500_000,
    deces: 500_000,
  },
  relaxauto: {
    indemniteJournaliere: 5_000,
    dureeMaxJours: 30,
    carenceJours: 3,
    fraisMedicaux: 300_000,
    invaliditePermanenteTotale: 1_000_000,
    deces: 1_000_000,
  },
} as const;

export async function renderContratRelaxMotoAuto(c: ContratRelaxMotoAuto): Promise<string> {
  const periodicite = c.cycleFacturation === "mensuel" ? "mensuelle" : "annuelle";
  const reconduction =
    c.cycleFacturation === "mensuel"
      ? "Le contrat est souscrit pour un mois et se renouvelle au même tarif depuis l'espace client."
      : "Le contrat est souscrit pour un an et se renouvelle au même tarif depuis l'espace client.";
  const g = GARANTIES_RELAX_MOTO_AUTO[c.produitLibelle.toLowerCase() === "relaxauto" ? "relaxauto" : "relaxmoto"];

  const cp = `
  ${header(c.numeroPolice)}
  <h1>Bulletin de souscription — ${esc(c.produitLibelle.toUpperCase())}</h1>
  <div class="sub">Assurance Individuelle Accident · Distribué via ${val(c.partenaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.partenaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td></tr>
    <tr><td class="k">Prime TTC ${periodicite}</td><td>${fcfa(c.montant)}</td><td class="k">Bénéficiaire</td><td>L'Assuré</td></tr>
  </table>

  <table>
    <tr><td class="k">Souscripteur / Assuré</td><td>${val(c.prenom)} ${val(c.nom)}</td><td class="k">Contact</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Date de naissance</td><td colspan="3">${dfr(c.dateNaissance)}</td></tr>
  </table>

  <!-- Le capital garanti (décès/IPT) n'est plus affiché ici en une ligne
       unique : il est détaillé, avec les autres garanties, dans la section
       ci-dessous. -->
  <h2>Garanties</h2>
  <table>
    <tr><td class="k">Indemnité journalière</td><td>${fcfa(g.indemniteJournaliere)} / jour, ${g.dureeMaxJours} jours max (${g.carenceJours} jours de délai de carence)</td></tr>
    <tr><td class="k">Frais médicaux et pharmaceutiques</td><td>${fcfa(g.fraisMedicaux)}</td></tr>
    <tr><td class="k">Invalidité permanente totale</td><td>${fcfa(g.invaliditePermanenteTotale)}</td></tr>
    <tr><td class="k">Décès</td><td>${fcfa(g.deces)}</td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales police RELAXACCIDENTS (MFB/DGTCP/DA/N° 01507 du 19 JUIN 2025) et les présentes Conditions Particulières.
    ${reconduction}
    <br/><br/>
    <b>En cas de sinistre :</b> le déclarer à SIM ASSURANCES (e-mail info@simassurances.com, 08 BP M4141 ABIDJAN 08,
    ou tél/WhatsApp 07 99 44 57 57), muni de la CNI, des ordonnances et factures médicales et du numéro Wave.
    Le paiement intervient sous 10 jours maximum après réception des pièces.
    Le souscripteur reconnaît avoir pris connaissance des Conditions Générales.
  </div>
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  const cg = await loadCG("relaxmoto", "cg-accident.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — ${esc(c.produitLibelle.toUpperCase())}</h2><div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function renderContratRelaxVoyage(c: ContratRelaxVoyage): Promise<string> {
  const trajet = [c.lieuDepart, c.lieuArrivee].filter(Boolean).join(" → ");
  const cp = `
  ${header(c.numeroPolice)}
  <h1>Bulletin de souscription — RELAXVOYAGE</h1>
  <div class="sub">Assurance Voyage · Distribué via ${val(c.partenaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.partenaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td></tr>
    <tr><td class="k">Prime TTC</td><td>${fcfa(c.montant)}</td><td class="k">Bénéficiaire</td><td>L'Assuré</td></tr>
  </table>

  <table>
    <tr><td class="k">Souscripteur / Assuré</td><td>${val(c.prenom)} ${val(c.nom)}</td><td class="k">Contact</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Date de naissance</td><td>${dfr(c.dateNaissance)}</td><td class="k">Personne à contacter</td><td>${val(c.numeroPersonneContact)}</td></tr>
    <tr><td class="k">Compagnie de transport</td><td>${val(c.compagnie)}</td><td class="k">N° Ticket</td><td>${val(c.numeroTicket)}</td></tr>
    <tr><td class="k">Trajet</td><td>${val(trajet)}</td><td class="k">Date de départ</td><td>${dfr(c.dateDepart)}</td></tr>
  </table>

  <h2>Garanties</h2>
  <table>
    <tr><td class="k">Décès / IPT</td><td>${fcfa(c.capitalGaranti)}</td><td class="k">Frais de Santé</td><td>${c.fraisSante != null ? fcfa(c.fraisSante) : "—"}</td></tr>
    <tr><td class="k">Bagages</td><td colspan="3">${val(c.bagages)}</td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales police RELAXVOYAGE et les présentes Conditions Particulières.
    <br/><br/>
    <b>En cas de sinistre :</b> le déclarer à SIM ASSURANCES (e-mail info@simassurances.com, 08 BP M4141 ABIDJAN 08,
    ou tél/WhatsApp 07 99 44 57 57), muni de la CNI, du ticket de voyage et des pièces justificatives.
    Le souscripteur reconnaît avoir pris connaissance des Conditions Générales RELAXVOYAGE.
  </div>
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  // RelaxVoyage n'a pas de fichier de CG propre : on sert celles de la famille
  // Accidents plutôt que d'imprimer « momentanément indisponibles », ce que
  // faisait le renvoi vers un cg-relaxvoyage.html qui n'a jamais existé.
  const cg = await loadCG("relaxvoyage", "cg-accident.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — RELAXVOYAGE</h2><div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

const TYPE_COUVERTURE_LABELS: Record<ContratRelaxAccidentsGenerale["typeCouverture"], string> = {
  vie_privee: "Vie privée uniquement",
  vie_professionnelle: "Vie professionnelle uniquement",
  vie_privee_professionnelle: "Vie privée & Vie professionnelle",
};

export async function renderContratRelaxAccidentsGenerale(c: ContratRelaxAccidentsGenerale): Promise<string> {
  const cp = `
  ${header(c.numeroPolice)}
  <h1>Bulletin de souscription — RELAXACCIDENTS</h1>
  <div class="sub">Assurance Accidents (police collective) · Distribué via ${val(c.partenaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.partenaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td></tr>
    <tr><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td><td class="k">Bénéficiaire</td><td>Les Assurés</td></tr>
  </table>

  <table>
    <tr><td class="k">Souscripteur / Raison sociale</td><td>${val(c.raisonSociale)}</td><td class="k">Contact</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Type d'activité / Profession</td><td>${val(c.profession)}</td><td class="k">Classe de risque</td><td>Classe ${val(c.classe)}</td></tr>
    <tr><td class="k">Type de couverture</td><td>${val(TYPE_COUVERTURE_LABELS[c.typeCouverture])}</td><td class="k">Effectif assuré</td><td>${val(c.effectif)} personne(s)</td></tr>
  </table>

  <h2>Garanties souscrites (par personne assurée)</h2>
  <table>
    <tr><td class="k">Garantie</td><td class="k">Montant</td><td class="k">Prime</td></tr>
    ${c.lignes.map((l) => `<tr><td>${val(l.garantie)}</td><td>${l.capital ? fcfa(l.capital) : "—"}</td><td>${fcfa(l.prime)}</td></tr>`).join("")}
  </table>

  <table>
    <tr><td class="k">Prime nette HT (avant réduction)</td><td>${fcfa(c.primeNetteHT1)}</td><td class="k">Réduction com. effectif</td><td>${(c.reductionPct * 100).toLocaleString("fr-FR")} %</td></tr>
    <tr><td class="k">Prime nette HT (après réduction)</td><td>${fcfa(c.primeNetteHT2)}</td><td class="k">Accessoires</td><td>${fcfa(c.accessoires)}</td></tr>
    <tr><td class="k">Taxes</td><td>${fcfa(c.taxes)}</td><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales police RELAXACCIDENTS (MFB/DGTCP/DA/N° 01507 du 19 JUIN 2025) et les présentes Conditions Particulières.
    <br/><br/>
    <b>En cas de sinistre :</b> le déclarer à SIM ASSURANCES (e-mail info@simassurances.com, 08 BP M4141 ABIDJAN 08,
    ou tél/WhatsApp 07 99 44 57 57), muni de la CNI de l'assuré concerné, des ordonnances et factures médicales et du numéro Wave.
    Le souscripteur reconnaît avoir pris connaissance des Conditions Générales RELAXACCIDENTS.
  </div>
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  const cg = await loadCG("relaxaccidents", "cg-accident.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — RELAXACCIDENTS</h2><div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function renderContratSecurpro(c: ContratSecurpro): Promise<string> {
  const cp = `
  ${header(c.numeroPolice, true)}
  <h1>Conditions Particulières — SECURPRO</h1>
  <div class="sub">Assurance Multirisque Professionnelle · Distribué via ${val(c.intermediaire)}</div>

  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.intermediaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date de souscription</td><td>${dfr(c.dateSouscription)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td><td class="k">Classe de risque</td><td>${val(c.classeLabel)}</td></tr>
    <tr><td class="k">${c.statutOccupation === "locataire" ? "Loyer mensuel" : "Valeur du bâtiment"}</td><td>${fcfa(c.valeurBatimentOuLoyer)}</td><td class="k">Contenu</td><td>${fcfa(c.contenu)}</td></tr>
  </table>

  <table>
    <tr><td class="k">Nom</td><td>${val(c.nom)}</td><td class="k">Prénom</td><td>${val(c.prenom)}</td></tr>
    <tr><td class="k">Numéro d'identification</td><td>${c.numeroPiece ? `${pieceLabel(c.typePiece)} ${val(c.numeroPiece)}` : "—"}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Ville</td><td>${val(c.ville)}</td><td class="k">Commune ou quartier</td><td>${val(c.communeQuartier)}</td></tr>
    <tr><td class="k">Statut</td><td>${c.statutOccupation === "locataire" ? "Locataire" : "Propriétaire"}</td><td class="k">Marché ou abords de marché</td><td>${c.dansMarche ? "Oui" : "Non"}</td></tr>
    ${
      c.nomCommercial || c.referenceCIE
        ? `<tr><td class="k">Nom commercial</td><td>${val(c.nomCommercial)}</td><td class="k">Référence CIE</td><td>${val(c.referenceCIE)}</td></tr>`
        : ""
    }
  </table>

  <h2>Garanties souscrites</h2>
  <table>
    <tr><td class="k">Garantie</td><td class="k">Capital</td><td class="k">Prime</td></tr>
    ${c.lignes.map((l) => `<tr><td>${val(l.garantie)}</td><td>${l.capital ? fcfa(l.capital) : "—"}</td><td>${fcfa(l.prime)}</td></tr>`).join("")}
  </table>

  <table>
    <tr><td class="k">Prime nette</td><td>${fcfa(c.primeNetteHT)}</td><td class="k">Accessoires</td><td>${fcfa(c.accessoires)}</td></tr>
    <tr><td class="k">Taxes</td><td>${fcfa(c.taxes)}</td><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales Contrat SECUR DOMMAGE (MFB/DGTCP/DA/N° 01498 du 19 JUIN 2025) et les présentes Conditions Particulières,
    lesquelles annulent et remplacent toute disposition plus restrictive des conditions générales.
  </div>
  ${signatures(c.signature)}`;

  const cg = await loadCG("incendie");
  const cgSection = `
  <div class="pagebreak"></div>
  <h1>Conditions Générales — SECUR DOMMAGE</h1>
  <div class="note">
    <b>Risques garantis :</b> Incendie / Explosion du local professionnel désigné, telle que définie aux Conditions Générales
    (classe de risque : ${val(c.classeLabel)}). <b>Ne sont pas couvertes :</b> les constructions en bois, ni le changement de
    local en cours de contrat sans résiliation préalable et souscription d'un nouveau contrat.
    <b>Indemnisation :</b> le montant de l'indemnité à payer en cas de sinistre est déterminé soit d'un commun accord,
    soit par un expert à la charge de SIM Assurances. Le souscripteur reconnaît avoir pris connaissance des
    Conditions Générales Contrat SECUR DOMMAGE.
  </div>
  ${RECLAMATION}
  <div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function renderContratSecurhome(c: ContratSecurhome): Promise<string> {
  const cp = `
  ${header(c.numeroPolice)}
  <h1>Bulletin de souscription — SECURHOME+</h1>
  <div class="sub">Assurance Multirisque Habitation · Distribué via ${val(c.partenaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.partenaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td></tr>
    <tr><td class="k">${c.statutOccupation === "locataire" ? "Loyer mensuel" : "Valeur du bâtiment"}</td><td>${fcfa(c.valeurBatimentOuLoyer)}</td><td class="k">Contenu</td><td>${fcfa(c.contenu)}</td></tr>
  </table>

  <table>
    <tr><td class="k">Nom</td><td>${val(c.nom)}</td><td class="k">Prénom</td><td>${val(c.prenom)}</td></tr>
    <tr><td class="k">Téléphone</td><td>${val(c.telephone)}</td><td class="k">Référence CIE</td><td>${val(c.referenceCIE)}</td></tr>
    <tr><td class="k">Ville</td><td>${val(c.ville)}</td><td class="k">Commune</td><td>${val(c.communeQuartier)}</td></tr>
    <tr><td class="k">Statut</td><td>${c.statutOccupation === "locataire" ? "Locataire" : "Propriétaire"}</td><td class="k">Nombre de pièces</td><td>${val(c.nombrePieces)}</td></tr>
  </table>

  <h2>Garanties souscrites</h2>
  <table>
    <tr><td class="k">Garantie</td><td class="k">Capital</td><td class="k">Prime</td></tr>
    ${c.lignes.map((l) => `<tr><td>${val(l.garantie)}</td><td>${l.capital ? fcfa(l.capital) : "—"}</td><td>${fcfa(l.prime)}</td></tr>`).join("")}
  </table>

  <table>
    <tr><td class="k">Prime nette</td><td>${fcfa(c.primeNetteHT)}</td><td class="k">Accessoires</td><td>${fcfa(c.accessoires)}</td></tr>
    <tr><td class="k">Taxes</td><td>${fcfa(c.taxes)}</td><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales Contrat SECUR DOMMAGE (MFB/DGTCP/DA/N° 01498 du 19 JUIN 2025) et les présentes Conditions Particulières,
    lesquelles annulent et remplacent toute disposition plus restrictive des conditions générales.
  </div>
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  const cg = await loadCG("incendie");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — SECUR DOMMAGE</h2><div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function renderContratSecurecolte(c: ContratSecurecolte): Promise<string> {
  const cp = `
  ${header(c.numeroPolice, true)}
  <h1>Conditions Particulières — SECURECOLTE</h1>
  <div class="sub">Assurance récolte indicielle sécheresse · Distribué via ${val(c.intermediaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.intermediaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date de souscription</td><td>${dfr(c.dateSouscription)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td><td class="k">Montant total du pack</td><td><strong>${fcfa(c.montantPack)}</strong></td></tr>
  </table>

  <table>
    <tr><td class="k">Nom</td><td>${val(c.nom)}</td><td class="k">Prénom</td><td>${val(c.prenom)}</td></tr>
    <tr><td class="k">Numéro d'identification</td><td>${c.numeroPiece ? `${pieceLabel(c.typePiece)} ${val(c.numeroPiece)}` : "—"}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Ville</td><td>${val(c.ville)}</td><td class="k">Commune ou quartier</td><td>${val(c.communeQuartier)}</td></tr>
    <tr><td class="k">Valeur du package</td><td>${c.valeurPackage ? fcfa(c.valeurPackage) : "—"}</td><td class="k">Superficie du champ</td><td>${c.superficieHa ? `${c.superficieHa} ha` : "—"}</td></tr>
  </table>

  ${c.capitaux ? `
  <h2>Capitaux garantis</h2>
  <table>
    <tr><td class="k">Palier</td><td class="k">Capital garanti</td></tr>
    ${c.capitaux.map((cx) => `<tr><td>${val(cx.label)}</td><td>${fcfa(cx.montant)}</td></tr>`).join("")}
  </table>` : ""}

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales Contrat SECURECOLTE (MFB/DGTCP/DA/N° 01496 du 19 JUIN 2025) et les présentes Conditions Particulières,
    lesquelles annulent et remplacent toute disposition plus restrictive des conditions générales.
  </div>
  ${signatures(c.signature)}`;

  const cgSection = `
  <div class="pagebreak"></div>
  <h1>Conditions Générales — SECURECOLTE</h1>
  <div class="note">
    <b>Garanties (par pack) :</b>
    <ul style="margin:6px 0 0 18px;">
      <li>Forte sécheresse : indemnisation à hauteur de <b>100 %</b> par pack ;</li>
      <li>Moyenne sécheresse : indemnisation à hauteur de <b>50 %</b> par pack ;</li>
      <li>Faible sécheresse : indemnisation à hauteur de <b>20 %</b> par pack ;</li>
      <li>Décès du producteur : indemnisation des ayants-droit à hauteur de <b>100 %</b> par pack.</li>
    </ul>
    <br/>
    <b>Indemnisation :</b> les conditions climatiques permettant de confirmer la survenance de l'événement garanti sont
    données exclusivement par l'AFRICAN RISK CAPACITY (organisme en charge de la collecte et de l'analyse des données).
  </div>
  ${RECLAMATION}`;

  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function renderContratSecurstock(c: ContratSecurstock): Promise<string> {
  const cp = `
  ${header(c.numeroPolice, true)}
  <h1>Conditions Particulières — SECURSTOCK</h1>
  <div class="sub">Assurance Nantissement de Stock · Distribué via ${val(c.intermediaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.intermediaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date de souscription</td><td>${dfr(c.dateSouscription)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td><td class="k">Classe de risque</td><td>${val(c.classeLabel)}</td></tr>
    <tr><td class="k">Localisation du local</td><td>${val(c.localisationLabel)}</td><td class="k">Montant du stock assuré</td><td>${fcfa(c.capitalRetenu)}</td></tr>
  </table>

  <table>
    <tr><td class="k">Nom</td><td>${val(c.nom)}</td><td class="k">Prénom</td><td>${val(c.prenom)}</td></tr>
    <tr><td class="k">Numéro d'identification</td><td>${c.numeroPiece ? `${pieceLabel(c.typePiece)} ${val(c.numeroPiece)}` : "—"}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Ville</td><td>${val(c.ville)}</td><td class="k">Commune ou quartier</td><td>${val(c.communeQuartier)}</td></tr>
    <tr><td class="k">Montant du stock déclaré</td><td>${fcfa(c.montantStock)}</td><td class="k">Montant du stock retenu</td><td>${fcfa(c.capitalRetenu)}</td></tr>
  </table>

  <h2>Garanties souscrites</h2>
  <table>
    <tr><td class="k">Garantie</td><td class="k">Capital</td><td class="k">Prime</td></tr>
    ${c.lignes.map((l) => `<tr><td>${val(l.garantie)}</td><td>${l.capital ? fcfa(l.capital) : "—"}</td><td>${fcfa(l.prime)}</td></tr>`).join("")}
  </table>

  <table>
    <tr><td class="k">Prime nette</td><td>${fcfa(c.primeNetteHT)}</td><td class="k">Accessoires</td><td>${fcfa(c.accessoires)}</td></tr>
    <tr><td class="k">Taxes</td><td>${fcfa(c.taxes)}</td><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales Contrat SECUR DOMMAGE (MFB/DGTCP/DA/N° 01498 du 19 JUIN 2025) et les présentes Conditions Particulières,
    lesquelles annulent et remplacent toute disposition plus restrictive des conditions générales.
  </div>
  ${signatures(c.signature)}`;

  const cg = await loadCG("incendie");
  const cgSection = `
  <div class="pagebreak"></div>
  <h1>Conditions Générales — SECUR DOMMAGE</h1>
  <div class="note">
    <b>Risque garanti :</b> Incendie / Explosion entraînant la destruction de tout ou partie du stock nanti ou couvert,
    tel que défini aux Conditions Générales. <b>Ne sont pas couverts :</b> les constructions en bois, ni le changement de
    local de stockage en cours de contrat sans résiliation préalable.
    <br/><br/>
    <b>Nantissement :</b> l'indemnité est payée en priorité à l'institution financière au profit de laquelle un nantissement
    a été établi, jusqu'à épuisement de l'encours du prêt et dans la limite du montant du sinistre ; le solde éventuel est
    payé au souscripteur. <b>Indemnisation :</b> le montant de l'indemnité est déterminé d'un commun accord ou par un expert
    à la charge de SIM Assurances.
  </div>
  ${RECLAMATION}
  <div class="cg">${cg}</div>`;
  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function renderContratCoupsdurs(c: ContratCoupsdurs): Promise<string> {
  const s = c.sante;

  const santeSection = s
    ? `
  <h2>Déclaration de bonne santé</h2>
  <table>
    <tr><td class="k">Taille / Poids</td><td>${s.taille ?? "—"} cm / ${s.poids ?? "—"} kg</td><td class="k">Fumeur</td><td>${ouiNon(s.fumeur)}${s.fumeur ? ` (${s.cigarettesParJour ?? 0} cig./jour)` : ""}</td></tr>
    <tr><td class="k">Sportif</td><td>${ouiNon(s.sportif)}${s.sportif ? ` (${s.sportifNiveau === "professionnel" ? "Professionnel" : "Amateur"})` : ""}</td><td class="k">Infirmité</td><td>${ouiNon(s.infirmite)}${s.infirmite ? ` — ${val(s.infirmiteNature)} (${val(s.infirmiteTaux)})` : ""}</td></tr>
    <tr><td class="k">Malade (5 dernières années)</td><td>${ouiNon(s.maladieRecente)}${s.maladieRecente ? ` — ${val(s.maladieRecentePrecisions)}` : ""}</td><td class="k">Toux + fièvre récentes</td><td>${ouiNon(s.touxFievre)}</td></tr>
    <tr><td class="k">Diarrhée fréquente</td><td>${ouiNon(s.diarrheeFrequente)}</td><td class="k">Transfusion sanguine</td><td>${ouiNon(s.transfusion)}</td></tr>
    <tr><td class="k">Grossesse en cours</td><td>${ouiNon(s.enceinte)}</td><td class="k">Affections déclarées</td><td>${s.affections?.length ? s.affections.map((a) => val(AFFECTIONS_LABELS[a] ?? a)).join(", ") : "Aucune"}</td></tr>
    ${s.affectionsPrecisions ? `<tr><td class="k">Précisions sur les affections</td><td colspan="3">${val(s.affectionsPrecisions)}</td></tr>` : ""}
  </table>
  <div class="note" style="font-style:italic;">
    Le souscripteur certifie avoir répondu sincèrement et sans réticence sur son état de santé passé ou actuel.
    Toute fausse déclaration ou omission intentionnelle entraîne la nullité du contrat.
  </div>`
    : "";

  const beneficiairesSection =
    c.beneficiaires && c.beneficiaires.length > 0
      ? `
  <h2>Bénéficiaires en cas de décès</h2>
  <table>
    <tr><td class="k">Nom et prénoms</td><td class="k">Contact</td><td class="k">Lien avec l'assuré</td><td class="k">Part (%)</td></tr>
    ${c.beneficiaires.map((b) => `<tr><td>${val(b.nom)}</td><td>${val(b.contact)}</td><td>${val(b.lien)}</td><td>${b.pourcentage}%</td></tr>`).join("")}
  </table>`
      : "";

  const garantiesLabel = c.lignes.map((l) => l.garantieLabel).join(" + ");
  const prestations = c.lignes
    .map((l) => COUPSDURS_PRESTATIONS[l.cle])
    .filter((p, i, arr): p is string => !!p && arr.indexOf(p) === i);

  const cp = `
  ${header(c.numeroPolice, true)}
  <h1>Conditions Particulières — COUPS DURS</h1>
  <div class="sub">${val(garantiesLabel)} · Distribué via ${val(c.intermediaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.intermediaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date de souscription</td><td>${dfr(c.dateSouscription)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td></tr>
  </table>

  <h2>Garanties souscrites</h2>
  <table>
    <tr><td class="k">Garantie</td><td class="k">Capital garanti</td><td class="k">Prime</td></tr>
    ${c.lignes.map((l) => `<tr><td>${val(l.garantieLabel)}</td><td>${fcfa(l.capital)}</td><td>${fcfa(l.prime)}</td></tr>`).join("")}
  </table>

  <table>
    <tr><td class="k">Nom</td><td>${val(c.nom)}</td><td class="k">Prénom</td><td>${val(c.prenom)}</td></tr>
    <tr><td class="k">Numéro d'identification</td><td>${c.numeroPiece ? `${pieceLabel(c.typePiece)} ${val(c.numeroPiece)}` : "—"}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Ville</td><td>${val(c.ville)}</td><td class="k">Commune ou quartier</td><td>${val(c.communeQuartier)}</td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est régi par les
    Conditions Générales du contrat COUPS DURS et les présentes Conditions Particulières.
  </div>
  ${santeSection}
  ${beneficiairesSection}
  ${signatures(c.signature)}`;

  const cgSection = `
  <div class="pagebreak"></div>
  <h1>Conditions Générales — COUPS DURS</h1>
  <div class="note">
    <b>Événements couverts (Coups Durs) :</b> AVC, infarctus du myocarde, accident de la voie publique, traumatisme
    crânien, hémorragie externe sévère, brûlure sévère et étendue (au-delà de 20 %), morsure de serpent — délai de
    carence de 7 jours pour l'AVC et la crise cardiaque uniquement.
    <br/><br/>
    <b>Prestations :</b>
    <ul style="margin:6px 0 0 18px;">
      ${prestations.map((p) => `<li>${p}</li>`).join("")}
    </ul>
  </div>
  ${RECLAMATION}`;

  return document_(`Contrat ${c.numeroPolice}`, cp + cgSection);
}
