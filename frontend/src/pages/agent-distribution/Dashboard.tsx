import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Flame, ShieldCheck } from "lucide-react";
import { agentDistApi, agentDistLogout, getAgentDistUser } from "../../agentDistributionAuth";

function fcfa(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR");
}

interface Moi {
  id: string;
  nom: string;
  telephone: string;
  localisation: string | null;
  statut: "actif" | "inactif";
  partenaireNom: string;
  produit: "incendie" | "accident";
}

interface Qr {
  produit: string;
  token: string;
  dataUrl: string;
}

interface Souscription {
  id: string;
  produit: "incendie" | "accident";
  nom: string | null;
  prenom: string | null;
  telephone: string;
  montantPrime: number;
  statut: string;
  createdAt: string;
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  marginBottom: 20,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  border: "1px solid #dde3ec",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  color: "#0f1b2d",
};

export default function AgentDistributionDashboard() {
  const navigate = useNavigate();
  const [moi, setMoi] = useState<Moi | null>(null);
  const [qrIncendie1000, setQrIncendie1000] = useState<Qr | null>(null);
  const [qrIncendie2000, setQrIncendie2000] = useState<Qr | null>(null);
  const [qrAccident, setQrAccident] = useState<Qr | null>(null);
  const [souscriptions, setSouscriptions] = useState<Souscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState("");

  const [ancienMotDePasse, setAncienMotDePasse] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [changement, setChangement] = useState(false);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => {
    if (!getAgentDistUser()) {
      navigate("/agent-distribution/connexion");
      return;
    }
    (async () => {
      try {
        const m = await agentDistApi.get<Moi>("/moi");
        setMoi(m);
        const s = await agentDistApi.get<{ incendie: Souscription[]; accident: Souscription[] }>("/souscriptions");
        setSouscriptions([...s.incendie, ...s.accident].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        if (m.produit === "incendie") {
          const [q1, q2] = await Promise.all([
            agentDistApi.get<Qr>("/qr/incendie1000"),
            agentDistApi.get<Qr>("/qr/incendie2000"),
          ]);
          setQrIncendie1000(q1);
          setQrIncendie2000(q2);
        } else {
          setQrAccident(await agentDistApi.get<Qr>("/qr/accident"));
        }
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    setChangement(true);
    try {
      await agentDistApi.patch("/mot-de-passe", { ancienMotDePasse, nouveauMotDePasse });
      notify("Mot de passe modifié ✓");
      setAncienMotDePasse("");
      setNouveauMotDePasse("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    } finally {
      setChangement(false);
    }
  }

  function deconnexion() {
    agentDistLogout();
    navigate("/agent-distribution/connexion");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)", padding: "24px 20px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 560, margin: "0 auto" }}>
          <div>
            <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 36, display: "block", marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>Bonjour {moi?.nom ?? ""}</div>
            {moi && <div style={{ fontSize: 12, opacity: 0.8 }}>Agent de {moi.partenaireNom}</div>}
          </div>
          <button onClick={deconnexion} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "8px 14px", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#5b6b80" }}>Chargement…</div>}
        {erreur && <div style={{ color: "#dc2626", textAlign: "center", padding: 20 }}>{erreur}</div>}

        {moi && (
          <>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Mon/mes QR code(s)</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
                {moi.produit === "incendie" ? (
                  <>
                    {qrIncendie1000 && (
                      <div style={{ textAlign: "center" }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6, color: "#5b6b80" }}>Jusqu'à 250 000 FCFA</div>
                        <img src={qrIncendie1000.dataUrl} alt="QR" style={{ width: 150, height: 150, border: "1px solid #eee", borderRadius: 10, padding: 6 }} />
                        <a className="btn" style={{ display: "block", marginTop: 8, fontSize: 12 }} href={qrIncendie1000.dataUrl} download="qr-incendie1000.png">
                          <Download size={13} style={{ verticalAlign: -2 }} /> Télécharger
                        </a>
                      </div>
                    )}
                    {qrIncendie2000 && (
                      <div style={{ textAlign: "center" }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6, color: "#5b6b80" }}>Au-dessus de 250 000 FCFA</div>
                        <img src={qrIncendie2000.dataUrl} alt="QR" style={{ width: 150, height: 150, border: "1px solid #eee", borderRadius: 10, padding: 6 }} />
                        <a className="btn" style={{ display: "block", marginTop: 8, fontSize: 12 }} href={qrIncendie2000.dataUrl} download="qr-incendie2000.png">
                          <Download size={13} style={{ verticalAlign: -2 }} /> Télécharger
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  qrAccident && (
                    <div style={{ textAlign: "center" }}>
                      <img src={qrAccident.dataUrl} alt="QR" style={{ width: 170, height: 170, border: "1px solid #eee", borderRadius: 10, padding: 6 }} />
                      <a className="btn" style={{ display: "block", marginTop: 8, fontSize: 12 }} href={qrAccident.dataUrl} download="qr-accident.png">
                        <Download size={13} style={{ verticalAlign: -2 }} /> Télécharger
                      </a>
                    </div>
                  )
                )}
              </div>
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Mes souscriptions ({souscriptions.length})</div>
              {souscriptions.length === 0 ? (
                <div style={{ color: "#5b6b80", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
                  Aucune souscription pour l'instant.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {souscriptions.map((s) => (
                    <div key={s.id} style={{ background: "#f5f8fc", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                        <span>
                          {s.produit === "incendie" ? <Flame size={13} style={{ verticalAlign: -2 }} /> : <ShieldCheck size={13} style={{ verticalAlign: -2 }} />}
                          {" "}{s.prenom ?? ""} {s.nom ?? ""}
                        </span>
                        <span>{fcfa(s.montantPrime)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#5b6b80", marginTop: 2 }}>
                        {s.telephone} · {fmtDate(s.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Changer mon mot de passe</div>
              <form onSubmit={changerMotDePasse}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
                    Mot de passe actuel
                  </label>
                  <input type="password" value={ancienMotDePasse} onChange={(e) => setAncienMotDePasse(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
                    Nouveau mot de passe (6 caractères minimum)
                  </label>
                  <input type="password" value={nouveauMotDePasse} onChange={(e) => setNouveauMotDePasse(e.target.value)} style={inputStyle} />
                </div>
                <button
                  disabled={changement || !ancienMotDePasse || nouveauMotDePasse.length < 6}
                  style={{
                    width: "100%", padding: "12px 0", background: "#004b9c", color: "#fff",
                    border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                    opacity: changement || !ancienMotDePasse || nouveauMotDePasse.length < 6 ? 0.5 : 1,
                  }}
                >
                  {changement ? "Modification…" : "Modifier le mot de passe"}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#0f1b2d", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
