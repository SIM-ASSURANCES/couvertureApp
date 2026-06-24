import { Link } from "react-router-dom";
import { Store, Flame, ShieldCheck, Wallet, ArrowUpRight } from "lucide-react";
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
  const { data, loading, error } = useFetch<Overview>("/stats/overview");

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de l'activité du réseau SIM Assurances."
      />

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="stat-grid" style={{ marginTop: 24 }}>
            <StatCard
              icon={<Store size={20} />}
              label="Partenaires actifs"
              value={`${data.partenairesActifs} / ${data.partenairesTotal}`}
              trend="Réseau de distribution"
            />
            <StatCard
              icon={<Flame size={20} />}
              label="Souscriptions Incendie"
              value={String(data.incendieTotal)}
              color="#b45309"
              bg="#fdf3e3"
            />
            <StatCard
              icon={<ShieldCheck size={20} />}
              label="Souscriptions Accident"
              value={String(data.accidentTotal)}
              color="#15803d"
              bg="#e8f6ec"
            />
            <StatCard
              icon={<Wallet size={20} />}
              label="Primes Accident (Wave)"
              value={fcfa(data.primesAccident)}
              trend="Encaissées via Wave"
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
