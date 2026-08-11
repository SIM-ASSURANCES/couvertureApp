import { useState } from "react";
import { Download, FileSpreadsheet, Trash2, Bell, Send } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fcfa, fmtDate, waveBadge } from "../../../components/ui";
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
  dateDebut?: string | null;
  dateFin?: string | null;
  cycleFacturation?: string | null;
  renouvellementEnCoursDepuis?: string | null;
  renouveleAt?: string | null;
}

function statutRenouvellement(c: SouscriptionAssurancesAccidents) {
  // RelaxMoto/Auto (cycleFacturation non-null) ont leur propre renouvellement
  // côté espace client — pas de statut admin à afficher ici.
  if (c.cycleFacturation) return <span className="muted">—</span>;
  if (c.renouvellementEnCoursDepuis) return <Badge kind="warning">Renouvellement en attente</Badge>;
  if (c.renouveleAt) return <Badge kind="success">Renouvelé le {fmtDate(c.renouveleAt)}</Badge>;
  return <span className="muted">—</span>;
}

export default function AssurancesAccidentsClients() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("INCENDIE_ACCIDENT"));
  const { data, loading, error, reload } = useFetch<SouscriptionAssurancesAccidents[]>("/assurances-accidents/souscriptions");
  const { data: renouvellementsProches, reload: reloadAlertes } = useFetch<SouscriptionAssurancesAccidents[]>(
    "/assurances-accidents/souscriptions?renouvellementProche=1"
  );
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
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

  async function relancerRenouvellement(id: string) {
    try {
      await api.post(`/assurances-branche/souscriptions/${id}/relance-renouvellement`, {});
      notify("SMS de renouvellement envoyé ✓");
      reloadAlertes();
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
        "Date d'échéance": c.dateFin ? fmtDate(c.dateFin) : "",
        "Date d'effet": c.dateDebut ? fmtDate(c.dateDebut) : "",
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

      <Card
        title="Renouvellements à venir (échéance ≤ 2 semaines)"
        extra={<Bell size={18} color="#b45309" />}
        style={{ marginTop: 24 }}
        noBody
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Produit</th>
                <th>Partenaire</th>
                <th>Date d'échéance</th>
                <th>Statut renouvellement</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {(renouvellementsProches ?? []).map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.prenom} {c.nom}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                  </td>
                  <td>{c.produit.libelle}</td>
                  <td>{c.partenaireNom}</td>
                  <td className="muted">{c.dateFin ? fmtDate(c.dateFin) : "—"}</td>
                  <td>{statutRenouvellement(c)}</td>
                  <td>
                    <button
                      className="btn btn-primary"
                      style={{ padding: "7px 12px" }}
                      disabled={!!c.renouvellementEnCoursDepuis}
                      onClick={() => relancerRenouvellement(c.id)}
                      title="Envoyer un SMS avec lien de paiement pour le renouvellement"
                    >
                      <Send size={14} /> Relance
                    </button>
                  </td>
                </tr>
              ))}
              {(renouvellementsProches ?? []).length === 0 && (
                <tr><td colSpan={6}><div className="empty">Aucun renouvellement à venir dans les 2 prochaines semaines.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
                  <th>Date d'échéance</th>
                  <th>Renouvellement</th>
                  <th>Date d'effet</th>
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
                    <td className="muted">{c.dateFin ? fmtDate(c.dateFin) : "—"}</td>
                    <td>{statutRenouvellement(c)}</td>
                    <td className="muted">{c.dateDebut ? fmtDate(c.dateDebut) : "—"}</td>
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
                  <tr><td colSpan={isSuper ? 10 : 9}><div className="empty">Aucun client pour l'instant.</div></td></tr>
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
