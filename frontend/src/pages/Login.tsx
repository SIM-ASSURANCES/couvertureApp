import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Store } from "lucide-react";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<"admin" | "partenaire">("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchType(t: "admin" | "partenaire") {
    setType(t);
    setError("");
    setEmail("");
    setPassword("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(type, email, password);
      navigate(type === "admin" ? "/admin" : "/partenaire");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-layout">

      {/* ── Panneau gauche ── */}
      <div className="login-left">

        {/* Motif diamants géométriques */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 640 960"
          preserveAspectRatio="xMidYMid slice"
        >
          <polygon points="580,40 720,180 580,320 440,180" fill="rgba(255,255,255,0.06)" />
          <polygon points="600,60 710,170 600,280 490,170" fill="rgba(255,255,255,0.04)" />
          <polygon points="-40,350 120,510 -40,670 -200,510" fill="rgba(255,255,255,0.05)" />
          <polygon points="220,260 440,480 220,700 0,480" fill="rgba(255,255,255,0.04)" />
          <polygon points="260,300 440,480 260,660 80,480" fill="rgba(81,174,226,0.06)" />
          <polygon points="440,680 640,880 440,1080 240,880" fill="rgba(255,255,255,0.05)" />
          <polygon points="460,700 620,860 460,1020 300,860" fill="rgba(81,174,226,0.07)" />
          <polygon points="60,60 180,180 60,300 -60,180" fill="rgba(255,255,255,0.04)" />
        </svg>

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 64, objectFit: "contain" }} />
        </div>

        {/* Accroche centrale */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{
            color: "#fff",
            fontSize: 42,
            fontWeight: 800,
            lineHeight: 1.2,
            margin: 0,
            marginBottom: 20,
          }}>
            Gestion des<br />
            <span style={{ color: "#51aee2" }}>Souscriptions</span><br />
            par QR Code
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: 360,
            margin: 0,
          }}>
            Plateforme de micro-assurance Incendie &amp; Accident
            pour les partenaires de SIM Assurances CI.
          </p>
        </div>

        {/* Pied de page gauche */}
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, position: "relative", zIndex: 1 }}>
          © 2026 SIM Assurances CI — Tous droits réservés
        </div>
      </div>

      {/* ── Panneau droit ── */}
      <div className="login-right">

        <div style={{
          width: "100%",
          maxWidth: 420,
        }}>
          {/* Carte */}
          <div style={{
            background: "#fff",
            borderRadius: 16,
            padding: "40px 40px 36px",
            boxShadow: "0 4px 32px rgba(0,0,0,.07)",
          }}>
            <h2 style={{
              color: "#004b9c",
              fontWeight: 800,
              fontSize: 24,
              margin: 0,
              marginBottom: 4,
            }}>
              Connexion
            </h2>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px" }}>
              {type === "admin"
                ? "Accès réservé aux administrateurs"
                : "Espace dédié aux partenaires"}
            </p>

            {/* Onglets Admin / Partenaire */}
            <div style={{
              display: "flex",
              background: "#f3f6fb",
              borderRadius: 10,
              padding: 4,
              marginBottom: 24,
              gap: 4,
            }}>
              {(["admin", "partenaire"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    padding: "9px 0",
                    borderRadius: 7,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "Montserrat, sans-serif",
                    transition: "all .18s",
                    background: type === t ? "#004b9c" : "transparent",
                    color: type === t ? "#fff" : "#6b7280",
                    boxShadow: type === t ? "0 2px 8px rgba(0,75,156,.25)" : "none",
                  }}
                >
                  {t === "admin" ? <ShieldCheck size={15} /> : <Store size={15} />}
                  {t === "admin" ? "Administrateur" : "Partenaire"}
                </button>
              ))}
            </div>

            <form onSubmit={submit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 6,
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Votre email"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: "Montserrat, sans-serif",
                    outline: "none",
                    boxSizing: "border-box",
                    color: "#111827",
                    transition: "border-color .15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#004b9c")}
                  onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>

              <div style={{ marginBottom: error ? 14 : 24 }}>
                <label style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 6,
                }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: "Montserrat, sans-serif",
                    outline: "none",
                    boxSizing: "border-box",
                    color: "#111827",
                    transition: "border-color .15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#004b9c")}
                  onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>

              {error && (
                <div style={{
                  background: "#fef2f2",
                  color: "#dc2626",
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 16,
                  borderLeft: "3px solid #dc2626",
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  background: loading ? "#6b9fd4" : "#004b9c",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "Montserrat, sans-serif",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background .2s",
                  letterSpacing: ".02em",
                }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.background = "#003a7a"); }}
                onMouseLeave={(e) => { if (!loading) (e.currentTarget.style.background = "#004b9c"); }}
              >
                {loading ? "Connexion en cours…" : "Se connecter"}
              </button>
            </form>
          </div>

          {/* Note bas de page */}
          <p style={{
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 12,
            marginTop: 20,
          }}>
            QRApp v1.0 — SIM Assurances CI
          </p>
        </div>
      </div>
    </div>
  );
}
