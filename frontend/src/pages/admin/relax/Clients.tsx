import { useState } from "react";
import { Download, FileSpreadsheet, Eye, X, Send, RefreshCcw, Camera } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fcfa, fmtDate, fmtDateHeure, waveBadge } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { downloadCsv, api } from "../../../api";
import { exportExcel } from "../../../xlsx";
import { useAuth } from "../../../auth";
import PhotoCarteModal from "../../../components/PhotoCarteModal";
import AccesClientModal from "../../../components/AccesClientModal";
import PhotosClientModal from "../../../components/PhotosClientModal";
import ActionsDocumentsClient from "../../../components/ActionsDocumentsClient";
import type { ProduitRelax, SouscriptionRelax } from "../../../types";

const CYCLE_LABEL: Record<string, string> = {
  mensuel: "Mensuel",
  annuel: "Annuel",
};

function statutRenouvellement(c: SouscriptionRelax) {
  if (c.renouvellementEnCoursDepuis) return <Badge kind="warning">Renouvellement en attente</Badge>;
  if (c.renouveleAt) return <Badge kind="success">Renouvelé le {fmtDateHeure(c.renouveleAt)}</Badge>;
  return <span className="muted">—</span>;
}

export default function RelaxClients({ produit, libelle }: { produit: ProduitRelax; libelle: string }) {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("RELAX"));
  const { data, loading, error, reload } = useFetch<SouscriptionRelax[]>(`/relax/souscriptions?produit=${produit}`);
  const [detailFor, setDetailFor] = useState<SouscriptionRelax | null>(null);
  const [photoFor, setPhotoFor] = useState<SouscriptionRelax | null>(null);
  const [verifId, setVerifId] = useState("");
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  /** Envoie un SMS avec un lien de paiement pour reconduire l'abonnement au tarif courant du cycle — jamais avant échéance uniquement, l'admin peut anticiper. */
  async function relancerRenouvellement(id: string) {
    try {
      await api.post(`/assurances-branche/souscriptions/${id}/relance-renouvellement`, {});
      notify("SMS de renouvellement envoyé ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  // Re-vérifie directement auprès de Wave l'échéance la plus récente (première
  // prime ou renouvellement) — filet de sécurité manuel quand le webhook Wave
  // n'a pas abouti.
  async function verifier(id: string) {
    setVerifId(id);
    try {
      const r = await api.post<{ statut: string; estRenouvellement?: boolean }>(
        `/assurances-branche/souscriptions/${id}/verifier`,
        {}
      );
      if (r.statut === "paye" && r.estRenouvellement === false) {
        notify("Aucun renouvellement en cours — seule la prime initiale est enregistrée pour ce client.");
      } else if (r.statut === "paye") notify("Paiement confirmé ✓");
      else if (r.statut === "echoue") notify("Paiement échoué côté Wave.");
      else notify("Toujours en attente — paiement non abouti chez Wave.");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setVerifId("");
    }
  }

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
        "Date d'effet": c.dateDebut ? fmtDate(c.dateDebut) : "",
        "Date d'échéance": c.dateFin ? fmtDate(c.dateFin) : "",
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
                  <th>Date d'échéance</th>
                  <th>Renouvellement</th>
                  <th>N° police</th>
                  <th>Date</th>
                  <th></th>
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
                    <td className="muted">{c.dateFin ? fmtDate(c.dateFin) : "—"}</td>
                    <td>{statutRenouvellement(c)}</td>
                    <td className="muted">{c.numeroPolice ?? "—"}</td>
                    <td className="muted">{fmtDate(c.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: 8 }} title="Voir les détails" onClick={() => setDetailFor(c)}>
                          <Eye size={15} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: 8 }}
                          title="Envoyer un SMS de renouvellement dès maintenant (sans attendre l'échéance)"
                          disabled={!!c.renouvellementEnCoursDepuis}
                          onClick={() => relancerRenouvellement(c.id)}
                        >
                          <Send size={15} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: 8 }}
                          title="Vérifier le paiement Wave (souscription ou renouvellement)"
                          disabled={verifId === c.id}
                          onClick={() => verifier(c.id)}
                        >
                          <RefreshCcw size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={10}><div className="empty">Aucun client pour l'instant.</div></td></tr>
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
                <tr><td className="muted" style={{ width: "42%" }}>Nom / Prénom</td><td><strong>{[detailFor.prenom, detailFor.nom].filter(Boolean).join(" ") || "—"}</strong></td></tr>
                <tr><td className="muted">Téléphone</td><td>{detailFor.telephone}</td></tr>
                <tr><td className="muted">Produit</td><td>{libelle}</td></tr>
                <tr><td className="muted">Partenaire</td><td>{detailFor.partenaireNom}</td></tr>
                <tr><td className="muted">Prime</td><td><strong>{fcfa(detailFor.montantPrime)}</strong></td></tr>
                <tr><td className="muted">Capital garanti</td><td>{fcfa(detailFor.capitalGaranti)}</td></tr>
                <tr><td className="muted">Cycle</td><td>{detailFor.cycleFacturation ? CYCLE_LABEL[detailFor.cycleFacturation] : "—"}</td></tr>
                <tr><td className="muted">Statut</td><td>{waveBadge(detailFor.waveStatut ?? "en_attente")}</td></tr>
                <tr><td className="muted">N° police</td><td>{detailFor.numeroPolice ?? "—"}</td></tr>
                <tr><td className="muted">Date d'effet</td><td>{detailFor.dateDebut ? fmtDate(detailFor.dateDebut) : "—"}</td></tr>
                <tr><td className="muted">Date d'échéance</td><td>{detailFor.dateFin ? fmtDate(detailFor.dateFin) : "—"}</td></tr>
                <tr>
                  <td className="muted">Renouvellement</td>
                  <td style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {statutRenouvellement(detailFor)}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px 8px", fontSize: 12 }}
                      disabled={verifId === detailFor.id}
                      onClick={() => verifier(detailFor.id)}
                      title="Vérifier le paiement Wave auprès de Wave"
                    >
                      <RefreshCcw size={12} /> Vérifier
                    </button>
                  </td>
                </tr>
                <tr><td className="muted">Date de souscription</td><td>{fmtDate(detailFor.createdAt)}</td></tr>
              </tbody>
            </table>
            {isSuper && (
              <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setPhotoFor(detailFor)}>
                <Camera size={15} /> Modifier la photo de la carte
              </button>
            )}
            <ActionsDocumentsClient
              souscriptionId={detailFor.id}
              type={produit}
              numeroPolice={detailFor.numeroPolice}
              onNotify={notify}
            />
            <PhotosClientModal
              souscriptionId={detailFor.id}
              produitType="generique"
              referenceFichier={detailFor.numeroPolice}
            />
            <AccesClientModal
              souscriptionId={detailFor.id}
              produitType="generique"
              espaceClientActif={!!detailFor.espaceClientActif}
              onNotify={notify}
            />
          </div>
        </div>
      )}
      {photoFor && (
        <PhotoCarteModal
          souscriptionId={photoFor.id}
          produit={produit}
          onClose={() => setPhotoFor(null)}
          onSaved={() => {
            notify("Photo mise à jour ✓");
            reload();
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
