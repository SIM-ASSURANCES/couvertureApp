import { useState } from "react";
import { Download, FileSpreadsheet, Trash2 } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa, fmtDate, waveBadge } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { downloadCsv, api } from "../../../api";
import { exportExcel } from "../../../xlsx";
import { useAuth } from "../../../auth";

interface SouscriptionAssurancesAccidents {
  id: string;
  telephone: string;
  nom?: string | null;
  prenom?: string | null;
  montantPrime: number;
  capitalGaranti: number;
  waveStatut: string | null;
  numeroPolice?: string | null;
  partenaireNom: string;
  produit: { code: string; libelle: string };
  createdAt: string;
}

export default function AssurancesAccidentsClients() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("INCENDIE_ACCIDENT"));
  const { data, loading, error, reload } = useFetch<SouscriptionAssurancesAccidents[]>("/assurances-accidents/souscriptions");
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function remove(s: SouscriptionAssurancesAccidents) {
    if (!confirm(`Supprimer le contrat de ${s.prenom} ${s.nom} ?`)) return;
    try {
      await api.del(`/assurances-accidents/souscriptions/${s.id}`);
      notify("Contrat supprimé");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((c) => ({
        "Prénom": c.prenom ?? "",
        "Nom": c.nom ?? "",
        "Téléphone": c.telephone,
        "Produit": c.produit.libelle,
        "Partenaire": c.partenaireNom,
        "Prime": c.montantPrime,
        "Capital garanti": c.capitalGaranti,
        "Statut": c.waveStatut ?? "",
        "N° police": c.numeroPolice ?? "",
        Date: fmtDate(c.createdAt),
      })),
      "clients_assurances_accidents.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Clients & Contrats — Assurances Accidents"
        subtitle="Contrats confirmés (paiement Wave validé)."
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => downloadCsv("/assurances-accidents/souscriptions/export.csv", "clients_assurances_accidents.csv")}>
              <Download size={16} /> CSV
            </button>
            <button className="btn btn-danger-soft" onClick={exportXlsx}>
              <FileSpreadsheet size={16} /> Export Excel
            </button>
          </>
        }
      />

      <Card title={data ? `${data.length} contrats` : "Contrats"} noBody style={{ marginTop: 24 }}>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Statut</th>
                  <th>N° police</th>
                  <th>Date</th>
                  {isSuper && <th></th>}
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.prenom} {c.nom}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                    </td>
                    <td>{c.produit.libelle}</td>
                    <td>{c.partenaireNom}</td>
                    <td><strong>{fcfa(c.montantPrime)}</strong></td>
                    <td>{waveBadge(c.waveStatut ?? "en_attente")}</td>
                    <td className="muted">{c.numeroPolice ?? "—"}</td>
                    <td className="muted">{fmtDate(c.createdAt)}</td>
                    {isSuper && (
                      <td>
                        <button className="btn btn-ghost" style={{ padding: 8 }} title="Supprimer" onClick={() => remove(c)}>
                          <Trash2 size={15} color="var(--danger)" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={isSuper ? 8 : 7}><div className="empty">Aucun client pour l'instant.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
