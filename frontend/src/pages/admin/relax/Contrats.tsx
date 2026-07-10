import { useState } from "react";
import { Send, CheckCircle2, RotateCcw } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import type { CarteRelax, SouscriptionRelax } from "../../../types";

function carteBadge(statut: string) {
  if (statut === "activee") return <Badge kind="success">Activée</Badge>;
  if (statut === "envoyee") return <Badge kind="info">Envoyée</Badge>;
  return <Badge kind="warning">Générée</Badge>;
}

export default function RelaxContrats() {
  const { data: souscriptions, loading, error } = useFetch<SouscriptionRelax[]>("/relax/souscriptions");
  const { data: cartes, reload: reloadCartes } = useFetch<CarteRelax[]>("/relax/cartes");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  const carteBySouscription = new Map((cartes ?? []).map((c) => [c.souscriptionId, c]));

  async function action(souscriptionId: string, path: string, label: string) {
    setBusy(souscriptionId);
    try {
      await api.post(`/relax/souscriptions/${souscriptionId}/carte/${path}`);
      notify(`${label} ✓`);
      reloadCartes();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Contrats & Cartes — Relax"
        subtitle="Abonnements confirmés et suivi de la carte de prise en charge."
      />

      <Card title={souscriptions ? `${souscriptions.length} contrats` : "Contrats"} noBody style={{ marginTop: 24 }}>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {souscriptions && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Partenaire</th>
                  <th>N° police</th>
                  <th>Carte</th>
                  <th>Date</th>
                  <th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {souscriptions.map((s) => {
                  const carte = carteBySouscription.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.prenom} {s.nom}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{s.telephone}</div>
                      </td>
                      <td>{s.produit.libelle}</td>
                      <td>{s.partenaireNom}</td>
                      <td className="muted">{s.numeroPolice ?? "—"}</td>
                      <td>
                        {carte ? (
                          <>
                            {carteBadge(carte.statut)}
                            <div className="muted" style={{ fontSize: 11 }}>{carte.numero}</div>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="muted">{fmtDate(s.createdAt)}</td>
                      <td>
                        {carte && (
                          <div style={{ display: "flex", gap: 6 }}>
                            {carte.statut === "generee" && (
                              <button className="btn btn-ghost" style={{ padding: 8 }} title="Marquer envoyée" disabled={busy === s.id} onClick={() => action(s.id, "envoyer", "Carte envoyée")}>
                                <Send size={15} />
                              </button>
                            )}
                            {carte.statut === "envoyee" && (
                              <button className="btn btn-ghost" style={{ padding: 8 }} title="Marquer activée" disabled={busy === s.id} onClick={() => action(s.id, "activer", "Carte activée")}>
                                <CheckCircle2 size={15} color="var(--success)" />
                              </button>
                            )}
                            <button className="btn btn-ghost" style={{ padding: 8 }} title="Renouveler la carte" disabled={busy === s.id} onClick={() => action(s.id, "renouveler", "Carte renouvelée")}>
                              <RotateCcw size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {souscriptions.length === 0 && (
                  <tr><td colSpan={7}><div className="empty">Aucun contrat pour l'instant.</div></td></tr>
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
