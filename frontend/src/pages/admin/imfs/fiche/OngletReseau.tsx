import { useState } from "react";
import { ZonesInner } from "../../imf/Zones";
import { AgencesInner } from "../../imf/Agences";
import { AgentsInner } from "../../imf/Agents";

type SousOnglet = "zones" | "agences" | "agents";

const SOUS_ONGLETS: { id: SousOnglet; label: string }[] = [
  { id: "zones", label: "Zones" },
  { id: "agences", label: "Agences" },
  { id: "agents", label: "Agents" },
];

/**
 * Onglet « Réseau » de la fiche IMF (phase 3a) — réplique des écrans
 * Zones / Agences / Agents de la branche « Assurances IMF », scopés sur cette
 * IMF via l'API /imf-partenaires/:id/reseau.
 */
export default function OngletReseau({ imfId }: { imfId: string }) {
  const [sous, setSous] = useState<SousOnglet>("zones");
  const apiBase = `/imf-partenaires/${imfId}/reseau`;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {SOUS_ONGLETS.map((o) => (
          <button
            key={o.id}
            className={o.id === sous ? "btn btn-primary" : "btn btn-ghost"}
            style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => setSous(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {sous === "zones" && <ZonesInner apiBase={apiBase} branche="IMF_PARTENAIRES" header={false} />}
      {sous === "agences" && <AgencesInner apiBase={apiBase} branche="IMF_PARTENAIRES" header={false} />}
      {sous === "agents" && (
        <AgentsInner apiBase={apiBase} branche="IMF_PARTENAIRES" header={false} showQr={false} />
      )}
    </div>
  );
}
