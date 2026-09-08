import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fmtDate, nb, PhoneInput } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import { useAuth, type BrancheAcces } from "../../../auth";
import type { AgenceImf, ZoneImf } from "../../../types";

const empty = { nom: "", zoneId: "", telephone: "", localisation: "" };

/** Voir ZonesInner : paramétrable branche « Assurances IMF » / réseau d'une IMF partenaire. */
export function AgencesInner({
  apiBase = "/imf",
  branche = "IMF",
  header = true,
}: {
  apiBase?: string;
  branche?: BrancheAcces;
  header?: boolean;
}) {
  const { user } = useAuth();
  const isSuper =
    user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes(branche));
  const { data, loading, error, reload } = useFetch<AgenceImf[]>(`${apiBase}/agences`);
  const { data: zones } = useFetch<ZoneImf[]>(`${apiBase}/zones`);
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
      await api.post(`${apiBase}/agences`, {
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
      await api.del(`${apiBase}/agences/${a.id}`);
      notify("Agence supprimée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  const canSubmit = form.nom.trim() && form.zoneId;

  return (
    <>
      {header && <PageHeader title="Agences" subtitle="Institutions de microfinance rattachées à une zone." />}

      <div className="grid-2" style={{ marginTop: header ? 24 : 0 }}>
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
                      <td className="muted">{nb(a.nbAgents ?? 0)}</td>
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
              <PhoneInput value={form.telephone} onChange={(v) => setForm({ ...form, telephone: v })} />
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

export default function Agences() {
  return <AgencesInner />;
}
