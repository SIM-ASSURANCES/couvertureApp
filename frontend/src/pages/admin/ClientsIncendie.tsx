import { useState } from "react";
import { Download, MessageCircle, Trash2 } from "lucide-react";
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

  async function relance(id: string) {
    await api.post(`/souscriptions/incendie/${id}/relance`);
    setToast("Relance WhatsApp envoyée ✓");
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
                  <th>N° facture</th>
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
                    <td>{c.numeroFacture ?? <span className="muted">—</span>}</td>
                    <td>{statutIncendieBadge(c.statut)}</td>
                    <td className="muted">{fmtDate(c.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {c.statut !== "complet" && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px" }}
                            title="Relancer par WhatsApp"
                            onClick={() => relance(c.id)}
                          >
                            <MessageCircle size={15} />
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
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
