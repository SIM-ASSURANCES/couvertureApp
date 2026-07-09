import { useState } from "react";
import { Download, Trash2, Eye, X, FileSpreadsheet } from "lucide-react";
import {
  PageHeader,
  Card,
  Loader,
  ErrorBox,
  waveBadge,
  Badge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api, downloadCsv } from "../../api";
import { useAuth } from "../../auth";
import { exportExcel } from "../../xlsx";
import type { ClientAccident, Partenaire } from "../../types";

export default function ClientsAccident() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [part, setPart] = useState("");
  const [toast, setToast] = useState("");
  const params = new URLSearchParams();
  if (part) params.set("partenaireId", part);

  const { data, loading, error, reload } = useFetch<ClientAccident[]>(
    `/souscriptions/accident?${params.toString()}`
  );
  const { data: partenaires } = useFetch<Partenaire[]>("/partenaires");

  async function supprimer(id: string) {
    if (!confirm("Supprimer définitivement ce client ?")) return;
    try {
      await api.del(`/souscriptions/accident/${id}`);
      setToast("Client supprimé ✓");
      setTimeout(() => setToast(""), 2500);
      reload();
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  const [detailFor, setDetailFor] = useState<ClientAccident | null>(null);

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((c) => ({
        "Prénom": c.prenom,
        "Nom": c.nom,
        "Téléphone": c.telephone,
        "Date de naissance": c.dateNaissance ? fmtDate(c.dateNaissance) : "",
        "Partenaire": c.partenaireNom,
        "Prime": c.montantPrime,
        "Capital garanti": c.capitalGaranti,
        "Paiement Wave": c.waveStatut,
        "N° police": c.numeroPolice ?? "",
        "Dossier": c.statutDossier,
        "Date": fmtDate(c.createdAt),
      })),
      "clients_accident.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Clients — Assurance Accident"
        subtitle="Souscriptions confirmées après paiement Wave."
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => downloadCsv("/souscriptions/accident/export.csv", "clients_accident.csv")}>
              <Download size={16} /> CSV
            </button>
            <button className="btn btn-danger-soft" onClick={exportXlsx}>
              <FileSpreadsheet size={16} /> Export Excel
            </button>
          </>
        }
      />

      <Card
        title={data ? `${data.length} souscriptions` : "Souscriptions"}
        extra={
          <div style={{ display: "flex", gap: 10 }}>
            <select className="select" style={{ width: 180, height: 40 }} value={part} onChange={(e) => setPart(e.target.value)}>
              <option value="">Tous partenaires</option>
              {partenaires?.map((p) => (
                <option key={p.id} value={p.id}>{p.nomCommerce}</option>
              ))}
            </select>
          </div>
        }
        noBody
      >
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Date de naissance</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Capital garanti</th>
                  <th>Paiement Wave</th>
                  <th>N° police</th>
                  <th>Dossier</th>
                  <th>Date</th>
                  <th style={{ width: 96 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.prenom} {c.nom}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                    </td>
                    <td className="muted">{c.dateNaissance ? fmtDate(c.dateNaissance) : "—"}</td>
                    <td>{c.partenaireNom}</td>
                    <td><strong>{fcfa(c.montantPrime)}</strong></td>
                    <td className="muted">{fcfa(c.capitalGaranti)}</td>
                    <td>{waveBadge(c.waveStatut)}</td>
                    <td className="muted">{c.numeroPolice ?? "—"}</td>
                    <td>
                      {c.statutDossier === "complet" ? (
                        <Badge kind="success">Complet</Badge>
                      ) : (
                        <Badge kind="warning">Formulaire en attente</Badge>
                      )}
                    </td>
                    <td className="muted">{fmtDate(c.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Voir les détails"
                          onClick={() => setDetailFor(c)}
                        >
                          <Eye size={15} />
                        </button>
                        {isSuper && c.waveStatut !== "confirme" && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px" }}
                            title="Supprimer"
                            onClick={() => supprimer(c.id)}
                          >
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={10}><div className="empty">Aucune souscription.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {detailFor && (
        <div
          onClick={() => setDetailFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 17 }}>Détails du client</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setDetailFor(null)}><X size={18} /></button>
            </div>
            <table className="tbl" style={{ width: "100%" }}>
              <tbody>
                <tr><td className="muted" style={{ width: "42%" }}>Nom / Prénom</td><td><strong>{detailFor.prenom} {detailFor.nom}</strong></td></tr>
                <tr><td className="muted">Téléphone</td><td>{detailFor.telephone}</td></tr>
                <tr><td className="muted">Date de naissance</td><td>{detailFor.dateNaissance ? fmtDate(detailFor.dateNaissance) : "—"}</td></tr>
                <tr><td className="muted">Partenaire</td><td>{detailFor.partenaireNom}</td></tr>
                <tr><td className="muted">Prime</td><td><strong>{fcfa(detailFor.montantPrime)}</strong></td></tr>
                <tr><td className="muted">Capital garanti</td><td>{fcfa(detailFor.capitalGaranti)}</td></tr>
                <tr><td className="muted">Paiement Wave</td><td>{waveBadge(detailFor.waveStatut)}</td></tr>
                <tr><td className="muted">N° police</td><td>{detailFor.numeroPolice || "—"}</td></tr>
                <tr>
                  <td className="muted">Dossier</td>
                  <td>{detailFor.statutDossier === "complet" ? <Badge kind="success">Complet</Badge> : <Badge kind="warning">Formulaire en attente</Badge>}</td>
                </tr>
                <tr><td className="muted">Date de souscription</td><td>{fmtDate(detailFor.createdAt)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
