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
  .contenu{
    position:absolute;left:56px;top:0;right:0;bottom:0;padding:24px 40px 22px;
    display:flex;flex-direction:column;
  }
  .entete{display:flex;justify-content:space-between;align-items:flex-start;}
  .mci{display:flex;flex-direction:column;gap:4px;}
  .mci img{height:56px;display:block;}
  .mci .tel{font-size:13px;font-weight:700;color:#0f1b2d;}
  .atlantique{display:flex;flex-direction:column;align-items:flex-end;gap:2px;}
  .atlantique img{height:48px;display:block;}
  .atlantique span{font-size:14px;font-weight:800;letter-spacing:0.5px;color:#c07b2c;}
  .separateur{height:3px;background:#12508c;margin:16px 0 0;border-radius:2px;}
  .corps{display:flex;gap:48px;align-items:center;flex:1;}
  .photo{
    width:280px;height:350px;flex:none;
    border-radius:12px;overflow:hidden;
    border:4px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,0.2);
    background:#e3e9f1;
  }
  .photo img{width:100%;height:100%;object-fit:cover;display:block;}
  .infos{flex:1;display:flex;flex-direction:column;justify-content:center;gap:40px;}
  .bloc h3{
    font-size:26px;color:#c81e2c;text-decoration:underline;text-underline-offset:4px;
    margin-bottom:16px;display:flex;gap:14px;align-items:baseline;
  }
  .bloc h3 .num{font-size:23px;color:#0f1b2d;text-decoration:none;font-weight:700;}
  .ligne{display:flex;font-size:22px;margin-bottom:11px;}
  .ligne .k{width:170px;flex:none;color:#334155;font-weight:600;}
  .ligne .v{color:#0f1b2d;font-weight:700;}
  .pied{position:absolute;left:56px;right:0;bottom:18px;padding:0 40px;display:flex;justify-content:space-between;align-items:center;}
  .croix{
    width:42px;height:42px;background:#c81e2c;border-radius:10px;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 4px rgba(0,0,0,0.25);
  }
  .croix::before{content:"+";color:#fff;font-size:30px;font-weight:800;line-height:1;}
  .sigle{font-size:20px;font-weight:800;color:#0f1b2d;letter-spacing:0.3px;}
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
