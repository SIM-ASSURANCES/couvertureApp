import { useState } from "react";
import { FileSpreadsheet, Download } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { exportExcel } from "../../../xlsx";
import { genererContratSecurpro, souscriptionImfToContratSecurpro } from "../../../contract";
import type { SouscriptionImf } from "../../../types";

const PRODUITS = [
  { value: "", label: "Tous produits" },
  { value: "securpro", label: "SECURPRO" },
  { value: "securstock", label: "SECURSTOCK" },
  { value: "coupsdurs_classique", label: "Coups Durs — Classique" },
  { value: "coupsdurs_incapacite", label: "Coups Durs — Incapacité" },
  { value: "securecolte", label: "SECURECOLTE" },
];

function statutBadge(s: SouscriptionImf["statut"]) {
  if (s === "active") return <Badge kind="success">Active</Badge>;
  if (s === "annulee") return <Badge kind="neutral">Annulée</Badge>;
  return <Badge kind="warning">En cours</Badge>;
}

export default function Souscriptions() {
  const [produitCode, setProduitCode] = useState("");
  const params = new URLSearchParams();
  if (produitCode) params.set("produitCode", produitCode);
  const { data, loading, error } = useFetch<SouscriptionImf[]>(`/imf/souscriptions?${params.toString()}`);

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((s) => ({
        "N° de police": s.numeroPolice,
        "Client": `${s.prenom} ${s.nom}`,
        "Téléphone": s.telephone,
        "Produit": s.produitCode,
        "Agent": s.agentNom ?? "",
        "Agence": s.agenceNom ?? "",
        "Zone": s.zoneNom ?? "",
        "Prime TTC": s.primeTTC,
        "Statut": s.statut,
        "Date": fmtDate(s.createdAt),
      })),
      "souscriptions_imf.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Souscriptions IMF"
        subtitle="Toutes les souscriptions créées par les agents du réseau."
        actions={
          <button className="btn btn-danger-soft" onClick={exportXlsx}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        }
      />

      <Card
        title={data ? `${data.length} souscriptions` : "Souscriptions"}
        extra={
          <select className="select" style={{ width: 220, height: 40 }} value={produitCode} onChange={(e) => setProduitCode(e.target.value)}>
            {PRODUITS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        }
        noBody
        style={{ marginTop: 24 }}
      >
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
                  <th>Agent</th>
                  <th>Prime TTC</th>
                  <th>Statut</th>
                  <th>Date</th>
                  <th></th>
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
                    <td>
                      {s.agentNom}
                      <div className="muted" style={{ fontSize: 12 }}>{s.agenceNom ?? s.zoneNom}</div>
                    </td>
                    <td><strong>{fcfa(s.primeTTC)}</strong></td>
                    <td>{statutBadge(s.statut)}</td>
                    <td className="muted">{fmtDate(s.createdAt)}</td>
                    <td>
                      {s.produitCode === "securpro" && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Télécharger le contrat"
                          onClick={() => genererContratSecurpro(souscriptionImfToContratSecurpro(s))}
                        >
                          <Download size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={8}><div className="empty">Aucune souscription.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
