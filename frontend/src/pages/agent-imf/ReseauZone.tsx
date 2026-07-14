import { Building2 } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox } from "../../components/ui";
import { useFetch } from "../../useFetch";

interface AgentDeLAgence {
  id: string;
  nom: string;
  prenom: string;
  roleImf: "AGENT" | "RESPONSABLE_AGENCE" | "RESPONSABLE_ZONE";
  statut: "actif" | "inactif";
  telephone: string;
  email: string;
}

interface AgenceAvecAgents {
  id: string;
  nom: string;
  telephone: string | null;
  localisation: string | null;
  agents: AgentDeLAgence[];
}

function roleLabel(r: AgentDeLAgence["roleImf"]) {
  if (r === "RESPONSABLE_AGENCE") return "Responsable";
  if (r === "RESPONSABLE_ZONE") return "Resp. de zone";
  return "Agent";
}

export default function ReseauZone() {
  const { data, loading, error } = useFetch<AgenceAvecAgents[]>("/agent-imf/reseau/agences");

  return (
    <>
      <PageHeader title="Mon réseau" subtitle="Agences et agents de votre zone." />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {data && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {data.map((agence) => (
            <Card key={agence.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: "var(--primary-50, #eef2ff)",
                  display: "grid", placeItems: "center", flex: "none",
                }}>
                  <Building2 size={18} color="var(--primary, #004b9c)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{agence.nom}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {agence.localisation ?? "—"} · {agence.agents.length} agent{agence.agents.length > 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Rôle</th>
                      <th>Contact</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agence.agents.map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.prenom} {a.nom}</strong></td>
                        <td>{roleLabel(a.roleImf)}</td>
                        <td className="muted">{a.telephone}</td>
                        <td>
                          <Badge kind={a.statut === "actif" ? "success" : "neutral"}>
                            {a.statut === "actif" ? "Actif" : "Inactif"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {agence.agents.length === 0 && (
                      <tr><td colSpan={4}><div className="empty">Aucun agent dans cette agence.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
          {data.length === 0 && (
            <Card><div className="empty">Aucune agence dans votre zone.</div></Card>
          )}
        </div>
      )}
    </>
  );
}
