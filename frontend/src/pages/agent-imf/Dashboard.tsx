import { Landmark, FileText, IdCard, Wallet, Building2, Users } from "lucide-react";
import { PageHeader, Card, Badge, Loader, ErrorBox, fcfa } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";
import type { SouscriptionImf } from "../../types";

interface Moi {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  roleImf: "AGENT" | "RESPONSABLE_AGENCE" | "RESPONSABLE_ZONE";
  statut: "actif" | "inactif";
  agenceNom: string | null;
  zoneNom: string | null;
}

interface AgenceAvecAgents {
  id: string;
  agents: unknown[];
}

interface AgentReseau {
  id: string;
}

function roleLabel(r: Moi["roleImf"]) {
  if (r === "AGENT") return "Agent";
  if (r === "RESPONSABLE_AGENCE") return "Responsable d'agence";
  return "Responsable de zone";
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Landmark; label: string; value: string | number }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: "var(--primary-50, #eef2ff)",
          display: "grid", placeItems: "center", flex: "none",
        }}>
          <Icon size={20} color="var(--primary, #004b9c)" />
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{value}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: moi, loading: l1, error: e1 } = useFetch<Moi>("/agent-imf/moi");
  const { data: souscriptions, loading: l2, error: e2 } = useFetch<SouscriptionImf[]>("/agent-imf/souscriptions");
  const { data: agences } = useFetch<AgenceAvecAgents[]>(
    moi?.roleImf === "RESPONSABLE_ZONE" ? "/agent-imf/reseau/agences" : null
  );
  const { data: agents } = useFetch<AgentReseau[]>(
    moi?.roleImf === "RESPONSABLE_AGENCE" ? "/agent-imf/reseau/agents" : null
  );

  const loading = l1 || l2;
  const error = e1 || e2;

  const total = souscriptions?.length ?? 0;
  const actives = souscriptions?.filter((s) => s.statut === "active").length ?? 0;
  const primeTotale = souscriptions?.reduce((s, x) => s + (x.statut === "active" ? x.primeTTC : 0), 0) ?? 0;
  const nbAgences = agences?.length ?? 0;
  const nbAgentsReseau = agences ? agences.reduce((s, a) => s + a.agents.length, 0) : agents?.length ?? 0;

  return (
    <>
      <PageHeader
        title={`Bienvenue, ${user?.nom ?? ""}`}
        subtitle={
          moi?.roleImf === "AGENT"
            ? "Votre activité IMF."
            : moi?.roleImf === "RESPONSABLE_AGENCE"
            ? "Activité de votre agence."
            : "Activité de votre zone."
        }
      />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {moi && (
        <>
          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <StatCard icon={FileText} label="Souscriptions" value={total} />
            <StatCard icon={IdCard} label="Contrats actifs" value={actives} />
            <StatCard icon={Wallet} label="Prime totale (contrats actifs)" value={fcfa(primeTotale)} />
            {moi.roleImf === "RESPONSABLE_ZONE" && <StatCard icon={Building2} label="Agences" value={nbAgences} />}
            {moi.roleImf !== "AGENT" && <StatCard icon={Users} label="Agents du réseau" value={nbAgentsReseau} />}
          </div>

          <div style={{ marginTop: 24 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: "var(--primary-50, #eef2ff)",
                  display: "grid", placeItems: "center", flex: "none",
                }}>
                  <Landmark size={22} color="var(--primary, #004b9c)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{moi.prenom} {moi.nom}</div>
                  <Badge kind={moi.roleImf === "AGENT" ? "neutral" : "info"}>{roleLabel(moi.roleImf)}</Badge>
                </div>
              </div>
              <table className="tbl" style={{ width: "100%" }}>
                <tbody>
                  <tr><td className="muted" style={{ width: "40%" }}>Email</td><td>{moi.email}</td></tr>
                  <tr><td className="muted">Téléphone</td><td>{moi.telephone}</td></tr>
                  {moi.agenceNom && <tr><td className="muted">Agence</td><td>{moi.agenceNom}</td></tr>}
                  <tr><td className="muted">Zone</td><td>{moi.zoneNom ?? "—"}</td></tr>
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
