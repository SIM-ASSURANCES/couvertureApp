import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../../api";

const BASE = API_BASE;

function fcfa(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

interface Souscription {
  id: string;
  nom: string | null;
  prenom: string | null;
  telephone: string;
  email: string | null;
  refFacture: string | null;
  commune: string | null;
  quartier: string | null;
  numeroMaison: string | null;
  montant: number;
  capitalGaranti: number;
  statut: string;
  partenaire: string;
  numeroPolice: string;
  dateDebut: string;
  dateFin: string;
}

type Step = "loading" | "form" | "success" | "error";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d4ddea",
  fontSize: 15,
  outline: "none",
};

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function genererContrat(s: Souscription) {
  const debut = new Date(s.dateDebut);
  const fin = new Date(s.dateFin);
  const d = (x: Date) => x.toLocaleDateString("fr-FR");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Contrat ${s.numeroPolice}</title>
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
    <div class="pol">N° de police<b>${s.numeroPolice}</b></div>
  </div>
  <h1>Contrat d'Assurance Incendie</h1>
  <div class="sub">Distribué via ${s.partenaire}</div>
  <div class="box" style="margin-bottom:24px"><div class="l">Capital garanti</div><div class="v">${fcfa(s.capitalGaranti)}</div></div>
  <table>
    <tr><td class="k">Assuré(e)</td><td>${s.prenom ?? ""} ${s.nom ?? ""}</td></tr>
    <tr><td class="k">Téléphone</td><td>${s.telephone}</td></tr>
    ${s.refFacture ? `<tr><td class="k">Réf. facture</td><td>${s.refFacture}</td></tr>` : ""}
    ${s.commune ? `<tr><td class="k">Commune</td><td>${s.commune}</td></tr>` : ""}
    ${s.quartier ? `<tr><td class="k">Quartier</td><td>${s.quartier}</td></tr>` : ""}
    ${s.numeroMaison ? `<tr><td class="k">N° de maison</td><td>${s.numeroMaison}</td></tr>` : ""}
    <tr><td class="k">Date d'effet</td><td>${d(debut)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${d(fin)}</td></tr>
    <tr><td class="k">Durée</td><td>12 mois</td></tr>
  </table>
  <div class="note">Ce contrat atteste de la souscription d'une assurance incendie d'une durée de douze (12) mois,
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

export default function SouscriptionComplement() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>("loading");
  const [data, setData] = useState<Souscription | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [refFacture, setRefFacture] = useState("");
  const [commune, setCommune] = useState("");
  const [quartier, setQuartier] = useState("");
  const [numeroMaison, setNumeroMaison] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setErrorMsg("Lien invalide.");
      setStep("error");
      return;
    }
    fetch(`${BASE}/public/souscriptions/incendie/${token}`)
      .then((r) => r.json())
      .then((d: Souscription & { error?: string }) => {
        if (d.error) {
          setErrorMsg("Lien invalide ou expiré.");
          setStep("error");
          return;
        }
        setData(d);
        setNom(d.nom ?? "");
        setPrenom(d.prenom ?? "");
        setRefFacture(d.refFacture ?? "");
        setCommune(d.commune ?? "");
        setQuartier(d.quartier ?? "");
        setNumeroMaison(d.numeroMaison ?? "");
        // Déjà complété → directement la page de contrat
        setStep(d.statut === "complet" && d.refFacture ? "success" : "form");
      })
      .catch(() => {
        setErrorMsg("Impossible de charger votre souscription.");
        setStep("error");
      });
  }, [token]);

  async function handleSubmit() {
    if (!refFacture.trim() || !commune.trim() || !quartier.trim() || !numeroMaison.trim()) {
      setErrorMsg("Réf.facture, commune, quartier et numéro de maison sont obligatoires.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${BASE}/public/souscriptions/incendie/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          prenom,
          refFacture: refFacture.trim(),
          commune: commune.trim(),
          quartier: quartier.trim(),
          numeroMaison: numeroMaison.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur lors de la validation");
      setData((prev) =>
        prev
          ? {
              ...prev,
              nom,
              prenom,
              refFacture: refFacture.trim(),
              commune: commune.trim(),
              quartier: quartier.trim(),
              numeroMaison: numeroMaison.trim(),
              statut: "complet",
            }
          : prev
      );
      setStep("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f8fc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "'Montserrat', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)",
            padding: "28px 32px 24px",
            color: "#fff",
          }}
        >
          <img
            src="/logo_sim.webp"
            alt="SIM Assurances"
            style={{ height: 48, marginBottom: 16, display: "block" }}
          />
          <div style={{ fontSize: 18, fontWeight: 800 }}>Assurance Incendie</div>
          {data && (
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
              via {data.partenaire}
            </div>
          )}
        </div>

        <div style={{ padding: "28px 32px" }}>
          {step === "loading" && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#5b6b80" }}>
              Chargement…
            </div>
          )}

          {step === "error" && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Une erreur est survenue</div>
              <div style={{ color: "#5b6b80", fontSize: 14 }}>{errorMsg}</div>
            </div>
          )}

          {step === "form" && data && (
            <>
              <div
                style={{
                  background: "#e6f1fb",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 22,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 13, color: "#5b6b80" }}>Capital garanti</div>
                <div style={{ fontWeight: 800, color: "#004b9c", fontSize: 15 }}>
                  {fcfa(data.capitalGaranti)}
                </div>
              </div>

              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>
                Finalisez votre souscription
              </div>
              <div style={{ color: "#5b6b80", fontSize: 13, marginBottom: 18 }}>
                Renseignez votre numéro de facture pour activer votre contrat.
              </div>

              <FieldRow label="Prénom">
                <input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Votre prénom"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Nom">
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Votre nom"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Réf. facture *">
                <input
                  value={refFacture}
                  onChange={(e) => setRefFacture(e.target.value)}
                  placeholder="Ex. FAC-2026-0001"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Commune *">
                <input
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  placeholder="Ex. Cocody"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Quartier *">
                <input
                  value={quartier}
                  onChange={(e) => setQuartier(e.target.value)}
                  placeholder="Ex. Angré"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="N° de maison *">
                <input
                  value={numeroMaison}
                  onChange={(e) => setNumeroMaison(e.target.value)}
                  placeholder="Ex. Ilot 12, lot 34"
                  style={inputStyle}
                />
              </FieldRow>

              {errorMsg && (
                <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 12,
                  border: "none",
                  background: submitting ? "#7da6d6" : "#004b9c",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: submitting ? "default" : "pointer",
                  marginTop: 6,
                }}
              >
                {submitting ? "Validation…" : "Valider et obtenir mon contrat"}
              </button>
            </>
          )}

          {step === "success" && data && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
                Souscription confirmée
              </div>
              <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                Votre Assurance Incendie est active.
                <br />
                N° de police : <strong>{data.numeroPolice}</strong>
              </div>

              <div
                style={{
                  background: "#f5f8fc",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 22,
                  textAlign: "left",
                  fontSize: 14,
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <strong>Capital garanti :</strong> {fcfa(data.capitalGaranti)}
                </div>
                <div>
                  <strong>Assuré(e) :</strong> {data.prenom} {data.nom}
                </div>
              </div>

              <button
                onClick={() => genererContrat(data)}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#004b9c",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                Télécharger mon contrat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
