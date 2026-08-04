// Génération HTML de la carte virtuelle de prise en charge (MCI Care /
// Atlantique Assurances / SCCONAS P/C SIM), rendue ensuite en PNG par
// Chromium headless (voir services/image.ts) — reproduit la mise en page et
// les partenaires réels du modèle physique fourni par SIM Assurances.

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://localhost:5173";

export interface CarteData {
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
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

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;}
  html,body{width:${CARTE_WIDTH}px;height:${CARTE_HEIGHT}px;overflow:hidden;}
  .carte{
    position:relative;
    width:${CARTE_WIDTH}px;height:${CARTE_HEIGHT}px;
    background:linear-gradient(135deg,#f4f6f9 0%,#f4f6f9 40%,#dce8f5 65%,#a9c8e8 100%);
    border-radius:28px;
    overflow:hidden;
    border:1px solid #d7dee6;
  }
  .bande{
    position:absolute;left:0;top:0;bottom:0;width:56px;
    background:#c81e2c;
    display:flex;align-items:center;justify-content:center;
  }
  .bande span{
    display:block;color:#fff;font-weight:800;font-size:26px;letter-spacing:6px;
    transform:rotate(-90deg);white-space:nowrap;
  }
  .contenu{position:absolute;left:56px;top:0;right:0;bottom:0;padding:26px 34px 20px;}
  .entete{display:flex;justify-content:space-between;align-items:flex-start;}
  .mci{display:flex;flex-direction:column;gap:4px;}
  .mci img{height:56px;display:block;}
  .mci .tel{font-size:13px;font-weight:700;color:#0f1b2d;}
  .atlantique{display:flex;flex-direction:column;align-items:flex-end;gap:2px;}
  .atlantique img{height:48px;display:block;}
  .atlantique span{font-size:14px;font-weight:800;letter-spacing:0.5px;color:#c07b2c;}
  .separateur{height:3px;background:#12508c;margin:14px 0 18px;border-radius:2px;}
  .corps{display:flex;gap:26px;}
  .photo{
    width:168px;height:210px;flex:none;
    border-radius:8px;overflow:hidden;
    border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.18);
    background:#e3e9f1;
  }
  .photo img{width:100%;height:100%;object-fit:cover;display:block;}
  .infos{flex:1;display:flex;flex-direction:column;gap:14px;}
  .bloc h3{
    font-size:16px;color:#c81e2c;text-decoration:underline;text-underline-offset:3px;
    margin-bottom:8px;display:flex;gap:10px;align-items:baseline;
  }
  .bloc h3 .num{font-size:15px;color:#0f1b2d;text-decoration:none;font-weight:700;}
  .ligne{display:flex;font-size:15px;margin-bottom:4px;}
  .ligne .k{width:110px;flex:none;color:#334155;font-weight:600;}
  .ligne .v{color:#0f1b2d;font-weight:700;}
  .pied{position:absolute;left:56px;right:0;bottom:16px;padding:0 34px;display:flex;justify-content:space-between;align-items:center;}
  .croix{
    width:36px;height:36px;background:#c81e2c;border-radius:8px;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 4px rgba(0,0,0,0.25);
  }
  .croix::before{content:"+";color:#fff;font-size:26px;font-weight:800;line-height:1;}
  .sigle{font-size:17px;font-weight:800;color:#0f1b2d;letter-spacing:0.3px;}
`;

export function renderCarteHtml(c: CarteData): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Carte</title>
<style>${CSS}</style></head><body>
  <div class="carte">
    <div class="bande"><span>CARTE D'ACCÈS</span></div>
    <div class="contenu">
      <div class="entete">
        <div class="mci">
          <img src="${APP_PUBLIC_URL}/logo_mci.png" alt="MCI Care" />
          <div class="tel">Tél : 20 31 65 00 / Fax : 20 31 65 64</div>
        </div>
        <div class="atlantique">
          <img src="${APP_PUBLIC_URL}/logo_atlantique_cheval.png" alt="" />
          <span>ATLANTIQUE ASSURANCES</span>
        </div>
      </div>
      <div class="separateur"></div>
      <div class="corps">
        <div class="photo"><img src="${c.photoDataUrl}" alt="" /></div>
        <div class="infos">
          <div class="bloc">
            <h3>Bénéficiaire</h3>
            <div class="ligne"><div class="k">Matricule</div><div class="v">${val(c.matricule)}</div></div>
            <div class="ligne"><div class="k">Nom</div><div class="v">${val(c.nom)}</div></div>
            <div class="ligne"><div class="k">Prénoms</div><div class="v">${val(c.prenom)}</div></div>
            <div class="ligne"><div class="k">Né(e) le</div><div class="v">${dfr(c.dateNaissance)}</div></div>
          </div>
          <div class="bloc">
            <h3>Assuré(e) <span class="num">${val(c.matricule)}</span></h3>
            <div class="ligne"><div class="k">Nom</div><div class="v">${val(c.nom)}</div></div>
            <div class="ligne"><div class="k">Prénoms</div><div class="v">${val(c.prenom)}</div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="pied">
      <div class="croix"></div>
      <div class="sigle">SCCONAS P/C SIM</div>
    </div>
  </div>
</body></html>`;
}
