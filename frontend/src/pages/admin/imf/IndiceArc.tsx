import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import type { IndiceArcImf } from "../../../types";

const empty = { region: "", annee: new Date().getFullYear(), valeur: "", reference: "" };

function palierBadge(p: IndiceArcImf["palier"]) {
  if (p === "forte") return <Badge kind="danger">Forte sécheresse</Badge>;
  if (p === "moyenne") return <Badge kind="warning">Sécheresse moyenne</Badge>;
  if (p === "faible") return <Badge kind="info">Sécheresse faible</Badge>;
  return <Badge kind="success">Aucune</Badge>;
}

export default function IndiceArc() {
  const { data, loading, error, reload } = useFetch<IndiceArcImf[]>("/imf/indice-arc");
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
      await api.post("/imf/indice-arc", {
        region: form.region,
        annee: Number(form.annee),
        valeur: Number(form.valeur),
        reference: Number(form.reference),
      });
      setForm({ ...empty, annee: form.annee });
      notify("Indice enregistré ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = form.region.trim() && form.valeur !== "" && form.reference !== "";

  return (
    <>
      <PageHeader
        title="Indice ARC — SECURECOLTE"
        subtitle="Saisie manuelle de l'indice WRSI publié par l'African Risk Capacity, par région et par année."
      />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title={data ? `${data.length} entrées` : "Indices"} noBody>
          {loading && <Loader />}
          {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
          {data && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Région</th>
                    <th>Année</th>
                    <th>Indice observé</th>
                    <th>Référence</th>
                    <th>Palier</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.region}</strong></td>
                      <td className="muted">{r.annee}</td>
                      <td className="muted">{r.valeur}</td>
                      <td className="muted">{r.reference}</td>
                      <td>{palierBadge(r.palier)}</td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={5}><div className="empty">Aucun indice saisi.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Saisir / mettre à jour un indice">
          <form onSubmit={create}>
            <div className="field">
              <label className="label">Région <span className="req">*</span></label>
              <input className="input" required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Année <span className="req">*</span></label>
              <input className="input" type="number" required value={form.annee} onChange={(e) => setForm({ ...form, annee: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="label">Indice WRSI observé <span className="req">*</span></label>
              <input className="input" type="number" step="0.01" required value={form.valeur} onChange={(e) => setForm({ ...form, valeur: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Valeur de référence (médiane 5 ans) <span className="req">*</span></label>
              <input className="input" type="number" step="0.01" required value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <button className="btn btn-primary btn-block" disabled={saving || !canSubmit}>
              <Plus size={17} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </Card>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
