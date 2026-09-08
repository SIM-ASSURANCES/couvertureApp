import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Trash2, Power } from "lucide-react";
import { Card } from "../../../../components/ui";
import { api } from "../../../../api";
import { useAuth } from "../../../../auth";
import type { Imf } from "../../../../types";

type FormState = {
  nom: string;
  nomResponsable: string;
  telephone: string;
  email: string;
  localisation: string;
  logoUrl: string;
  couleurPrimaire: string;
  couleurSecondaire: string;
  mentionsLegales: string;
};

function toForm(imf: Imf): FormState {
  return {
    nom: imf.nom,
    nomResponsable: imf.nomResponsable,
    telephone: imf.telephone,
    email: imf.email ?? "",
    localisation: imf.localisation ?? "",
    logoUrl: imf.logoUrl ?? "",
    couleurPrimaire: imf.couleurPrimaire ?? "",
    couleurSecondaire: imf.couleurSecondaire ?? "",
    mentionsLegales: imf.mentionsLegales ?? "",
  };
}

export default function OngletGeneral({
  imf,
  reload,
  notify,
}: {
  imf: Imf;
  reload: () => void;
  notify: (m: string) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuper =
    user?.role === "SUPER_ADMIN" ||
    (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("IMF_PARTENAIRES"));

  const [form, setForm] = useState<FormState>(toForm(imf));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toForm(imf));
  }, [imf]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/imf-partenaires/${imf.id}`, {
        nom: form.nom.trim(),
        nomResponsable: form.nomResponsable.trim(),
        telephone: form.telephone.trim(),
        email: form.email.trim(),
        localisation: form.localisation.trim(),
        logoUrl: form.logoUrl.trim(),
        couleurPrimaire: form.couleurPrimaire.trim(),
        couleurSecondaire: form.couleurSecondaire.trim(),
        mentionsLegales: form.mentionsLegales.trim(),
      });
      notify("Modifications enregistrées ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatut() {
    const next = imf.statut === "actif" ? "inactif" : "actif";
    try {
      await api.patch(`/imf-partenaires/${imf.id}`, { statut: next });
      notify(next === "actif" ? "IMF réactivée ✓" : "IMF désactivée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer définitivement l'IMF "${imf.nom}" ? Cette action est irréversible.`)) return;
    try {
      await api.del(`/imf-partenaires/${imf.id}`);
      navigate("/admin/imfs/liste");
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="grid-2">
        <Card title="Identité">
          <div className="field">
            <label className="label">Nom de l'IMF</label>
            <input className="input" value={form.nom} onChange={(e) => set("nom", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Responsable</label>
            <input className="input" value={form.nomResponsable} onChange={(e) => set("nomResponsable", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Téléphone</label>
            <input className="input" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">E-mail</label>
            <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Localisation</label>
            <input className="input" value={form.localisation} onChange={(e) => set("localisation", e.target.value)} />
          </div>
        </Card>

        <Card title="Branding">
          <div className="field">
            <label className="label">Logo (URL)</label>
            <input className="input" placeholder="https://…" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
          </div>
          <div className="field" style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Couleur primaire</label>
              <input className="input" placeholder="#004B9C" value={form.couleurPrimaire} onChange={(e) => set("couleurPrimaire", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Couleur secondaire</label>
              <input className="input" placeholder="#51AEE2" value={form.couleurSecondaire} onChange={(e) => set("couleurSecondaire", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="label">Mentions légales</label>
            <textarea className="input" rows={4} value={form.mentionsLegales} onChange={(e) => set("mentionsLegales", e.target.value)} />
          </div>
          {(form.logoUrl || form.couleurPrimaire) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              {form.logoUrl && <img src={form.logoUrl} alt="" style={{ height: 32, width: "auto", borderRadius: 6 }} />}
              {form.couleurPrimaire && <span style={{ width: 20, height: 20, borderRadius: 5, background: form.couleurPrimaire, display: "inline-block", border: "1px solid var(--border,#e5e7eb)" }} />}
              {form.couleurSecondaire && <span style={{ width: 20, height: 20, borderRadius: 5, background: form.couleurSecondaire, display: "inline-block", border: "1px solid var(--border,#e5e7eb)" }} />}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={saving}>
          <Save size={16} /> {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {isSuper && (
          <button type="button" className="btn btn-ghost" onClick={toggleStatut}>
            <Power size={16} /> {imf.statut === "actif" ? "Désactiver" : "Réactiver"}
          </button>
        )}
        {isSuper && (
          <button type="button" className="btn btn-ghost" onClick={remove} style={{ marginLeft: "auto", color: "var(--danger)" }}>
            <Trash2 size={16} /> Supprimer
          </button>
        )}
      </div>
    </form>
  );
}
