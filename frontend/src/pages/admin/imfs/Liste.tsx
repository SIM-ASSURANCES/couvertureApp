import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ExternalLink } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fmtDate, nb } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import type { Imf } from "../../../types";

const emptyForm = {
  nom: "",
  nomResponsable: "",
  telephone: "",
  email: "",
  localisation: "",
};

export default function Liste() {
  const { data, loading, error, reload } = useFetch<Imf[]>("/imf-partenaires");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2800);
  }

  const canSubmit =
    form.nom.trim() !== "" && form.nomResponsable.trim() !== "" && form.telephone.trim() !== "";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await api.post("/imf-partenaires", {
        nom: form.nom.trim(),
        nomResponsable: form.nomResponsable.trim(),
        telephone: form.telephone.trim(),
        email: form.email.trim() || undefined,
        localisation: form.localisation.trim() || undefined,
      });
      setForm(emptyForm);
      notify("IMF créée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Les IMF" subtitle="Ajoutez une institution de microfinance : elle est enregistrée comme partenaire, avec son paramétrage propre." />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title={data ? `${data.length} IMF` : "IMF"} noBody>
          {loading && <Loader />}
          {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
          {data && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>IMF</th>
                    <th>Responsable</th>
                    <th>Téléphone</th>
                    <th>Statut</th>
                    <th style={{ textAlign: "right" }}>Réseau</th>
                    <th>Créée le</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((imf) => (
                    <tr key={imf.id}>
                      <td>
                        <strong>{imf.nom}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{imf.code}</div>
                      </td>
                      <td className="muted">{imf.nomResponsable}</td>
                      <td className="muted">{imf.telephone}</td>
                      <td>
                        <span className={`badge ${imf.statut === "actif" ? "success" : "neutral"}`}>
                          {imf.statut === "actif" ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }} className="muted">
                        {nb(imf.nbZones)} z · {nb(imf.nbAgences)} ag · {nb(imf.nbAgents)} agents
                      </td>
                      <td className="muted">{fmtDate(imf.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link to={`/admin/imfs/${imf.id}/tableau-de-bord`} className="btn btn-ghost" style={{ padding: "4px 10px", display: "inline-flex", gap: 6, alignItems: "center" }}>
                          Ouvrir <ExternalLink size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={7}><div className="empty">Aucune IMF. Ajoutez-en une avec le formulaire.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Ajouter une IMF">
          <form onSubmit={create}>
            <div className="field">
              <label className="label">Nom de l'IMF <span className="req">*</span></label>
              <input className="input" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
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
              <label className="label">E-mail</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Localisation</label>
              <input className="input" value={form.localisation} onChange={(e) => setForm({ ...form, localisation: e.target.value })} />
            </div>
            <button className="btn btn-primary btn-block" disabled={saving || !canSubmit}>
              <Plus size={17} /> {saving ? "Création…" : "Créer l'IMF"}
            </button>
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Le branding et le paramétrage détaillé (produits, barèmes, commission, documents, habilitations) se règlent dans la fiche de l'IMF.
            </div>
          </form>
        </Card>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
