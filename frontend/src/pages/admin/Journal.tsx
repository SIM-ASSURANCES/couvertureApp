import { PageHeader, Card, Badge, Loader, ErrorBox, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";

interface Entry {
  id: string;
  date: string;
  admin: string;
  typeAction: string;
  objet: string;
  identifiant: string;
  ip: string;
}

function actionBadge(t: string) {
  const map: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
    creation: "success",
    modification: "warning",
    suppression: "danger",
    export: "info",
    connexion: "neutral",
    relance: "info",
  };
  return <Badge kind={map[t] ?? "neutral"}>{t}</Badge>;
}

export default function Journal() {
  const { data, loading, error } = useFetch<Entry[]>("/journal");

  return (
    <>
      <PageHeader
        title="Journal d'activité"
        subtitle="Traçabilité de toutes les actions des administrateurs."
      />

      <Card title={data ? `${data.length} entrées récentes` : "Journal"} noBody>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date & heure</th>
                  <th>Administrateur</th>
                  <th>Action</th>
                  <th>Objet</th>
                  <th>Identifiant</th>
                  <th>Adresse IP</th>
                </tr>
              </thead>
              <tbody>
                {data.map((j) => (
                  <tr key={j.id}>
                    <td className="muted">{fmtDate(j.date)}</td>
                    <td><strong>{j.admin}</strong></td>
                    <td>{actionBadge(j.typeAction)}</td>
                    <td>{j.objet}</td>
                    <td className="muted">{j.identifiant}</td>
                    <td className="muted" style={{ fontFamily: "monospace", fontSize: 12 }}>{j.ip || "—"}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={6}><div className="empty">Aucune entrée.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
