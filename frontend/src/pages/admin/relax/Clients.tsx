import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa, fmtDate, waveBadge } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { downloadCsv } from "../../../api";
import { exportExcel } from "../../../xlsx";
import type { ProduitRelax, SouscriptionRelax } from "../../../types";

const CYCLE_LABEL: Record<string, string> = {
  hebdo5semaines: "Hebdo (5 sem.)",
  mensuel: "Mensuel",
  annuel: "Annuel",
};

export default function RelaxClients({ produit, libelle }: { produit: ProduitRelax; libelle: string }) {
  const { data, loading, error } = useFetch<SouscriptionRelax[]>(`/relax/souscriptions?produit=${produit}`);

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((c) => ({
        "Prénom": c.prenom ?? "",
        "Nom": c.nom ?? "",
        "Téléphone": c.telephone,
        "Partenaire": c.partenaireNom,
        "Prime annuelle": c.montantPrime,
        "Capital garanti": c.capitalGaranti,
        "Cycle": c.cycleFacturation ? CYCLE_LABEL[c.cycleFacturation] : "",
        "Échéances": c.nombreEcheances ?? "",
        "Statut abonnement": c.statutAbonnement ?? "",
        "N° police": c.numeroPolice ?? "",
        Date: fmtDate(c.createdAt),
      })),
      `clients_${produit}.xlsx`
    );
  }

  return (
    <>
      <PageHeader
        title={`Clients — ${libelle}`}
        subtitle="Abonnements confirmés (1ère échéance payée)."
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => downloadCsv(`/relax/souscriptions/export.csv?produit=${produit}`, `clients_${produit}.csv`)}>
              <Download size={16} /> CSV
            </button>
            <button className="btn btn-danger-soft" onClick={exportXlsx}>
              <FileSpreadsheet size={16} /> Export Excel
            </button>
          </>
        }
      />

      <Card title={data ? `${data.length} abonnements` : "Abonnements"} noBody style={{ marginTop: 24 }}>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Partenaire</th>
                  <th>Prime annuelle</th>
                  <th>Cycle</th>
                  <th>Statut</th>
                  <th>N° police</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.prenom} {c.nom}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                    </td>
                    <td>{c.partenaireNom}</td>
                    <td><strong>{fcfa(c.montantPrime)}</strong></td>
                    <td>{c.cycleFacturation ? CYCLE_LABEL[c.cycleFacturation] : "—"}</td>
                    <td>{waveBadge(c.waveStatut ?? "en_attente")}</td>
                    <td className="muted">{c.numeroPolice ?? "—"}</td>
                    <td className="muted">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={7}><div className="empty">Aucun client pour l'instant.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
