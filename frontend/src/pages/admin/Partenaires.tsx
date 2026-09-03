import { useState, useEffect, useCallback } from "react";
import { Plus, Search, QrCode, Power, Trash2, Download, X, Copy, Check, Eye, Pencil, FileSpreadsheet, Flame, ShieldCheck, SlidersHorizontal, KeyRound, RefreshCw, Send } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate, nb, waveBadge, statutIncendieBadge, PhoneInput } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { exportExcel, exportExcelMultiSheet } from "../../xlsx";
import type { Partenaire, CatalogueProduitBranche, SouscriptionBranche } from "../../types";

interface PartenaireDetails {
  partenaire: {
    id: string; nomCommerce: string; nomResponsable: string; telephone: string;
    localisation: string; email: string | null; statut: string;
    branche: "INCENDIE_ACCIDENT" | "RELAX" | null;
    produitIncendie: boolean; produitAccident: boolean;
  };
  souscripteursIncendie: { id: string; telephone: string; nom?: string | null; prenom?: string | null; montantPrime: number; statut: string; createdAt: string }[];
  souscripteursAccident: { id: string; telephone: string; nom: string; prenom: string; montantPrime: number; waveStatut: string; createdAt: string }[];
  commissionTotale: number;
  commissionGenereePeriode: number;
  commissionEncaissee: number;
  commissionDue: number;
  commissionMensuelle: {
    incendie: { caHT: number; seuil: number; tauxPct: number; seuilAtteint: boolean; commission: number };
    accident: { caHT: number; seuil: number; tauxPct: number; seuilAtteint: boolean; commission: number };
  };
}

interface AgentDistributionAdmin {
  id: string;
  nom: string;
  telephone: string;
  localisation: string | null;
  statut: "actif" | "inactif";
  createdAt: string;
  nombreSouscriptions: number;
  commissionTotale: number;
}

function DetailsModal({ partenaireId, onClose }: { partenaireId: string; onClose: () => void }) {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("INCENDIE_ACCIDENT"));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<PartenaireDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: agents, reload: reloadAgents } = useFetch<AgentDistributionAdmin[]>(
    isSuper ? `/partenaires/${partenaireId}/agents` : null
  );

  // Filtres "type d'assurance" / "type de produit" du tableau des souscripteurs
  // (vue unifiée tous produits, modèle générique + historiques Incendie/Accident).
  const [sousBrancheFiltre, setSousBrancheFiltre] = useState<"" | "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES">("");
  const [produitFiltre, setProduitFiltre] = useState("");
  const { data: catalogue } = useFetch<CatalogueProduitBranche[]>("/assurances-branche/catalogue");
  const souscripteursParams = new URLSearchParams();
  souscripteursParams.set("partenaireId", partenaireId);
  // Seules les souscriptions confirmées apparaissent ici — celles en attente
  // de paiement sont à retrouver sur la page dédiée "Paiement en attente".
  souscripteursParams.set("statut", "confirme");
  if (sousBrancheFiltre) souscripteursParams.set("sousBranche", sousBrancheFiltre);
  if (produitFiltre) souscripteursParams.set("produit", produitFiltre);
  if (from) souscripteursParams.set("from", from);
  if (to) souscripteursParams.set("to", to);
  const { data: souscripteurs } = useFetch<SouscriptionBranche[]>(
    `/assurances-branche/souscriptions?${souscripteursParams.toString()}`
  );

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    setLoading(true);
    api.get<PartenaireDetails>(`/partenaires/${partenaireId}/details${qs ? `?${qs}` : ""}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [partenaireId, from, to]);

  useEffect(() => { load(); }, [load]);

  function exportXlsx() {
    if (!data) return;
    exportExcelMultiSheet(
      [
        {
          name: "Résumé",
          rows: [
            {
              "Partenaire": data.partenaire.nomCommerce,
              "Responsable": data.partenaire.nomResponsable,
              "Téléphone": data.partenaire.telephone,
              "Localisation": data.partenaire.localisation,
              "Email": data.partenaire.email ?? "",
              "Commission totale": data.commissionTotale,
              "Commission encaissée": data.commissionEncaissee,
              "Commission due": data.commissionDue,
              "Commission générée (période)": data.commissionGenereePeriode,
              "CA HT Incendie (31j)": data.commissionMensuelle.incendie.caHT,
              "Commission mensuelle Incendie": data.commissionMensuelle.incendie.commission,
              "CA HT Accidents (31j)": data.commissionMensuelle.accident.caHT,
              "Commission mensuelle Accidents": data.commissionMensuelle.accident.commission,
            },
          ],
        },
        {
          name: "Souscripteurs",
          rows: (souscripteurs ?? []).map((s) => ({
            "Produit": s.produitLibelle,
            "Client": [s.prenom, s.nom].filter(Boolean).join(" "),
            "Téléphone": s.telephone,
            "Prime": s.montantPrime,
            "Statut": s.statut,
            "Date": fmtDate(s.createdAt),
          })),
        },
      ],
      `partenaire_${data.partenaire.nomCommerce.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.xlsx`
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 820, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <strong style={{ fontSize: 17 }}>{data?.partenaire.nomCommerce ?? "Détails partenaire"}</strong>
          <div style={{ display: "flex", gap: 8 }}>
            {data && (
              <button className="btn btn-danger-soft" onClick={exportXlsx}>
                <FileSpreadsheet size={16} /> Export Excel
              </button>
            )}
            <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {data && (
          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {data.partenaire.nomResponsable} · {data.partenaire.telephone} · {data.partenaire.localisation}
            {data.partenaire.email ? ` · ${data.partenaire.email}` : ""}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Du</label>
            <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Au</label>
            <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(from || to) && <button className="btn btn-ghost" onClick={() => { setFrom(""); setTo(""); }}>Réinitialiser</button>}
        </div>

        {loading && <Loader />}
        {data && (
          <>
            <div className="stat-grid" style={{ marginBottom: 20 }}>
              <div className="stat"><div className="stat-label">Commission totale</div><div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionTotale)}</div></div>
              <div className="stat"><div className="stat-label">Payée</div><div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionEncaissee)}</div></div>
              <div className="stat"><div className="stat-label">Due</div><div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionDue)}</div></div>
              <div className="stat"><div className="stat-label">Générée (période)</div><div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionGenereePeriode)}</div></div>
            </div>

            <div style={{ fontWeight: 700, margin: "8px 0 8px" }}>
              Commission mensuelle (31 derniers jours)
            </div>
            <div className="stat-grid" style={{ marginBottom: 20 }}>
              {data.partenaire.branche === "INCENDIE_ACCIDENT" && (
                <div className="stat">
                  <div className="stat-label">Dommages — CA prime HT</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionMensuelle.incendie.caHT)}</div>
                  <div
                    className="stat-trend"
                    style={{ color: data.commissionMensuelle.incendie.seuilAtteint ? "var(--success)" : "var(--text-2)" }}
                  >
                    {data.commissionMensuelle.incendie.seuilAtteint
                      ? `Seuil atteint (≥ ${fcfa(data.commissionMensuelle.incendie.seuil)}) → ${fcfa(data.commissionMensuelle.incendie.commission)} (${data.commissionMensuelle.incendie.tauxPct}%)`
                      : `Seuil non atteint — ${fcfa(data.commissionMensuelle.incendie.seuil)} requis`}
                  </div>
                </div>
              )}
              {data.partenaire.branche === "INCENDIE_ACCIDENT" && (
                <div className="stat">
                  <div className="stat-label">Accidents — CA prime HT</div>
                  <div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionMensuelle.accident.caHT)}</div>
                  <div
                    className="stat-trend"
                    style={{ color: data.commissionMensuelle.accident.seuilAtteint ? "var(--success)" : "var(--text-2)" }}
                  >
                    {data.commissionMensuelle.accident.seuilAtteint
                      ? `Seuil atteint (≥ ${fcfa(data.commissionMensuelle.accident.seuil)}) → ${fcfa(data.commissionMensuelle.accident.commission)} (${data.commissionMensuelle.accident.tauxPct}%)`
                      : `Seuil non atteint — ${fcfa(data.commissionMensuelle.accident.seuil)} requis`}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, margin: "8px 0 8px" }}>
              <div style={{ fontWeight: 700 }}>Souscripteurs via son canal ({souscripteurs?.length ?? 0})</div>
              <div style={{ display: "flex", gap: 10 }}>
                <select
                  className="select"
                  style={{ width: 170, height: 36 }}
                  value={sousBrancheFiltre}
                  onChange={(e) => {
                    setSousBrancheFiltre(e.target.value as "" | "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES");
                    setProduitFiltre("");
                  }}
                >
                  <option value="">Toutes les Assurances</option>
                  <option value="ASSURANCES_ACCIDENTS">Assurances Accidents</option>
                  <option value="ASSURANCES_DOMMAGES">Assurances Dommages</option>
                </select>
                <select
                  className="select"
                  style={{ width: 200, height: 36 }}
                  value={produitFiltre}
                  onChange={(e) => setProduitFiltre(e.target.value)}
                >
                  <option value="">Tous produits</option>
                  {(catalogue ?? [])
                    .filter((p) => !sousBrancheFiltre || p.sousBranche === sousBrancheFiltre)
                    .map((p) => (
                      <option key={p.code} value={p.code}>{p.libelle}</option>
                    ))}
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Produit</th><th>Client</th><th>Téléphone</th><th>Prime</th><th>Statut</th><th>Date</th></tr></thead>
                <tbody>
                  {(souscripteurs ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>
                        {s.sousBranche === "ASSURANCES_DOMMAGES" ? (
                          <Badge kind="warning"><Flame size={12} /> {s.produitLibelle}</Badge>
                        ) : (
                          <Badge kind="info"><ShieldCheck size={12} /> {s.produitLibelle}</Badge>
                        )}
                      </td>
                      <td>{[s.prenom, s.nom].filter(Boolean).join(" ") || <span className="muted">—</span>}</td>
                      <td>{s.telephone}</td>
                      <td>{fcfa(s.montantPrime)}</td>
                      <td>{s.produit === "incendie_historique" ? statutIncendieBadge(s.statut) : waveBadge(s.statut)}</td>
                      <td className="muted">{fmtDate(s.createdAt)}</td>
                    </tr>
                  ))}
                  {(souscripteurs ?? []).length === 0 && (
                    <tr><td colSpan={6}><div className="empty">Aucun souscripteur sur la période.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {isSuper && (
              <>
                <div style={{ fontWeight: 700, margin: "20px 0 8px" }}>
                  Agents de distribution ({agents?.length ?? 0})
                </div>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Nom</th><th>Téléphone</th><th>Localisation</th><th>Statut</th>
                        <th>Souscriptions</th><th>Commission</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(agents ?? []).map((a) => (
                        <tr key={a.id}>
                          <td>{a.nom}</td>
                          <td>{a.telephone}</td>
                          <td>{a.localisation ?? <span className="muted">—</span>}</td>
                          <td>{a.statut === "actif" ? <Badge kind="success">Actif</Badge> : <Badge kind="danger">Inactif</Badge>}</td>
                          <td>{a.nombreSouscriptions}</td>
                          <td>{fcfa(a.commissionTotale)}</td>
                          <td>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 6 }}
                              title="Supprimer cet agent"
                              onClick={async () => {
                                if (!confirm(`Supprimer l'agent ${a.nom} ?`)) return;
                                try {
                                  await api.del(`/partenaires/${partenaireId}/agents/${a.id}`);
                                  reloadAgents();
                                } catch (err) {
                                  alert((err as Error).message);
                                }
                              }}
                            >
                              <Trash2 size={14} color="var(--danger)" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(agents ?? []).length === 0 && (
                        <tr><td colSpan={7}><div className="empty">Aucun agent de distribution.</div></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ProduitPartenaire {
  id: string;
  code: string;
  libelle: string;
  sousBranche: string | null;
  actif: boolean;
}

function ProduitsModal({ partenaireId, onClose }: { partenaireId: string; onClose: () => void }) {
  const { data, loading, error, reload } = useFetch<ProduitPartenaire[]>(`/partenaires/${partenaireId}/produits`);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(p: ProduitPartenaire) {
    setBusyId(p.id);
    try {
      await api.post(`/partenaires/${partenaireId}/produits/${p.id}/statut`, { actif: !p.actif });
      reload();
    } finally {
      setBusyId(null);
    }
  }

  const parGroupe = {
    ASSURANCES_ACCIDENTS: (data ?? []).filter((p) => p.sousBranche === "ASSURANCES_ACCIDENTS"),
    ASSURANCES_DOMMAGES: (data ?? []).filter((p) => p.sousBranche === "ASSURANCES_DOMMAGES"),
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <strong style={{ fontSize: 17 }}>Produits actifs pour ce partenaire</strong>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 16 }}>
          Un produit désactivé ici apparaît grisé et non cliquable dans le formulaire public de ce partenaire — les autres partenaires ne sont pas concernés.
        </p>
        {loading && <Loader />}
        {error && <ErrorBox message={error} />}
        {data && data.length === 0 && (
          <div className="empty">Aucun produit géré individuellement pour ce partenaire.</div>
        )}
        {(["ASSURANCES_ACCIDENTS", "ASSURANCES_DOMMAGES"] as const).map((groupe) =>
          parGroupe[groupe].length > 0 ? (
            <div key={groupe} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                {groupe === "ASSURANCES_ACCIDENTS" ? "Assurances Accidents" : "Assurances Dommages"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {parGroupe[groupe].map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 10,
                      opacity: busyId === p.id ? 0.6 : 1,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.libelle}</span>
                    <button
                      type="button"
                      className="btn"
                      disabled={busyId === p.id}
                      onClick={() => toggle(p)}
                      style={{
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 999,
                        border: "none",
                        cursor: "pointer",
                        background: p.actif ? "var(--success-50, #e8f6ec)" : "var(--danger-50, #fdeaea)",
                        color: p.actif ? "var(--success, #15803d)" : "var(--danger, #dc2626)",
                      }}
                    >
                      {p.actif ? "Actif" : "Désactivé"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

function EditModal({
  partenaire,
  onClose,
  onSaved,
}: {
  partenaire: Partenaire;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    nomCommerce: partenaire.nomCommerce,
    nomResponsable: partenaire.nomResponsable,
    telephone: partenaire.telephone,
    localisation: partenaire.localisation ?? "",
    typeCommerce: (partenaire.typeCommerce ?? "Electronique") as string,
    produit: (partenaire.produitIncendie ? "incendie" : "accident") as "incendie" | "accident",
    email: partenaire.email ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.patch(`/partenaires/${partenaire.id}`, form);
      onSaved("Partenaire modifié ✓");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <strong style={{ fontSize: 17 }}>Modifier {partenaire.nomCommerce}</strong>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={save}>
          <div className="field">
            <label className="label">Nom du commerce <span className="req">*</span></label>
            <input className="input" required value={form.nomCommerce} onChange={(e) => setForm({ ...form, nomCommerce: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Responsable <span className="req">*</span></label>
            <input className="input" required value={form.nomResponsable} onChange={(e) => setForm({ ...form, nomResponsable: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Téléphone <span className="req">*</span></label>
            <PhoneInput required value={form.telephone} onChange={(v) => setForm({ ...form, telephone: v })} />
          </div>
          <div className="field">
            <label className="label">Localisation <span className="req">*</span></label>
            <input className="input" required value={form.localisation} onChange={(e) => setForm({ ...form, localisation: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Type de commerce <span className="req">*</span></label>
            <select className="select" value={form.typeCommerce} onChange={(e) => setForm({ ...form, typeCommerce: e.target.value })}>
              <option value="Electronique">Electronique</option>
              <option value="Vulcanisateur">Vulcanisateur</option>
              <option value="MecaniqueGarage">Mécanique / garage</option>
              <option value="AccessoireAuto">Accessoire auto</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Produit <span className="req">*</span></label>
            <div style={{ display: "flex", gap: 16, marginTop: 2 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="editProduit" value="incendie" checked={form.produit === "incendie"} onChange={() => setForm({ ...form, produit: "incendie" })} />
                <span>Incendie</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="editProduit" value="accident" checked={form.produit === "accident"} onChange={() => setForm({ ...form, produit: "accident" })} />
                <span>Accidents</span>
              </label>
            </div>
          </div>
          <div className="field">
            <label className="label">Gmail (accès partenaire) <span className="req">*</span></label>
            <input
              className="input"
              type="email"
              required
              placeholder="exemple@gmail.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CleApi {
  id: string;
  label: string;
  prefix: string;
  environnement: "live" | "test";
  scopes: string[];
  ipAllowlist: string[];
  statut: "active" | "revoquee";
  webhookUrl: string | null;
  webhookEvents: string[];
  webhookSecretDefini: boolean;
  dernierUsageAt: string | null;
  expireAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
type CleApiAvecSecret = CleApi & { secret: string; webhookSecret: string | null };

const SCOPES_API: { v: string; l: string }[] = [
  { v: "catalogue:read", l: "Catalogue & devis" },
  { v: "souscriptions:write", l: "Créer / confirmer des souscriptions" },
  { v: "souscriptions:read", l: "Lire les souscriptions" },
  { v: "documents:read", l: "Documents (carte, contrat)" },
];
const EVENEMENTS_WEBHOOK = [
  "souscription.creee",
  "paiement.recu",
  "souscription.confirmee",
  "contrat.disponible",
];

function ChampSecret({ label, valeur, k, copied, onCopy }: {
  label: string; valeur: string; k: string; copied: string | null; onCopy: (v: string, k: string) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <code style={{ flex: 1, fontSize: 12, background: "var(--sim-primary-50)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", wordBreak: "break-all", lineHeight: 1.5 }}>{valeur}</code>
        <button type="button" className="btn btn-ghost" style={{ padding: 8 }} title="Copier" onClick={() => onCopy(valeur, k)}>
          {copied === k ? <Check size={15} color="var(--success)" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

function AccesApiModal({ partenaire, onClose }: { partenaire: Partenaire; onClose: () => void }) {
  const { data, loading, error, reload } = useFetch<CleApi | null>(`/partenaires/${partenaire.id}/api-key`);
  const [reveal, setReveal] = useState<{ secret?: string; webhookSecret?: string | null } | null>(null);
  const [mode, setMode] = useState<"view" | "form">("view");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [label, setLabel] = useState("Intégration API");
  const [environnement, setEnvironnement] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>(SCOPES_API.map((s) => s.v));
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(EVENEMENTS_WEBHOOK);
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [expireAt, setExpireAt] = useState("");

  const editing = mode === "form" && !!data;

  function copier(v: string, k: string) {
    navigator.clipboard?.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  }
  function toggle(list: string[], setList: (v: string[]) => void, v: string) {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function ouvrirEdition() {
    if (!data) return;
    setLabel(data.label);
    setEnvironnement(data.environnement);
    setScopes(data.scopes);
    setWebhookUrl(data.webhookUrl ?? "");
    setWebhookEvents(data.webhookEvents.length ? data.webhookEvents : EVENEMENTS_WEBHOOK);
    setIpAllowlist(data.ipAllowlist.join("\n"));
    setExpireAt(data.expireAt ? data.expireAt.slice(0, 10) : "");
    setErr(""); setOk("");
    setMode("form");
  }

  function ipsDuFormulaire() {
    return ipAllowlist.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  }

  async function creer() {
    setBusy("creer"); setErr(""); setOk("");
    try {
      const body: Record<string, unknown> = { label, environnement, scopes, ipAllowlist: ipsDuFormulaire() };
      if (webhookUrl.trim()) { body.webhookUrl = webhookUrl.trim(); body.webhookEvents = webhookEvents; }
      if (expireAt) body.expireAt = new Date(expireAt + "T00:00:00.000Z").toISOString();
      const cle = await api.post<CleApiAvecSecret>(`/partenaires/${partenaire.id}/api-key`, body);
      setReveal({ secret: cle.secret, webhookSecret: cle.webhookSecret });
      setMode("view");
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function enregistrerEdition() {
    setBusy("edit"); setErr(""); setOk("");
    try {
      const body: Record<string, unknown> = {
        label,
        scopes,
        ipAllowlist: ipsDuFormulaire(),
        webhookUrl: webhookUrl.trim() || null,
        webhookEvents: webhookUrl.trim() ? webhookEvents : [],
        expireAt: expireAt ? new Date(expireAt + "T00:00:00.000Z").toISOString() : null,
      };
      const cle = await api.patch<CleApi & { webhookSecret?: string }>(`/partenaires/${partenaire.id}/api-key`, body);
      if (cle.webhookSecret) setReveal({ webhookSecret: cle.webhookSecret });
      setMode("view");
      setOk("Clé mise à jour ✓");
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function regenerer() {
    if (!data) return;
    if (!window.confirm("Régénérer la clé ? L'ancienne est révoquée immédiatement — le partenaire devra remplacer sa clé.")) return;
    setBusy("regen"); setErr(""); setOk("");
    try {
      const body: Record<string, unknown> = {
        label: data.label,
        environnement: data.environnement,
        scopes: data.scopes,
        ipAllowlist: data.ipAllowlist,
      };
      if (data.webhookUrl) { body.webhookUrl = data.webhookUrl; body.webhookEvents = data.webhookEvents; }
      if (data.expireAt) body.expireAt = data.expireAt;
      const cle = await api.post<CleApiAvecSecret>(`/partenaires/${partenaire.id}/api-key`, body);
      setReveal({ secret: cle.secret, webhookSecret: cle.webhookSecret });
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function revoquer() {
    if (!window.confirm("Révoquer la clé API de ce partenaire ? Ses appels seront immédiatement refusés.")) return;
    setBusy("revoke"); setErr(""); setOk("");
    try {
      await api.post(`/partenaires/${partenaire.id}/api-key/revoke`);
      setOk("Clé révoquée.");
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function testerWebhook() {
    setBusy("webhook"); setErr(""); setOk("");
    try {
      await api.post(`/partenaires/${partenaire.id}/webhook/test`);
      setOk("Événement de test envoyé à l'URL configurée.");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  const champLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" };
  const ligne: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-strong)", fontSize: 13 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 500, maxWidth: "100%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <strong style={{ fontSize: 17 }}>Accès API — {partenaire.nomCommerce}</strong>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 16 }}>
          Clé d'accès serveur&#8209;à&#8209;serveur à l'API partenaire (<code>/api/partner/v1</code>). Une seule clé active à la fois — la régénérer révoque l'ancienne.
        </p>

        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {ok && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{ok}</div>}

        {reveal && (
          <div style={{ border: "1px solid var(--warning)", background: "var(--warning-50)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--warning)", marginBottom: 10 }}>
              À copier maintenant — ces valeurs ne seront plus jamais affichées.
            </div>
            {reveal.secret && (
              <ChampSecret label="Clé API (secret)" valeur={reveal.secret} k="secret" copied={copied} onCopy={copier} />
            )}
            {reveal.webhookSecret && (
              <ChampSecret label="Secret webhook (vérification X-SIM-Signature)" valeur={reveal.webhookSecret} k="wh" copied={copied} onCopy={copier} />
            )}
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} onClick={() => setReveal(null)}>
              J'ai copié — continuer
            </button>
          </div>
        )}

        {!reveal && loading && <Loader />}
        {!reveal && error && <ErrorBox message={error} />}

        {/* ---------- Vue d'une clé active ---------- */}
        {!reveal && !loading && data && mode === "view" && (
          <>
            <div style={{ marginBottom: 4 }}>
              <div style={ligne}><span style={champLabel}>Identifiant</span><code style={{ fontSize: 12.5 }}>{data.prefix}…</code></div>
              <div style={ligne}><span style={champLabel}>Environnement</span><span style={{ fontWeight: 600 }}>{data.environnement}</span></div>
              <div style={ligne}>
                <span style={champLabel}>Portées</span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                  {data.scopes.map((s) => (
                    <span key={s} style={{ background: "var(--sim-primary-50)", color: "var(--sim-primary)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{s}</span>
                  ))}
                </span>
              </div>
              <div style={ligne}>
                <span style={champLabel}>Webhook</span>
                <span style={{ textAlign: "right", wordBreak: "break-all" }}>
                  {data.webhookUrl
                    ? <>{data.webhookUrl}<br /><span style={{ fontSize: 11, color: "var(--text-2)" }}>{data.webhookEvents.join(", ") || "aucun événement"}{data.webhookSecretDefini ? " · secret défini" : ""}</span></>
                    : <span style={{ color: "var(--text-2)" }}>non configuré</span>}
                </span>
              </div>
              <div style={ligne}><span style={champLabel}>IP autorisées</span><span style={{ textAlign: "right" }}>{data.ipAllowlist.length ? data.ipAllowlist.join(", ") : <span style={{ color: "var(--text-2)" }}>toutes</span>}</span></div>
              <div style={ligne}><span style={champLabel}>Dernier appel</span><span>{data.dernierUsageAt ? fmtDate(data.dernierUsageAt) : <span style={{ color: "var(--text-2)" }}>jamais</span>}</span></div>
              <div style={ligne}><span style={champLabel}>Expiration</span><span>{data.expireAt ? fmtDate(data.expireAt) : <span style={{ color: "var(--text-2)" }}>aucune</span>}</span></div>
              <div style={{ ...ligne, borderBottom: "none" }}><span style={champLabel}>Créée le</span><span>{fmtDate(data.createdAt)}</span></div>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: "10px 0 14px" }}>
              Le secret n'est pas récupérable. En cas de perte, régénérez la clé.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button className="btn btn-ghost" onClick={ouvrirEdition} disabled={!!busy}><Pencil size={14} style={{ marginRight: 6 }} />Modifier</button>
              {data.webhookUrl && (
                <button className="btn btn-ghost" onClick={testerWebhook} disabled={!!busy}><Send size={14} style={{ marginRight: 6 }} />{busy === "webhook" ? "Envoi…" : "Tester le webhook"}</button>
              )}
              <button className="btn btn-ghost" onClick={regenerer} disabled={!!busy}><RefreshCw size={14} style={{ marginRight: 6 }} />{busy === "regen" ? "…" : "Régénérer"}</button>
              <button className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={revoquer} disabled={!!busy}><Trash2 size={14} style={{ marginRight: 6 }} />{busy === "revoke" ? "…" : "Révoquer"}</button>
            </div>
          </>
        )}

        {/* ---------- Aucune clé : proposition de création ---------- */}
        {!reveal && !loading && !data && mode === "view" && (
          <div className="empty" style={{ marginBottom: 16 }}>
            Aucune clé API active pour ce partenaire.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => { setErr(""); setOk(""); setMode("form"); }}>Créer une clé</button>
            </div>
          </div>
        )}

        {/* ---------- Formulaire (création ou édition) ---------- */}
        {!reveal && !loading && mode === "form" && (
          <div>
            {!editing && (
              <>
                <div className="field">
                  <label className="label">Libellé</label>
                  <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Intégration site partenaire" />
                </div>
                <div className="field">
                  <label className="label">Environnement</label>
                  <select className="select" value={environnement} onChange={(e) => setEnvironnement(e.target.value as "live" | "test")}>
                    <option value="live">live (production)</option>
                    <option value="test">test (bac à sable)</option>
                  </select>
                </div>
              </>
            )}
            {editing && (
              <div className="field">
                <label className="label">Libellé</label>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
            )}

            <div className="field">
              <label className="label">Portées <span className="req">*</span></label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {SCOPES_API.map((s) => (
                  <label key={s.v} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={scopes.includes(s.v)} onChange={() => toggle(scopes, setScopes, s.v)} />
                    <span>{s.l} <code style={{ fontSize: 11, color: "var(--text-2)" }}>{s.v}</code></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="label">URL webhook (optionnel)</label>
              <input className="input" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://partenaire.exemple.com/webhooks/sim" />
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>HTTPS obligatoire, hôte public.</div>
            </div>

            {webhookUrl.trim() && (
              <div className="field">
                <label className="label">Événements poussés</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {EVENEMENTS_WEBHOOK.map((ev) => (
                    <label key={ev} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={webhookEvents.includes(ev)} onChange={() => toggle(webhookEvents, setWebhookEvents, ev)} />
                      <code style={{ fontSize: 12 }}>{ev}</code>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <label className="label">IP autorisées (optionnel)</label>
              <textarea className="input" rows={2} value={ipAllowlist} onChange={(e) => setIpAllowlist(e.target.value)} placeholder="Une IP ou plage CIDR par ligne — vide = toutes" style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
            </div>

            <div className="field">
              <label className="label">Expiration (optionnel)</label>
              <input className="input" type="date" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={!!busy || scopes.length === 0}
                onClick={editing ? enregistrerEdition : creer}
              >
                {busy ? "…" : editing ? "Enregistrer" : "Créer la clé"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setMode("view"); setErr(""); }}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const empty = {
  nomCommerce: "",
  nomResponsable: "",
  telephone: "",
  localisation: "",
  email: "",
};

const MEDAILLES = ["🥇", "🥈", "🥉"];

export default function Partenaires() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("INCENDIE_ACCIDENT"));
  // Activation/désactivation par produit : réservée au Super Administrateur
  // global (pas même un BRANCH_SUPER_ADMIN), contrairement aux autres actions
  // partenaire — voir GET/POST /partenaires/:id/produits (backend).
  const isSuperAdminGlobal = user?.role === "SUPER_ADMIN";
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (statut) params.set("statut", statut);
  const { data, loading, error, reload } = useFetch<Partenaire[]>(
    `/partenaires?${params.toString()}`
  );

  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [qr, setQr] = useState<{ url: string; label: string } | null>(null);
  const [credentials, setCredentials] = useState<{
    nomCommerce: string;
    email: string;
    motDePasse: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [produitsId, setProduitsId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partenaire | null>(null);
  const [accesApi, setAccesApi] = useState<Partenaire | null>(null);

  // Classement des partenaires par produit — le prospect choisit un produit,
  // le tableau liste les partenaires du plus performant (le plus de
  // souscriptions confirmées) au moins performant. Agrégation client-side
  // sur GET /assurances-branche/souscriptions, déjà utilisé ailleurs (voir
  // filtre "Production par produit" du tableau de bord) : aucun endroit
  // backend dédié n'est nécessaire.
  const [produitClassement, setProduitClassement] = useState("");
  const [classementFrom, setClassementFrom] = useState("");
  const [classementTo, setClassementTo] = useState("");
  const { data: catalogueClassement } = useFetch<CatalogueProduitBranche[]>("/assurances-branche/catalogue");
  const classementParams = new URLSearchParams();
  classementParams.set("statut", "confirme");
  if (produitClassement) classementParams.set("produit", produitClassement);
  if (classementFrom) classementParams.set("from", classementFrom);
  if (classementTo) classementParams.set("to", classementTo);
  const { data: souscriptionsClassement, loading: classementLoading } = useFetch<SouscriptionBranche[]>(
    produitClassement ? `/assurances-branche/souscriptions?${classementParams.toString()}` : null
  );
  const classement = (() => {
    const parPartenaire = new Map<string, { partenaireId: string; nomCommerce: string; nomResponsable: string; nombre: number; ca: number }>();
    for (const s of souscriptionsClassement ?? []) {
      const ligne = parPartenaire.get(s.partenaireId) ?? {
        partenaireId: s.partenaireId,
        nomCommerce: s.partenaireNom,
        nomResponsable: s.partenaireResponsable ?? "",
        nombre: 0,
        ca: 0,
      };
      ligne.nombre += 1;
      ligne.ca += s.montantPrime;
      parPartenaire.set(s.partenaireId, ligne);
    }
    return [...parPartenaire.values()].sort((a, b) => b.nombre - a.nombre);
  })();
  const maxClassement = Math.max(...classement.map((c) => c.nombre), 1);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api.post<{
        nomCommerce: string;
        email?: string | null;
        motDePasseProvisoire?: string | null;
      }>("/partenaires", {
        nomCommerce: form.nomCommerce,
        nomResponsable: form.nomResponsable,
        telephone: form.telephone,
        localisation: form.localisation,
        // Ni `produit` ni `sousBranche` : un seul QR unique est généré, le
        // client choisit son Assurance (Accidents/Dommages) puis son produit
        // après le scan (refonte 2026-08-07).
        email: form.email || undefined,
      });
      setForm(empty);
      reload();
      if (result.motDePasseProvisoire && result.email) {
        setCredentials({
          nomCommerce: result.nomCommerce,
          email: result.email,
          motDePasse: result.motDePasseProvisoire,
        });
      } else {
        notify("Partenaire créé ✓");
      }
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function copyCredentials() {
    if (!credentials) return;
    navigator.clipboard.writeText(
      `Email : ${credentials.email}\nMot de passe : ${credentials.motDePasse}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleStatut(p: Partenaire) {
    await api.post(`/partenaires/${p.id}/statut`, {
      statut: p.statut === "actif" ? "inactif" : "actif",
    });
    reload();
  }

  async function remove(p: Partenaire) {
    if (!confirm(`Supprimer ${p.nomCommerce} ?`)) return;
    try {
      await api.del(`/partenaires/${p.id}`);
      notify("Partenaire supprimé");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  async function showQr(
    p: Partenaire,
    produit: "incendie1000" | "incendie2000" | "accident" | "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES" | "UNIFIE"
  ) {
    try {
      const r = await api.get<{ dataUrl: string }>(
        `/partenaires/${p.id}/qr/${produit}`
      );
      const label =
        produit === "incendie1000" ? "Incendie 1 000 FCFA"
        : produit === "incendie2000" ? "Incendie 2 000 FCFA"
        : produit === "accident" ? "Accidents"
        : produit === "ASSURANCES_ACCIDENTS" ? "Assurances Accidents"
        : produit === "ASSURANCES_DOMMAGES" ? "Assurances Dommages"
        : "Assurances Accidents et Dommages";
      setQr({ url: r.dataUrl, label });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((p) => ({
        "Commerce": p.nomCommerce,
        "Responsable": p.nomResponsable,
        "Téléphone": p.telephone,
        "Localisation": p.localisation,
        "Type de commerce": p.typeCommerce,
        "Produit": p.qrUnifie
          ? "Assurances Accidents et Dommages"
          : p.sousBranche
          ? p.sousBranche === "ASSURANCES_ACCIDENTS" ? "Assurances Accidents" : "Assurances Dommages"
          : p.produitIncendie ? "Incendie (historique)" : "Accidents (historique)",
        "Statut": p.statut,
        "Clients Incendie": p.clientsIncendie,
        "Clients Accidents": p.clientsAccident,
        "Clients (autres produits)": p.clientsRelax ?? 0,
        "Email": p.email ?? "",
        "Créé le": fmtDate(p.createdAt),
      })),
      "partenaires.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Partenaires"
        subtitle="Gérez le réseau de commerçants distributeurs et leurs QR codes."
        actions={
          <button className="btn btn-ghost" onClick={exportXlsx}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        }
      />

      <Card
        title="Classement des partenaires par produit"
        style={{ marginTop: 24 }}
        extra={
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select
              className="select"
              style={{ width: 260, height: 40 }}
              value={produitClassement}
              onChange={(e) => setProduitClassement(e.target.value)}
            >
              <option value="">Sélectionnez un produit…</option>
              {(catalogueClassement ?? []).map((p) => (
                <option key={p.code} value={p.code}>{p.libelle}</option>
              ))}
            </select>
            <input
              type="date"
              className="input"
              style={{ height: 40, width: 150 }}
              value={classementFrom}
              max={classementTo || undefined}
              onChange={(e) => setClassementFrom(e.target.value)}
              title="Du"
            />
            <input
              type="date"
              className="input"
              style={{ height: 40, width: 150 }}
              value={classementTo}
              min={classementFrom || undefined}
              onChange={(e) => setClassementTo(e.target.value)}
              title="Au"
            />
          </div>
        }
        noBody={!!produitClassement}
      >
        {!produitClassement && (
          <div className="muted" style={{ fontSize: 13, padding: "4px 0" }}>
            Choisissez un produit pour voir les partenaires classés du plus performant au moins performant.
          </div>
        )}
        {produitClassement && classementLoading && <Loader />}
        {produitClassement && !classementLoading && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Partenaire</th>
                  <th>Souscriptions</th>
                  <th>Chiffre d'affaires</th>
                </tr>
              </thead>
              <tbody>
                {classement.map((c, i) => (
                  <tr key={c.partenaireId}>
                    <td style={{ color: "var(--text-2)", fontWeight: 600 }}>
                      {i < 3 ? MEDAILLES[i] : i + 1}
                    </td>
                    <td>
                      <strong>{c.nomCommerce}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.nomResponsable}</div>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="bar-track" style={{ flex: 1 }}>
                          <div className="bar-fill" style={{ width: `${(c.nombre / maxClassement) * 100}%` }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{nb(c.nombre)}</span>
                      </div>
                    </td>
                    <td><strong style={{ color: "var(--sim-primary)" }}>{fcfa(c.ca)}</strong></td>
                  </tr>
                ))}
                {classement.length === 0 && (
                  <tr><td colSpan={4}><div className="empty">Aucune souscription confirmée pour ce produit sur cette période.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card
          title={`Réseau${data ? ` (${data.length})` : ""}`}
          extra={
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 11, top: 13, color: "var(--text-3)" }}
                />
                <input
                  className="input"
                  style={{ paddingLeft: 34, width: 190, height: 40 }}
                  placeholder="Rechercher…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <select
                className="select"
                style={{ width: 140, height: 40 }}
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
              >
                <option value="">Tous statuts</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
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
                    <th>Commerce</th>
                    <th>Localisation</th>
                    <th>Produit</th>
                    <th>Clients</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.nomCommerce}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {p.nomResponsable}
                        </div>
                      </td>
                      <td>{p.localisation}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {p.qrUnifie && (
                            <Badge kind="info">Assurances Accidents et Dommages</Badge>
                          )}
                          {p.sousBranche === "ASSURANCES_ACCIDENTS" && (
                            <Badge kind="success">Assurances Accidents</Badge>
                          )}
                          {p.sousBranche === "ASSURANCES_DOMMAGES" && (
                            <Badge kind="warning">Assurances Dommages</Badge>
                          )}
                          {!p.sousBranche && !p.qrUnifie && p.produitIncendie && (
                            <Badge kind="warning">Incendie (historique)</Badge>
                          )}
                          {!p.sousBranche && !p.qrUnifie && p.produitAccident && (
                            <Badge kind="success">Accidents (historique)</Badge>
                          )}
                        </div>
                      </td>
                      <td className="muted">
                        {p.clientsIncendie + p.clientsAccident + (p.clientsRelax ?? 0)}
                      </td>
                      <td>
                        {p.statut === "actif" ? (
                          <Badge kind="success">Actif</Badge>
                        ) : (
                          <Badge kind="neutral">Inactif</Badge>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: 8 }}
                            title="Voir les détails"
                            onClick={() => setDetailsId(p.id)}
                          >
                            <Eye size={15} color="var(--sim-primary)" />
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: 8 }}
                            title="Modifier le partenaire"
                            onClick={() => setEditing(p)}
                          >
                            <Pencil size={15} />
                          </button>
                          {isSuper && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title="Accès API"
                              onClick={() => setAccesApi(p)}
                            >
                              <KeyRound size={15} />
                            </button>
                          )}
                          {isSuperAdminGlobal && (p.sousBranche || p.qrUnifie) && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title="Produits actifs pour ce partenaire (Super Administrateur)"
                              onClick={() => setProduitsId(p.id)}
                            >
                              <SlidersHorizontal size={15} />
                            </button>
                          )}
                          {p.qrUnifie && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title="QR Assurances Accidents et Dommages"
                              onClick={() => showQr(p, "UNIFIE")}
                            >
                              <QrCode size={15} color="#004b9c" />
                            </button>
                          )}
                          {p.sousBranche && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title={`QR ${p.sousBranche === "ASSURANCES_ACCIDENTS" ? "Assurances Accidents" : "Assurances Dommages"}`}
                              onClick={() => showQr(p, p.sousBranche!)}
                            >
                              <QrCode size={15} color={p.sousBranche === "ASSURANCES_ACCIDENTS" ? "#15803d" : "#b45309"} />
                            </button>
                          )}
                          {!p.sousBranche && !p.qrUnifie && p.produitIncendie && (
                            <>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: 8 }}
                                title="QR Incendie 1 000 FCFA"
                                onClick={() => showQr(p, "incendie1000")}
                              >
                                <QrCode size={15} color="#b45309" />
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: 8 }}
                                title="QR Incendie 2 000 FCFA"
                                onClick={() => showQr(p, "incendie2000")}
                              >
                                <QrCode size={15} color="#dc2626" />
                              </button>
                            </>
                          )}
                          {!p.sousBranche && !p.qrUnifie && p.produitAccident && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title="QR Accidents"
                              onClick={() => showQr(p, "accident")}
                            >
                              <QrCode size={15} color="#15803d" />
                            </button>
                          )}
                          <button
                            className="btn btn-ghost"
                            style={{ padding: 8 }}
                            title={p.statut === "actif" ? "Désactiver" : "Activer"}
                            onClick={() => toggleStatut(p)}
                          >
                            <Power size={15} />
                          </button>
                          {isSuper && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title="Supprimer"
                              onClick={() => remove(p)}
                            >
                              <Trash2 size={15} color="var(--danger)" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty">Aucun partenaire trouvé.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Ajouter un partenaire">
          <form onSubmit={create}>
            <div className="field">
              <label className="label">Nom du commerce <span className="req">*</span></label>
              <input
                className="input"
                required
                value={form.nomCommerce}
                onChange={(e) => setForm({ ...form, nomCommerce: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">Responsable <span className="req">*</span></label>
              <input
                className="input"
                required
                value={form.nomResponsable}
                onChange={(e) => setForm({ ...form, nomResponsable: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">Téléphone <span className="req">*</span></label>
              <PhoneInput required value={form.telephone} onChange={(v) => setForm({ ...form, telephone: v })} />
            </div>
            <div className="field">
              <label className="label">Localisation <span className="req">*</span></label>
              <input
                className="input"
                required
                value={form.localisation}
                onChange={(e) => setForm({ ...form, localisation: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">Assurance</label>
              <div
                className="muted"
                style={{ fontSize: 13, marginTop: 2, background: "var(--sim-primary-50, #e6f1fb)", borderRadius: 8, padding: "10px 12px" }}
              >
                Un seul QR code unique sera généré : le client choisira d'abord son Assurance
                (Accidents ou Dommages), puis son produit, après l'avoir scanné.
              </div>
            </div>
            <div className="field">
              <label className="label">Gmail (accès partenaire) <span className="req">*</span></label>
              <input
                className="input"
                type="email"
                required
                placeholder="exemple@gmail.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Obligatoire. Un mot de passe provisoire sera généré automatiquement.
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={saving}>
              <Plus size={17} /> {saving ? "Création…" : "Créer le partenaire"}
            </button>
          </form>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Les QR codes sont générés automatiquement selon le produit attribué.
          </p>
        </Card>
      </div>

      {qr && (
        <div
          onClick={() => setQr(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,27,45,.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ padding: 24, width: 320, textAlign: "center" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <strong>QR {qr.label}</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setQr(null)}>
                <X size={16} />
              </button>
            </div>
            <img src={qr.url} alt="QR" style={{ width: 240, height: 240 }} />
            <a className="btn btn-primary btn-block" style={{ marginTop: 14 }} href={qr.url} download={`qr-${qr.label}.png`}>
              <Download size={16} /> Télécharger
            </a>
          </div>
        </div>
      )}

      {credentials && (
        <div
          onClick={() => setCredentials(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,27,45,.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ padding: 28, width: 380, maxWidth: "calc(100vw - 32px)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <strong style={{ fontSize: 16 }}>Accès créé — {credentials.nomCommerce}</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setCredentials(null)}>
                <X size={16} />
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
              Transmettez ces identifiants au partenaire. Le mot de passe ne sera plus affiché après fermeture.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</div>
                <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 14 }}>
                  {credentials.email}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Mot de passe provisoire</div>
                <div style={{ background: "var(--sim-primary-50, #e6f1fb)", border: "1px solid var(--sim-primary)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 22, fontWeight: 800, letterSpacing: "0.12em", color: "var(--sim-primary)", textAlign: "center" }}>
                  {credentials.motDePasse}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={copyCredentials}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copié !" : "Copier les identifiants"}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCredentials(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsId && <DetailsModal partenaireId={detailsId} onClose={() => setDetailsId(null)} />}
      {produitsId && <ProduitsModal partenaireId={produitsId} onClose={() => setProduitsId(null)} />}
      {accesApi && <AccesApiModal partenaire={accesApi} onClose={() => setAccesApi(null)} />}
      {editing && (
        <EditModal
          partenaire={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { notify(msg); reload(); }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
