import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { downloadCsv } from "../../api";

interface PerfRow {
  id: string;
  nomCommerce: string;
  localisation: string;
  clientsIncendie: number;
  clientsAccident: number;
  total: number;
  primesAccident: number;
  commission: number;
}
interface Perf {
  rows: PerfRow[];
  taux: { tauxAcc: number; tauxInc: number };
}

export default function Performance() {
  const [periode, setPeriode] = useState("annuel");
  const { data, loading, error } = useFetch<Perf>(
    `/stats/performance?periode=${periode}`
  );

  const rows = data?.rows ?? [];
  const max = Math.max(...rows.map((r) => r.total), 1);
  const totalCom = rows.reduce((s, r) => s + r.commission, 0);
  const totalPrimes = rows.reduce((s, r) => s + r.primesAccident, 0);
  const totalSous = rows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHeader
        title="Performance & Commissions"
        subtitle="Suivi de la production par partenaire et calcul des commissions."
        actions={
          <button
            className="btn btn-danger-soft"
            onClick={() =>
              downloadCsv(
                `/stats/performance/export.csv?periode=${periode}`,
                "performance_partenaires.csv"
              )
            }
          >
            <Download size={16} /> Export global
          </button>
        }
      />

      <div className="tabs">
        {["mensuel", "trimestriel", "annuel"].map((p) => (
          <button key={p} className={`tab${periode === p ? " active" : ""}`} onClick={() => setPeriode(p)}>
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat">
              <div className="stat-label">Total souscriptions</div>
              <div className="stat-value">{totalSous}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Primes Accident générées</div>
              <div className="stat-value">{fcfa(totalPrimes)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Commissions à verser</div>
              <div className="stat-value">{fcfa(totalCom)}</div>
            </div>
          </div>

          <Card title="Classement des partenaires" noBody>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Partenaire</th>
                    <th>Volume</th>
                    <th>Incendie</th>
                    <th>Accident</th>
                    <th>Primes</th>
                    <th>Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.nomCommerce}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{r.localisation}</div>
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="bar-track" style={{ flex: 1 }}>
                            <div className="bar-fill" style={{ width: `${(r.total / max) * 100}%` }} />
                          </div>
                          <span style={{ fontWeight: 600 }}>{r.total}</span>
                        </div>
                      </td>
                      <td>{r.clientsIncendie}</td>
                      <td>{r.clientsAccident}</td>
                      <td>{fcfa(r.primesAccident)}</td>
                      <td><strong style={{ color: "var(--sim-primary)" }}>{fcfa(r.commission)}</strong></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={6}><div className="empty">Aucune donnée.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
