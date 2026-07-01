import { useState } from "react";
import { Link } from "react-router-dom";
import { Store, Flame, ShieldCheck, Wallet, ArrowUpRight, TrendingUp, Receipt, FileText } from "lucide-react";
import {
  PageHeader,
  StatCard,
  Card,
  Loader,
  ErrorBox,
  fcfa,
  statutIncendieBadge,
  waveBadge,
} from "../../components/ui";
import { useFetch } from "../../useFetch";

interface Overview {
  partenairesTotal: number;
  partenairesActifs: number;
  incendieTotal: number;
  accidentTotal: number;
  primesAccident: number;
  primesIncendie: number;
  chiffreAffaires: number;
  taxes: number;
  caIncendie: number;
  caAccident: number;
  derniersAccident: {
    id: string;
    prenom: string;
    nom: string;
    telephone: string;
    partenaireNom: string;
    waveStatut: string;
    numeroPolice?: string;
  }[];
  derniersIncendie: {
    id: string;
    telephone: string;
    partenaireNom: string;
    statut: string;
  }[];
}

export default function AdminDashboard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const { data, loading, error } = useFetch<Overview>(
    `/stats/overview${qs ? `?${qs}` : ""}`
  );

  const periodeLabel =
    from || to
      ? `Période : ${from || "début"} → ${to || "aujourd'hui"}`
      : "Toutes périodes";

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de l'activité du réseau SIM Assurances."
      />

      {/* Filtres de période */}
      <Card title="Filtrer par période" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Du</label>
            <input
              className="input"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Au</label>
            <input
              className="input"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {(from || to) && (
            <button
              className="btn btn-ghost"
              onClick={() => { setFrom(""); setTo(""); }}
            >
              Réinitialiser
            </button>
          )}
          <span className="muted" style={{ fontSize: 13, marginLeft: "auto" }}>
            {periodeLabel}
          </span>
        </div>
      </Card>

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="stat-grid stat-grid-7" style={{ marginTop: 24 }}>
            <StatCard
              icon={<TrendingUp size={20} />}
              label="Chiffre d'affaires"
              value={fcfa(data.chiffreAffaires)}
            />
            <StatCard
              icon={<Receipt size={20} />}
              label="Taxes"
              value={fcfa(data.taxes)}
              color="#7c3aed"
              bg="#f3eefe"
            />
            <StatCard
              icon={<FileText size={20} />}
              label="Primes Incendie TTC"
              value={fcfa(data.primesIncendie)}
              color="#b45309"
              bg="#fdf3e3"
            />
            <StatCard
              icon={<Wallet size={20} />}
              label="Primes Accident TTC"
              value={fcfa(data.primesAccident)}
              color="#15803d"
              bg="#e8f6ec"
            />
            <StatCard
              icon={<Store size={20} />}
              label="Partenaires actifs"
              value={`${data.partenairesActifs}/${data.partenairesTotal}`}
            />
            <StatCard
              icon={<Flame size={20} />}
              label="Souscr. Incendie"
              value={String(data.incendieTotal)}
              color="#b45309"
              bg="#fdf3e3"
            />
            <StatCard
              icon={<ShieldCheck size={20} />}
              label="Souscr. Accident"
              value={String(data.accidentTotal)}
              color="#15803d"
              bg="#e8f6ec"
            />
          </div>

          <div className="grid-2" style={{ marginTop: 24 }}>
            <Card
              title="Dernières souscriptions Accident"
              extra={
                <Link className="muted" to="/admin/accident" style={{ fontSize: 13 }}>
                  Tout voir{" "}
                  <ArrowUpRight size={14} style={{ verticalAlign: -2 }} />
                </Link>
              }
              noBody
            >
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Partenaire</th>
                      <th>Paiement Wave</th>
                      <th>N° police</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.derniersAccident.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>
                            {c.prenom} {c.nom}
                          </strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {c.telephone}
                          </div>
                        </td>
                        <td>{c.partenaireNom}</td>
                        <td>{waveBadge(c.waveStatut)}</td>
                        <td className="muted">{c.numeroPolice ?? "—"}</td>
                      </tr>
                    ))}
                    {data.derniersAccident.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <div className="empty">Aucune souscription.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Souscriptions Incendie récentes" noBody>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Téléphone</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.derniersIncendie.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.telephone}
                          <div className="muted" style={{ fontSize: 12 }}>
                            {c.partenaireNom}
                          </div>
                        </td>
                        <td>{statutIncendieBadge(c.statut)}</td>
                      </tr>
                    ))}
                    {data.derniersIncendie.length === 0 && (
                      <tr>
                        <td colSpan={2}>
                          <div className="empty">Aucune souscription.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
