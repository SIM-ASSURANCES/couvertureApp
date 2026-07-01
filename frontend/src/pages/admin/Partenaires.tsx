import { useState, useEffect, useCallback } from "react";
import { Plus, Search, QrCode, Power, Trash2, Download, X, Copy, Check, Eye } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { useAuth } from "../../auth";
import type { Partenaire } from "../../types";

interface PartenaireDetails {
  partenaire: {
    id: string; nomCommerce: string; nomResponsable: string; telephone: string;
    localisation: string; email: string | null; statut: string;
    produitIncendie: boolean; produitAccident: boolean;
  };
  souscripteursIncendie: { id: string; telephone: string; nom?: string | null; prenom?: string | null; montantPrime: number; statut: string; createdAt: string }[];
  souscripteursAccident: { id: string; telephone: string; nom: string; prenom: string; montantPrime: number; waveStatut: string; createdAt: string }[];
  commissionTotale: number;
  commissionGenereePeriode: number;
  commissionEncaissee: number;
  commissionDue: number;
}

function DetailsModal({ partenaireId, onClose }: { partenaireId: string; onClose: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<PartenaireDetails | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 820, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <strong style={{ fontSize: 17 }}>{data?.partenaire.nomCommerce ?? "Détails partenaire"}</strong>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
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
              <div className="stat"><div className="stat-label">Encaissée</div><div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionEncaissee)}</div></div>
              <div className="stat"><div className="stat-label">Due</div><div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionDue)}</div></div>
              <div className="stat"><div className="stat-label">Générée (période)</div><div className="stat-value" style={{ fontSize: 18 }}>{fcfa(data.commissionGenereePeriode)}</div></div>
            </div>

            <div style={{ fontWeight: 700, margin: "8px 0 8px" }}>Souscripteurs via son canal ({data.souscripteursIncendie.length + data.souscripteursAccident.length})</div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Produit</th><th>Client</th><th>Téléphone</th><th>Prime</th><th>Date</th></tr></thead>
                <tbody>
                  {data.souscripteursIncendie.map((s) => (
                    <tr key={s.id}>
                      <td><Badge kind="warning">Incendie</Badge></td>
                      <td>{[s.prenom, s.nom].filter(Boolean).join(" ") || <span className="muted">—</span>}</td>
                      <td>{s.telephone}</td>
                      <td>{fcfa(s.montantPrime)}</td>
                      <td className="muted">{fmtDate(s.createdAt)}</td>
                    </tr>
                  ))}
                  {data.souscripteursAccident.map((s) => (
                    <tr key={s.id}>
                      <td><Badge kind="success">Accident</Badge></td>
                      <td>{s.prenom} {s.nom}</td>
                      <td>{s.telephone}</td>
                      <td>{fcfa(s.montantPrime)}</td>
                      <td className="muted">{fmtDate(s.createdAt)}</td>
                    </tr>
                  ))}
                  {data.souscripteursIncendie.length + data.souscripteursAccident.length === 0 && (
                    <tr><td colSpan={5}><div className="empty">Aucun souscripteur sur la période.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
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
  typeCommerce: "Electronique",
  produit: "incendie" as "incendie" | "accident",
  email: "",
};

export default function Partenaires() {
  const { user } = useAuth();
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
        typeCommerce: form.typeCommerce,
        produit: form.produit,
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

  async function showQr(p: Partenaire, produit: "incendie1000" | "incendie2000" | "accident") {
    try {
      const r = await api.get<{ dataUrl: string }>(
        `/partenaires/${p.id}/qr/${produit}`
      );
      const label =
        produit === "incendie1000" ? "Incendie 1 000 FCFA"
        : produit === "incendie2000" ? "Incendie 2 000 FCFA"
        : "Accident";
      setQr({ url: r.dataUrl, label });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Partenaires"
        subtitle="Gérez le réseau de commerçants distributeurs et leurs QR codes."
      />

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
                          {p.produitIncendie && (
                            <Badge kind="warning">Incendie</Badge>
                          )}
                          {p.produitAccident && (
                            <Badge kind="success">Accident</Badge>
                          )}
                        </div>
                      </td>
                      <td className="muted">
                        {p.clientsIncendie + p.clientsAccident}
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
                          {p.produitIncendie && (
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
                          {p.produitAccident && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title="QR Accident"
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
                          {user?.role === "SUPER_ADMIN" && (
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
              <input
                className="input"
                required
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              />
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
              <label className="label">Type de commerce <span className="req">*</span></label>
              <select
                className="select"
                value={form.typeCommerce}
                onChange={(e) => setForm({ ...form, typeCommerce: e.target.value })}
              >
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
                  <input
                    type="radio"
                    name="produit"
                    value="incendie"
                    checked={form.produit === "incendie"}
                    onChange={() => setForm({ ...form, produit: "incendie" })}
                  />
                  <span>Incendie</span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="produit"
                    value="accident"
                    checked={form.produit === "accident"}
                    onChange={() => setForm({ ...form, produit: "accident" })}
                  />
                  <span>Accident</span>
                </label>
              </div>
              {form.produit === "incendie" && (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Deux QR codes seront générés automatiquement : 1 000 FCFA et 2 000 FCFA.
                </div>
              )}
            </div>
            <div className="field">
              <label className="label">Gmail (accès partenaire)</label>
              <input
                className="input"
                type="email"
                placeholder="exemple@gmail.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Facultatif. Un mot de passe provisoire sera généré automatiquement.
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

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
