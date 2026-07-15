import { Fragment, useState } from "react";
import { FilePlus, ChevronDown, ChevronUp, Check } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import type { SinistreImf, SouscriptionImf } from "../../types";

const TYPE_EVENEMENT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  securpro: [{ value: "incendie", label: "Incendie / explosion" }],
  securstock: [{ value: "incendie", label: "Incendie / explosion du stock nanti" }],
  coupsdurs_classique: [
    { value: "maladie", label: "Maladie Coups Durs" },
    { value: "deces", label: "Décès suite à Coups Durs" },
  ],
  coupsdurs_incapacite: [{ value: "incapacite_temporaire", label: "Incapacité temporaire de l'emprunteur" }],
};

function statutBadge(s: SinistreImf["statut"]) {
  if (s === "regle") return <Badge kind="success">Réglé</Badge>;
  if (s === "rejete") return <Badge kind="danger">Rejeté</Badge>;
  if (s === "accepte") return <Badge kind="success">Accepté</Badge>;
  if (s === "instruction") return <Badge kind="info">En instruction</Badge>;
  if (s === "complet") return <Badge kind="info">Dossier complet</Badge>;
  if (s === "pieces_attente") return <Badge kind="warning">Pièces en attente</Badge>;
  return <Badge kind="warning">Déclaré</Badge>;
}

export default function Sinistres() {
  const { data: sinistres, loading, error, reload, setData } = useFetch<SinistreImf[]>("/agent-imf/sinistres");
  const { data: souscriptions } = useFetch<SouscriptionImf[]>("/agent-imf/souscriptions");

  const declarables = (souscriptions ?? []).filter(
    (s) => s.statut === "active" && s.produitCode !== "securecolte"
  );

  const [souscriptionId, setSouscriptionId] = useState("");
  const [typeEvenement, setTypeEvenement] = useState("");
  const [dateSurvenance, setDateSurvenance] = useState("");
  const [montantEstime, setMontantEstime] = useState(0);
  const [declaring, setDeclaring] = useState(false);
  const [declareError, setDeclareError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingPieces, setSavingPieces] = useState(false);

  const produitSelectionne = declarables.find((s) => s.id === souscriptionId)?.produitCode;
  const options = produitSelectionne ? TYPE_EVENEMENT_OPTIONS[produitSelectionne] ?? [] : [];

  async function declarer(e: React.FormEvent) {
    e.preventDefault();
    if (!souscriptionId || !typeEvenement || !dateSurvenance) return;
    setDeclaring(true);
    setDeclareError("");
    try {
      await api.post<SinistreImf>("/agent-imf/sinistres", {
        souscriptionId,
        typeEvenement,
        dateSurvenance,
        montantEstime: montantEstime || undefined,
      });
      setSouscriptionId("");
      setTypeEvenement("");
      setDateSurvenance("");
      setMontantEstime(0);
      reload();
    } catch (err) {
      setDeclareError((err as Error).message);
    } finally {
      setDeclaring(false);
    }
  }

  async function togglePiece(sin: SinistreImf, index: number) {
    if (!sinistres) return;
    const pieces = sin.pieces.map((p, i) => (i === index ? { ...p, fournie: !p.fournie } : p));
    setSavingPieces(true);
    try {
      const updated = await api.patch<SinistreImf>(`/agent-imf/sinistres/${sin.id}/pieces`, { pieces });
      setData(sinistres.map((s) => (s.id === sin.id ? updated : s)));
    } catch {
      /* la liste ne sera pas mise à jour ; l'utilisateur peut réessayer */
    } finally {
      setSavingPieces(false);
    }
  }

  return (
    <>
      <PageHeader title="Sinistres" subtitle="Déclarer un sinistre et suivre son instruction." />

      <Card title="Déclarer un sinistre" style={{ marginTop: 24 }}>
        <form onSubmit={declarer}>
          <div className="field">
            <label className="label">Contrat concerné <span className="req">*</span></label>
            <select
              className="select"
              required
              value={souscriptionId}
              onChange={(e) => { setSouscriptionId(e.target.value); setTypeEvenement(""); }}
            >
              <option value="">— Sélectionner —</option>
              {declarables.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.numeroPolice} · {s.prenom} {s.nom} · {s.produitCode}
                </option>
              ))}
            </select>
            {declarables.length === 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Aucun contrat actif éligible (SECURECOLTE s'indemnise automatiquement, sans déclaration).
              </div>
            )}
          </div>

          {souscriptionId && (
            <div className="field">
              <label className="label">Type d'événement <span className="req">*</span></label>
              <select className="select" required value={typeEvenement} onChange={(e) => setTypeEvenement(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          <div className="field">
            <label className="label">Date de survenance <span className="req">*</span></label>
            <input className="input" type="date" required value={dateSurvenance} onChange={(e) => setDateSurvenance(e.target.value)} />
          </div>

          <div className="field">
            <label className="label">Montant estimé (facultatif)</label>
            <input className="input" type="number" value={montantEstime} onChange={(e) => setMontantEstime(Number(e.target.value))} />
          </div>

          {declareError && <div className="empty" style={{ color: "var(--danger)", marginBottom: 12 }}>{declareError}</div>}

          <button className="btn btn-primary" disabled={declaring || !souscriptionId || !typeEvenement || !dateSurvenance}>
            <FilePlus size={16} /> {declaring ? "Déclaration…" : "Déclarer le sinistre"}
          </button>
        </form>
      </Card>

      <Card title={sinistres ? `${sinistres.length} sinistres déclarés` : "Sinistres"} noBody style={{ marginTop: 24 }}>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {sinistres && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>N° sinistre</th>
                  <th>Contrat</th>
                  <th>Client</th>
                  <th>Événement</th>
                  <th>Statut</th>
                  <th>Déclaré le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sinistres.map((s) => (
                  <Fragment key={s.id}>
                    <tr>
                      <td><strong>{s.numeroSinistre}</strong></td>
                      <td className="muted">{s.numeroPolice}</td>
                      <td>{s.clientPrenom} {s.clientNom}</td>
                      <td className="muted">{s.typeEvenement}</td>
                      <td>{statutBadge(s.statut)}</td>
                      <td className="muted">{fmtDate(s.dateDeclaration)}</td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                        >
                          {expanded === s.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </td>
                    </tr>
                    {expanded === s.id && (
                      <tr key={`${s.id}-detail`}>
                        <td colSpan={7} style={{ background: "var(--bg-2, #f8fafc)" }}>
                          <div style={{ padding: 16 }}>
                            {s.montantEstime ? (
                              <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                                Montant estimé : {fcfa(s.montantEstime)}
                              </div>
                            ) : null}
                            {s.motifRejet && (
                              <div style={{ fontSize: 13, marginBottom: 10, color: "var(--danger)" }}>
                                Motif de rejet : {s.motifRejet}
                              </div>
                            )}
                            {s.statut === "regle" && s.montantRegle != null && (
                              <div style={{ fontSize: 13, marginBottom: 10, color: "var(--success, #16a34a)" }}>
                                Réglé : {fcfa(s.montantRegle)}
                                {s.montantIMF != null && ` (dont ${fcfa(s.montantIMF)} à l'IMF nantie${s.montantSouscripteur ? `, ${fcfa(s.montantSouscripteur)} au souscripteur` : ""})`}
                              </div>
                            )}
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Pièces requises</div>
                            {s.pieces.length === 0 ? (
                              <div className="muted" style={{ fontSize: 13 }}>Aucune pièce requise pour ce type de sinistre.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {s.pieces.map((p, i) => (
                                  <label key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                                    <input
                                      type="checkbox"
                                      checked={p.fournie}
                                      disabled={savingPieces || s.statut === "regle" || s.statut === "rejete"}
                                      onChange={() => togglePiece(s, i)}
                                    />
                                    {p.fournie && <Check size={13} color="var(--success, #16a34a)" />}
                                    {p.label}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {sinistres.length === 0 && (
                  <tr><td colSpan={7}><div className="empty">Aucun sinistre déclaré.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
