// Génération HTML de la carte virtuelle de prise en charge (partenaire
// Novelia Assurances), rendue ensuite en PNG par Chromium headless (voir
// services/pdf.ts) — reproduit la mise en page de la carte physique Novelia
// fournie par SIM Assurances (refonte complète, remplace l'ancien modèle
// MCI Care / Atlantique Assurances / SCCONAS).

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://localhost:5173";

export interface CarteData {
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  dateDebut: string | null;
  // Déjà traduit ("Masculin"/"Féminin") — null si non renseigné (produits ne
  // collectant pas encore ce champ, ex. Incendie/ancien Accident).
  sexeLabel: string | null;
  // Libellé + montant de la bannière garantie, adaptés par produit (voir
  // routes/cartes.ts : "FMP" pour Frais Médicaux, "DÉCÈS/IPT" pour
  // RelaxVoyage, "CAPITAL GARANTI" en générique).
  garantieLabel: string;
  garantieMontant: number;
  photoDataUrl: string;
}

export const CARTE_WIDTH = 1013;
export const CARTE_HEIGHT = 638;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const val = (s?: string | null) => (s === null || s === undefined || s === "" ? "—" : esc(String(s)));
const dfr = (s?: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");
const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;}
  html,body{width:${CARTE_WIDTH}px;height:${CARTE_HEIGHT}px;overflow:hidden;background:#eef2f6;}
  .carte{
    position:relative;
    width:${CARTE_WIDTH}px;height:${CARTE_HEIGHT}px;
    background:#ffffff;
    border-radius:26px;
    overflow:hidden;
    border:1px solid #dbe3ec;
    box-shadow:0 6px 24px rgba(15,27,45,0.12);
    display:flex;flex-direction:column;
    padding:34px 46px 26px;
  }
  .entete{display:flex;justify-content:space-between;align-items:flex-start;}
  .logo-novelia img{height:64px;display:block;}
  .titre{text-align:center;padding-top:6px;}
  .titre .petit{font-size:15px;letter-spacing:3px;color:#5b7194;font-weight:700;}
  .titre .grand{font-size:26px;letter-spacing:0.5px;color:#1b3e73;font-weight:800;margin-top:2px;}
  .banniere{
    background:#2d5fa8;color:#fff;font-weight:800;font-size:20px;letter-spacing:0.5px;
    padding:10px 22px;border-radius:10px;white-space:nowrap;align-self:flex-start;
    box-shadow:0 2px 8px rgba(45,95,168,0.35);
  }
  .separateur{height:1px;background:#e3e9f1;margin:22px 0 26px;}
  .corps{display:flex;gap:44px;align-items:center;flex:1;min-height:0;}
  .photo{
    width:250px;height:314px;flex:none;
    border-radius:14px;overflow:hidden;
    border:4px solid #fff;box-shadow:0 3px 14px rgba(15,27,45,0.22);
    background:#e3e9f1;
  }
  .photo img{width:100%;height:100%;object-fit:cover;display:block;}
  .infos{flex:1;display:flex;flex-direction:column;justify-content:center;gap:13px;}
  .ligne{display:flex;font-size:21px;align-items:baseline;}
  .ligne .k{width:180px;flex:none;color:#1b3e73;font-weight:700;}
  .ligne .sep{color:#8fa2bd;margin-right:14px;}
  .ligne .v{color:#141b26;font-weight:700;}
  .pied{display:flex;justify-content:space-between;align-items:flex-end;padding-top:18px;}
  .pied-sim{display:flex;flex-direction:column;gap:2px;}
  .pied-sim .nom-cie{font-size:16px;font-weight:800;color:#1b3e73;}
  .pied-sim .nom-client{font-size:13px;font-weight:600;color:#5b7194;letter-spacing:0.3px;}
  .pied-logo{display:flex;flex-direction:column;align-items:center;gap:4px;}
  .pied-logo img{height:46px;display:block;}
  .pied-logo .nom-cie{font-size:13px;font-weight:800;color:#1b3e73;line-height:1.3;}
  .pied-logo .tagline{font-size:8.5px;font-weight:700;letter-spacing:0.8px;color:#8fa2bd;text-transform:uppercase;line-height:1.3;}
`;

export function renderCarteHtml(c: CarteData): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Carte</title>
<style>${CSS}</style></head><body>
  <div class="carte">
    <div class="entete">
      <div class="logo-novelia"><img src="${APP_PUBLIC_URL}/logo_novelia.png" alt="Novelia Assurances" /></div>
      <div class="titre">
        <div class="petit">CARTE</div>
        <div class="grand">INDIVIDUELLE ACCIDENT</div>
      </div>
      <div class="banniere">${esc(c.garantieLabel)} ${fcfa(c.garantieMontant)}</div>
    </div>
    <div class="separateur"></div>
    <div class="corps">
      <div class="photo"><img src="${c.photoDataUrl}" alt="" /></div>
      <div class="infos">
        <div class="ligne"><div class="k">Matricule</div><div class="sep">:</div><div class="v">${val(c.matricule)}</div></div>
        <div class="ligne"><div class="k">Nom</div><div class="sep">:</div><div class="v">${val(c.nom)}</div></div>
        <div class="ligne"><div class="k">Prénoms</div><div class="sep">:</div><div class="v">${val(c.prenom)}</div></div>
        <div class="ligne"><div class="k">Né(e) le</div><div class="sep">:</div><div class="v">${dfr(c.dateNaissance)}</div></div>
        <div class="ligne"><div class="k">Statut</div><div class="sep">:</div><div class="v">Assuré</div></div>
        <div class="ligne"><div class="k">Sexe</div><div class="sep">:</div><div class="v">${val(c.sexeLabel)}</div></div>
        <div class="ligne"><div class="k">Entré(e) le</div><div class="sep">:</div><div class="v">${dfr(c.dateDebut)}</div></div>
      </div>
    </div>
    <div class="pied">
      <div class="pied-sim">
        <div class="nom-cie">SIM ASSURANCES</div>
        <div class="nom-client">${val(`${c.prenom} ${c.nom}`.trim())}</div>
      </div>
      <div class="pied-logo">
        <img src="${APP_PUBLIC_URL}/logo_sim.png" alt="SIM Assurances" />
        <div class="nom-cie">SIM ASSURANCES</div>
        <div class="tagline">Société Ivoirienne de Micro-Assurances</div>
      </div>
    </div>
  </div>
</body></html>`;
}
