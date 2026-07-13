import { useState } from "react";
import { RefreshCw, Send, Trash2, Eye, X, FileSpreadsheet } from "lucide-react";
import {
  PageHeader,
  Card,
  Loader,
  ErrorBox,
  waveBadge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { exportExcel } from "../../xlsx";
import type { ClientAccident, Partenaire } from "../../types";

export default function PaiementsEnAttente() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [part, setPart] = useState("");
  const [toast, setToast] = useState("");
  const params = new URLSearchParams();
  params.set("attente", "1");
  if (part) params.set("partenaireId", part);

  const { data, loading, error, reload } = useFetch<ClientAccident[]>(
    `/souscriptions/accident?${params.toString()}`
  );
  const { data: partenaires } = useFetch<Partenaire[]>("/partenaires");

  const [detailFor, setDetailFor] = useState<ClientAccident | null>(null);
  const [verifId, setVerifId] = useState("");
  const [relanceId, setRelanceId] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3500);
  }

  async function verifier(id: string) {
    setVerifId(id);
    try {
      const r = await api.post<{ statut: string }>(
        `/souscriptions/accident/${id}/verifier`,
        {}
      );
      if (r.statut === "confirme") notify("Paiement confirmé ✓");
      else if (r.statut === "echoue") notify("Paiement échoué côté Wave.");
      else notify("Toujours en attente — paiement non abouti chez Wave.");
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setVerifId("");
    }
  }

  async function relancer(id: string) {
    setRelanceId(id);
    try {
      await api.post(`/souscriptions/accident/${id}/relance-paiement`, {});
      notify("Lien de paiement Wave envoyé par SMS ✓");
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setRelanceId("");
    }
  }

  async function supprimer(id: string) {
    if (!confirm("Supprimer définitivement cette souscription ?")) return;
    try {
      await api.del(`/souscriptions/accident/${id}`);
      notify("Souscription supprimée ✓");
      reload();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((c) => ({
        "Prénom": c.prenom,
        "Nom": c.nom,
        "Téléphone": c.telephone,
        "Partenaire": c.partenaireNom,
        "Prime": c.montantPrime,
        "Paiement Wave": c.waveStatut,
        "Date": fmtDate(c.createdAt),
      })),
      "paiements_en_attente.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Paiement en attente"
        subtitle="Souscriptions Accident dont le paiement Wave n'a pas encore abouti."
        actions={
          <button className="btn btn-danger-soft" onClick={exportXlsx}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        }
      />

      <Card
        title={data ? `${data.length} en attente` : "En attente"}
        extra={
          <select className="select" style={{ width: 180, height: 40 }} value={part} onChange={(e) => setPart(e.target.value)}>
            <option value="">Tous partenaires</option>
            {partenaires?.map((p) => (
              <option key={p.id} value={p.id}>{p.nomCommerce}</option>
            ))}
          </select>
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
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Paiement Wave</th>
                  <th>Date</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.prenom} {c.nom}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                    </td>
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
                    <td>{waveBadge(c.waveStatut)}</td>
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
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Vérifier le paiement Wave"
                          disabled={verifId === c.id}
                          onClick={() => verifier(c.id)}
                        >
                          <RefreshCw size={15} className={verifId === c.id ? "spin" : ""} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px", position: "relative" }}
                          title={
                            c.relanceCount
                              ? `Relancer par SMS (déjà relancé ${c.relanceCount} fois)`
                              : "Relancer par SMS (nouveau lien Wave, montant exact)"
                          }
                          disabled={relanceId === c.id}
                          onClick={() => relancer(c.id)}
                        >
                          <Send size={15} />
                          {!!c.relanceCount && (
                            <span
                              style={{
                                position: "absolute",
                                top: -5,
                                right: -5,
                                background: "var(--danger)",
                                color: "#fff",
                                borderRadius: "999px",
                                fontSize: 10,
                                fontWeight: 700,
                                lineHeight: 1,
                                padding: "3px 5px",
                                minWidth: 16,
                                textAlign: "center",
                              }}
                            >
                              {c.relanceCount}
                            </span>
                          )}
                        </button>
                        {isSuper && (
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
                  <tr><td colSpan={6}><div className="empty">Aucun paiement en attente.</div></td></tr>
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
