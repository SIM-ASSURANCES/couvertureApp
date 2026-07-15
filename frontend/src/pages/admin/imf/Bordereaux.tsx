import { Fragment, useState } from "react";
import { FilePlus, ChevronDown, ChevronUp, FileSpreadsheet, Banknote } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import { exportExcel } from "../../../xlsx";
import type { AgenceImf, BordereauImf, BordereauImfDetail } from "../../../types";

function statutBadge(s: BordereauImf["statut"]) {
  if (s === "regle") return <Badge kind="success">Réglé</Badge>;
  if (s === "partiellement_regle") return <Badge kind="warning">Partiellement réglé</Badge>;
  return <Badge kind="info">Émis</Badge>;
}

/** Détail dépliable d'un bordereau : souscriptions incluses, virements pointés, export Excel. */
function DetailBordereau({ id, onUpdated }: { id: string; onUpdated: (b: BordereauImf) => void }) {
  const { data, loading, error, reload } = useFetch<BordereauImfDetail>(`/imf/bordereaux/${id}`);
  const [montant, setMontant] = useState(0);
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function pointerVirement(e: React.FormEvent) {
    e.preventDefault();
    if (!montant || !date || !reference.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await api.post<BordereauImf>(`/imf/bordereaux/${id}/virements`, { montant, date, reference: reference.trim() });
      onUpdated(updated);
      setMontant(0);
      setDate("");
      setReference("");
      reload();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function exporter() {
    if (!data) return;
    exportExcel(
      data.souscriptions.map((s) => ({
        "N° de police": s.numeroPolice,
        "Client": `${s.prenom} ${s.nom}`,
        "Produit": s.produitCode,
        "Agent": s.agentNom ?? "",
        "Prime TTC": s.primeTTC,
        "Date": fmtDate(s.createdAt),
      })),
      `${data.numero}.xlsx`
    );
  }

  if (loading) return <div style={{ padding: 16 }}><Loader /></div>;
  if (error || !data) return <div style={{ padding: 16 }}><ErrorBox message={error ?? "Introuvable"} /></div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {data.nombreSouscriptions} souscription(s) · {fcfa(data.primeTotal)} · reçu : {fcfa(data.montantRecu)}
        </div>
        <button className="btn btn-ghost" onClick={exporter}>
          <FileSpreadsheet size={15} /> Export Excel
        </button>
      </div>

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="tbl">
          <thead>
            <tr><th>N° de police</th><th>Client</th><th>Produit</th><th>Agent</th><th>Prime TTC</th><th>Date</th></tr>
          </thead>
          <tbody>
            {data.souscriptions.map((s) => (
              <tr key={s.numeroPolice}>
                <td><strong>{s.numeroPolice}</strong></td>
                <td>{s.prenom} {s.nom}</td>
                <td className="muted">{s.produitCode}</td>
                <td className="muted">{s.agentNom}</td>
                <td>{fcfa(s.primeTTC)}</td>
                <td className="muted">{fmtDate(s.createdAt)}</td>
              </tr>
            ))}
            {data.souscriptions.length === 0 && (
              <tr><td colSpan={6}><div className="empty">Aucune souscription dans ce bordereau.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Virements pointés</div>
      {data.virements.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Aucun virement enregistré.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          {data.virements.map((v, i) => (
            <div key={i} className="muted" style={{ fontSize: 13 }}>
              {fmtDate(v.date)} · {fcfa(v.montant)} · réf. {v.reference}
            </div>
          ))}
        </div>
      )}

      {data.statut !== "regle" && (
        <form onSubmit={pointerVirement} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
            <label className="label">Montant</label>
            <input className="input" type="number" value={montant} onChange={(e) => setMontant(Number(e.target.value))} />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
            <label className="label">Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
            <label className="label">Référence</label>
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Réf. virement" />
          </div>
          <button className="btn btn-primary" disabled={saving || !montant || !date || !reference.trim()}>
            <Banknote size={16} /> {saving ? "Enregistrement…" : "Pointer le virement"}
          </button>
        </form>
      )}
      {saveError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{saveError}</div>}
    </div>
  );
}

export default function Bordereaux() {
  const { data: agences } = useFetch<AgenceImf[]>("/imf/agences");
  const [agenceFiltre, setAgenceFiltre] = useState("");
  const [statutFiltre, setStatutFiltre] = useState("");
  const params = new URLSearchParams();
  if (agenceFiltre) params.set("agenceId", agenceFiltre);
  if (statutFiltre) params.set("statut", statutFiltre);
  const { data, loading, error, reload, setData } = useFetch<BordereauImf[]>(`/imf/bordereaux?${params.toString()}`);

  const [agenceId, setAgenceId] = useState("");
  const [periodeDebut, setPeriodeDebut] = useState("");
  const [periodeFin, setPeriodeFin] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function generer(e: React.FormEvent) {
    e.preventDefault();
    if (!agenceId || !periodeDebut || !periodeFin) return;
    setGenerating(true);
    setGenError("");
    try {
      await api.post<BordereauImf>("/imf/bordereaux", { agenceId, periodeDebut, periodeFin });
      setAgenceId("");
      setPeriodeDebut("");
      setPeriodeFin("");
      reload();
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function onUpdated(b: BordereauImf) {
    setData((data ?? []).map((x) => (x.id === b.id ? b : x)));
  }

  return (
    <>
      <PageHeader title="Bordereaux IMF" subtitle="Production périodique par agence et pointage des virements reçus." />

      <Card title="Générer un bordereau" style={{ marginTop: 24 }}>
        <form onSubmit={generer}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Agence <span className="req">*</span></label>
              <select className="select" required value={agenceId} onChange={(e) => setAgenceId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {(agences ?? []).map((a) => <option key={a.id} value={a.id}>{a.nom} ({a.zoneNom})</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label className="label">Début de période <span className="req">*</span></label>
              <input className="input" type="date" required value={periodeDebut} onChange={(e) => setPeriodeDebut(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label className="label">Fin de période <span className="req">*</span></label>
              <input className="input" type="date" required value={periodeFin} onChange={(e) => setPeriodeFin(e.target.value)} />
            </div>
          </div>
          {genError && <div className="empty" style={{ color: "var(--danger)", marginBottom: 12 }}>{genError}</div>}
          <button className="btn btn-primary" disabled={generating || !agenceId || !periodeDebut || !periodeFin}>
            <FilePlus size={16} /> {generating ? "Génération…" : "Générer le bordereau"}
          </button>
        </form>
      </Card>

      <Card
        title={data ? `${data.length} bordereaux` : "Bordereaux"}
        extra={
          <div style={{ display: "flex", gap: 8 }}>
            <select className="select" style={{ width: 200, height: 40 }} value={agenceFiltre} onChange={(e) => setAgenceFiltre(e.target.value)}>
              <option value="">Toutes agences</option>
              {(agences ?? []).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
            <select className="select" style={{ width: 180, height: 40 }} value={statutFiltre} onChange={(e) => setStatutFiltre(e.target.value)}>
              <option value="">Tous statuts</option>
              <option value="emis">Émis</option>
              <option value="partiellement_regle">Partiellement réglé</option>
              <option value="regle">Réglé</option>
            </select>
          </div>
        }
        noBody
        style={{ marginTop: 24 }}
      >
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>N° bordereau</th>
                  <th>Agence</th>
                  <th>Période</th>
                  <th style={{ textAlign: "right" }}>Souscriptions</th>
                  <th style={{ textAlign: "right" }}>Prime totale</th>
                  <th style={{ textAlign: "right" }}>Reçu</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((b) => (
                  <Fragment key={b.id}>
                    <tr>
                      <td><strong>{b.numero}</strong></td>
                      <td>{b.agenceNom}<div className="muted" style={{ fontSize: 12 }}>{b.zoneNom}</div></td>
                      <td className="muted">{fmtDate(b.periodeDebut)} — {fmtDate(b.periodeFin)}</td>
                      <td style={{ textAlign: "right" }}>{b.nombreSouscriptions}</td>
                      <td style={{ textAlign: "right" }}><strong>{fcfa(b.primeTotal)}</strong></td>
                      <td style={{ textAlign: "right" }} className="muted">{fcfa(b.montantRecu)}</td>
                      <td>{statutBadge(b.statut)}</td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                        >
                          {expanded === b.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </td>
                    </tr>
                    {expanded === b.id && (
                      <tr key={`${b.id}-detail`}>
                        <td colSpan={8} style={{ background: "var(--bg-2, #f8fafc)" }}>
                          <DetailBordereau id={b.id} onUpdated={onUpdated} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={8}><div className="empty">Aucun bordereau généré.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
