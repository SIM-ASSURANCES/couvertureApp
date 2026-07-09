// Génération des contrats (Conditions Particulières + Conditions Générales).
// Le bulletin de souscription (CP) est reconstruit avec les données du client,
// puis les Conditions Générales (CG) sont annexées depuis /public/cg-*.html.

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
}

const fcfa = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
const dfr = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("fr-FR") : "—";
const val = (s?: string | number | null) =>
  s === null || s === undefined || s === "" ? "—" : String(s);

const CSS = `
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
  body{margin:0;color:#0f1b2d;padding:40px;font-size:13px;line-height:1.5;}
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

const RECLAMATION = `<div class="note">
  Toute réclamation relative à l'exécution du contrat doit être adressée à « SIM ASSURANCES CÔTE D'IVOIRE »
  (courrier contre décharge, e-mail : info@simassurances.com, ou tout autre moyen faisant foi). La réclamation est gratuite ;
  une réponse est apportée sous cinq (05) jours ouvrés. En cas d'insatisfaction, le client peut saisir gratuitement
  l'OQSF-CI (www.oqsf.ci) ou la Médiation de l'Assurance (www.mediationassuranceci.net).
</div>`;

const SIGNATURES = `<div class="sign"><div>LE SOUSCRIPTEUR</div><div>POUR LA COMPAGNIE</div></div>`;

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
    en bois et le changement de domicile en cours de contrat. <b>Indemnisation :</b> montant forfaitaire de ${fcfa(c.capitalGaranti)}
    (SIM ASSURANCES pourra recourir à un expert pour la validation du montant à payer).
    Le souscripteur reconnaît avoir pris connaissance des Conditions Générales SECURDOMMAGE.
  </div>
  ${RECLAMATION}
  ${SIGNATURES}`;

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
  ${SIGNATURES}`;

  const cg = await loadCG("cg-accident.html");
  const cgSection = `<div class="pagebreak"></div><h2>Conditions Générales — RELAXACCIDENTS</h2><div class="cg">${cg}</div>`;
  writeDoc(w, `Contrat ${c.numeroPolice}`, cp + cgSection);
}
