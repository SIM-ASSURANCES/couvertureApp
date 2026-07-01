import { useState } from "react";
import { Save } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";

interface Profil {
  id: string;
  nomCommerce: string;
  nomResponsable: string;
  telephone: string;
  localisation: string;
  email: string | null;
}

export default function PartenaireProfil() {
  const { data, loading, error, reload } = useFetch<Profil>("/me/profile");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  function val(k: "nomResponsable" | "telephone" | "email"): string {
    if (k in form) return form[k];
    if (!data) return "";
    return (data[k] ?? "") as string;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const k of ["nomResponsable", "telephone", "email"] as const) {
        if (k in form) payload[k] = form[k];
      }
      if (form.motDePasse) payload.motDePasse = form.motDePasse;
      await api.patch("/me/profile", payload);
      notify("Profil mis à jour ✓");
      setForm({});
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Modifiez vos informations et votre mot de passe." />
      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div style={{ maxWidth: 480, marginTop: 24 }}>
          <Card title="Informations du commerce">
            <form onSubmit={save}>
              <div className="field">
                <label className="label">Commerce</label>
                <input className="input" value={data.nomCommerce} disabled />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Géré par l'administration.</div>
              </div>
              <div className="field">
                <label className="label">Localisation</label>
                <input className="input" value={data.localisation} disabled />
              </div>
              <div className="field">
                <label className="label">Responsable</label>
                <input className="input" value={val("nomResponsable")} onChange={(e) => setForm({ ...form, nomResponsable: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Téléphone</label>
                <input className="input" value={val("telephone")} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" value={val("email")} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Nouveau mot de passe</label>
                <input className="input" type="password" placeholder="Laisser vide pour ne pas changer" value={form.motDePasse ?? ""} onChange={(e) => setForm({ ...form, motDePasse: e.target.value })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Minimum 6 caractères.</div>
              </div>
              <button className="btn btn-primary btn-block" disabled={saving}>
                <Save size={16} /> {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </form>
          </Card>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
