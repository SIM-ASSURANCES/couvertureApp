// Bulletin d'adhésion + questionnaire médical d'une demande d'Assurance Santé,
// tel que le souscripteur l'a rempli (2026-10-15) : reprend la mise en page du
// bulletin fourni par SIM Assurances — informations du souscripteur, personnes
// couvertes, puis le questionnaire médical en colonnes (assuré principal,
// conjoint, enfants) et la mention « Déclare exact et sincère ». Rendu en PDF
// pour l'admin qui valide la demande ; données de santé : jamais servi à un
// client ni à un partenaire.

import {
  QUESTIONNAIRE_SANTE,
  libellesPersonnesSante,
  type PersonneAssureeSante,
  type ReponsesSante,
} from "./assurancesSante.js";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://localhost:5173";

export interface DonneesBulletinSante {
  numeroDemande: string;
  dateDemande: Date;
  produit: string;
  description: string;
  tauxPriseEnCharge: number | null;
  montant: number;
  apporteur: string;
  souscripteur: {
    nomComplet: string;
    telephone: string;
    email: string | null;
    sexe: string | null;
    dateNaissance: Date | null;
    profession: string | null;
    lieuResidence: string | null;
    numeroCmu: string | null;
  };
  personnes: PersonneAssureeSante[];
  /** Réponses, une entrée par personne (assuré principal d'abord) ; `null` pour une demande antérieure au questionnaire. */
  questionnaire: { personnes: { reponses: ReponsesSante }[]; signeLe: string | null } | null;
  signature: string | null;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const jour = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR", { timeZone: "UTC" });
};
const libelleSexe = (s: string | null | undefined) => (s === "masculin" ? "M" : s === "feminin" ? "F" : "—");
const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;

const STYLE = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 11px; margin: 0; }
  .page { width: 210mm; height: 296mm; padding: 11mm 12mm; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .tete { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #004b9c; padding-bottom: 8px; margin-bottom: 12px; }
  .tete img { height: 50px; }
  h1 { font-size: 17px; color: #004b9c; margin: 0; text-align: right; }
  .sous { font-size: 10px; color: #5b6b80; text-align: right; margin-top: 2px; }
  h2 { font-size: 12px; background: #004b9c; color: #fff; padding: 5px 8px; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #9ca3af; padding: 4px 5px; vertical-align: top; }
  th { background: #eef3fa; text-align: left; font-size: 10px; }
  td.k { background: #f3f4f6; font-weight: 700; width: 24%; }
  .q th, .q td { font-size: 9.5px; text-align: center; padding: 2px 5px; }
  .q { margin-bottom: 4px; }
  .q td.lib { text-align: left; }
  .q tr.rub td { background: #dbe7f6; font-weight: 700; text-align: left; font-size: 10px; }
  .oui { color: #b91c1c; font-weight: 700; }
  .non { color: #166534; }
  .na { color: #9ca3af; }
  .txt { text-align: left !important; font-size: 9px; }
  .note { font-size: 9.5px; color: #374151; border: 1px solid #d1d5db; padding: 6px 8px; margin: 8px 0; background: #fafafa; }
  .signatures { display: flex; gap: 12mm; margin-top: 6px; page-break-inside: avoid; }
  .signatures > div { flex: 1; border: 1px solid #9ca3af; min-height: 24mm; padding: 4px 7px; font-size: 10px; }
  .signatures img { max-height: 20mm; max-width: 100%; display: block; margin-top: 3px; }
`;

function lignePersonne(intitule: string, nom: string, p: { lieu?: string; profession?: string; cmu?: string; naissance?: string; sexe?: string; tel?: string }): string {
  return `<tr>
    <td class="k">${esc(intitule)}</td><td>${esc(nom)}</td><td>${esc(p.lieu || "—")}</td><td>${esc(p.profession || "—")}</td>
    <td>${esc(p.cmu || "—")}</td><td>${esc(p.naissance || "—")}</td><td style="text-align:center">${esc(p.sexe || "—")}</td><td>${esc(p.tel || "—")}</td>
  </tr>`;
}

function celluleReponse(valeur: boolean | string | undefined, applicable: boolean, texte: boolean): string {
  if (!applicable) return `<td class="na">s.o.</td>`;
  if (valeur === undefined) return `<td class="na">—</td>`;
  if (typeof valeur === "boolean") return valeur ? `<td class="oui">OUI</td>` : `<td class="non">non</td>`;
  return `<td class="${texte ? "txt" : ""}">${esc(valeur)}</td>`;
}

function tableauQuestionnaire(d: DonneesBulletinSante): string {
  if (!d.questionnaire) {
    return `<div class="note">Cette demande a été déposée avant la mise en place du questionnaire médical : aucune réponse n'est disponible.</div>`;
  }
  const intitules = libellesPersonnesSante(d.personnes);
  const sexes = [d.souscripteur.sexe, ...d.personnes.map((p) => p.sexe)];
  const colonnes = d.questionnaire.personnes.length;
  const entetes = Array.from({ length: colonnes }, (_, i) => `<th style="text-align:center">${esc(intitules[i] ?? `Personne ${i + 1}`)}</th>`).join("");
  const lignes = QUESTIONNAIRE_SANTE.map((r) => {
    const questions = r.questions
      .map((q) => {
        const cellules = Array.from({ length: colonnes }, (_, i) => {
          const applicable = !q.sexe || q.sexe === sexes[i];
          const reponses = d.questionnaire!.personnes[i].reponses;
          // Question conditionnelle non déclenchée (ex. mois de grossesse) : sans objet.
          const declenchee = !q.siOui || reponses[q.siOui] === true;
          return celluleReponse(reponses[q.cle], applicable && declenchee, q.type !== "oui_non");
        }).join("");
        return `<tr><td class="lib">${esc(q.libelle)}</td>${cellules}</tr>`;
      })
      .join("");
    return `<tr class="rub"><td colspan="${colonnes + 1}">${r.numero}- ${esc(r.titre)}</td></tr>${questions}`;
  }).join("");
  return `<table class="q"><tr><th style="text-align:left">Antécédents médicaux</th>${entetes}</tr>${lignes}</table>`;
}

export function renderBulletinSanteHtml(d: DonneesBulletinSante): string {
  const s = d.souscripteur;
  const personnes = [
    lignePersonne("Assuré principal", s.nomComplet, {
      lieu: s.lieuResidence ?? undefined,
      profession: s.profession ?? undefined,
      cmu: s.numeroCmu ?? undefined,
      naissance: jour(s.dateNaissance),
      sexe: libelleSexe(s.sexe),
      tel: s.telephone,
    }),
    ...d.personnes.map((p, i) => {
      const intitule = libellesPersonnesSante(d.personnes)[i + 1];
      return lignePersonne(intitule, `${p.prenom} ${p.nom}`.trim(), {
        lieu: p.lieuResidence,
        profession: p.profession,
        cmu: p.numeroCmu,
        naissance: jour(p.dateNaissance),
        sexe: libelleSexe(p.sexe),
        tel: p.telephone,
      });
    }),
  ].join("");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bulletin d'adhésion — questionnaire médical</title><style>${STYLE}</style></head><body>
<div class="page">
  <div class="tete">
    <img src="${APP_PUBLIC_URL}/logo.webp" alt="SIM Assurances" />
    <div><h1>BULLETIN D'ADHÉSION — Assurance santé</h1><div class="sous">Demande n° ${esc(d.numeroDemande.slice(0, 8).toUpperCase())} · déposée le ${esc(jour(d.dateDemande))}</div></div>
  </div>
  <table>
    <tr><td class="k">Apporteur</td><td>${esc(d.apporteur)}</td><td class="k">Formule choisie</td><td>${esc(d.produit)} — ${esc(d.description)}${d.tauxPriseEnCharge != null ? ` · prise en charge ${d.tauxPriseEnCharge} %` : ""}</td></tr>
    <tr><td class="k">Souscripteur</td><td>${esc(s.nomComplet)}</td><td class="k">Prime annuelle</td><td><strong>${esc(fcfa(d.montant))}</strong></td></tr>
    <tr><td class="k">Contacts</td><td>${esc(s.telephone)}</td><td class="k">E-mail</td><td>${esc(s.email || "—")}</td></tr>
  </table>
  <h2>Personnes couvertes</h2>
  <table>
    <tr><th>Qualité</th><th>Nom et prénoms</th><th>Lieu de résidence</th><th>Profession</th><th>N° CMU</th><th>Date de naissance</th><th>Sexe</th><th>Téléphone</th></tr>
    ${personnes}
  </table>
  <div class="note">Veuillez renseigner un second bulletin à partir du 5<sup>e</sup> enfant.</div>
  <h2>QUESTIONNAIRE MÉDICAL</h2>
  <div class="note">Le souscripteur est tenu de déclarer toutes ses affections, sous peine de la déchéance de la garantie. Répondre à toutes les questions est obligatoire. « s.o. » : question sans objet pour cette personne.</div>
</div>
<div class="page">
  <div class="tete">
    <img src="${APP_PUBLIC_URL}/logo.webp" alt="SIM Assurances" />
    <div><h1>QUESTIONNAIRE MÉDICAL</h1><div class="sous">${esc(s.nomComplet)} · ${esc(d.produit)}</div></div>
  </div>
  ${tableauQuestionnaire(d)}
  <div class="signatures">
    <div>Date et signature de l'adhérent<br /><strong>« Déclare exact et sincère »</strong><br />${d.questionnaire?.signeLe ? `Le ${esc(jour(d.questionnaire.signeLe))}` : ""}
      ${d.signature ? `<img src="${esc(d.signature)}" alt="Signature" />` : ""}</div>
    <div>Visa médecin conseil</div>
  </div>
</div>
</body></html>`;
}
