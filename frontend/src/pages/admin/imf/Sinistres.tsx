import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, Droplets, FilePlus } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import type { SinistreImf, SouscriptionImf } from "../../../types";

const TYPE_EVENEMENT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  securpro: [{ value: "incendie", label: "Incendie / explosion" }],
  securstock: [{ value: "incendie", label: "Incendie / explosion du stock nanti" }],
  coupsdurs_classique: [
    { value: "maladie", label: "Maladie Coups Durs" },
    { value: "deces", label: "Décès suite à Coups Durs" },
  ],
  coupsdurs_incapacite: [{ value: "incapacite_temporaire", label: "Incapacité temporaire de l'emprunteur" }],
};

const STATUTS = [
  { value: "", label: "Tous statuts" },
  { value: "declare", label: "Déclaré" },
  { value: "pieces_attente", label: "Pièces en attente" },
  { value: "complet", label: "Dossier complet" },
  { value: "instruction", label: "En instruction" },
  { value: "accepte", label: "Accepté" },
  { value: "rejete", label: "Rejeté" },
  { value: "regle", label: "Réglé" },
];

const PRODUITS = [
  { value: "", label: "Tous produits" },
  { value: "securpro", label: "SECURPRO" },
  { value: "securstock", label: "SECURSTOCK" },
  { value: "coupsdurs_classique", label: "Coups Durs — Classique" },
  { value: "coupsdurs_incapacite", label: "Coups Durs — Incapacité" },
];

function statutBadge(s: SinistreImf["statut"]) {
  if (s === "regle") return <Badge kind="success">Réglé</Badge>;
  if (s === "rejete") return <Badge kind="danger">Rejeté</Badge>;
  if (s === "accepte") return <Badge kind="success">Accepté</Badge>;
  if (s === "instruction") return <Badge kind="info">En instruction</Badge>;
  if (s === "complet") return <Badge kind="info">Dossier complet</Badge>;
  if (s === "pieces_attente") return <Badge kind="warning">Pièces en attente</Badge>;
  return <Badge kind="warning">Déclaré</Badge>;
}

const PALIERS = [
  { value: "forte", label: "Forte sécheresse (100%)" },
  { value: "moyenne", label: "Moyenne sécheresse (50%)" },
  { value: "faible", label: "Faible sécheresse (20%)" },
];

export default function Sinistres() {
  const [statut, setStatut] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const params = new URLSearchParams();
  if (statut) params.set("statut", statut);
  if (produitCode) params.set("produitCode", produitCode);
  const { data, loading, error, reload, setData } = useFetch<SinistreImf[]>(`/imf/sinistres?${params.toString()}`);

  // Déclaration par l'admin (souscriptions directes, sans agent/zone/agence).
  const { data: toutesSouscriptions } = useFetch<SouscriptionImf[]>("/imf/souscriptions");
  const declarables = (toutesSouscriptions ?? []).filter(
    (s) => s.directe && s.statut === "active" && s.produitCode !== "securecolte"
  );
  const [souscriptionId, setSouscriptionId] = useState("");
  const [typeEvenement, setTypeEvenement] = useState("");
  const [dateSurvenance, setDateSurvenance] = useState("");
  const [montantEstime, setMontantEstime] = useState(0);
  const [declaring, setDeclaring] = useState(false);
  const [declareError, setDeclareError] = useState("");
  const produitSelectionne = declarables.find((s) => s.id === souscriptionId)?.produitCode;
  const optionsEvenement = produitSelectionne ? TYPE_EVENEMENT_OPTIONS[produitSelectionne] ?? [] : [];

  async function declarer(e: React.FormEvent) {
    e.preventDefault();
    if (!souscriptionId || !typeEvenement || !dateSurvenance) return;
    setDeclaring(true);
    setDeclareError("");
    try {
      await api.post<SinistreImf>("/imf/sinistres", {
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

  const [expanded, setExpanded] = useState<string | null>(null);
  const [cible, setCible] = useState<"instruction" | "accepte" | "rejete" | "regle" | "">("");
  const [motifRejet, setMotifRejet] = useState("");
  const [montantRegle, setMontantRegle] = useState(0);
  const [montantIMF, setMontantIMF] = useState(0);
  const [montantSouscripteur, setMontantSouscripteur] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState("");

  function ouvrir(id: string) {
    setExpanded(expanded === id ? null : id);
    setCible("");
    setMotifRejet("");
    setMontantRegle(0);
    setMontantIMF(0);
    setMontantSouscripteur(0);
    setTransitionError("");
  }

  async function valider(s: SinistreImf) {
    if (!cible) return;
    setTransitioning(true);
    setTransitionError("");
    try {
      const updated = await api.patch<SinistreImf>(`/imf/sinistres/${s.id}/statut`, {
        statut: cible,
        motifRejet: cible === "rejete" ? motifRejet : undefined,
        montantRegle: cible === "regle" ? montantRegle : undefined,
        montantIMF: cible === "regle" && s.produitCode === "securstock" ? montantIMF || undefined : undefined,
        montantSouscripteur: cible === "regle" && s.produitCode === "securstock" ? montantSouscripteur || undefined : undefined,
      });
      setData((data ?? []).map((x) => (x.id === s.id ? updated : x)));
      setExpanded(null);
    } catch (err) {
      setTransitionError((err as Error).message);
    } finally {
      setTransitioning(false);
    }
  }

  // SECURECOLTE — indemnisation automatique
  const { data: souscriptionsSecurecolte } = useFetch<SouscriptionImf[]>("/imf/souscriptions?produitCode=securecolte");
  const actives = (souscriptionsSecurecolte ?? []).filter((s) => s.statut === "active");
  const [selection, setSelection] = useState<string[]>([]);
  const [palier, setPalier] = useState<"forte" | "moyenne" | "faible">("forte");
  const [region, setRegion] = useState("");
  const [indemnisant, setIndemnisant] = useState(false);
  const [indemnisationMsg, setIndemnisationMsg] = useState("");

  function toggleSelection(id: string) {
    setSelection((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }

  async function declencherIndemnisation() {
    if (selection.length === 0 || !region.trim()) return;
    setIndemnisant(true);
    setIndemnisationMsg("");
    try {
      const res = await api.post<{ nombre: number }>("/imf/sinistres/securecolte/indemnisation", {
        souscriptionIds: selection,
        palier,
        region: region.trim(),
      });
      setIndemnisationMsg(`${res.nombre} indemnisation(s) créée(s).`);
      setSelection([]);
      reload();
    } catch (err) {
      setIndemnisationMsg((err as Error).message);
    } finally {
      setIndemnisant(false);
    }
  }

  return (
    <>
      <PageHeader title="Sinistres IMF" subtitle="Instruction des sinistres du réseau et indemnisation SECURECOLTE." />

      {declarables.length > 0 && (
        <Card title="Déclarer un sinistre (souscription directe)" style={{ marginTop: 24 }}>
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
                  <option key={s.id} value={s.id}>{s.numeroPolice} · {s.prenom} {s.nom} · {s.produitCode}</option>
                ))}
              </select>
            </div>
            {souscriptionId && (
              <div className="field">
                <label className="label">Type d'événement <span className="req">*</span></label>
                <select className="select" required value={typeEvenement} onChange={(e) => setTypeEvenement(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {optionsEvenement.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
      )}

      <Card
        title={data ? `${data.length} sinistres` : "Sinistres"}
        extra={
          <div style={{ display: "flex", gap: 8 }}>
            <select className="select" style={{ width: 170, height: 40 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
              {STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="select" style={{ width: 200, height: 40 }} value={produitCode} onChange={(e) => setProduitCode(e.target.value)}>
              {PRODUITS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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
                  <th>N° sinistre</th>
                  <th>Contrat</th>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Événement</th>
                  <th>Statut</th>
                  <th>Déclaré le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <Fragment key={s.id}>
                    <tr>
                      <td><strong>{s.numeroSinistre}</strong></td>
                      <td className="muted">{s.numeroPolice}</td>
                      <td>{s.clientPrenom} {s.clientNom}</td>
                      <td className="muted">{s.produitCode}</td>
                      <td className="muted">{s.typeEvenement}</td>
                      <td>{statutBadge(s.statut)}</td>
                      <td className="muted">{fmtDate(s.dateDeclaration)}</td>
                      <td>
                        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => ouvrir(s.id)}>
                          {expanded === s.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </td>
                    </tr>
                    {expanded === s.id && (
                      <tr key={`${s.id}-detail`}>
                        <td colSpan={8} style={{ background: "var(--bg-2, #f8fafc)" }}>
                          <div style={{ padding: 16 }}>
                            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                              Déclaré par {s.agentNom ?? s.adminNom ?? "—"}
                              {s.montantEstime ? ` · Montant estimé : ${fcfa(s.montantEstime)}` : ""}
                            </div>

                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Pièces</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                              {s.pieces.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Aucune pièce requise.</div>}
                              {s.pieces.map((p, i) => (
                                <div key={i} style={{ fontSize: 13, color: p.fournie ? "var(--success, #16a34a)" : "var(--muted)" }}>
                                  {p.fournie ? "✓" : "○"} {p.label}
                                </div>
                              ))}
                            </div>

                            {(s.statut === "rejete" || s.statut === "regle") ? (
                              <div className="muted" style={{ fontSize: 13 }}>
                                {s.statut === "rejete" && `Rejeté — ${s.motifRejet}`}
                                {s.statut === "regle" && `Réglé — ${fcfa(s.montantRegle ?? 0)}`}
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Faire évoluer le statut</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                                  {(["instruction", "accepte", "rejete", "regle"] as const).map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      className={cible === c ? "btn btn-primary" : "btn btn-ghost"}
                                      onClick={() => setCible(c)}
                                    >
                                      {c === "instruction" ? "En instruction" : c === "accepte" ? "Accepter" : c === "rejete" ? "Rejeter" : "Marquer réglé"}
                                    </button>
                                  ))}
                                </div>

                                {cible === "rejete" && (
                                  <div className="field">
                                    <label className="label">Motif du rejet <span className="req">*</span></label>
                                    <input className="input" value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} />
                                  </div>
                                )}
                                {cible === "regle" && (
                                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <div className="field" style={{ flex: 1, minWidth: 160 }}>
                                      <label className="label">Montant réglé <span className="req">*</span></label>
                                      <input className="input" type="number" value={montantRegle} onChange={(e) => setMontantRegle(Number(e.target.value))} />
                                    </div>
                                    {s.produitCode === "securstock" && (
                                      <>
                                        <div className="field" style={{ flex: 1, minWidth: 160 }}>
                                          <label className="label">Dont part IMF (nantissement)</label>
                                          <input className="input" type="number" value={montantIMF} onChange={(e) => setMontantIMF(Number(e.target.value))} />
                                        </div>
                                        <div className="field" style={{ flex: 1, minWidth: 160 }}>
                                          <label className="label">Dont part souscripteur</label>
                                          <input className="input" type="number" value={montantSouscripteur} onChange={(e) => setMontantSouscripteur(Number(e.target.value))} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}

                                {transitionError && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{transitionError}</div>}

                                {cible && (
                                  <button
                                    className="btn btn-primary"
                                    disabled={
                                      transitioning ||
                                      (cible === "rejete" && !motifRejet.trim()) ||
                                      (cible === "regle" && !montantRegle)
                                    }
                                    onClick={() => valider(s)}
                                  >
                                    {transitioning ? "Enregistrement…" : "Valider"}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={8}><div className="empty">Aucun sinistre.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Indemnisation SECURECOLTE (indice de sécheresse)" style={{ marginTop: 24 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          SECURECOLTE n'a pas de déclaration individuelle : sélectionnez les contrats actifs concernés par la
          sécheresse constatée, indiquez le palier et la région, puis déclenchez l'indemnisation automatique.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Palier de sécheresse</label>
            <select className="select" value={palier} onChange={(e) => setPalier(e.target.value as typeof palier)}>
              {PALIERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Région</label>
            <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Ex. Poro" />
          </div>
        </div>

        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="tbl">
            <thead>
              <tr><th></th><th>N° de police</th><th>Client</th><th>Prime TTC</th></tr>
            </thead>
            <tbody>
              {actives.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={selection.includes(s.id)} onChange={() => toggleSelection(s.id)} /></td>
                  <td><strong>{s.numeroPolice}</strong></td>
                  <td>{s.prenom} {s.nom}</td>
                  <td>{fcfa(s.primeTTC)}</td>
                </tr>
              ))}
              {actives.length === 0 && (
                <tr><td colSpan={4}><div className="empty">Aucun contrat SECURECOLTE actif.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {indemnisationMsg && <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{indemnisationMsg}</div>}

        <button
          className="btn btn-primary"
          disabled={indemnisant || selection.length === 0 || !region.trim()}
          onClick={declencherIndemnisation}
        >
          <Droplets size={16} /> {indemnisant ? "Traitement…" : `Indemniser ${selection.length} contrat(s)`}
        </button>
      </Card>
    </>
  );
}
