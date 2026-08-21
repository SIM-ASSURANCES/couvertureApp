import { useState } from "react";
import { Plus, Power, Download, X, Flame, ShieldCheck, Copy, KeyRound } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa, fmtDate, PhoneInput } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { useAuth } from "../../auth";

interface AgentDistribution {
  id: string;
  nom: string;
  telephone: string;
  localisation: string | null;
  statut: "actif" | "inactif";
  createdAt: string;
  nombreSouscriptions: number;
  commissionTotale: number;
}

/** Accès (téléphone + mot de passe en clair) d'un agent, affichés une seule fois — jamais récupérables ensuite. */
interface AccesAgent {
  nom: string;
  telephone: string;
  motDePasse: string;
}

function messageAcces(a: AccesAgent) {
  return `SIM Assurances : voici vos accès pour vous connecter à votre espace agent (${window.location.origin}/agent-distribution/connexion) — Téléphone : ${a.telephone} — Mot de passe : ${a.motDePasse}. Vous pourrez le changer une fois connecté.`;
}

function EncartAcces({ acces, onClose }: { acces: AccesAgent; onClose: () => void }) {
  const [copie, setCopie] = useState(false);
  return (
    <div style={{ marginTop: 24 }}>
      <Card
        title={`Accès de ${acces.nom}`}
        extra={
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={15} /> Fermer
          </button>
        }
      >
        <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
          À communiquer à l'agent pour qu'il se connecte — ce mot de passe ne sera plus jamais affiché après fermeture.
        </p>
        <div style={{ background: "var(--sim-primary-50, #e6f1fb)", borderRadius: 10, padding: "14px 18px", marginTop: 12 }}>
          <div style={{ fontSize: 13 }}><strong>Téléphone :</strong> {acces.telephone}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            <strong>Mot de passe :</strong>{" "}
            <span style={{ fontFamily: "monospace", fontSize: 15, letterSpacing: 1 }}>{acces.motDePasse}</span>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={async () => {
            await navigator.clipboard.writeText(messageAcces(acces));
            setCopie(true);
            setTimeout(() => setCopie(false), 2000);
          }}
        >
          <Copy size={15} /> {copie ? "Copié ✓" : "Copier le message à envoyer"}
        </button>
      </Card>
    </div>
  );
}

interface Qr {
  produit: string;
  token: string;
  dataUrl: string;
}

interface SouscriptionAgent {
  id: string;
  produit: "incendie" | "accident";
  nom: string | null;
  prenom: string | null;
  telephone: string;
  montantPrime: number;
  statut: string;
  createdAt: string;
}

function statutBadge(s: string) {
  if (s === "complet" || s === "confirme") return <Badge kind="success">{s === "complet" ? "Complet" : "Confirmé"}</Badge>;
  if (s === "echoue") return <Badge kind="danger">Échoué</Badge>;
  return <Badge kind="warning">En cours</Badge>;
}

function QrMini({ agentId, produit, label }: { agentId: string; produit: "incendie1000" | "incendie2000" | "accident"; label: string }) {
  const { data, loading } = useFetch<Qr>(`/me/agents/${agentId}/qr/${produit}`);
  return (
    <div style={{ textAlign: "center" }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div>
      {loading && <Loader label="Génération…" />}
      {data && (
        <>
          <img src={data.dataUrl} alt={label} style={{ width: 150, height: 150, border: "1px solid var(--border)", borderRadius: 10, padding: 6, background: "#fff" }} />
          <a className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12 }} href={data.dataUrl} download={`qr-agent-${produit}.png`}>
            <Download size={13} /> Télécharger
          </a>
        </>
      )}
    </div>
  );
}

export default function PartenaireAgents() {
  const { user } = useAuth();
  const produit = user?.produit ?? "accident";
  const { data, loading, error, reload } = useFetch<AgentDistribution[]>("/me/agents");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [localisation, setLocalisation] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [acces, setAcces] = useState<AccesAgent | null>(null);
  const [reinitialisant, setReinitialisant] = useState(false);
  const { data: souscriptions, loading: loadingSouscriptions } = useFetch<{ incendie: SouscriptionAgent[]; accident: SouscriptionAgent[] }>(
    detailId ? `/me/agents/${detailId}/souscriptions` : null
  );

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await api.post<AgentDistribution & { motDePasseProvisoire: string }>("/me/agents", {
        nom,
        telephone,
        localisation: localisation || undefined,
      });
      setNom("");
      setTelephone("");
      setLocalisation("");
      setAcces({ nom: created.nom, telephone: created.telephone, motDePasse: created.motDePasseProvisoire });
      notify("Agent créé ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatut(a: AgentDistribution) {
    try {
      await api.patch(`/me/agents/${a.id}`, { statut: a.statut === "actif" ? "inactif" : "actif" });
      notify(a.statut === "actif" ? "Agent désactivé" : "Agent réactivé");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  async function reinitialiserMotDePasse(a: AgentDistribution) {
    setReinitialisant(true);
    try {
      const r = await api.post<{ motDePasseProvisoire: string }>(`/me/agents/${a.id}/reinitialiser-mot-de-passe`);
      setAcces({ nom: a.nom, telephone: a.telephone, motDePasse: r.motDePasseProvisoire });
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setReinitialisant(false);
    }
  }

  const agentDetail = data?.find((a) => a.id === detailId) ?? null;
  const souscriptionsAgent = souscriptions
    ? [...souscriptions.incendie, ...souscriptions.accident].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return (
    <>
      <PageHeader
        title="Mes agents"
        subtitle="Créez des agents de distribution avec leur propre QR code et suivez leur activité."
      />

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title={data ? `${data.length} agent(s)` : "Agents"} noBody>
          {loading && <Loader />}
          {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
          {data && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Téléphone</th>
                    <th>Localisation</th>
                    <th>Souscriptions</th>
                    <th>Commission totale</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.nom}</strong></td>
                      <td className="muted">{a.telephone}</td>
                      <td className="muted">{a.localisation ?? "—"}</td>
                      <td>{a.nombreSouscriptions}</td>
                      <td>{fcfa(a.commissionTotale)}</td>
                      <td>
                        <Badge kind={a.statut === "actif" ? "success" : "neutral"}>
                          {a.statut === "actif" ? "Actif" : "Inactif"}
                        </Badge>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setDetailId(a.id)}>
                            Détails
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: 8 }}
                            title={a.statut === "actif" ? "Désactiver" : "Activer"}
                            onClick={() => toggleStatut(a)}
                          >
                            <Power size={15} color={a.statut === "actif" ? "var(--danger)" : "var(--success)"} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={7}><div className="empty">Aucun agent pour l'instant.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Ajouter un agent">
          <form onSubmit={creer}>
            <div className="field">
              <label className="label">Nom <span className="req">*</span></label>
              <input className="input" required value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Téléphone <span className="req">*</span></label>
              <PhoneInput required value={telephone} onChange={setTelephone} />
            </div>
            <div className="field">
              <label className="label">Localisation</label>
              <input className="input" placeholder="Ex. Cocody, Angré" value={localisation} onChange={(e) => setLocalisation(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" disabled={saving || !nom.trim() || !telephone.trim()}>
              <Plus size={17} /> {saving ? "Création…" : "Créer l'agent"}
            </button>
          </form>
        </Card>
      </div>

      {acces && <EncartAcces acces={acces} onClose={() => setAcces(null)} />}

      {detailId && agentDetail && (
        <div style={{ marginTop: 24 }}>
          <Card
            title={`Détails — ${agentDetail.nom}`}
            extra={
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" disabled={reinitialisant} onClick={() => reinitialiserMotDePasse(agentDetail)}>
                  <KeyRound size={15} /> {reinitialisant ? "…" : "Réinitialiser le mot de passe"}
                </button>
                <button className="btn btn-ghost" onClick={() => setDetailId(null)}>
                  <X size={15} /> Fermer
                </button>
              </div>
            }
          >
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
              {produit === "incendie" ? (
                <>
                  <QrMini agentId={agentDetail.id} produit="incendie1000" label="QR — jusqu'à 250 000 FCFA" />
                  <QrMini agentId={agentDetail.id} produit="incendie2000" label="QR — au-dessus de 250 000 FCFA" />
                </>
              ) : (
                <QrMini agentId={agentDetail.id} produit="accident" label="QR Accidents" />
              )}
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Souscriptions de cet agent</div>
            {loadingSouscriptions && <Loader />}
            {souscriptions && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Produit</th>
                      <th>Prime</th>
                      <th>Statut</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {souscriptionsAgent.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.prenom ?? ""} {s.nom ?? ""}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>{s.telephone}</div>
                        </td>
                        <td>
                          {s.produit === "incendie" ? (
                            <Badge kind="warning"><Flame size={12} style={{ verticalAlign: -2 }} /> Incendie</Badge>
                          ) : (
                            <Badge kind="info"><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> Accidents</Badge>
                          )}
                        </td>
                        <td>{fcfa(s.montantPrime)}</td>
                        <td>{statutBadge(s.statut)}</td>
                        <td className="muted">{fmtDate(s.createdAt)}</td>
                      </tr>
                    ))}
                    {souscriptionsAgent.length === 0 && (
                      <tr><td colSpan={5}><div className="empty">Aucune souscription pour cet agent.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
