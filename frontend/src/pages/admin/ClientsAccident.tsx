import { useState } from "react";
import { Download, Trash2, Eye, X, FileSpreadsheet, Bell, Send, Camera } from "lucide-react";
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
import PhotoCarteModal from "../../components/PhotoCarteModal";
import AccesClientModal from "../../components/AccesClientModal";
import PhotosClientModal from "../../components/PhotosClientModal";
import ActionsDocumentsClient from "../../components/ActionsDocumentsClient";
import type { ClientAccident, Partenaire } from "../../types";

// Doit correspondre à CODE_ACCIDENT_HISTORIQUE côté backend (assurancesBranche.ts).
const CODE_ACCIDENT_HISTORIQUE = "accident_historique";

function statutRenouvellement(c: ClientAccident) {
  if (c.renouvellementEnCoursDepuis) return <Badge kind="warning">Renouvellement en attente</Badge>;
  if (c.renouveleAt) return <Badge kind="success">Renouvelé le {fmtDate(c.renouveleAt)}</Badge>;
  return <span className="muted">—</span>;
}

export default function ClientsAccident() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("INCENDIE_ACCIDENT"));
  const [part, setPart] = useState("");
  const [toast, setToast] = useState("");
  const params = new URLSearchParams();
  if (part) params.set("partenaireId", part);

  const { data, loading, error, reload } = useFetch<ClientAccident[]>(
    `/souscriptions/accident?${params.toString()}`
  );
  const { data: partenaires } = useFetch<Partenaire[]>("/partenaires");

  const alerteParams = new URLSearchParams(params);
  alerteParams.set("renouvellementProche", "1");
  const { data: renouvellementsProches, reload: reloadAlertes } = useFetch<ClientAccident[]>(
    `/souscriptions/accident?${alerteParams.toString()}`
  );

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function supprimer(id: string) {
    if (!confirm("Supprimer définitivement ce client ?")) return;
    try {
      await api.del(`/souscriptions/accident/${id}`);
      notify("Client supprimé ✓");
      reload();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function relancerRenouvellement(id: string) {
    try {
      await api.post(`/souscriptions/accident/${id}/relance-renouvellement`, {});
      notify("SMS de renouvellement envoyé ✓");
      reloadAlertes();
      reload();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  const [detailFor, setDetailFor] = useState<ClientAccident | null>(null);
  const [photoFor, setPhotoFor] = useState<ClientAccident | null>(null);

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((c) => ({
        "Prénom": c.prenom,
        "Nom": c.nom,
        "Téléphone": c.telephone,
        "Date d'échéance": c.dateFin ? fmtDate(c.dateFin) : "",
        "Partenaire": c.partenaireNom,
        "Prime": c.montantPrime,
        "Capital garanti": c.capitalGaranti,
        "Paiement Wave": c.waveStatut,
        "N° police": c.numeroPolice ?? "",
        "Dossier": c.statutDossier,
        "Date d'effet": c.dateDebut ? fmtDate(c.dateDebut) : "",
      })),
      "clients_accident.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Clients — Assurance Accidents"
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
                <tr><td colSpan={5}><div className="empty">Aucun renouvellement à venir dans les 2 prochaines semaines.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={data ? `${data.length} souscriptions` : "Souscriptions"}
        style={{ marginTop: 24 }}
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
                  <th>Date d'échéance</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Capital garanti</th>
                  <th>Paiement Wave</th>
                  <th>N° police</th>
                  <th>Dossier</th>
                  <th>Renouvellement</th>
                  <th>Date d'effet</th>
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
                    <td className="muted">{c.dateFin ? fmtDate(c.dateFin) : "—"}</td>
                    <td>
                      <strong>{c.partenaireNom}</strong>
                      {c.partenaireResponsable && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireResponsable}</div>
                      )}
                      {c.partenaireLocalisation && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireLocalisation}</div>
                      )}
                    </td>
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
                    <td>{statutRenouvellement(c)}</td>
                    <td className="muted">{c.dateDebut ? fmtDate(c.dateDebut) : "—"}</td>
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
                  <tr><td colSpan={11}><div className="empty">Aucune souscription.</div></td></tr>
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
                <tr><td className="muted">Partenaire</td><td>
                  {detailFor.partenaireNom}
                  {detailFor.partenaireResponsable && (
                    <div className="muted" style={{ fontSize: 12 }}>{detailFor.partenaireResponsable}</div>
                  )}
                  {detailFor.partenaireLocalisation && (
                    <div className="muted" style={{ fontSize: 12 }}>{detailFor.partenaireLocalisation}</div>
                  )}
                </td></tr>
                <tr><td className="muted">Prime</td><td><strong>{fcfa(detailFor.montantPrime)}</strong></td></tr>
                <tr><td className="muted">Capital garanti</td><td>{fcfa(detailFor.capitalGaranti)}</td></tr>
                <tr><td className="muted">Paiement Wave</td><td>{waveBadge(detailFor.waveStatut)}</td></tr>
                <tr><td className="muted">N° police</td><td>{detailFor.numeroPolice || "—"}</td></tr>
                <tr>
                  <td className="muted">Dossier</td>
                  <td>{detailFor.statutDossier === "complet" ? <Badge kind="success">Complet</Badge> : <Badge kind="warning">Formulaire en attente</Badge>}</td>
                </tr>
                <tr><td className="muted">Date d'effet</td><td>{detailFor.dateDebut ? fmtDate(detailFor.dateDebut) : "—"}</td></tr>
                <tr><td className="muted">Date d'échéance</td><td>{detailFor.dateFin ? fmtDate(detailFor.dateFin) : "—"}</td></tr>
                <tr><td className="muted">Renouvellement</td><td>{statutRenouvellement(detailFor)}</td></tr>
                <tr><td className="muted">Date de souscription</td><td>{fmtDate(detailFor.createdAt)}</td></tr>
              </tbody>
            </table>
            {isSuper && (
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
                {detailFor.selfieUrl && (
                  <img
                    src={detailFor.selfieUrl}
                    alt="Photo carte"
                    style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1.5px solid var(--border, #e5e7eb)" }}
                  />
                )}
                <button className="btn btn-ghost" onClick={() => setPhotoFor(detailFor)}>
                  <Camera size={15} /> {detailFor.selfieUrl ? "Modifier la photo de la carte" : "Ajouter une photo pour la carte"}
                </button>
              </div>
            )}
            <ActionsDocumentsClient
              souscriptionId={detailFor.id}
              type="accident"
              numeroPolice={detailFor.numeroPolice}
              onNotify={notify}
            />
            <PhotosClientModal
              souscriptionId={detailFor.id}
              produitType="accident"
              referenceFichier={detailFor.numeroPolice}
            />
            {isSuper && (
              <AccesClientModal
                souscriptionId={detailFor.id}
                produitType="accident"
                espaceClientActif={!!detailFor.espaceClientActif}
                onNotify={notify}
              />
            )}
          </div>
        </div>
      )}
      {photoFor && (
        <PhotoCarteModal
          souscriptionId={photoFor.id}
          produit={CODE_ACCIDENT_HISTORIQUE}
          onClose={() => setPhotoFor(null)}
          onSaved={() => {
            notify("Photo mise à jour ✓");
            reload();
            setDetailFor(null);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
