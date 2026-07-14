import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import type { SouscriptionImf } from "../../types";

function statutBadge(s: SouscriptionImf["statut"]) {
  if (s === "active") return <Badge kind="success">Active</Badge>;
  if (s === "annulee") return <Badge kind="neutral">Annulée</Badge>;
  return <Badge kind="warning">En cours</Badge>;
}

export default function Souscriptions() {
  const { data, loading, error } = useFetch<SouscriptionImf[]>("/agent-imf/souscriptions");

  return (
    <>
      <PageHeader title="Mes souscriptions" subtitle="Souscriptions créées à partir de vos simulations." />

      <Card title={data ? `${data.length} souscriptions` : "Souscriptions"} noBody style={{ marginTop: 24 }}>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>N° de police</th>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Prime TTC</th>
                  <th>Statut</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.numeroPolice}</strong></td>
                    <td>
                      {s.prenom} {s.nom}
                      <div className="muted" style={{ fontSize: 12 }}>{s.telephone}</div>
                    </td>
                    <td className="muted">{s.produitCode}</td>
                    <td><strong>{fcfa(s.primeTTC)}</strong></td>
                    <td>{statutBadge(s.statut)}</td>
                    <td className="muted">{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={6}><div className="empty">Aucune souscription pour l'instant.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
