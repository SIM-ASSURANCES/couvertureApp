import { useState } from "react";
import { Download, MessageCircle, Trash2, FileText, X } from "lucide-react";
import {
  PageHeader,
  Card,
  Loader,
  ErrorBox,
  statutIncendieBadge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api, downloadCsv } from "../../api";
import { useAuth } from "../../auth";
import type { ClientIncendie, Partenaire } from "../../types";

export default function ClientsIncendie() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [statut, setStatut] = useState("");
  const [part, setPart] = useState("");
  const [toast, setToast] = useState("");
  const params = new URLSearchParams();
  if (statut) params.set("statut", statut);
  if (part) params.set("partenaireId", part);

  const { data, loading, error, reload } = useFetch<ClientIncendie[]>(
    `/souscriptions/incendie?${params.toString()}`
  );
  const { data: partenaires } = useFetch<Partenaire[]>("/partenaires");

  const [factureFor, setFactureFor] = useState<ClientIncendie | null>(null);
  const [factureVal, setFactureVal] = useState("");
  const [communeVal, setCommuneVal] = useState("");
  const [quartierVal, setQuartierVal] = useState("");
  const [numeroMaisonVal, setNumeroMaisonVal] = useState("");
  const [savingFacture, setSavingFacture] = useState(false);

  async function saveFacture() {
    if (
      !factureFor ||
      !factureVal.trim() ||
      !communeVal.trim() ||
      !quartierVal.trim() ||
      !numeroMaisonVal.trim()
    )
      return;
    setSavingFacture(true);
    try {
      await api.patch(`/souscriptions/incendie/${factureFor.id}/facture`, {
        refFacture: factureVal.trim(),
        commune: communeVal.trim(),
        quartier: quartierVal.trim(),
        numeroMaison: numeroMaisonVal.trim(),
      });
      setToast("Réf.facture enregistrée ✓");
      setTimeout(() => setToast(""), 2500);
      setFactureFor(null);
      reload();
    } catch (e) {
      setToast((e as Error).message);
      setTimeout(() => setToast(""), 2500);
    } finally {
      setSavingFacture(false);
    }
  }

  async function relance(id: string) {
    await api.post(`/souscriptions/incendie/${id}/relance`);
    setToast("Relance SMS envoyée ✓");
    setTimeout(() => setToast(""), 2500);
    reload();
  }

  async function supprimer(id: string) {
    if (!confirm("Supprimer définitivement ce client ?")) return;
    try {
      await api.del(`/souscriptions/incendie/${id}`);
      setToast("Client supprimé ✓");
      setTimeout(() => setToast(""), 2500);
      reload();
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Clients — Assurance Incendie"
        subtitle="Souscriptions générées par scan du QR Incendie des partenaires."
        actions={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => downloadCsv("/souscriptions/incendie/export.csv", "clients_incendie.csv")}
            >
              <Download size={16} /> CSV
            </button>
            <button
              className="btn btn-danger-soft"
              onClick={() => downloadCsv("/souscriptions/incendie/export.csv", "clients_incendie.csv")}
            >
              <Download size={16} /> Excel
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
            <select className="select" style={{ width: 170, height: 40 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Tous statuts</option>
              <option value="en_cours">En cours</option>
              <option value="complet">Complète</option>
              <option value="expire">Expiré</option>
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
                  <th>Téléphone</th>
                  <th>Nom / Prénom</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Capital garanti</th>
                  <th>Réf. facture</th>
                  <th>Statut</th>
                  <th>Date</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.telephone}</strong></td>
                    <td>
                      {c.nom || c.prenom ? (
                        `${c.prenom ?? ""} ${c.nom ?? ""}`.trim()
                      ) : (
                        <span className="muted">Non renseigné</span>
                      )}
                    </td>
                    <td>{c.partenaireNom}</td>
                    <td><strong>{fcfa(c.montantPrime)}</strong></td>
                    <td className="muted">{fcfa(c.capitalGaranti)}</td>
                    <td>{c.refFacture ?? <span className="muted">—</span>}</td>
                    <td>{statutIncendieBadge(c.statut)}</td>
                    <td className="muted">{fmtDate(c.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Saisir / modifier la réf.facture"
                          onClick={() => {
                            setFactureFor(c);
                            setFactureVal(c.refFacture ?? "");
                            setCommuneVal(c.commune ?? "");
                            setQuartierVal(c.quartier ?? "");
                            setNumeroMaisonVal(c.numeroMaison ?? "");
                          }}
                        >
                          <FileText size={15} color="var(--sim-primary)" />
                        </button>
                        {c.statut !== "complet" && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px", position: "relative" }}
                            title={
                              c.relanceCount
                                ? `Relancer par SMS (${c.relanceCount} relance${c.relanceCount > 1 ? "s" : ""} déjà envoyée${c.relanceCount > 1 ? "s" : ""})`
                                : "Relancer par SMS"
                            }
                            onClick={() => relance(c.id)}
                          >
                            <MessageCircle size={15} />
                            {!!c.relanceCount && c.relanceCount > 0 && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: -6,
                                  right: -6,
                                  minWidth: 17,
                                  height: 17,
                                  padding: "0 4px",
                                  borderRadius: 9,
                                  background: "var(--danger, #dc2626)",
                                  color: "#fff",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  lineHeight: "17px",
                                  textAlign: "center",
                                  boxShadow: "0 0 0 2px var(--card, #fff)",
                                }}
                              >
                                {c.relanceCount}
                              </span>
                            )}
                          </button>
                        )}
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
                  <tr><td colSpan={9}><div className="empty">Aucune souscription.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {factureFor && (
        <div
          onClick={() => setFactureFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: "100%", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 16 }}>Réf. facture</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setFactureFor(null)}><X size={18} /></button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Souscripteur : <strong>{factureFor.telephone}</strong>
              {factureFor.prenom || factureFor.nom ? ` — ${factureFor.prenom ?? ""} ${factureFor.nom ?? ""}`.trimEnd() : ""}
            </p>
            <div className="field">
              <label className="label">Réf. facture communiquée</label>
              <input
                className="input"
                autoFocus
                value={factureVal}
                placeholder="ex: FAC-2026-00123"
                onChange={(e) => setFactureVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveFacture(); }}
              />
            </div>
            <div className="field">
              <label className="label">Commune</label>
              <input
                className="input"
                value={communeVal}
                placeholder="ex: Cocody"
                onChange={(e) => setCommuneVal(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Quartier</label>
              <input
                className="input"
                value={quartierVal}
                placeholder="ex: Angré"
                onChange={(e) => setQuartierVal(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">N° de maison</label>
              <input
                className="input"
                value={numeroMaisonVal}
                placeholder="ex: Ilot 12, lot 34"
                onChange={(e) => setNumeroMaisonVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveFacture(); }}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                La souscription passera au statut « complète ».
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={
                  savingFacture ||
                  !factureVal.trim() ||
                  !communeVal.trim() ||
                  !quartierVal.trim() ||
                  !numeroMaisonVal.trim()
                }
                onClick={saveFacture}
              >
                {savingFacture ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button className="btn btn-ghost" onClick={() => setFactureFor(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
