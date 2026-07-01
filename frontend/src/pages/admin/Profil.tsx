import { useState } from "react";
import { Save } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";

interface Profil {
  id: string;
  nom: string;
  email: string;
  role: "ADMIN" | "SUPER_ADMIN";
}

export default function AdminProfil() {
  const { data, loading, error, reload } = useFetch<Profil>("/admins/me");
  const [form, setForm] = useState<{ nom?: string; email?: string; motDePasse?: string }>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  function val(k: "nom" | "email"): string {
    if (k in form) return form[k] ?? "";
    return data ? data[k] : "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (form.nom !== undefined) payload.nom = form.nom;
      if (form.email !== undefined) payload.email = form.email;
      if (form.motDePasse) payload.motDePasse = form.motDePasse;
      await api.patch("/admins/me", payload);
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
      <PageHeader title="Mon profil" subtitle="Modifiez vos informations de connexion." />
      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div style={{ maxWidth: 480, marginTop: 24 }}>
          <Card title="Informations">
            <form onSubmit={save}>
              <div className="field">
                <label className="label">Rôle</label>
                <div>{data.role === "SUPER_ADMIN" ? <Badge kind="info">Super Administrateur</Badge> : <Badge kind="neutral">Administrateur</Badge>}</div>
              </div>
              <div className="field">
                <label className="label">Nom complet</label>
                <input className="input" value={val("nom")} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
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
