import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fmtDate, nb } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import { useAuth, type BrancheAcces } from "../../../auth";
import type { ZoneImf } from "../../../types";

/**
 * Gestion des zones IMF. Paramétrable pour servir aussi bien la branche
 * « Assurances IMF » (apiBase `/imf`) que le réseau d'une IMF partenaire
 * (apiBase `/imf-partenaires/:id/reseau`). Le `header` est masqué quand la
 * page est rendue à l'intérieur d'un onglet.
 */
export function ZonesInner({
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
  const { data, loading, error, reload } = useFetch<ZoneImf[]>(`${apiBase}/zones`);
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
      await api.post(`${apiBase}/zones`, { nom });
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
      await api.del(`${apiBase}/zones/${z.id}`);
      notify("Zone supprimée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <>
      {header && <PageHeader title="Zones" subtitle="Découpage géographique du réseau IMF." />}

      <div className="grid-2" style={{ marginTop: header ? 24 : 0 }}>
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
                      <td className="muted">{nb(z.nbAgences ?? 0)}</td>
                      <td className="muted">{nb(z.nbAgents ?? 0)}</td>
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

export default function Zones() {
  return <ZonesInner />;
}
