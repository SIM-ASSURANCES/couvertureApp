import { useState } from "react";
import { Plus, Trash2, FileSpreadsheet } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { exportExcel } from "../../xlsx";

type Branche = "INCENDIE_ACCIDENT" | "RELAX" | "IMF";

interface Admin {
  id: string;
  nom: string;
  email: string;
  role: "ADMIN" | "SUPER_ADMIN";
  branches: Branche[];
  createdAt: string;
}

const empty = {
  nom: "",
  email: "",
  motDePasse: "",
  role: "ADMIN",
  branches: [] as Branche[],
};

function brancheLabel(b: Branche) {
  if (b === "INCENDIE_ACCIDENT") return "Incendie et Accident";
  if (b === "RELAX") return "RelaxMoto et RelaxAuto";
  return "IMF";
}

export default function Administrateurs() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const { data, loading, error, reload } = useFetch<Admin[]>("/admins");
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
      await api.post("/admins", form);
      setForm(empty);
      notify("Administrateur créé ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Admin) {
    if (!confirm(`Supprimer ${a.nom} ?`)) return;
    try {
      await api.del(`/admins/${a.id}`);
      notify("Supprimé");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((a) => ({
        "Nom": a.nom,
        "Email": a.email,
        "Rôle": a.role,
        "Branches": a.branches.map(brancheLabel).join(", "),
        "Créé le": fmtDate(a.createdAt),
      })),
      "administrateurs.xlsx"
    );
  }

  function toggleBranche(b: Branche) {
    setForm((f) => ({
      ...f,
      branches: f.branches.includes(b)
        ? f.branches.filter((x) => x !== b)
        : [...f.branches, b],
    }));
  }

  const isSuperForm = form.role === "SUPER_ADMIN";
  const canSubmit = isSuperForm || form.branches.length > 0;

  return (
    <>
      <PageHeader
        title="Administrateurs"
        subtitle="Gestion des comptes d'accès au dashboard."
        actions={
          <button className="btn btn-danger-soft" onClick={exportXlsx}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        }
      />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title={data ? `${data.length} comptes` : "Comptes"} noBody>
          {loading && <Loader />}
          {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
          {data && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Email</th>
                    <th>Rôle</th>
                    <th>Branches</th>
                    <th>Créé le</th>
                    {isSuper && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.nom}</strong></td>
                      <td className="muted">{a.email}</td>
                      <td>
                        {a.role === "SUPER_ADMIN" ? (
                          <Badge kind="info">Super Admin</Badge>
                        ) : (
                          <Badge kind="neutral">Admin</Badge>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {a.branches.map((b) => (
                            <Badge
                              key={b}
                              kind={b === "INCENDIE_ACCIDENT" ? "warning" : b === "RELAX" ? "info" : "success"}
                            >
                              {brancheLabel(b)}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="muted">{fmtDate(a.createdAt)}</td>
                      {isSuper && (
                        <td>
                          {a.id !== user?.id && (
                            <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => remove(a)}>
                              <Trash2 size={15} color="var(--danger)" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {isSuper ? (
          <Card title="Ajouter un administrateur">
            <form onSubmit={create}>
              <div className="field">
                <label className="label">Nom <span className="req">*</span></label>
                <input className="input" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Email <span className="req">*</span></label>
                <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Mot de passe <span className="req">*</span></label>
                <input className="input" type="password" required minLength={6} value={form.motDePasse} onChange={(e) => setForm({ ...form, motDePasse: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Rôle</label>
                <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="ADMIN">Administrateur</option>
                  <option value="SUPER_ADMIN">Super Administrateur</option>
                </select>
              </div>

              <div className="field">
                <label className="label">
                  Branche{isSuperForm ? "" : <span className="req"> *</span>}
                </label>
                {isSuperForm ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Un Super Administrateur a automatiquement accès aux deux branches.
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={form.branches.includes("INCENDIE_ACCIDENT")}
                          onChange={() => toggleBranche("INCENDIE_ACCIDENT")}
                        />
                        <span>Assurances Incendie et Accident</span>
                      </label>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={form.branches.includes("RELAX")}
                          onChange={() => toggleBranche("RELAX")}
                        />
                        <span>Assurances RelaxMoto et RelaxAuto</span>
                      </label>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={form.branches.includes("IMF")}
                          onChange={() => toggleBranche("IMF")}
                        />
                        <span>Assurances IMF</span>
                      </label>
                    </div>
                    {form.branches.length === 0 && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Sélectionnez au moins une branche.
                      </div>
                    )}
                  </>
                )}
              </div>

              <button className="btn btn-primary btn-block" disabled={saving || !canSubmit}>
                <Plus size={17} /> {saving ? "Création…" : "Créer le compte"}
              </button>
            </form>
          </Card>
        ) : (
          <Card>
            <div className="empty">Seul le Super Administrateur peut créer des comptes.</div>
          </Card>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
