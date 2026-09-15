import { useParams } from "react-router-dom";
import { useFetch } from "../../useFetch";
import Simulateur from "../agent-imf/Simulateur";

interface AgentImfPublic {
  nom: string;
  prenom: string;
  agenceNom: string | null;
}

/**
 * Simulation + souscription IMF en libre-service, sans compte — accessible
 * via le lien/QR personnel d'un agent (`/imf/:token`, voir GET
 * /imf/agents/:id/qr côté admin). Réutilise à l'identique le simulateur
 * agent/admin (`Simulateur`, voir pages/agent-imf/Simulateur.tsx), pointé
 * sur les endpoints publics `${apiBase} = "/public/imf/:token"` — la
 * souscription créée est automatiquement rattachée à cet agent.
 */
export default function SimulationImfPublique() {
  const { token } = useParams<{ token: string }>();
  const { data: agent, loading, error } = useFetch<AgentImfPublic>(`/public/imf/${token}`);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f8fc" }}>
        <div className="muted">Chargement…</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f8fc", padding: 24 }}>
        <div className="card" style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>Lien invalide</h2>
          <p className="muted">
            Ce lien de simulation n'est plus valide. Demandez un nouveau lien à votre agent SIM Assurances.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)",
          color: "#fff",
          padding: "20px 24px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>SIM Assurances — IMF</div>
          <div style={{ opacity: 0.85, fontSize: 13.5, marginTop: 2 }}>
            Simulation proposée par {agent.prenom} {agent.nom}
            {agent.agenceNom ? ` — ${agent.agenceNom}` : ""}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px" }}>
        <Simulateur apiBase={`/public/imf/${token}`} />
      </div>
    </div>
  );
}
