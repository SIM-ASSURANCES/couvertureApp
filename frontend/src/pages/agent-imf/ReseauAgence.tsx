import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa } from "../../components/ui";
import { useFetch } from "../../useFetch";

interface AgentAvecStats {
  id: string;
  nom: string;
  prenom: string;
  roleImf: "AGENT" | "RESPONSABLE_AGENCE" | "RESPONSABLE_ZONE" | "FINANCE_COMPTABLE";
  statut: "actif" | "inactif";
  agenceNom: string | null;
  zoneNom: string | null;
  nbSouscriptions: number;
  primeTotale: number;
}

// Le responsable d'agence (qui consulte cette page) ne voit jamais les
// commissions — seul le finance comptable de l'agence y a accès, sur sa
// propre page Finance. Ici, le finance comptable apparaît comme un membre
// de l'agence parmi d'autres, sans aucune donnée financière supplémentaire.
function roleLabel(r: AgentAvecStats["roleImf"]) {
  if (r === "RESPONSABLE_AGENCE") return "Responsable";
  if (r === "RESPONSABLE_ZONE") return "Resp. de zone";
  if (r === "FINANCE_COMPTABLE") return "Finance comptable";
  return "Agent";
}

export default function ReseauAgence() {
  const { data, loading, error } = useFetch<AgentAvecStats[]>("/agent-imf/reseau/agents");

  return (
    <>
      <PageHeader title="Mon agence" subtitle="Agents de votre agence et leur activité." />

      <Card title={data ? `${data.length} agents` : "Agents"} noBody style={{ marginTop: 24 }}>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Souscriptions</th>
                  <th>Prime totale</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.prenom} {a.nom}</strong></td>
                    <td>{roleLabel(a.roleImf)}</td>
                    <td>
                      <Badge kind={a.statut === "actif" ? "success" : "neutral"}>
                        {a.statut === "actif" ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="muted">{a.nbSouscriptions}</td>
                    <td><strong>{fcfa(a.primeTotale)}</strong></td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={5}><div className="empty">Aucun agent dans votre agence.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
