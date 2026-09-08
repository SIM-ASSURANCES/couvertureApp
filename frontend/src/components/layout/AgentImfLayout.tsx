import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { WifiOff } from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { agentImfNav } from "./nav";
import { useAuth } from "../../auth";
import { useOnline } from "../../offline/useOnline";
import { syncPendingQueue } from "../../offline/sync";

export default function AgentImfLayout() {
  const { user } = useAuth();
  const online = useOnline();
  const eteintHorsLigne = useRef(false);

  // Dès que la connexion revient après une coupure, on tente de vider la file
  // hors-ligne automatiquement, quelle que soit la page consultée.
  useEffect(() => {
    if (!online) {
      eteintHorsLigne.current = true;
    } else if (eteintHorsLigne.current) {
      eteintHorsLigne.current = false;
      syncPendingQueue();
    }
  }, [online]);

  return (
    <DashboardLayout
      nav={agentImfNav(user?.roleImf)}
      userName={user?.nom ?? "Agent"}
      userMail={user?.email ?? ""}
      homeTo="/agent-imf"
    >
      {user?.imfId && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            borderRadius: 10,
            background: user.imfCouleurPrimaire ? `${user.imfCouleurPrimaire}14` : "var(--sim-primary-50, #eef2ff)",
            borderLeft: `3px solid ${user.imfCouleurPrimaire || "var(--sim-primary, #004b9c)"}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
          }}
        >
          {user.imfLogoUrl && <img src={user.imfLogoUrl} alt="" style={{ height: 24, width: "auto", borderRadius: 4 }} />}
          <span>
            Espace <strong>{user.imfNom}</strong> — vos données sont limitées à cette IMF.
          </span>
        </div>
      )}
      {!online && (
        <div style={{ marginBottom: 16, padding: "8px 14px", borderRadius: 10, background: "rgba(245,158,11,0.12)", color: "#b45309", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <WifiOff size={16} /> Vous êtes hors-ligne — le simulateur reste utilisable, les nouvelles souscriptions seront synchronisées à la reconnexion.
        </div>
      )}
      <Outlet />
    </DashboardLayout>
  );
}
