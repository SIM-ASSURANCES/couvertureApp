import { useState } from "react";
import { Save, KeyRound, Eye, EyeOff } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, PhoneInput } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { libelleCategorie } from "../../categoriesPartenaires";

interface Profil {
  id: string;
  identifiant?: string | null;
  categorie?: number | null;
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
  // Mot de passe : bloc et formulaire SÉPARÉS des informations du commerce.
  // Avant, le champ « Nouveau mot de passe » suivait directement le champ Email
  // dans le même formulaire, sans `autoComplete` : les navigateurs le prenaient
  // pour un formulaire de connexion et y pré-remplissaient l'ANCIEN mot de passe
  // mémorisé (ce que le partenaire tapait s'y ajoutait), et ne proposaient jamais
  // de mettre à jour le mot de passe enregistré — l'ancien revenait ensuite tout
  // seul sur la page de connexion. Sans confirmation, une faute de frappe passait
  // aussi inaperçue : le partenaire ne pouvait plus se reconnecter.
  const [mdp, setMdp] = useState({ nouveau: "", confirmation: "" });
  const [voirMdp, setVoirMdp] = useState(false);
  const [mdpErreur, setMdpErreur] = useState("");
  const [savingMdp, setSavingMdp] = useState(false);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3500);
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

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    setMdpErreur("");
    if (mdp.nouveau.length < 6) {
      setMdpErreur("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (mdp.nouveau !== mdp.confirmation) {
      setMdpErreur("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setSavingMdp(true);
    try {
      await api.patch("/me/profile", { motDePasse: mdp.nouveau });
      setMdp({ nouveau: "", confirmation: "" });
      setVoirMdp(false);
      notify("Mot de passe modifié ✓ — utilisez-le à votre prochaine connexion.");
    } catch (err) {
      setMdpErreur((err as Error).message);
    } finally {
      setSavingMdp(false);
    }
  }

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Modifiez vos informations et votre mot de passe." />
      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div style={{ maxWidth: 480, marginTop: 24, display: "grid", gap: 24 }}>
          <Card title="Informations du commerce">
            <form onSubmit={save} autoComplete="off">
              {data.identifiant && (
                <div className="field">
                  <label className="label">Identifiant</label>
                  <input className="input" value={data.identifiant} disabled style={{ fontWeight: 700 }} />
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {libelleCategorie(data.categorie) ?? "Catégorie"} — attribué par l'administration, non modifiable.
                  </div>
                </div>
              )}
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
                <PhoneInput value={val("telephone")} onChange={(v) => setForm({ ...form, telephone: v })} />
              </div>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" autoComplete="email" value={val("email")} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>C'est aussi votre identifiant de connexion.</div>
              </div>
              <button className="btn btn-primary btn-block" disabled={saving}>
                <Save size={16} /> {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </form>
          </Card>

          <Card title="Changer le mot de passe">
            <form onSubmit={changerMotDePasse}>
              {/* Identifiant caché : indique au gestionnaire de mots de passe du
                  navigateur QUEL compte mettre à jour (sinon il garde l'ancien). */}
              <input type="email" name="username" autoComplete="username" value={data.email ?? ""} readOnly hidden />
              <div className="field">
                <label className="label">Nouveau mot de passe</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    type={voirMdp ? "text" : "password"}
                    name="new-password"
                    autoComplete="new-password"
                    value={mdp.nouveau}
                    onChange={(e) => setMdp({ ...mdp, nouveau: e.target.value })}
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setVoirMdp((v) => !v)}
                    aria-label={voirMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: 6 }}
                  >
                    {voirMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Minimum 6 caractères.</div>
              </div>
              <div className="field">
                <label className="label">Confirmer le nouveau mot de passe</label>
                <input
                  className="input"
                  type={voirMdp ? "text" : "password"}
                  name="confirm-password"
                  autoComplete="new-password"
                  value={mdp.confirmation}
                  onChange={(e) => setMdp({ ...mdp, confirmation: e.target.value })}
                />
              </div>
              {mdpErreur && <ErrorBox message={mdpErreur} />}
              <button className="btn btn-primary btn-block" disabled={savingMdp || !mdp.nouveau}>
                <KeyRound size={16} /> {savingMdp ? "Modification…" : "Changer le mot de passe"}
              </button>
            </form>
          </Card>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
