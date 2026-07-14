import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import { useAuth } from "../../../auth";
import type { AgentImf, AgenceImf, ZoneImf, RoleImf } from "../../../types";

const empty = {
  nom: "",
  prenom: "",
  telephone: "",
  email: "",
  motDePasse: "",
  roleImf: "AGENT" as RoleImf,
  agenceId: "",
  zoneId: "",
};

function roleLabel(r: RoleImf) {
  if (r === "AGENT") return "Agent";
  if (r === "RESPONSABLE_AGENCE") return "Responsable d'agence";
  return "Responsable de zone";
}

function roleBadgeKind(r: RoleImf): "neutral" | "warning" | "info" {
  if (r === "AGENT") return "neutral";
  if (r === "RESPONSABLE_AGENCE") return "warning";
  return "info";
}

export default function Agents() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const { data, loading, error, reload } = useFetch<AgentImf[]>("/imf/agents");
  const { data: agences } = useFetch<AgenceImf[]>("/imf/agences");
  const { data: zones } = useFetch<ZoneImf[]>("/imf/zones");
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
      await api.post("/imf/agents", {
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone,
        email: form.email,
        motDePasse: form.motDePasse,
        roleImf: form.roleImf,
        agenceId: form.roleImf === "RESPONSABLE_ZONE" ? undefined : form.agenceId,
        zoneId: form.roleImf === "RESPONSABLE_ZONE" ? form.zoneId : undefined,
      });
      setForm(empty);
      notify("Agent créé ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatut(a: AgentImf) {
    try {
      await api.patch(`/imf/agents/${a.id}`, { statut: a.statut === "actif" ? "inactif" : "actif" });
      notify(a.statut === "actif" ? "Agent désactivé" : "Agent réactivé");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  async function remove(a: AgentImf) {
    if (!confirm(`Supprimer ${a.prenom} ${a.nom} ?`)) return;
    try {
      await api.del(`/imf/agents/${a.id}`);
      notify("Agent supprimé ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  const canSubmit =
    form.nom.trim() &&
    form.prenom.trim() &&
    form.telephone.trim() &&
    form.email.trim() &&
    form.motDePasse.length >= 6 &&
    (form.roleImf === "RESPONSABLE_ZONE" ? !!form.zoneId : !!form.agenceId);

  return (
    <>
      <PageHeader title="Agents" subtitle="Comptes de connexion des agents et responsables de zone IMF." />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title={data ? `${data.length} agents` : "Agents"} noBody>
          {loading && <Loader />}
          {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
          {data && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Rattachement</th>
                    <th>Statut</th>
                    <th>Créé le</th>
                    {isSuper && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.prenom} {a.nom}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{a.email}</div>
                      </td>
                      <td>
                        <Badge kind={roleBadgeKind(a.roleImf)}>{roleLabel(a.roleImf)}</Badge>
                      </td>
                      <td className="muted">{a.roleImf === "RESPONSABLE_ZONE" ? a.zoneNom : a.agenceNom}</td>
                      <td>
                        <Badge kind={a.statut === "actif" ? "success" : "neutral"}>
                          {a.statut === "actif" ? "Actif" : "Inactif"}
                        </Badge>
                      </td>
                      <td className="muted">{fmtDate(a.createdAt)}</td>
                      {isSuper && (
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => toggleStatut(a)}>
                              {a.statut === "actif" ? "Désactiver" : "Réactiver"}
                            </button>
                            <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => remove(a)}>
                              <Trash2 size={15} color="var(--danger)" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={6}><div className="empty">Aucun agent.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Ajouter un agent">
          <form onSubmit={create}>
            <div className="field">
              <label className="label">Nom <span className="req">*</span></label>
              <input className="input" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Prénom <span className="req">*</span></label>
              <input className="input" required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Téléphone <span className="req">*</span></label>
              <input className="input" required value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
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
              <select
                className="select"
                value={form.roleImf}
                onChange={(e) => setForm({ ...form, roleImf: e.target.value as RoleImf, agenceId: "", zoneId: "" })}
              >
                <option value="AGENT">Agent</option>
                <option value="RESPONSABLE_AGENCE">Responsable d'agence</option>
                <option value="RESPONSABLE_ZONE">Responsable de zone</option>
              </select>
            </div>
            {form.roleImf === "RESPONSABLE_ZONE" ? (
              <div className="field">
                <label className="label">Zone <span className="req">*</span></label>
                <select className="select" required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                  <option value="">Sélectionner…</option>
                  {zones?.map((z) => (
                    <option key={z.id} value={z.id}>{z.nom}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label className="label">Agence <span className="req">*</span></label>
                <select className="select" required value={form.agenceId} onChange={(e) => setForm({ ...form, agenceId: e.target.value })}>
                  <option value="">Sélectionner…</option>
                  {agences?.map((a) => (
                    <option key={a.id} value={a.id}>{a.nom} ({a.zoneNom})</option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn btn-primary btn-block" disabled={saving || !canSubmit}>
              <Plus size={17} /> {saving ? "Création…" : "Créer l'agent"}
            </button>
          </form>
        </Card>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
