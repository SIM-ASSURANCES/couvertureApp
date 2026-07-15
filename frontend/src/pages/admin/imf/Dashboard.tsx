import { MapPin, Building2, Users, FileText, TrendingUp, Receipt, Package } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import type { ZoneImf, AgenceImf, AgentImf, StatsImf } from "../../../types";

const FAMILLES = ["SECURPRO", "SECURSTOCK", "COUPS DURS", "SECURECOLTE"] as const;
const COULEURS: Record<string, string> = {
  SECURPRO: "#2563eb",
  SECURSTOCK: "#16a34a",
  "COUPS DURS": "#f59e0b",
  SECURECOLTE: "#db2777",
};

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "var(--primary, #004b9c)",
  bg = "var(--primary-50, #eef2ff)",
}: {
  icon: typeof MapPin;
  label: string;
  value: string | number;
  accent?: string;
  bg?: string;
}) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: "grid", placeItems: "center", flex: "none" }}>
          <Icon size={20} color={accent} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

/** Graphique multi-lignes maison (SVG, sans dépendance) : évolution mensuelle du CA par produit. */
function EvolutionChart({ evolution }: { evolution: StatsImf["evolution"] }) {
  if (evolution.length === 0) {
    return <div className="empty" style={{ padding: 24 }}>Aucune donnée à afficher pour l'instant.</div>;
  }

  const W = 720, H = 280, padL = 64, padR = 16, padT = 16, padB = 40;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const maxY = Math.max(1, ...evolution.flatMap((p) => FAMILLES.map((f) => (p[f] as number) ?? 0)));
  const n = evolution.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxY) * innerH;

  // 4 lignes horizontales de repère
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: maxY * t, y: padT + innerH - t * innerH }));

  const moisCourt = (m: string) => {
    const [a, mo] = m.split("-");
    return `${mo}/${a.slice(2)}`;
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560 }} role="img" aria-label="Évolution du chiffre d'affaires par produit">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="var(--border, #e5e7eb)" strokeWidth={1} />
            <text x={padL - 8} y={t.y + 4} textAnchor="end" fontSize={11} fill="var(--muted, #6b7280)">
              {Math.round(t.v / 1000)}k
            </text>
          </g>
        ))}
        {evolution.map((p, i) => (
          <text key={i} x={x(i)} y={H - 14} textAnchor="middle" fontSize={11} fill="var(--muted, #6b7280)">
            {moisCourt(p.mois)}
          </text>
        ))}
        {FAMILLES.map((f) => {
          const pts = evolution.map((p, i) => `${x(i)},${y((p[f] as number) ?? 0)}`);
          return (
            <g key={f}>
              {n > 1 && <polyline points={pts.join(" ")} fill="none" stroke={COULEURS[f]} strokeWidth={2.5} strokeLinejoin="round" />}
              {evolution.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y((p[f] as number) ?? 0)} r={3.5} fill={COULEURS[f]} />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, paddingLeft: 8 }}>
        {FAMILLES.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COULEURS[f], display: "inline-block" }} />
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, loading: l0, error: e0 } = useFetch<StatsImf>("/imf/stats");
  const { data: zones, loading: l1, error: e1 } = useFetch<ZoneImf[]>("/imf/zones");
  const { data: agences, loading: l2, error: e2 } = useFetch<AgenceImf[]>("/imf/agences");
  const { data: agents, loading: l3, error: e3 } = useFetch<AgentImf[]>("/imf/agents");

  const loading = l0 || l1 || l2 || l3;
  const error = e0 || e1 || e2 || e3;
  const agentsActifs = agents?.filter((a) => a.statut === "actif").length ?? 0;
  const caGlobal = stats?.global.ca ?? 0;

  return (
    <>
      <PageHeader title="Assurances IMF" subtitle="Chiffre d'affaires, taxes et accessoires du réseau, par produit." />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {!loading && !error && stats && (
        <>
          {/* Indicateurs financiers globaux */}
          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <StatCard icon={TrendingUp} label="Chiffre d'affaires global" value={fcfa(stats.global.ca)} accent="#16a34a" bg="rgba(22,163,74,0.12)" />
            <StatCard icon={Receipt} label="Taxes globales" value={fcfa(stats.global.taxes)} accent="#db2777" bg="rgba(219,39,119,0.12)" />
            <StatCard icon={Package} label="Accessoires globaux" value={fcfa(stats.global.accessoires)} accent="#f59e0b" bg="rgba(245,158,11,0.12)" />
            <StatCard icon={FileText} label="Contrats actifs" value={stats.global.nombre} />
          </div>

          {/* Détail par produit */}
          <Card title="Chiffre d'affaires par produit" noBody style={{ marginTop: 24 }}>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th style={{ textAlign: "right" }}>Contrats</th>
                    <th style={{ textAlign: "right" }}>Chiffre d'affaires</th>
                    <th style={{ textAlign: "right" }}>Taxes</th>
                    <th style={{ textAlign: "right" }}>Accessoires</th>
                    <th style={{ width: "22%" }}>Part du CA</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.parProduit.map((p) => (
                    <tr key={p.famille}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: COULEURS[p.famille] ?? "#888", display: "inline-block" }} />
                          <strong>{p.famille}</strong>
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>{p.nombre}</td>
                      <td style={{ textAlign: "right" }}><strong>{fcfa(p.ca)}</strong></td>
                      <td style={{ textAlign: "right" }} className="muted">{fcfa(p.taxes)}</td>
                      <td style={{ textAlign: "right" }} className="muted">{fcfa(p.accessoires)}</td>
                      <td>
                        <div style={{ background: "var(--border, #e5e7eb)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                          <div style={{ width: `${caGlobal ? (p.ca / caGlobal) * 100 : 0}%`, height: "100%", background: COULEURS[p.famille] ?? "#888" }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{stats.global.nombre}</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{fcfa(stats.global.ca)}</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{fcfa(stats.global.taxes)}</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{fcfa(stats.global.accessoires)}</strong></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 12, padding: "10px 16px 4px" }}>
              Les taxes et accessoires ne sont ventilés que pour SECURPRO et SECURSTOCK (produits à formule). COUPS DURS et SECURECOLTE sont à prime fixe (catalogue).
            </div>
          </Card>

          {/* Évolution */}
          <Card title="Évolution du chiffre d'affaires par produit" style={{ marginTop: 24 }}>
            <EvolutionChart evolution={stats.evolution} />
          </Card>

          {/* Réseau */}
          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <StatCard icon={MapPin} label="Zones" value={zones?.length ?? 0} />
            <StatCard icon={Building2} label="Agences" value={agences?.length ?? 0} />
            <StatCard icon={Users} label="Agents actifs" value={agentsActifs} />
          </div>
        </>
      )}
    </>
  );
}
