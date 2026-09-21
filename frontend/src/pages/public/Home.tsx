import { useNavigate } from "react-router-dom";

// Token du QR "unique" du partenaire virtuel "Souscription directe" (voir
// backend/src/seed.ts::seedPartenaireSouscriptionDirecte) — permet de
// souscrire à un produit Assurances Accidents/Dommages sans intermédiaire
// humain, en réutilisant tel quel le parcours existant (chooser Accidents/
// Dommages → liste des produits → formulaire). Le fallback littéral DOIT
// rester synchronisé avec TOKEN_QR_DIRECT côté backend.
const DIRECT_QR_TOKEN = import.meta.env.VITE_DIRECT_QR_TOKEN ?? "app-mobile-direct";

// Écran d'accueil de l'app mobile (Capacitor uniquement, voir AppMobile.tsx)
// : point d'entrée entre souscrire à un nouveau produit (public, sans
// compte) et se connecter à son espace client existant (renouvellement,
// souscrire à un autre produit — comme sur le site web).
export default function Home() {
  const navigate = useNavigate();

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
          <div style={{ fontSize: 18, fontWeight: 800 }}>Bienvenue</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Assurances Accidents &amp; Dommages</div>
        </div>
        <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          <button
            onClick={() => navigate(`/souscription/${DIRECT_QR_TOKEN}`)}
            style={{
              width: "100%",
              padding: "16px 0",
              background: "#004b9c",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Souscrire à un produit
          </button>
          <button
            onClick={() => navigate("/client/connexion")}
            style={{
              width: "100%",
              padding: "16px 0",
              background: "#fff",
              color: "#004b9c",
              border: "1.5px solid #004b9c",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Mon espace client
          </button>
          <div style={{ fontSize: 12, color: "#5b6b80", textAlign: "center", marginTop: 4 }}>
            Déjà client ? Connectez-vous pour renouveler ou souscrire à un autre produit.
          </div>
        </div>
      </div>
    </div>
  );
}
