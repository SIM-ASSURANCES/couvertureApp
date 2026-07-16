import { Banknote, FileText, Wallet } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa } from "../../components/ui";
import { useFetch } from "../../useFetch";
import type { FinanceImf } from "../../types";

function StatCard({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string | number }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary-50, #eef2ff)", display: "grid", placeItems: "center", flex: "none" }}>
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

/**
 * Espace du finance comptable de l'agence : commissions générées par le
 * réseau, par agent et par produit. Le responsable d'agence n'a pas accès à
 * cette page (ni à la route /agent-imf/finance qui l'alimente).
 */
export default function Finance() {
  const { data, loading, error } = useFetch<FinanceImf>("/agent-imf/finance");

  return (
    <>
      <PageHeader title="Finance" subtitle="Commissions générées par les contrats actifs de votre agence." />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {data && (
        <>
          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <StatCard icon={FileText} label="Souscriptions actives" value={data.global.nombreSouscriptions} />
            <StatCard icon={Wallet} label="Prime TTC totale" value={fcfa(data.global.primeTTC)} />
            <StatCard icon={Banknote} label="Commission totale" value={fcfa(data.global.commission)} />
          </div>

          <Card title="Commissions par agent" noBody style={{ marginTop: 24 }}>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th style={{ textAlign: "right" }}>Souscriptions</th>
                    <th style={{ textAlign: "right" }}>Prime TTC</th>
                    <th style={{ textAlign: "right" }}>Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parAgent.map((a) => (
                    <tr key={a.agentId}>
                      <td><strong>{a.prenom} {a.nom}</strong></td>
                      <td style={{ textAlign: "right" }}>{a.nombreSouscriptions}</td>
                      <td style={{ textAlign: "right" }}>{fcfa(a.primeTTC)}</td>
                      <td style={{ textAlign: "right" }}><strong>{fcfa(a.commission)}</strong></td>
                    </tr>
                  ))}
                  {data.parAgent.length === 0 && (
                    <tr><td colSpan={4}><div className="empty">Aucun agent dans cette agence.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Commissions par produit" noBody style={{ marginTop: 24 }}>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th style={{ textAlign: "right" }}>Souscriptions</th>
                    <th style={{ textAlign: "right" }}>Prime TTC</th>
                    <th style={{ textAlign: "right" }}>Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parProduit.map((p) => (
                    <tr key={p.famille}>
                      <td><strong>{p.famille}</strong></td>
                      <td style={{ textAlign: "right" }}>{p.nombreSouscriptions}</td>
                      <td style={{ textAlign: "right" }}>{fcfa(p.primeTTC)}</td>
                      <td style={{ textAlign: "right" }}><strong>{fcfa(p.commission)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 12, padding: "10px 16px 4px" }}>
              Commission calculée sur la prime nette HT (jamais la prime TTC), aux taux en vigueur : 20% (SECURPRO/SECURSTOCK),
              10% (Coups Durs), 22% (SECURECOLTE).
            </div>
          </Card>
        </>
      )}
    </>
  );
}
