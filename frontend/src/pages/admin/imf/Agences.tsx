import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import { useAuth } from "../../../auth";
import type { AgenceImf, ZoneImf } from "../../../types";

const empty = { nom: "", zoneId: "", telephone: "", localisation: "" };

export default function Agences() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const { data, loading, error, reload } = useFetch<AgenceImf[]>("/imf/agences");
  const { data: zones } = useFetch<ZoneImf[]>("/imf/zones");
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/imf/agences", {
        nom: form.nom,
        zoneId: form.zoneId,
        telephone: form.telephone || undefined,
        localisation: form.localisation || undefined,
      });
      setForm(empty);
      notify("Agence créée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: AgenceImf) {
    if (!confirm(`Supprimer l'agence "${a.nom}" ?`)) return;
    try {
      await api.del(`/imf/agences/${a.id}`);
      notify("Agence supprimée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  const canSubmit = form.nom.trim() && form.zoneId;

  return (
    <>
      <PageHeader title="Agences" subtitle="Institutions de microfinance rattachées à une zone." />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title={data ? `${data.length} agences` : "Agences"} noBody>
          {loading && <Loader />}
          {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
          {data && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Zone</th>
                    <th>Agents</th>
                    <th>Localisation</th>
                    <th>Créée le</th>
                    {isSuper && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.nom}</strong></td>
                      <td className="muted">{a.zoneNom}</td>
                      <td className="muted">{a.nbAgents ?? 0}</td>
                      <td className="muted">{a.localisation ?? "—"}</td>
                      <td className="muted">{fmtDate(a.createdAt)}</td>
                      {isSuper && (
                        <td>
                          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => remove(a)}>
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={6}><div className="empty">Aucune agence.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Ajouter une agence">
          <form onSubmit={create}>
            <div className="field">
              <label className="label">Nom <span className="req">*</span></label>
              <input className="input" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Zone <span className="req">*</span></label>
              <select className="select" required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                <option value="">Sélectionner…</option>
                {zones?.map((z) => (
                  <option key={z.id} value={z.id}>{z.nom}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Téléphone</label>
              <input className="input" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Localisation</label>
              <input className="input" value={form.localisation} onChange={(e) => setForm({ ...form, localisation: e.target.value })} />
            </div>
            <button className="btn btn-primary btn-block" disabled={saving || !canSubmit}>
              <Plus size={17} /> {saving ? "Création…" : "Créer l'agence"}
            </button>
          </form>
        </Card>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
