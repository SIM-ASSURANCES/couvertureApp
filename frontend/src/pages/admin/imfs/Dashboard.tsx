import { Link } from "react-router-dom";
import { Building, CheckCircle2, PauseCircle, FileText, ArrowRight } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, nb } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import type { Imf, StatsImfPartenaires } from "../../../types";

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "var(--primary, #004b9c)",
  bg = "var(--primary-50, #eef2ff)",
}: {
  icon: typeof Building;
  label: string;
  value: string | number;
  accent?: string;
  bg?: string;
}) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: "grid", placeItems: "center", flex: "none" }}>
          <Icon size={20} color={accent} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, loading: l0, error: e0 } = useFetch<StatsImfPartenaires>("/imf-partenaires/stats");
  const { data: imfs, loading: l1, error: e1 } = useFetch<Imf[]>("/imf-partenaires");

  const loading = l0 || l1;
  const error = e0 || e1;
  const recentes = (imfs ?? []).slice(0, 6);

  return (
    <>
      <PageHeader
        title="IMF Partenaires"
        subtitle="Institutions de microfinance enregistrées, chacune avec son paramétrage propre."
        actions={
          <Link to="/admin/imfs/liste" className="btn btn-primary">
            Gérer les IMF <ArrowRight size={16} />
          </Link>
        }
      />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {!loading && !error && stats && (
        <>
          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <StatCard icon={Building} label="IMF enregistrées" value={nb(stats.total)} />
            <StatCard icon={CheckCircle2} label="IMF actives" value={nb(stats.actives)} accent="#16a34a" bg="rgba(22,163,74,0.12)" />
            <StatCard icon={PauseCircle} label="IMF inactives" value={nb(stats.inactives)} accent="#6b7280" bg="rgba(107,114,128,0.12)" />
            <StatCard icon={FileText} label="Souscriptions (IMF partenaires)" value={nb(stats.souscriptions)} accent="#db2777" bg="rgba(219,39,119,0.12)" />
          </div>

          <Card title="Dernières IMF" noBody style={{ marginTop: 24 }}>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>IMF</th>
                    <th>Responsable</th>
                    <th>Statut</th>
                    <th style={{ textAlign: "right" }}>Zones</th>
                    <th style={{ textAlign: "right" }}>Agences</th>
                    <th style={{ textAlign: "right" }}>Agents</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((imf) => (
                    <tr key={imf.id}>
                      <td><strong>{imf.nom}</strong><div className="muted" style={{ fontSize: 12 }}>{imf.code}</div></td>
                      <td className="muted">{imf.nomResponsable}</td>
                      <td>
                        <span className={`badge ${imf.statut === "actif" ? "success" : "neutral"}`}>
                          {imf.statut === "actif" ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }} className="muted">{nb(imf.nbZones)}</td>
                      <td style={{ textAlign: "right" }} className="muted">{nb(imf.nbAgences)}</td>
                      <td style={{ textAlign: "right" }} className="muted">{nb(imf.nbAgents)}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link to={`/admin/imfs/${imf.id}/general`} className="btn btn-ghost" style={{ padding: "4px 10px" }}>
                          Ouvrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {recentes.length === 0 && (
                    <tr><td colSpan={7}><div className="empty">Aucune IMF enregistrée. <Link to="/admin/imfs/liste">Ajouter la première</Link>.</div></td></tr>
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
