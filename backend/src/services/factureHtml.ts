// Rendu HTML de la facture (puis PDF via services/pdf.ts::htmlToPdf). Mise en
// page inspirée du modèle fourni par SIM Assurances : bloc client, tableau
// de la police, détail de la prime, montant arrêté en lettres, bloc de
// règlement. Même charte que les contrats (services/contractHtml.ts).

import { montantEnLettres } from "./montantEnLettres.js";
import type { DonneesFacture } from "./facture.js";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://localhost:5173";

/**
 * Coordonnées de règlement affichées en bas de facture. VIDE tant que SIM
 * Assurances n'a pas communiqué ses comptes : le bloc est alors masqué plutôt
 * que d'imprimer des coordonnées inventées ou celles d'un tiers. Une ligne par
 * compte, ex. « BANQUE X — IBAN CI00 0000 0000 0000 0000 0000 000 ».
 */
export const COMPTES_REGLEMENT: string[] = [];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const val = (s?: string | null) => (s === null || s === undefined || s === "" ? "—" : esc(s));
// Espace ordinaire (et non l'espace fine insécable de Intl) : rendu identique dans tous les lecteurs PDF.
const nombre = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fcfa = (n: number) => `${nombre(n)} FCFA`;
const jour = (d: Date | null) =>
  d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" }) : "—";

const CSS = `
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
  body{margin:0;color:#0f1b2d;padding:40px;font-size:13px;line-height:1.5;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #004b9c;padding-bottom:16px;margin-bottom:22px;}
  .head img{height:80px;display:block;}
  .num{text-align:right;font-size:12px;color:#5b6b80;}
  .num b{display:block;font-size:20px;color:#0f1b2d;letter-spacing:.5px;}
  .statut{display:inline-block;margin-top:6px;padding:2px 10px;border:1.5px solid #1a7f4b;color:#1a7f4b;border-radius:4px;font-weight:700;font-size:11px;letter-spacing:1px;}
  .client{border:1px solid #c9d3e0;padding:10px 14px;width:55%;margin-bottom:18px;}
  .client .t{font-size:11px;color:#5b6b80;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;}
  .client b{font-size:14px;}
  .client .idcl{margin-top:6px;padding-top:6px;border-top:1px dashed #c9d3e0;font-size:12px;color:#5b6b80;}
  .client .idcl b{font-size:13.5px;color:#004b9c;letter-spacing:.6px;}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;}
  td{padding:6px 10px;border:1px solid #e3e9f1;font-size:12px;vertical-align:top;}
  td.k{background:#f5f8fc;font-weight:600;color:#5b6b80;width:18%;}
  .prime{width:62%;margin-left:auto;margin-right:auto;}
  .prime td{border:none;border-bottom:1px solid #e3e9f1;font-size:13px;}
  .prime td.v{text-align:right;font-variant-numeric:tabular-nums;width:38%;}
  .prime tr.total td{border-bottom:none;border-top:2px solid #0f1b2d;font-weight:700;font-size:14.5px;padding-top:10px;}
  .arrete{margin:18px 0 6px;font-size:12.5px;}
  .arrete b{text-transform:capitalize;}
  .sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:28px;font-size:12px;color:#5b6b80;page-break-inside:avoid;}
  .sign img{height:60px;max-width:220px;display:block;margin:0 0 4px auto;}
  .reglement{margin-top:26px;font-size:11.5px;color:#25324a;border-top:1px solid #e3e9f1;padding-top:10px;}
  .reglement ul{margin:4px 0 0 18px;padding:0;}
  .note{font-size:10.5px;color:#5b6b80;margin-top:22px;border-top:1px solid #e3e9f1;padding-top:8px;}
`;

export function renderFactureHtml(f: DonneesFacture): string {
  const d = f.detailPrime;
  const lignesPrime = d
    ? `
      <tr><td>Prime nette</td><td class="v">${fcfa(d.primeNette)}</td></tr>
      <tr><td>Accessoires</td><td class="v">${fcfa(d.accessoires)}</td></tr>
      <tr><td>Taxes</td><td class="v">${fcfa(d.taxes)}</td></tr>`
    : "";

  const mentionPaiement = f.moyenPaiement
    ? `Facture acquittée le ${jour(f.dateFacture)} — règlement par ${esc(f.moyenPaiement)}.`
    : `Facture acquittée le ${jour(f.dateFacture)}.`;

  const reglement = COMPTES_REGLEMENT.length
    ? `<div class="reglement"><b>Coordonnées de règlement SIM Assurances</b>
         <ul>${COMPTES_REGLEMENT.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`
    : "";

  const body = `
  <div class="head">
    <img src="${APP_PUBLIC_URL}/logo.webp" alt="SIM Assurances" />
    <div class="num">
      Facture N°<b>${esc(f.numeroFacture)}</b>
      Du ${jour(f.dateFacture)}
      <div><span class="statut">ACQUITTÉE</span></div>
    </div>
  </div>

  <div class="client">
    <div class="t">Client / Souscripteur</div>
    <b>${val(f.client.nomComplet)}</b><br />
    ${f.client.adresse ? `${esc(f.client.adresse)}<br />` : ""}
    Tél. ${val(f.client.telephone)}
    ${f.client.identifiant ? `<div class="idcl">Identifiant client : <b>${esc(f.client.identifiant)}</b></div>` : ""}
  </div>

  <table>
    <tr><td class="k">Assurance</td><td><b>${val(f.produitLibelle)}</b></td><td class="k">Avenant</td><td>${esc(f.avenant)}</td></tr>
    <tr><td class="k">Police N°</td><td>${val(f.numeroPolice)}</td><td class="k">Bureau de souscription</td><td>${val(f.bureau)}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${jour(f.periodeDebut)}</td><td class="k">Date d'expiration</td><td>${jour(f.periodeFin)}</td></tr>
    <tr><td class="k">Risque(s) assuré(s)</td><td colspan="3">${val(f.assure)} — pour le détail, se référer aux Conditions Particulières.</td></tr>
  </table>

  <table class="prime">
    ${lignesPrime}
    <tr class="total"><td>Prime totale à payer</td><td class="v">${fcfa(f.montant)}</td></tr>
  </table>

  <div class="arrete">
    Arrêtée la présente facture à la somme de : <b>${esc(montantEnLettres(f.montant))}</b> francs CFA.
  </div>
  <div style="font-size:12px;color:#25324a;">${mentionPaiement}</div>

  <div class="sign">
    <div>Fait à Abidjan, le ${jour(f.dateFacture)}</div>
    <div style="text-align:right;">
      <img src="${APP_PUBLIC_URL}/signature-compagnie.png" alt="" />
      Pour la Société
    </div>
  </div>

  ${reglement}
  <div class="note">SIM ASSURANCES CÔTE D'IVOIRE — info@simassurances.com. Cette facture atteste du paiement de la prime ci-dessus ; elle ne se substitue pas aux Conditions Particulières et Générales du contrat.</div>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${esc(f.numeroFacture)}</title>
<style>${CSS}</style></head><body>${body}</body></html>`;
}
