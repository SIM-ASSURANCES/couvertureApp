import { useState } from "react";
import { PageHeader, Card, StatCard, Loader, ErrorBox, Badge, fcfa, fmtDate } from "../../components/ui";
import { Wallet, HandCoins, PiggyBank, Send } from "lucide-react";
import { useFetch } from "../../useFetch";
import { api } from "../../api";

interface Demande {
  id: string;
  montant: number;
  statut: "en_attente" | "validee" | "rejetee";
  createdAt: string;
  traiteeAt?: string | null;
  motifRejet?: string | null;
}
interface Commission {
  totale: number;
  encaissee: number;
  due: number;
  canRequest: boolean;
  enAttente: boolean;
  prochaineDate: string | null;
  demandes: Demande[];
}

function demandeBadge(s: string) {
  if (s === "validee") return <Badge kind="success">Validée</Badge>;
  if (s === "rejetee") return <Badge kind="danger">Rejetée</Badge>;
  return <Badge kind="warning">En attente</Badge>;
}

export default function PartenaireCommissions() {
  const { data, loading, error, reload } = useFetch<Commission>("/me/commission");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function demander() {
    setSubmitting(true);
    try {
      await api.post("/me/commission/demande");
      notify("Demande envoyée ✓ En attente de validation.");
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Mes commissions"
        subtitle="Rémunération sur les souscriptions générées via votre réseau."
      />

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="stat-grid" style={{ marginTop: 24 }}>
            <StatCard icon={<Wallet size={20} />} label="Commission totale" value={fcfa(data.totale)} />
            <StatCard icon={<PiggyBank size={20} />} label="Commission encaissée" value={fcfa(data.encaissee)} color="#15803d" bg="#e8f6ec" />
            <StatCard icon={<HandCoins size={20} />} label="Commission due" value={fcfa(data.due)} color="#b45309" bg="#fdf3e3" />
          </div>

          <div style={{ marginTop: 24 }}>
            <Card title="Demander le versement de ma commission">
              <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 16 }}>
                Vous pouvez demander le versement de votre commission due toutes les 2 semaines.
              </p>
              <button
                className="btn btn-primary"
                disabled={!data.canRequest || submitting}
                onClick={demander}
              >
                <Send size={16} />
                {submitting ? "Envoi…" : `Demander ma commission (${fcfa(data.due)})`}
              </button>
              {!data.canRequest && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  {data.enAttente
                    ? "Une demande est déjà en attente de validation par l'administration."
                    : data.due <= 0
                    ? "Aucune commission due actuellement."
                    : data.prochaineDate
                    ? `Prochaine demande possible le ${new Date(data.prochaineDate).toLocaleDateString("fr-FR")}.`
                    : ""}
                </p>
              )}
            </Card>
          </div>

          <div style={{ marginTop: 24 }}>
            <Card title="Historique des demandes" noBody>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>Statut</th>
                      <th>Traitée le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.demandes.map((d) => (
                      <tr key={d.id}>
                        <td className="muted">{fmtDate(d.createdAt)}</td>
                        <td><strong>{fcfa(d.montant)}</strong></td>
                        <td>
                          {demandeBadge(d.statut)}
                          {d.motifRejet ? <div className="muted" style={{ fontSize: 11 }}>{d.motifRejet}</div> : null}
                        </td>
                        <td className="muted">{d.traiteeAt ? fmtDate(d.traiteeAt) : "—"}</td>
                      </tr>
                    ))}
                    {data.demandes.length === 0 && (
                      <tr><td colSpan={4}><div className="empty">Aucune demande pour l'instant.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
