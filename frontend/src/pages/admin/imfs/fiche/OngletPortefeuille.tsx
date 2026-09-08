import { useState } from "react";
import { ContratsInner } from "../../imf/Contrats";
import { SinistresInner } from "../../imf/Sinistres";
import { BordereauxInner } from "../../imf/Bordereaux";

type SousOnglet = "contrats" | "sinistres" | "bordereaux";

const SOUS_ONGLETS: { id: SousOnglet; label: string }[] = [
  { id: "contrats", label: "Contrats" },
  { id: "sinistres", label: "Sinistres" },
  { id: "bordereaux", label: "Bordereaux" },
];

/**
 * Onglet « Portefeuille » de la fiche IMF (phase 3c) — réplique des écrans
 * Contrats / Sinistres / Bordereaux de la branche « Assurances IMF », scopés
 * sur cette IMF via l'API /imf-partenaires/:id/reseau.
 */
export default function OngletPortefeuille({ imfId }: { imfId: string }) {
  const [sous, setSous] = useState<SousOnglet>("contrats");
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

      {sous === "contrats" && <ContratsInner apiBase={apiBase} branche="IMF_PARTENAIRES" header={false} />}
      {sous === "sinistres" && <SinistresInner apiBase={apiBase} branche="IMF_PARTENAIRES" header={false} />}
      {sous === "bordereaux" && <BordereauxInner apiBase={apiBase} header={false} />}
    </div>
  );
}
