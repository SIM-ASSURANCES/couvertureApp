import { useState } from "react";
import { Download, FileSpreadsheet, Trash2, Bell, Send, Camera, Eye, X, Search } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fcfa, fmtDate, waveBadge } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { downloadCsv, api } from "../../../api";
import { exportExcel } from "../../../xlsx";
import { useAuth } from "../../../auth";
import PhotoCarteModal from "../../../components/PhotoCarteModal";
import AccesClientModal from "../../../components/AccesClientModal";
import PhotosClientModal from "../../../components/PhotosClientModal";
import ActionsDocumentsClient from "../../../components/ActionsDocumentsClient";

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
  partenaireResponsable?: string | null;
  produit: { code: string; libelle: string };
  createdAt: string;
  dateDebut?: string | null;
  dateFin?: string | null;
  cycleFacturation?: string | null;
  renouvellementEnCoursDepuis?: string | null;
  renouveleAt?: string | null;
  espaceClientActif?: boolean;
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
  const [photoFor, setPhotoFor] = useState<SouscriptionAssurancesAccidents | null>(null);
  const [detailFor, setDetailFor] = useState<SouscriptionAssurancesAccidents | null>(null);
  const [recherche, setRecherche] = useState("");

  const donneesFiltrees = (data ?? []).filter((c) => {
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return [c.nom, c.prenom, c.telephone, c.numeroPolice, c.partenaireNom, c.produit.libelle]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

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
        "Partenaire": c.partenaireResponsable || c.partenaireNom,
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
                  <td>{c.partenaireResponsable || c.partenaireNom}</td>
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

      <Card
        title={data ? `${donneesFiltrees.length} contrats` : "Contrats"}
        noBody
        style={{ marginTop: 24 }}
        extra={
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-2)" }} />
            <input
              className="input"
              style={{ width: 260, height: 40, paddingLeft: 34 }}
              placeholder="Rechercher (nom, téléphone, N° police...)"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
        }
      >
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap table-wrap-scroll">
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
                {donneesFiltrees.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.prenom} {c.nom}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                    </td>
                    <td>{c.produit.libelle}</td>
                    <td>{c.partenaireResponsable || c.partenaireNom}</td>
                    <td><strong>{fcfa(c.montantPrime)}</strong></td>
                    <td>{waveBadge(c.waveStatut ?? "en_attente")}</td>
                    <td className="muted">{c.numeroPolice ?? "—"}</td>
                    <td className="muted">{c.dateFin ? fmtDate(c.dateFin) : "—"}</td>
                    <td>{statutRenouvellement(c)}</td>
                    <td className="muted">{c.dateDebut ? fmtDate(c.dateDebut) : "—"}</td>
                    {isSuper && (
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost" style={{ padding: 8 }} title="Voir les détails" onClick={() => setDetailFor(c)}>
                            <Eye size={15} />
                          </button>
                          <button className="btn btn-ghost" style={{ padding: 8 }} title="Modifier la photo de la carte" onClick={() => setPhotoFor(c)}>
                            <Camera size={15} />
                          </button>
                          <button className="btn btn-ghost" style={{ padding: 8 }} title="Supprimer" onClick={() => remove(c)}>
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {donneesFiltrees.length === 0 && (
                  <tr><td colSpan={isSuper ? 10 : 9}><div className="empty">{recherche ? "Aucun résultat pour cette recherche." : "Aucun client pour l'instant."}</div></td></tr>
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
                <tr><td className="muted">Produit</td><td>{detailFor.produit.libelle}</td></tr>
                <tr><td className="muted">Partenaire</td><td>{detailFor.partenaireResponsable || detailFor.partenaireNom}</td></tr>
                <tr><td className="muted">Prime</td><td><strong>{fcfa(detailFor.montantPrime)}</strong></td></tr>
                <tr><td className="muted">Capital garanti</td><td>{fcfa(detailFor.capitalGaranti)}</td></tr>
                <tr><td className="muted">Statut</td><td>{waveBadge(detailFor.waveStatut ?? "en_attente")}</td></tr>
                <tr><td className="muted">N° police</td><td>{detailFor.numeroPolice ?? "—"}</td></tr>
                <tr><td className="muted">Date d'effet</td><td>{detailFor.dateDebut ? fmtDate(detailFor.dateDebut) : "—"}</td></tr>
                <tr><td className="muted">Date d'échéance</td><td>{detailFor.dateFin ? fmtDate(detailFor.dateFin) : "—"}</td></tr>
                <tr><td className="muted">Renouvellement</td><td>{statutRenouvellement(detailFor)}</td></tr>
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
              type={detailFor.produit.code}
              numeroPolice={detailFor.numeroPolice}
              onNotify={notify}
            />
            <PhotosClientModal
              souscriptionId={detailFor.id}
              produitType="generique"
              referenceFichier={detailFor.numeroPolice}
            />
            {isSuper && (
              <AccesClientModal
                souscriptionId={detailFor.id}
                produitType="generique"
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
          produit={photoFor.produit.code}
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
