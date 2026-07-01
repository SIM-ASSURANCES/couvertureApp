import { useState } from "react";
import { Download, FileText, Flame, ShieldCheck, Eye, X } from "lucide-react";
import {
  PageHeader,
  Card,
  Loader,
  ErrorBox,
  Badge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";

interface Contrat {
  id: string;
  type: "incendie" | "accident";
  numeroPolice: string;
  nom: string;
  prenom: string;
  telephone: string;
  montant: number;
  capitalGaranti: number;
  partenaire: string;
  dateDebut: string | null;
  dateFin: string | null;
  date: string;
  refFacture?: string | null;
}

function genererContrat(c: Contrat) {
  const debut = c.dateDebut ? new Date(c.dateDebut) : new Date(c.date);
  const fin = c.dateFin
    ? new Date(c.dateFin)
    : new Date(
        new Date(debut).setMonth(
          debut.getMonth() + (c.type === "accident" ? 3 : 12)
        )
      );
  const d = (x: Date) => x.toLocaleDateString("fr-FR");
  const duree = c.type === "accident" ? "3 mois" : "12 mois";
  const titre =
    c.type === "accident"
      ? "Contrat d'Assurance Accident"
      : "Contrat d'Assurance Incendie";

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Contrat ${c.numeroPolice}</title>
<style>
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
  body{margin:0;color:#0f1b2d;padding:40px;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #004b9c;padding-bottom:16px;margin-bottom:24px;}
  .brand img{height:56px;display:block;}
  .pol{text-align:right;font-size:13px;color:#5b6b80;}
  .pol b{display:block;font-size:18px;color:#0f1b2d;letter-spacing:1px;}
  h1{font-size:20px;margin:0 0 6px;}
  .sub{color:#5b6b80;font-size:13px;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;}
  td{padding:10px 12px;border:1px solid #e3e9f1;font-size:14px;}
  td.k{background:#f5f8fc;font-weight:600;width:42%;color:#5b6b80;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px;}
  .box{border:1px solid #e3e9f1;border-radius:10px;padding:14px 16px;}
  .box .l{font-size:11px;color:#5b6b80;text-transform:uppercase;letter-spacing:.05em;}
  .box .v{font-size:17px;font-weight:800;margin-top:4px;}
  .note{font-size:12px;color:#5b6b80;border-top:1px solid #e3e9f1;padding-top:16px;margin-top:24px;}
  .sign{display:flex;justify-content:space-between;margin-top:48px;font-size:13px;color:#5b6b80;}
  @media print{body{padding:24px;}}
</style></head><body>
  <div class="head">
    <div class="brand"><img src="${window.location.origin}/logo.webp" alt="SIM Assurances" /></div>
    <div class="pol">N° de police<b>${c.numeroPolice}</b></div>
  </div>
  <h1>${titre}</h1>
  <div class="sub">Distribué via ${c.partenaire}</div>
  ${
    c.type === "accident"
      ? `<div class="grid">
    <div class="box"><div class="l">Prime</div><div class="v">${fcfa(c.montant)}</div></div>
    <div class="box"><div class="l">Frais de soins médicaux</div><div class="v">${fcfa(c.capitalGaranti)}</div></div>
  </div>`
      : `<div class="box" style="margin-bottom:24px"><div class="l">Capital garanti</div><div class="v">${fcfa(c.capitalGaranti)}</div></div>`
  }
  <table>
    <tr><td class="k">Assuré(e)</td><td>${c.prenom} ${c.nom}</td></tr>
    <tr><td class="k">Téléphone</td><td>${c.telephone}</td></tr>
    ${c.refFacture ? `<tr><td class="k">Réf. facture</td><td>${c.refFacture}</td></tr>` : ""}
    <tr><td class="k">Date d'effet</td><td>${d(debut)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${d(fin)}</td></tr>
    <tr><td class="k">Durée</td><td>${duree}</td></tr>
  </table>
  <div class="note">Ce contrat atteste de la souscription d'une assurance ${c.type === "accident" ? "accident" : "incendie"} d'une durée de ${duree},
  prenant effet le ${d(debut)} et arrivant à échéance le ${d(fin)}. La garantie est acquise sous réserve du
  paiement effectif de la prime. Document généré électroniquement par SIM Assurances CI.</div>
  <div class="sign"><div>Fait à Abidjan, le ${d(new Date())}</div><div>Pour SIM Assurances CI</div></div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export default function Contrats() {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Contrat | null>(null);
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q) params.set("q", q);

  const { data, loading, error } = useFetch<Contrat[]>(
    `/souscriptions/contrats?${params.toString()}`
  );

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Polices émises : assurances incendie complètes et accident confirmées."
      />

      <Card
        title={data ? `${data.length} contrats` : "Contrats"}
        extra={
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="select"
              style={{ width: 220, height: 40 }}
              placeholder="Rechercher (nom, police, tél.)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="select"
              style={{ width: 160, height: 40 }}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Tous produits</option>
              <option value="incendie">Incendie</option>
              <option value="accident">Accident</option>
            </select>
          </div>
        }
        noBody
      >
        {loading && <Loader />}
        {error && (
          <div style={{ padding: 20 }}>
            <ErrorBox message={error} />
          </div>
        )}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>N° police</th>
                  <th>Assuré</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Capital garanti</th>
                  <th>Échéance</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={`${c.type}-${c.id}`}>
                    <td>
                      {c.type === "accident" ? (
                        <Badge kind="info">
                          <ShieldCheck size={13} /> Accident
                        </Badge>
                      ) : (
                        <Badge kind="warning">
                          <Flame size={13} /> Incendie
                        </Badge>
                      )}
                    </td>
                    <td>
                      <strong>{c.numeroPolice}</strong>
                    </td>
                    <td>
                      {c.prenom} {c.nom}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.telephone}
                      </div>
                    </td>
                    <td>{c.partenaire}</td>
                    <td>
                      <strong>{fcfa(c.montant)}</strong>
                    </td>
                    <td className="muted">{fcfa(c.capitalGaranti)}</td>
                    <td className="muted">
                      {c.dateFin ? fmtDate(c.dateFin) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Voir les détails"
                          onClick={() => setDetail(c)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Télécharger le contrat"
                          onClick={() => genererContrat(c)}
                        >
                          <Download size={15} /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty">
                        <FileText size={28} />
                        <div>Aucun contrat émis pour le moment.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,27,45,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card, #fff)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {detail.type === "accident" ? (
                  <Badge kind="info">
                    <ShieldCheck size={13} /> Accident
                  </Badge>
                ) : (
                  <Badge kind="warning">
                    <Flame size={13} /> Incendie
                  </Badge>
                )}
                <strong style={{ fontSize: 16 }}>{detail.numeroPolice}</strong>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: "6px 8px" }}
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <div className="grid-2" style={{ gap: 12, marginBottom: 18 }}>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>
                    Prime
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{fcfa(detail.montant)}</div>
                </div>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>
                    Capital garanti
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {fcfa(detail.capitalGaranti)}
                  </div>
                </div>
              </div>

              <table className="tbl" style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td className="muted" style={{ width: "42%" }}>Assuré(e)</td>
                    <td><strong>{detail.prenom} {detail.nom}</strong></td>
                  </tr>
                  <tr>
                    <td className="muted">Téléphone</td>
                    <td>{detail.telephone}</td>
                  </tr>
                  <tr>
                    <td className="muted">Partenaire</td>
                    <td>{detail.partenaire}</td>
                  </tr>
                  {detail.refFacture && (
                    <tr>
                      <td className="muted">Réf. facture</td>
                      <td>{detail.refFacture}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="muted">Date d'effet</td>
                    <td>{detail.dateDebut ? fmtDate(detail.dateDebut) : "—"}</td>
                  </tr>
                  <tr>
                    <td className="muted">Date d'échéance</td>
                    <td>{detail.dateFin ? fmtDate(detail.dateFin) : "—"}</td>
                  </tr>
                  <tr>
                    <td className="muted">Souscrit le</td>
                    <td>{fmtDate(detail.date)}</td>
                  </tr>
                </tbody>
              </table>

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                onClick={() => genererContrat(detail)}
              >
                <Download size={16} /> Télécharger le contrat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
