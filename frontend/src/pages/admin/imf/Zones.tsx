import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import { useAuth } from "../../../auth";
import type { ZoneImf } from "../../../types";

export default function Zones() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const { data, loading, error, reload } = useFetch<ZoneImf[]>("/imf/zones");
  const [nom, setNom] = useState("");
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
      await api.post("/imf/zones", { nom });
      setNom("");
      notify("Zone créée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(z: ZoneImf) {
    if (!confirm(`Supprimer la zone "${z.nom}" ?`)) return;
    try {
      await api.del(`/imf/zones/${z.id}`);
      notify("Zone supprimée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Zones" subtitle="Découpage géographique du réseau IMF." />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title={data ? `${data.length} zones` : "Zones"} noBody>
          {loading && <Loader />}
          {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
          {data && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Agences</th>
                    <th>Agents</th>
                    <th>Créée le</th>
                    {isSuper && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((z) => (
                    <tr key={z.id}>
                      <td><strong>{z.nom}</strong></td>
                      <td className="muted">{z.nbAgences ?? 0}</td>
                      <td className="muted">{z.nbAgents ?? 0}</td>
                      <td className="muted">{fmtDate(z.createdAt)}</td>
                      {isSuper && (
                        <td>
                          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => remove(z)}>
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={5}><div className="empty">Aucune zone.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Ajouter une zone">
          <form onSubmit={create}>
            <div className="field">
              <label className="label">Nom <span className="req">*</span></label>
              <input className="input" required value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" disabled={saving || !nom.trim()}>
              <Plus size={17} /> {saving ? "Création…" : "Créer la zone"}
            </button>
          </form>
        </Card>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
