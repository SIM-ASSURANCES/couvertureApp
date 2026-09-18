import { Link } from "react-router-dom";

export default function Login() {
  return (
    <div className="login-layout">

      {/* ── Panneau gauche ── */}
      <div className="login-left">
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

        <div style={{ position: "relative", zIndex: 1 }}>
          <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 64, objectFit: "contain" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{ color: "#fff", fontSize: 42, fontWeight: 800, lineHeight: 1.2, margin: 0, marginBottom: 20 }}>
            Gestion des<br />
            <span style={{ color: "#51aee2" }}>Souscriptions</span><br />
            par QR Code
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, lineHeight: 1.6, maxWidth: 360, margin: 0 }}>
            Plateforme de micro-assurance Incendie &amp; Accident
            pour les partenaires de SIM Assurances CI.
          </p>
        </div>

        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, position: "relative", zIndex: 1 }}>
          © 2026 SIM Assurances CI — Tous droits réservés
        </div>
      </div>

      {/* ── Panneau droit : choix de l'espace ── */}
      <div className="login-right">
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{
            background: "#fff",
            borderRadius: 16,
            padding: "40px 40px 36px",
            boxShadow: "0 4px 32px rgba(0,0,0,.07)",
          }}>
            <h2 style={{ color: "#004b9c", fontWeight: 800, fontSize: 24, margin: 0, marginBottom: 4 }}>
              Connexion
            </h2>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 28px" }}>
              Choisissez votre espace pour continuer.
            </p>

            <Link
              to="/admin/connexion"
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "16px 18px",
                marginBottom: 14,
                background: "#004b9c",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "Montserrat, sans-serif",
                textDecoration: "none",
                textAlign: "center",
                letterSpacing: ".02em",
              }}
            >
              Administration
            </Link>

            <Link
              to="/partenaire/connexion"
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "16px 18px",
                background: "#fff",
                color: "#004b9c",
                border: "1.5px solid #004b9c",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "Montserrat, sans-serif",
                textDecoration: "none",
                textAlign: "center",
                letterSpacing: ".02em",
              }}
            >
              Partenaire
            </Link>
          </div>

          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, marginTop: 20 }}>
            QRApp v1.0 — SIM Assurances CI
          </p>
        </div>
      </div>
    </div>
  );
}
