import { useState } from "react";
import { RefreshCcw, RotateCw } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fcfa, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";

interface EcheanceEnAttente {
  id: string;
  souscriptionId: string;
  numeroEcheance: number;
  montant: number;
  statut: "en_attente" | "paye" | "echoue";
  dateEcheance: string;
  souscription: {
    nom?: string | null;
    prenom?: string | null;
    telephone: string;
    partenaire: { nomCommerce: string };
    produit: { code: string; libelle: string };
  };
}

export default function RelaxPaiementsEnAttente() {
  const { data, loading, error, reload } = useFetch<EcheanceEnAttente[]>("/relax/echeances");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function relancer(e: EcheanceEnAttente) {
    setBusy(e.id);
    try {
      await api.post(`/relax/souscriptions/${e.souscriptionId}/echeances/${e.numeroEcheance}/relance-paiement`);
      notify("Lien de paiement renvoyé ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifier(e: EcheanceEnAttente) {
    setBusy(e.id);
    try {
      const r = await api.post<{ statut: string }>(`/relax/souscriptions/${e.souscriptionId}/echeances/${e.numeroEcheance}/verifier`);
      notify(r.statut === "paye" ? "Paiement confirmé ✓" : "Toujours en attente");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Paiements en attente — Relax"
        subtitle="Échéances non payées ou échouées, tous abonnements confondus."
      />

      <Card title={data ? `${data.length} échéances` : "Échéances"} noBody style={{ marginTop: 24 }}>
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
                  <th>Échéance</th>
                  <th>Montant</th>
                  <th>Date prévue</th>
                  <th>Statut</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.souscription.prenom} {e.souscription.nom}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{e.souscription.telephone}</div>
                    </td>
                    <td>{e.souscription.produit.libelle}</td>
                    <td>{e.souscription.partenaire.nomCommerce}</td>
                    <td className="muted">N° {e.numeroEcheance}</td>
                    <td><strong>{fcfa(e.montant)}</strong></td>
                    <td className="muted">{fmtDate(e.dateEcheance)}</td>
                    <td>{e.statut === "echoue" ? <Badge kind="danger">Échoué</Badge> : <Badge kind="warning">En attente</Badge>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: 8 }} title="Vérifier le paiement" disabled={busy === e.id} onClick={() => verifier(e)}>
                          <RefreshCcw size={15} />
                        </button>
                        <button className="btn btn-ghost" style={{ padding: 8 }} title="Relancer le paiement" disabled={busy === e.id} onClick={() => relancer(e)}>
                          <RotateCw size={15} color="var(--sim-primary)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={8}><div className="empty">Aucune échéance en attente. 🎉</div></td></tr>
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
