import { useState } from "react";
import { Download, Check, X } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fcfa, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { downloadCsv, api } from "../../api";
import type { Partenaire } from "../../types";

interface PerfRow {
  id: string;
  nomCommerce: string;
  localisation: string;
  clientsIncendie: number;
  clientsAccident: number;
  total: number;
  primesAccident: number;
  primesAccidentHT: number;
  primesIncendie: number;
  primesIncendieHT: number;
  ca: number;
  commission: number;
  commissionEncaissee: number;
}
interface Perf {
  rows: PerfRow[];
  taux: { tauxAcc: number; tauxInc: number };
}
interface Demande {
  id: string;
  partenaireNom: string;
  responsable: string;
  montant: number;
  statut: "en_attente" | "validee" | "rejetee";
  createdAt: string;
  traiteeAt?: string | null;
  motifRejet?: string | null;
}

function demandeBadge(s: string) {
  if (s === "validee") return <Badge kind="success">Validée</Badge>;
  if (s === "rejetee") return <Badge kind="danger">Rejetée</Badge>;
  return <Badge kind="warning">En attente</Badge>;
}

const MEDAILLES = ["🥇", "🥈", "🥉"];

export default function Performance() {
  // Filtres
  const [periode, setPeriode] = useState("annuel");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterPart, setFilterPart] = useState("");
  const [filterPrime, setFilterPrime] = useState("");
  const [filterProduit, setFilterProduit] = useState("");

  const [toast, setToast] = useState("");
  function notify(m: string) { setToast(m); setTimeout(() => setToast(""), 2500); }

  // URL filtres principaux
  const params = new URLSearchParams();
  if (from && to) { params.set("from", from); params.set("to", to); }
  else params.set("periode", periode);
  if (filterPart) params.set("partenaireId", filterPart);
  if (filterPrime) params.set("montantPrime", filterPrime);
  if (filterProduit) params.set("produit", filterProduit);

  const { data, loading, error } = useFetch<Perf>(`/stats/performance?${params.toString()}`);

  // Top 3 sur le mois en cours, classé par nombre de souscriptions
  const { data: monthlyData } = useFetch<Perf>("/stats/performance?periode=mensuel");
  const top3 = [...(monthlyData?.rows ?? [])]
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // Partenaires pour le filtre
  const { data: partenaires } = useFetch<Partenaire[]>("/partenaires");

  // Demandes de commission
  const { data: demandes, reload: reloadDemandes } = useFetch<Demande[]>("/commissions/demandes");

  async function valider(id: string) {
    try { await api.post(`/commissions/demandes/${id}/valider`); notify("Commission validée ✓"); reloadDemandes(); }
    catch (e) { notify((e as Error).message); }
  }
  async function rejeter(id: string) {
    const motif = prompt("Motif du rejet (optionnel) :") ?? "";
    try { await api.post(`/commissions/demandes/${id}/rejeter`, { motif }); notify("Demande rejetée"); reloadDemandes(); }
    catch (e) { notify((e as Error).message); }
  }

  const enAttente = (demandes ?? []).filter((d) => d.statut === "en_attente");
  const rows = data?.rows ?? [];
  const max = Math.max(...rows.map((r) => r.total), 1);
  const totalCom = rows.reduce((s, r) => s + r.commission, 0);
  const totalEncaisse = rows.reduce((s, r) => s + r.commissionEncaissee, 0);
  const totalIncHT = rows.reduce((s, r) => s + r.primesIncendieHT, 0);
  const totalAccHT = rows.reduce((s, r) => s + r.primesAccidentHT, 0);
  const totalSous = rows.reduce((s, r) => s + r.total, 0);

  const exportUrl = `/stats/performance/export.csv?${params.toString()}`;

  return (
    <>
      <PageHeader
        title="Performance & Commissions"
        subtitle="Suivi de la production par partenaire et calcul des commissions."
        actions={
          <button className="btn btn-danger-soft" onClick={() => downloadCsv(exportUrl, "performance_partenaires.csv")}>
            <Download size={16} /> Export
          </button>
        }
      />

      {/* ── Top 3 mensuel ── */}
      {top3.length > 0 && (
        <Card title="Top 3 partenaires — Souscriptions du mois" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "4px 0" }}>
            {top3.map((r, i) => (
              <div key={r.id} style={{
                flex: "1 1 180px",
                background: i === 0 ? "linear-gradient(135deg,#fef9c3,#fefce8)" : "var(--bg)",
                border: `2px solid ${i === 0 ? "#eab308" : i === 1 ? "#94a3b8" : "#cd7c3a"}`,
                borderRadius: 14,
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}>
                <div style={{ fontSize: 28 }}>{MEDAILLES[i]}</div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{r.nomCommerce}</div>
                <div style={{ color: "var(--text-2)", fontSize: 12 }}>{r.localisation}</div>
                <div style={{ fontWeight: 800, color: "var(--sim-primary)", fontSize: 22, marginTop: 4 }}>
                  {r.total} souscription{r.total > 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                  {r.clientsIncendie} incendie · {r.clientsAccident} accident · {fcfa(r.ca)} CA
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Filtres ── */}
      <Card style={{ marginBottom: 24 }} title="Filtres">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", padding: "4px 0 8px" }}>
          {/* Période rapide */}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Période</div>
            <div style={{ display: "flex", gap: 4 }}>
              {["mensuel", "trimestriel", "annuel"].map((p) => (
                <button
                  key={p}
                  className={`btn btn-ghost${periode === p && !from ? " active" : ""}`}
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => { setPeriode(p); setFrom(""); setTo(""); }}
                >
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Du / Au */}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Du</div>
            <input type="date" className="input" style={{ height: 38, width: 150 }} value={from}
              onChange={(e) => { setFrom(e.target.value); }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Au</div>
            <input type="date" className="input" style={{ height: 38, width: 150 }} value={to}
              onChange={(e) => { setTo(e.target.value); }} />
          </div>

          {/* Partenaire */}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Partenaire</div>
            <select className="select" style={{ height: 38, width: 200 }} value={filterPart} onChange={(e) => setFilterPart(e.target.value)}>
              <option value="">Tous les partenaires</option>
              {(partenaires ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nomCommerce}</option>
              ))}
            </select>
          </div>

          {/* Produit */}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Produit</div>
            <select className="select" style={{ height: 38, width: 150 }} value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)}>
              <option value="">Tous produits</option>
              <option value="incendie">Incendie</option>
              <option value="accident">Accident</option>
            </select>
          </div>

          {/* Montant prime */}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Montant prime</div>
            <select className="select" style={{ height: 38, width: 150 }} value={filterPrime} onChange={(e) => setFilterPrime(e.target.value)}>
              <option value="">Tous montants</option>
              <option value="1000">1 000 FCFA</option>
              <option value="2000">2 000 FCFA</option>
              <option value="500">500 FCFA</option>
              <option value="5000">5 000 FCFA</option>
            </select>
          </div>

          {(from || to || filterPart || filterPrime || filterProduit) && (
            <button className="btn btn-ghost" style={{ height: 38, fontSize: 12 }}
              onClick={() => { setFrom(""); setTo(""); setFilterPart(""); setFilterPrime(""); setFilterProduit(""); }}>
              Réinitialiser
            </button>
          )}
        </div>
      </Card>

      {/* ── Demandes de commission ── */}
      <Card
        title={`Demandes de commission${enAttente.length ? ` (${enAttente.length} en attente)` : ""}`}
        noBody
        style={{ marginBottom: 24 }}
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Partenaire</th>
                <th>Montant demandé</th>
                <th>Date demande</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(demandes ?? []).map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.partenaireNom}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{d.responsable}</div>
                  </td>
                  <td><strong style={{ color: "var(--sim-primary)" }}>{fcfa(d.montant)}</strong></td>
                  <td className="muted">{fmtDate(d.createdAt)}</td>
                  <td>{demandeBadge(d.statut)}</td>
                  <td>
                    {d.statut === "en_attente" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => valider(d.id)}>
                          <Check size={13} /> Valider
                        </button>
                        <button className="btn btn-danger-soft" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => rejeter(d.id)}>
                          <X size={13} /> Rejeter
                        </button>
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {d.traiteeAt ? fmtDate(d.traiteeAt) : "—"}
                        {d.motifRejet ? ` · ${d.motifRejet}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {(demandes ?? []).length === 0 && (
                <tr><td colSpan={5}><div className="empty">Aucune demande de commission.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat">
              <div className="stat-label">Total souscriptions</div>
              <div className="stat-value">{totalSous}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Primes Incendie HT</div>
              <div className="stat-value">{fcfa(totalIncHT)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Primes Accident HT</div>
              <div className="stat-value">{fcfa(totalAccHT)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Commissions à verser</div>
              <div className="stat-value">{fcfa(totalCom)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Commission encaissée</div>
              <div className="stat-value">{fcfa(totalEncaisse)}</div>
            </div>
          </div>

          <Card title="Classement des partenaires" noBody>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Partenaire</th>
                    <th>Volume</th>
                    <th>Inc.</th>
                    <th>Acc.</th>
                    <th>Primes Inc. HT</th>
                    <th>Primes Acc. HT</th>
                    <th>CA</th>
                    <th>Commission</th>
                    <th>Encaissée</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: "var(--text-2)", fontWeight: 600 }}>{i + 1}</td>
                      <td>
                        <strong>{r.nomCommerce}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{r.localisation}</div>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="bar-track" style={{ flex: 1 }}>
                            <div className="bar-fill" style={{ width: `${(r.total / max) * 100}%` }} />
                          </div>
                          <span style={{ fontWeight: 600 }}>{r.total}</span>
                        </div>
                      </td>
                      <td>{r.clientsIncendie}</td>
                      <td>{r.clientsAccident}</td>
                      <td className="muted">{fcfa(r.primesIncendieHT)}</td>
                      <td className="muted">{fcfa(r.primesAccidentHT)}</td>
                      <td><strong style={{ color: "var(--sim-primary)" }}>{fcfa(r.ca)}</strong></td>
                      <td><strong>{fcfa(r.commission)}</strong></td>
                      <td className="muted">{fcfa(r.commissionEncaissee)}</td>
                      <td><strong>{fcfa(r.commission - r.commissionEncaissee)}</strong></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={11}><div className="empty">Aucune donnée pour ces critères.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
