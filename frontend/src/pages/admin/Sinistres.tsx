import { useState } from "react";
import { AlertTriangle, X, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";

interface AnalyseIA {
  correspondanceNom: boolean | null;
  correspondanceDateNaissance: boolean | null;
  pieceAuthentique: boolean | null;
  photosAccidentAuthentiques: boolean | null;
  niveauRisque: "faible" | "moyen" | "eleve";
  explication: string;
  erreur?: string;
}

interface Sinistre {
  id: string;
  produitType: "generique" | "incendie" | "accident";
  souscriptionId: string;
  numeroSinistre: string;
  typeEvenement: string;
  dateSurvenance: string;
  description: string | null;
  photosAccidentUrls: string[];
  statut: "declare" | "en_cours" | "traite" | "rejete";
  motifRejet: string | null;
  analyseIA: AnalyseIA | null;
  analyseIAAt: string | null;
  createdAt: string;
  clientNom: string | null;
  clientPrenom: string | null;
  clientTelephone: string;
  numeroPolice: string | null;
  produitLibelle: string;
  pieceIdentiteUrl: string | null;
}

function statutBadge(s: Sinistre["statut"]) {
  if (s === "declare") return <Badge kind="warning">Déclaré</Badge>;
  if (s === "en_cours") return <Badge kind="info">En cours</Badge>;
  if (s === "traite") return <Badge kind="success">Traité</Badge>;
  return <Badge kind="danger">Rejeté</Badge>;
}

function pastilleRisque(a: AnalyseIA | null, analyseIAAt: string | null) {
  if (!analyseIAAt) return <span className="muted" style={{ fontSize: 12 }}>Analyse en cours…</span>;
  if (!a || a.erreur) return <span className="muted" style={{ fontSize: 12 }} title={a?.erreur}>Non disponible</span>;
  if (a.niveauRisque === "eleve")
    return <Badge kind="danger"><ShieldAlert size={12} /> Risque élevé</Badge>;
  if (a.niveauRisque === "moyen")
    return <Badge kind="warning"><ShieldQuestion size={12} /> Risque moyen</Badge>;
  return <Badge kind="success"><ShieldCheck size={12} /> Risque faible</Badge>;
}

function coche(v: boolean | null) {
  if (v === null) return <span className="muted">?</span>;
  return v ? <span style={{ color: "var(--success)" }}>✓</span> : <span style={{ color: "var(--danger)" }}>✗</span>;
}

export default function Sinistres() {
  const [statut, setStatut] = useState("");
  const [produitType, setProduitType] = useState("");
  const [detail, setDetail] = useState<Sinistre | null>(null);
  const [toast, setToast] = useState("");
  const [motifRejet, setMotifRejet] = useState("");
  const [afficherRejet, setAfficherRejet] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const params = new URLSearchParams();
  if (statut) params.set("statut", statut);
  if (produitType) params.set("produitType", produitType);
  const { data, loading, error, reload } = useFetch<Sinistre[]>(`/assurances-branche/sinistres?${params.toString()}`);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function traiter(s: Sinistre) {
    setEnvoi(true);
    try {
      await api.patch(`/assurances-branche/sinistres/${s.id}/statut`, { statut: "traite" });
      notify("Sinistre traité ✓");
      setDetail(null);
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function rejeter(s: Sinistre) {
    if (!motifRejet.trim()) return;
    setEnvoi(true);
    try {
      await api.patch(`/assurances-branche/sinistres/${s.id}/statut`, { statut: "rejete", motifRejet: motifRejet.trim() });
      notify("Sinistre rejeté ✓");
      setDetail(null);
      setAfficherRejet(false);
      setMotifRejet("");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <PageHeader title="Sinistres" subtitle="Déclarations reçues depuis l'espace client, tous produits confondus." />

      <Card
        title={data ? `${data.length} sinistres` : "Sinistres"}
        style={{ marginTop: 24 }}
        extra={
          <div style={{ display: "flex", gap: 10 }}>
            <select className="select" style={{ width: 170, height: 40 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Tous statuts</option>
              <option value="declare">Déclaré</option>
              <option value="en_cours">En cours</option>
              <option value="traite">Traité</option>
              <option value="rejete">Rejeté</option>
            </select>
            <select className="select" style={{ width: 170, height: 40 }} value={produitType} onChange={(e) => setProduitType(e.target.value)}>
              <option value="">Tous produits</option>
              <option value="generique">Produits génériques</option>
              <option value="incendie">Incendie</option>
              <option value="accident">Accidents (historique)</option>
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
                  <th>N° sinistre</th>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Événement</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th>Analyse IA</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td className="muted">{s.numeroSinistre}</td>
                    <td>
                      <strong>{[s.clientPrenom, s.clientNom].filter(Boolean).join(" ") || "—"}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{s.clientTelephone}</div>
                    </td>
                    <td>{s.produitLibelle}</td>
                    <td>{s.typeEvenement}</td>
                    <td className="muted">{fmtDate(s.dateSurvenance)}</td>
                    <td>{statutBadge(s.statut)}</td>
                    <td>{pastilleRisque(s.analyseIA, s.analyseIAAt)}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => setDetail(s)}>
                        <AlertTriangle size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={8}><div className="empty">Aucun sinistre.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <div
          onClick={() => { setDetail(null); setAfficherRejet(false); setMotifRejet(""); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "100%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong style={{ fontSize: 17 }}>{detail.numeroSinistre}</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setDetail(null)}><X size={18} /></button>
            </div>

            <table className="tbl" style={{ width: "100%", marginBottom: 16 }}>
              <tbody>
                <tr><td className="muted" style={{ width: "42%" }}>Client</td><td><strong>{[detail.clientPrenom, detail.clientNom].filter(Boolean).join(" ") || "—"}</strong></td></tr>
                <tr><td className="muted">Téléphone</td><td>{detail.clientTelephone}</td></tr>
                <tr><td className="muted">Produit</td><td>{detail.produitLibelle}</td></tr>
                <tr><td className="muted">N° police</td><td>{detail.numeroPolice ?? "—"}</td></tr>
                <tr><td className="muted">Type d'événement</td><td>{detail.typeEvenement}</td></tr>
                <tr><td className="muted">Date de survenance</td><td>{fmtDate(detail.dateSurvenance)}</td></tr>
                {detail.description && <tr><td className="muted">Description</td><td>{detail.description}</td></tr>}
                <tr><td className="muted">Statut</td><td>{statutBadge(detail.statut)}</td></tr>
                {detail.motifRejet && <tr><td className="muted">Motif de rejet</td><td>{detail.motifRejet}</td></tr>}
              </tbody>
            </table>

            {detail.pieceIdentiteUrl && (
              <div style={{ marginBottom: 16 }}>
                <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Pièce d'identité (contrat)</div>
                <img src={detail.pieceIdentiteUrl} alt="Pièce d'identité" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)" }} />
              </div>
            )}

            {detail.photosAccidentUrls.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Photos de l'accident</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {detail.photosAccidentUrls.map((url, i) => (
                    <img key={i} src={url} alt={`Accident ${i + 1}`} style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)" }} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "var(--bg-2, #f5f8fc)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Analyse IA (indicative — la décision finale revient à l'administrateur)</div>
              {!detail.analyseIAAt && <div className="muted" style={{ fontSize: 13 }}>Analyse en cours…</div>}
              {detail.analyseIAAt && detail.analyseIA?.erreur && (
                <div className="muted" style={{ fontSize: 13 }}>{detail.analyseIA.erreur}</div>
              )}
              {detail.analyseIAAt && detail.analyseIA && !detail.analyseIA.erreur && (
                <>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
                    <span>Nom correspond : {coche(detail.analyseIA.correspondanceNom)}</span>
                    <span>Date naissance correspond : {coche(detail.analyseIA.correspondanceDateNaissance)}</span>
                    <span>Pièce authentique : {coche(detail.analyseIA.pieceAuthentique)}</span>
                    <span>Photos accident authentiques : {coche(detail.analyseIA.photosAccidentAuthentiques)}</span>
                  </div>
                  <div style={{ marginBottom: 8 }}>{pastilleRisque(detail.analyseIA, detail.analyseIAAt)}</div>
                  <div style={{ fontSize: 13, color: "var(--text-2)" }}>{detail.analyseIA.explication}</div>
                </>
              )}
            </div>

            {(detail.statut === "declare" || detail.statut === "en_cours") && (
              <>
                {afficherRejet ? (
                  <div>
                    <div className="field">
                      <label className="label">Motif du rejet <span className="req">*</span></label>
                      <input className="input" autoFocus value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} placeholder="Ex. photos non concluantes, incohérence avec le contrat…" />
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btn-danger-soft" style={{ flex: 1 }} disabled={envoi || !motifRejet.trim()} onClick={() => rejeter(detail)}>
                        {envoi ? "Envoi…" : "Confirmer le rejet"}
                      </button>
                      <button className="btn btn-ghost" onClick={() => { setAfficherRejet(false); setMotifRejet(""); }}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} disabled={envoi} onClick={() => traiter(detail)}>
                      Valider le sinistre
                    </button>
                    <button className="btn btn-danger-soft" style={{ flex: 1 }} disabled={envoi} onClick={() => setAfficherRejet(true)}>
                      Rejeter
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
