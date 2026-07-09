import { FileSpreadsheet } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { exportExcel } from "../../xlsx";

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

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((j) => ({
        "Date & heure": fmtDate(j.date),
        "Administrateur": j.admin,
        "Action": j.typeAction,
        "Objet": j.objet,
        "Identifiant": j.identifiant,
        "Adresse IP": j.ip || "",
      })),
      "journal_activite.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Journal d'activité"
        subtitle="Traçabilité de toutes les actions des administrateurs."
        actions={
          <button className="btn btn-danger-soft" onClick={exportXlsx}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        }
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
