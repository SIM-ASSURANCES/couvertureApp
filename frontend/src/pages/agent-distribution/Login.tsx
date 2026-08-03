import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { agentDistLogin } from "../../agentDistributionAuth";

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

export default function AgentDistributionLogin() {
  const navigate = useNavigate();
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChargement(true);
    setErreur("");
    try {
      await agentDistLogin(telephone.replace(/\s/g, ""), motDePasse);
      navigate("/agent-distribution");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setChargement(false);
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
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
        <div style={{ background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)", padding: "28px 32px 24px", color: "#fff" }}>
          <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 48, marginBottom: 16, display: "block" }} />
          <div style={{ fontSize: 18, fontWeight: 800 }}>Espace agent</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Incendie / Accident</div>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "28px 32px" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
              Téléphone
            </label>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="07 00 00 00 00"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
              Mot de passe
            </label>
            <input
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              type="password"
              style={inputStyle}
            />
          </div>
          {erreur && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 14 }}>{erreur}</div>
          )}
          <button
            disabled={chargement || !telephone || !motDePasse}
            style={{
              width: "100%",
              padding: "13px 0",
              background: "#004b9c",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              opacity: chargement || !telephone || !motDePasse ? 0.5 : 1,
            }}
          >
            {chargement ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
