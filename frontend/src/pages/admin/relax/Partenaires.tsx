import { useState } from "react";
import { QrCode, Power, Trash2, Search, X } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import type { Partenaire, ProduitRelax } from "../../../types";

const empty = {
  nomCommerce: "",
  nomResponsable: "",
  telephone: "",
  localisation: "",
  typeCommerce: "MecaniqueGarage",
  produit: "relaxmoto" as ProduitRelax,
  email: "",
};

export default function RelaxPartenaires() {
  const [q, setQ] = useState("");
  const params = new URLSearchParams({ branche: "RELAX" });
  if (q) params.set("q", q);
  const { data, loading, error, reload } = useFetch<Partenaire[]>(`/partenaires?${params.toString()}`);

  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [qr, setQr] = useState<{ url: string; label: string } | null>(null);
  const [credentials, setCredentials] = useState<{ nomCommerce: string; email: string; motDePasse: string } | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api.post<{ nomCommerce: string; email?: string | null; motDePasseProvisoire?: string | null }>(
        "/partenaires",
        {
          nomCommerce: form.nomCommerce,
          nomResponsable: form.nomResponsable,
          telephone: form.telephone,
          localisation: form.localisation,
          typeCommerce: form.typeCommerce,
          produit: form.produit,
          email: form.email || undefined,
        }
      );
      setForm(empty);
      reload();
      if (result.motDePasseProvisoire && result.email) {
        setCredentials({ nomCommerce: result.nomCommerce, email: result.email, motDePasse: result.motDePasseProvisoire });
      } else {
        notify("Partenaire créé ✓");
      }
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatut(p: Partenaire) {
    await api.post(`/partenaires/${p.id}/statut`, { statut: p.statut === "actif" ? "inactif" : "actif" });
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

  async function showQr(p: Partenaire, produit: ProduitRelax) {
    try {
      const r = await api.get<{ dataUrl: string }>(`/partenaires/${p.id}/qr/${produit}`);
      setQr({ url: r.dataUrl, label: produit === "relaxmoto" ? "RelaxMoto" : "RelaxAuto" });
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Partenaires — RelaxMoto & RelaxAuto"
        subtitle="Réseau de distributeurs de la branche Relax et leurs QR codes."
      />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card
          title={`Réseau${data ? ` (${data.length})` : ""}`}
          extra={
            <div style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: 11, top: 13, color: "var(--text-3)" }} />
              <input
                className="input"
                style={{ paddingLeft: 34, width: 190, height: 40 }}
                placeholder="Rechercher…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
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
                    <th>Clients Relax</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.nomCommerce}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{p.nomResponsable}</div>
                      </td>
                      <td>{p.localisation}</td>
                      <td className="muted">{p.clientsRelax ?? 0}</td>
                      <td>{p.statut === "actif" ? <Badge kind="success">Actif</Badge> : <Badge kind="neutral">Inactif</Badge>}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost" style={{ padding: 8 }} title="QR RelaxMoto" onClick={() => showQr(p, "relaxmoto")}>
                            <QrCode size={15} color="#16215E" />
                          </button>
                          <button className="btn btn-ghost" style={{ padding: 8 }} title="QR RelaxAuto" onClick={() => showQr(p, "relaxauto")}>
                            <QrCode size={15} color="#51AEE2" />
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: 8 }}
                            title={p.statut === "actif" ? "Désactiver" : "Activer"}
                            onClick={() => toggleStatut(p)}
                          >
                            <Power size={15} />
                          </button>
                          <button className="btn btn-ghost" style={{ padding: 8 }} title="Supprimer" onClick={() => remove(p)}>
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={5}><div className="empty">Aucun partenaire Relax pour l'instant.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Ajouter un partenaire Relax">
          <form onSubmit={create}>
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
              <input className="input" required value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
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
                  <input type="radio" name="produitRelax" checked={form.produit === "relaxmoto"} onChange={() => setForm({ ...form, produit: "relaxmoto" })} />
                  <span>RelaxMoto</span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="produitRelax" checked={form.produit === "relaxauto"} onChange={() => setForm({ ...form, produit: "relaxauto" })} />
                  <span>RelaxAuto</span>
                </label>
              </div>
            </div>
            <div className="field">
              <label className="label">Gmail (accès partenaire) <span className="req">*</span></label>
              <input className="input" type="email" required placeholder="exemple@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={saving}>
              {saving ? "Création…" : "Créer le partenaire"}
            </button>
          </form>
        </Card>
      </div>

      {qr && (
        <div onClick={() => setQr(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ padding: 24, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <strong>{qr.label}</strong>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setQr(null)}><X size={18} /></button>
            </div>
            <img src={qr.url} alt={qr.label} style={{ width: 260, height: 260 }} />
          </div>
        </div>
      )}

      {credentials && (
        <div onClick={() => setCredentials(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.5)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ padding: 24, width: 380, maxWidth: "100%" }}>
            <strong>{credentials.nomCommerce} créé ✓</strong>
            <p className="muted" style={{ fontSize: 13 }}>Accès partenaire (à transmettre) :</p>
            <div style={{ fontSize: 14 }}>Email : <strong>{credentials.email}</strong></div>
            <div style={{ fontSize: 14, marginBottom: 16 }}>Mot de passe : <strong>{credentials.motDePasse}</strong></div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setCredentials(null)}>Fermer</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
