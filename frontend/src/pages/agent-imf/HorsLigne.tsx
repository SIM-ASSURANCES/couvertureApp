import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Trash2, Download, Wifi, WifiOff } from "lucide-react";
import { PageHeader, Card, Badge, fcfa, fmtDate } from "../../components/ui";
import { useOnline } from "../../offline/useOnline";
import { getAllQueueItems, removeQueueItem, type SouscriptionEnAttente } from "../../offline/db";
import { syncPendingQueue } from "../../offline/sync";
import { genererContratImf, contratImfDisponible } from "../../contract";

function statutBadge(s: SouscriptionEnAttente["statut"]) {
  if (s === "synchronisation") return <Badge kind="info">Synchronisation…</Badge>;
  if (s === "erreur") return <Badge kind="danger">Échec</Badge>;
  if (s === "synchronise") return <Badge kind="success">Synchronisé</Badge>;
  return <Badge kind="warning">En attente</Badge>;
}

/**
 * File des souscriptions créées hors-ligne dans le simulateur, en attente de
 * synchronisation avec le serveur. Voir frontend/src/offline/ pour le détail
 * du mécanisme (calcul local, file IndexedDB, idempotence par offlineId).
 */
export default function HorsLigne() {
  const online = useOnline();
  const [items, setItems] = useState<SouscriptionEnAttente[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState("");

  const charger = useCallback(async () => {
    setLoading(true);
    setItems(await getAllQueueItems());
    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (online) synchroniser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function synchroniser() {
    setSyncing(true);
    setLastResult("");
    try {
      const { synced, failed } = await syncPendingQueue();
      if (synced || failed) {
        setLastResult(`${synced} synchronisée(s)${failed ? `, ${failed} échec(s)` : ""}.`);
      }
    } finally {
      setSyncing(false);
      charger();
    }
  }

  async function supprimer(offlineId: string) {
    if (!window.confirm("Supprimer définitivement cette souscription en attente ? Elle ne sera jamais transmise au serveur.")) return;
    await removeQueueItem(offlineId);
    charger();
  }

  function telecharger(item: SouscriptionEnAttente) {
    genererContratImf({
      id: item.offlineId,
      numeroPolice: item.tempNumero,
      agentId: null,
      simulationId: null,
      produitCode: item.produitCode,
      nom: item.client.nom,
      prenom: item.client.prenom,
      telephone: item.client.telephone,
      email: item.client.email ?? null,
      typePiece: item.client.typePiece,
      numeroPiece: item.client.numeroPiece,
      signature: item.client.signature ?? null,
      entrees: item.entrees,
      resultat: item.resultat as Record<string, unknown>,
      primeTTC: item.primeTTC,
      statut: "active",
      createdAt: item.createdAt,
    });
  }

  return (
    <>
      <PageHeader
        title="Hors-ligne"
        subtitle="Souscriptions saisies sans connexion. Les primes affichées sont des estimations, confirmées par le serveur à la synchronisation."
        actions={
          <button className="btn btn-primary" disabled={!online || syncing || items.length === 0} onClick={synchroniser}>
            <RefreshCw size={16} className={syncing ? "spin" : ""} /> {syncing ? "Synchronisation…" : "Synchroniser maintenant"}
          </button>
        }
      />

      <div
        style={{
          marginTop: 16, padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          background: online ? "rgba(22,163,74,0.12)" : "rgba(245,158,11,0.12)",
          color: online ? "#16a34a" : "#b45309",
        }}
      >
        {online ? <Wifi size={16} /> : <WifiOff size={16} />}
        {online ? "Connecté — la synchronisation se fait automatiquement." : "Hors-ligne — les nouvelles souscriptions du simulateur seront mises en file ici."}
      </div>

      {lastResult && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{lastResult}</div>}

      <Card title={loading ? "Chargement…" : `${items.length} en attente`} noBody style={{ marginTop: 24 }}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° provisoire</th>
                <th>Client</th>
                <th>Produit</th>
                <th style={{ textAlign: "right" }}>Prime TTC</th>
                <th>Créée le</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.offlineId}>
                  <td><strong>{item.tempNumero}</strong></td>
                  <td>{item.client.prenom} {item.client.nom}<div className="muted" style={{ fontSize: 12 }}>{item.client.telephone}</div></td>
                  <td className="muted">{item.produitCode}</td>
                  <td style={{ textAlign: "right" }}>{fcfa(item.primeTTC)}</td>
                  <td className="muted">{fmtDate(item.createdAt)}</td>
                  <td>
                    {statutBadge(item.statut)}
                    {item.statut === "erreur" && item.erreur && (
                      <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4, maxWidth: 220 }}>{item.erreur}</div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {contratImfDisponible(item.produitCode) && (
                        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} title="Télécharger le contrat (provisoire)" onClick={() => telecharger(item)}>
                          <Download size={15} />
                        </button>
                      )}
                      <button className="btn btn-ghost" style={{ padding: "7px 10px" }} title="Supprimer" onClick={() => supprimer(item.offlineId)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7}><div className="empty">Aucune souscription en attente de synchronisation.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
