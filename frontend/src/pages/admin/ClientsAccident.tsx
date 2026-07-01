import { useState } from "react";
import { Download, Trash2, RefreshCw } from "lucide-react";
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
import type { ClientAccident, Partenaire } from "../../types";

export default function ClientsAccident() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [wave, setWave] = useState("");
  const [part, setPart] = useState("");
  const [toast, setToast] = useState("");
  const params = new URLSearchParams();
  if (wave) params.set("waveStatut", wave);
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

  const [verifId, setVerifId] = useState("");
  async function verifier(id: string) {
    setVerifId(id);
    try {
      const r = await api.post<{ statut: string }>(
        `/souscriptions/accident/${id}/verifier`,
        {}
      );
      if (r.statut === "confirme") setToast("Paiement confirmé ✓");
      else if (r.statut === "echoue") setToast("Paiement échoué côté Wave.");
      else setToast("Toujours en attente — paiement non abouti chez Wave.");
      setTimeout(() => setToast(""), 3500);
      reload();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setVerifId("");
    }
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
            <button className="btn btn-danger-soft" onClick={() => downloadCsv("/souscriptions/accident/export.csv", "clients_accident.csv")}>
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
            <select className="select" style={{ width: 170, height: 40 }} value={wave} onChange={(e) => setWave(e.target.value)}>
              <option value="">Tous paiements</option>
              <option value="confirme">Confirmé</option>
              <option value="en_attente">En attente</option>
              <option value="echoue">Échoué</option>
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
                        {c.waveStatut === "en_attente" && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px" }}
                            title="Vérifier le paiement Wave"
                            disabled={verifId === c.id}
                            onClick={() => verifier(c.id)}
                          >
                            <RefreshCw size={15} className={verifId === c.id ? "spin" : ""} />
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
                  <tr><td colSpan={10}><div className="empty">Aucune souscription.</div></td></tr>
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
