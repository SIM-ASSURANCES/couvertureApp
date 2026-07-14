import { MapPin, Building2, Users, FileText } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import type { ZoneImf, AgenceImf, AgentImf, SouscriptionImf } from "../../../types";

function StatCard({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: number }) {
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
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{value}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: zones, loading: l1, error: e1 } = useFetch<ZoneImf[]>("/imf/zones");
  const { data: agences, loading: l2, error: e2 } = useFetch<AgenceImf[]>("/imf/agences");
  const { data: agents, loading: l3, error: e3 } = useFetch<AgentImf[]>("/imf/agents");
  const { data: souscriptions, loading: l4, error: e4 } = useFetch<SouscriptionImf[]>("/imf/souscriptions");

  const loading = l1 || l2 || l3 || l4;
  const error = e1 || e2 || e3 || e4;
  const agentsActifs = agents?.filter((a) => a.statut === "actif").length ?? 0;

  return (
    <>
      <PageHeader
        title="Assurances IMF"
        subtitle="Réseau de distribution par agents d'institutions de microfinance."
      />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {!loading && !error && (
        <>
          <div className="grid-4" style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <StatCard icon={MapPin} label="Zones" value={zones?.length ?? 0} />
            <StatCard icon={Building2} label="Agences" value={agences?.length ?? 0} />
            <StatCard icon={Users} label="Agents actifs" value={agentsActifs} />
            <StatCard icon={FileText} label="Souscriptions" value={souscriptions?.length ?? 0} />
          </div>

          <div style={{ marginTop: 24 }}>
            <Card title="Prochaines étapes">
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                Le réseau, la tarification (SECURPRO, SECURSTOCK, COUPS DURS, SECURECOLTE)
                et la souscription à partir d'une simulation sont en place. Le PDF de
                contrat, les mentions CIMA et la signature tactile seront branchés dans
                une phase suivante.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
