import { useState, useEffect } from "react";
import { Plus, Search, QrCode, Power, Trash2, Download, X, Copy, Check } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api, API_BASE } from "../../api";
import { useAuth } from "../../auth";
import type { Partenaire } from "../../types";

interface TarifIncendie {
  id: number;
  prime: number;
  capitalGaranti: number;
}

const empty = {
  nomCommerce: "",
  nomResponsable: "",
  telephone: "",
  localisation: "",
  typeCommerce: "Electronique",
  produit: "incendie" as "incendie" | "accident",
  tarifIncendieId: "",
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

  const [tarifsIncendie, setTarifsIncendie] = useState<TarifIncendie[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/public/tarifs/incendie`)
      .then((r) => r.json())
      .then(setTarifsIncendie)
      .catch(() => {});
  }, []);

  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [qr, setQr] = useState<{ url: string; produit: string } | null>(null);
  const [credentials, setCredentials] = useState<{
    nomCommerce: string;
    email: string;
    motDePasse: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (form.produit === "incendie" && !form.tarifIncendieId) {
      notify("Veuillez sélectionner un tarif incendie.");
      return;
    }
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
        tarifIncendieId: form.produit === "incendie" ? Number(form.tarifIncendieId) : undefined,
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

  async function showQr(p: Partenaire, produit: "incendie" | "accident") {
    try {
      const r = await api.get<{ dataUrl: string }>(
        `/partenaires/${p.id}/qr/${produit}`
      );
      setQr({ url: r.dataUrl, produit });
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
                    <th>Produits</th>
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
                          {p.produitIncendie && p.tarifIncendie && (
                            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                              Tarif : {fcfa(p.tarifIncendie.prime)}
                            </span>
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
                          {p.produitIncendie && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 8 }}
                              title="QR Incendie"
                              onClick={() => showQr(p, "incendie")}
                            >
                              <QrCode size={15} color="#b45309" />
                            </button>
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
                <option>Electronique</option>
                <option>Alimentation</option>
                <option>Textile</option>
                <option>Autre</option>
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
                    onChange={() => setForm({ ...form, produit: "incendie", tarifIncendieId: "" })}
                  />
                  <span>Incendie</span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="produit"
                    value="accident"
                    checked={form.produit === "accident"}
                    onChange={() => setForm({ ...form, produit: "accident", tarifIncendieId: "" })}
                  />
                  <span>Accident</span>
                </label>
              </div>
            </div>

            {form.produit === "incendie" && (
              <div className="field">
                <label className="label">Tarif attribué <span className="req">*</span></label>
                <select
                  className="select"
                  required
                  value={form.tarifIncendieId}
                  onChange={(e) => setForm({ ...form, tarifIncendieId: e.target.value })}
                >
                  <option value="">— Choisir un tarif —</option>
                  {tarifsIncendie.map((t) => (
                    <option key={t.id} value={t.id}>
                      {fcfa(t.prime)} — Capital garanti : {fcfa(t.capitalGaranti)}
                    </option>
                  ))}
                </select>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Ce tarif sera appliqué à tous les clients de ce partenaire.
                </div>
              </div>
            )}
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
            Les QR codes sont générés automatiquement selon les produits autorisés.
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
              <strong style={{ textTransform: "capitalize" }}>QR {qr.produit}</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setQr(null)}>
                <X size={16} />
              </button>
            </div>
            <img src={qr.url} alt="QR" style={{ width: 240, height: 240 }} />
            <a className="btn btn-primary btn-block" style={{ marginTop: 14 }} href={qr.url} download={`qr-${qr.produit}.png`}>
              <Download size={16} /> Télécharger
            </a>
          </div>
        </div>
      )}

      {/* ── Modal credentials provisoires ── */}
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
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Email
                </div>
                <div style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontFamily: "monospace",
                  fontSize: 14,
                }}>
                  {credentials.email}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Mot de passe provisoire
                </div>
                <div style={{
                  background: "var(--sim-primary-50, #e6f1fb)",
                  border: "1px solid var(--sim-primary)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontFamily: "monospace",
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  color: "var(--sim-primary)",
                  textAlign: "center",
                }}>
                  {credentials.motDePasse}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={copyCredentials}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copié !" : "Copier les identifiants"}
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setCredentials(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
