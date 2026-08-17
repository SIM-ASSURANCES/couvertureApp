import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Badge, fmtDate } from "./ui";
import { useFetch } from "../useFetch";
import { api, ApiError } from "../api";

interface Sinistre {
  id: string;
  numeroSinistre: string;
  typeEvenement: string;
  dateSurvenance: string;
  statut: "declare" | "en_cours" | "traite" | "rejete";
}

function statutBadge(s: Sinistre["statut"]) {
  if (s === "declare") return <Badge kind="warning">Déclaré</Badge>;
  if (s === "en_cours") return <Badge kind="info">En cours</Badge>;
  if (s === "traite") return <Badge kind="success">Traité</Badge>;
  return <Badge kind="danger">Rejeté</Badge>;
}

/**
 * Section "Accès client" — pas une modale à part entière : à intégrer dans le
 * corps d'une modale de détail déjà existante (voir ClientsAccident.tsx,
 * ClientsIncendie.tsx, accidents/Clients.tsx). Affiche si l'espace client est
 * activé, permet de réinitialiser le mot de passe (envoyé par SMS, jamais
 * affiché ici) et liste les sinistres déjà déclarés par ce client — lecture
 * seule, la gestion complète se fait sur la page Sinistres.
 */
export default function AccesClientModal({
  souscriptionId,
  produitType,
  espaceClientActif,
  onNotify,
}: {
  souscriptionId: string;
  produitType: "generique" | "incendie" | "accident";
  espaceClientActif: boolean;
  onNotify: (message: string) => void;
}) {
  const [reinitialisation, setReinitialisation] = useState(false);
  const { data: sinistres } = useFetch<Sinistre[]>(
    `/assurances-branche/sinistres?souscriptionId=${souscriptionId}&produitType=${produitType}`
  );

  async function reinitialiserMotDePasse() {
    if (!confirm("Réinitialiser le mot de passe de ce client ? Le nouveau mot de passe lui sera envoyé par SMS.")) return;
    setReinitialisation(true);
    try {
      await api.post(`/assurances-branche/clients/${produitType}/${souscriptionId}/reinitialiser-mot-de-passe`, {});
      onNotify("Nouveau mot de passe envoyé par SMS ✓");
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : "Erreur lors de la réinitialisation");
    } finally {
      setReinitialisation(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border, #e5e7eb)" }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Accès à l'espace client</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {espaceClientActif ? <Badge kind="success">Espace activé</Badge> : <Badge kind="neutral">Espace non activé</Badge>}
        {espaceClientActif && (
          <button className="btn btn-ghost" style={{ padding: "7px 12px" }} disabled={reinitialisation} onClick={reinitialiserMotDePasse}>
            <KeyRound size={14} /> {reinitialisation ? "Envoi…" : "Réinitialiser le mot de passe"}
          </button>
        )}
      </div>

      {sinistres && sinistres.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Sinistres déclarés</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sinistres.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-2, #f5f8fc)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
                <span>{s.typeEvenement} · {fmtDate(s.dateSurvenance)}</span>
                {statutBadge(s.statut)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
