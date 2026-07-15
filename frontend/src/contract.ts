// Génération des contrats (Conditions Particulières + Conditions Générales).
// Le bulletin de souscription (CP) est reconstruit avec les données du client,
// puis les Conditions Générales (CG) sont annexées depuis /public/cg-*.html.

import type { SouscriptionImf } from "./types";

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
  classeLabel: string;
  statutOccupation: "proprietaire" | "locataire";
  valeurBatimentOuLoyer: number;
  contenu: number;
  dansMarche: boolean;
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
  classeLabel: string;
  localisationLabel: string;
  montantStock: number;
  capitalRetenu: number;
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
  montantPack: number;
  signature?: string | null;
}

const fcfa = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
const dfr = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("fr-FR") : "—";
const val = (s?: string | number | null) =>
  s === null || s === undefined || s === "" ? "—" : String(s);

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

/** true si un contrat PDF est disponible pour ce produit IMF (COUPS DURS à venir). */
export function contratImfDisponible(produitCode: string): boolean {
  return produitCode === "securpro" || produitCode === "securstock" || produitCode === "securecolte";
}

/** Génère et ouvre le contrat PDF adapté au produit d'une souscription IMF. */
export function genererContratImf(s: SouscriptionImf): void {
  if (s.produitCode === "securpro") genererContratSecurpro(souscriptionImfToContratSecurpro(s));
  else if (s.produitCode === "securstock") genererContratSecurstock(souscriptionImfToContratSecurstock(s));
  else if (s.produitCode === "securecolte") genererContratSecurecolte(souscriptionImfToContratSecurecolte(s));
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

/** Reconstitue les champs du contrat SECURECOLTE à partir d'une souscription IMF (produit catalogue). */
export function souscriptionImfToContratSecurecolte(s: SouscriptionImf): ContratSecurecolte {
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
    montantPack: s.primeTTC,
    signature: s.signature ?? null,
  };
}

/** Reconstitue les champs du contrat SECURSTOCK à partir d'une souscription IMF. */
export function souscriptionImfToContratSecurstock(s: SouscriptionImf): ContratSecurstock {
  const entrees = s.entrees as { classe?: number; capitalDeclare?: number; localisation?: string };
  const resultat = s.resultat as { capitauxTotaux?: number; primeNetteHT?: number; accessoires?: number; taxes?: number };
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
    classeLabel: entrees.classe ? (SECURSTOCK_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
    localisationLabel: entrees.localisation ? (SECURSTOCK_LOCALISATION_LABELS[entrees.localisation] ?? entrees.localisation) : "—",
    montantStock: entrees.capitalDeclare ?? 0,
    capitalRetenu: resultat.capitauxTotaux ?? 0,
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
    classeLabel: entrees.classe ? (SECURPRO_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
    statutOccupation,
    valeurBatimentOuLoyer: statutOccupation === "locataire" ? (entrees.loyerMensuel ?? 0) : (entrees.valeurBatiment ?? 0),
    contenu: entrees.contenu ?? 0,
    dansMarche: !!entrees.dansMarche,
    primeNetteHT: resultat.primeNetteHT ?? 0,
    accessoires: resultat.accessoires ?? 0,
    taxes: resultat.taxes ?? 0,
    primeTTC: s.primeTTC,
    signature: s.signature ?? null,
  };
}

const CSS = `
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
  body{margin:0;color:#0f1b2d;padding:40px;font-size:13px;line-height:1.5;text-align:justify;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #004b9c;padding-bottom:16px;margin-bottom:20px;}
  .brand img{height:54px;display:block;}
  .pol{text-align:right;font-size:12px;color:#5b6b80;}
  .pol b{display:block;font-size:17px;color:#0f1b2d;letter-spacing:1px;}
  h1{font-size:18px;margin:0 0 4px;color:#004b9c;}
  h2{font-size:15px;margin:22px 0 8px;color:#004b9c;border-bottom:1px solid #e3e9f1;padding-bottom:4px;}
  .sub{color:#5b6b80;font-size:12px;margin-bottom:18px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;}
  td{padding:7px 10px;border:1px solid #e3e9f1;font-size:12px;vertical-align:top;}
  td.k{background:#f5f8fc;font-weight:600;width:34%;color:#5b6b80;}
  .cg h3{font-size:13px;margin:14px 0 4px;color:#0f1b2d;}
  .cg p{margin:4px 0;font-size:11.5px;color:#25324a;}
  .cg ul{margin:4px 0 8px 18px;padding:0;}
  .cg li{font-size:11.5px;margin:2px 0;}
  .cg .cg-tbl td{font-size:11px;}
  .note{font-size:11px;color:#5b6b80;border-top:1px solid #e3e9f1;padding-top:12px;margin-top:16px;}
  .sign{display:flex;justify-content:space-between;margin-top:40px;font-size:12px;color:#5b6b80;}
  .pagebreak{page-break-before:always;}
  @media print{body{padding:22px;}}
`;

function header(numeroPolice: string) {
  return `<div class="head">
    <div class="brand"><img src="${window.location.origin}/logo.webp" alt="SIM Assurances" onerror="this.style.display='none'" /></div>
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
  const gauche = sig
    ? `<img src="${sig}" style="height:60px;max-width:220px;display:block;margin-bottom:4px;" /><div style="border-top:1px solid #5b6b80;padding-top:4px;">LE SOUSCRIPTEUR</div>`
    : `<div>LE SOUSCRIPTEUR</div>`;
  const droite = `<img src="${window.location.origin}/signature-compagnie.png" alt="" style="height:60px;max-width:220px;display:inline-block;margin-bottom:4px;" onerror="this.style.display='none'" /><div style="border-top:1px solid #5b6b80;padding-top:4px;">POUR LA COMPAGNIE</div>`;
  return `<div class="sign"><div>${gauche}</div><div style="text-align:right;">${droite}</div></div>`;
}

async function loadCG(file: string): Promise<string> {
  try {
    const r = await fetch(`${window.location.origin}/${file}`);
    if (r.ok) return await r.text();
  } catch {
    /* ignore */
  }
  return "<p>Conditions Générales momentanément indisponibles.</p>";
}

// La fenêtre doit être ouverte SYNCHRONIQUEMENT au clic (sinon bloquée par le
// navigateur). On l'ouvre d'abord, puis on y écrit après le fetch des CG.
function openWindow(): Window | null {
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(
      "<!doctype html><meta charset='utf-8'><title>Contrat…</title>" +
        "<p style='font-family:Arial;padding:40px;color:#5b6b80'>Génération du contrat…</p>"
    );
  }
  return w;
}

function writeDoc(w: Window | null, title: string, inner: string) {
  if (!w) {
    alert("Veuillez autoriser les fenêtres popup pour télécharger le contrat.");
    return;
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>${CSS}</style></head><body>${inner}
<script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export async function genererContratIncendie(c: ContratIncendie) {
  const w = openWindow();
  const adresse = [c.numeroMaison, c.quartier, c.commune].filter(Boolean).join(", ");
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
    <tr><td class="k">Commune</td><td>${val(c.commune)}</td><td class="k">Quartier</td><td>${val(c.quartier)}</td></tr>
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

  const cg = await loadCG("cg-incendie.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — SECURDOMMAGE</h2><div class="cg">${cg}</div>`;
  writeDoc(w, `Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function genererContratAccident(c: ContratAccident) {
  const w = openWindow();
  const cp = `
  ${header(c.numeroPolice)}
  <h1>Bulletin de souscription — RELAXACCIDENTS</h1>
  <div class="sub">Assurance Accident · Distribué via ${val(c.partenaire)}</div>

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

  const cg = await loadCG("cg-accident.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — RELAXACCIDENTS</h2><div class="cg">${cg}</div>`;
  writeDoc(w, `Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function genererContratSecurpro(c: ContratSecurpro) {
  const w = openWindow();
  const cp = `
  ${header(c.numeroPolice)}
  <h1>Conditions Particulières — SECURPRO</h1>
  <div class="sub">Assurance Multirisque Professionnelle · Distribué via ${val(c.intermediaire)}</div>

  <h2>Conditions Particulières</h2>
  <table>
    <tr><td class="k">Numéro de police</td><td>${val(c.numeroPolice)}</td><td class="k">Intermédiaire</td><td>${val(c.intermediaire)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${dfr(c.dateDebut)}</td><td class="k">Date de souscription</td><td>${dfr(c.dateSouscription)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${dfr(c.dateFin)}</td><td class="k">Classe de risque</td><td>${val(c.classeLabel)}</td></tr>
    <tr><td class="k">${c.statutOccupation === "locataire" ? "Loyer mensuel" : "Valeur du bâtiment"}</td><td>${fcfa(c.valeurBatimentOuLoyer)}</td><td class="k">Contenu</td><td>${fcfa(c.contenu)}</td></tr>
  </table>

  <table>
    <tr><td class="k">Nom</td><td>${val(c.nom)}</td><td class="k">Prénom</td><td>${val(c.prenom)}</td></tr>
    <tr><td class="k">Numéro d'identification</td><td>${c.numeroPiece ? `${pieceLabel(c.typePiece)} ${c.numeroPiece}` : "—"}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Statut</td><td>${c.statutOccupation === "locataire" ? "Locataire" : "Propriétaire"}</td><td class="k">Marché ou abords de marché</td><td>${c.dansMarche ? "Oui" : "Non"}</td></tr>
  </table>

  <table>
    <tr><td class="k">Prime nette</td><td>${fcfa(c.primeNetteHT)}</td><td class="k">Accessoires</td><td>${fcfa(c.accessoires)}</td></tr>
    <tr><td class="k">Taxes</td><td>${fcfa(c.taxes)}</td><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales Contrat SECUR DOMMAGE (MFB/DGTCP/DA/N° 01498 du 19 JUIN 2025) et les présentes Conditions Particulières,
    lesquelles annulent et remplacent toute disposition plus restrictive des conditions générales.
    <br/><br/>
    <b>Risques garantis :</b> Incendie / Explosion du local professionnel désigné, telle que définie aux Conditions Générales
    (classe de risque : ${val(c.classeLabel)}). <b>Ne sont pas couvertes :</b> les constructions en bois, ni le changement de
    local en cours de contrat sans résiliation préalable et souscription d'un nouveau contrat.
    <b>Indemnisation :</b> le montant de l'indemnité à payer en cas de sinistre est déterminé soit d'un commun accord,
    soit par un expert à la charge de SIM Assurances. Le souscripteur reconnaît avoir pris connaissance des
    Conditions Générales Contrat SECUR DOMMAGE.
  </div>
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  const cg = await loadCG("cg-incendie.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — SECUR DOMMAGE</h2><div class="cg">${cg}</div>`;
  writeDoc(w, `Contrat ${c.numeroPolice}`, cp + cgSection);
}

export async function genererContratSecurecolte(c: ContratSecurecolte) {
  const w = openWindow();
  const cp = `
  ${header(c.numeroPolice)}
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
    <tr><td class="k">Numéro d'identification</td><td>${c.numeroPiece ? `${pieceLabel(c.typePiece)} ${c.numeroPiece}` : "—"}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales Contrat SECURECOLTE (MFB/DGTCP/DA/N° 01496 du 19 JUIN 2025) et les présentes Conditions Particulières,
    lesquelles annulent et remplacent toute disposition plus restrictive des conditions générales.
    <br/><br/>
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
  ${RECLAMATION}
  ${signatures(c.signature)}`;

  writeDoc(w, `Contrat ${c.numeroPolice}`, cp);
}

export async function genererContratSecurstock(c: ContratSecurstock) {
  const w = openWindow();
  const cp = `
  ${header(c.numeroPolice)}
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
    <tr><td class="k">Numéro d'identification</td><td>${c.numeroPiece ? `${pieceLabel(c.typePiece)} ${c.numeroPiece}` : "—"}</td><td class="k">Téléphone</td><td>${val(c.telephone)}</td></tr>
    <tr><td class="k">Montant du stock déclaré</td><td>${fcfa(c.montantStock)}</td><td class="k">Montant du stock retenu</td><td>${fcfa(c.capitalRetenu)}</td></tr>
  </table>

  <table>
    <tr><td class="k">Prime nette</td><td>${fcfa(c.primeNetteHT)}</td><td class="k">Accessoires</td><td>${fcfa(c.accessoires)}</td></tr>
    <tr><td class="k">Taxes</td><td>${fcfa(c.taxes)}</td><td class="k">Prime TTC</td><td><strong>${fcfa(c.primeTTC)}</strong></td></tr>
  </table>

  <div class="note">
    Le présent contrat conclu entre le Souscripteur (ci-dessus) et SIM ASSURANCES CI (l'Assureur) est constitué par
    les Conditions Générales Contrat SECUR DOMMAGE (MFB/DGTCP/DA/N° 01498 du 19 JUIN 2025) et les présentes Conditions Particulières,
    lesquelles annulent et remplacent toute disposition plus restrictive des conditions générales.
    <br/><br/>
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
  ${signatures(c.signature)}`;

  const cg = await loadCG("cg-incendie.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — SECUR DOMMAGE</h2><div class="cg">${cg}</div>`;
  writeDoc(w, `Contrat ${c.numeroPolice}`, cp + cgSection);
}
