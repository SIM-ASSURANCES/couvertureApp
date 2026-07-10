import { Bike, Car, Store, Clock, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, StatCard, Card, Loader, ErrorBox, fcfa, fmtDate, waveBadge } from "../../../components/ui";
import { useFetch } from "../../../useFetch";

interface Overview {
  partenairesRelax: number;
  produits: { produit: string; libelle: string; confirmes: number; enAttente: number }[];
  derniers: {
    id: string;
    nom?: string | null;
    prenom?: string | null;
    telephone: string;
    montantPrime: number;
    waveStatut: string | null;
    numeroPolice?: string | null;
    partenaire: { nomCommerce: string };
    produit: { code: string; libelle: string };
    createdAt: string;
  }[];
}

export default function RelaxDashboard() {
  const { data, loading, error } = useFetch<Overview>("/relax/overview");

  const moto = data?.produits.find((p) => p.produit === "relaxmoto");
  const auto = data?.produits.find((p) => p.produit === "relaxauto");

  return (
    <>
      <PageHeader
        title="Tableau de bord — RelaxMoto & RelaxAuto"
        subtitle="Vue d'ensemble des abonnements à paiement échelonné."
      />

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="stat-grid stat-grid-7" style={{ marginTop: 24 }}>
            <StatCard icon={<Store size={20} />} label="Partenaires Relax" value={String(data.partenairesRelax)} />
            <StatCard
              icon={<Bike size={20} />}
              label="Abonnements RelaxMoto actifs"
              value={String(moto?.confirmes ?? 0)}
              color="#16215E"
              bg="#eceefb"
            />
            <StatCard
              icon={<Car size={20} />}
              label="Abonnements RelaxAuto actifs"
              value={String(auto?.confirmes ?? 0)}
              color="#51AEE2"
              bg="#eaf6fd"
            />
            <StatCard
              icon={<Clock size={20} />}
              label="Échéances en attente"
              value={String((moto?.enAttente ?? 0) + (auto?.enAttente ?? 0))}
              color="#b45309"
              bg="#fdf3e3"
            />
          </div>

          <Card
            title="Dernières souscriptions confirmées"
            extra={
              <Link className="muted" to="/admin/relax/contrats" style={{ fontSize: 13 }}>
                Tout voir <ArrowUpRight size={14} style={{ verticalAlign: -2 }} />
              </Link>
            }
            noBody
            style={{ marginTop: 24 }}
          >
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Produit</th>
                    <th>Partenaire</th>
                    <th>Prime</th>
                    <th>Statut</th>
                    <th>N° police</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.derniers.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.prenom} {c.nom}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                      </td>
                      <td>{c.produit.libelle}</td>
                      <td>{c.partenaire.nomCommerce}</td>
                      <td><strong>{fcfa(c.montantPrime)}</strong></td>
                      <td>{waveBadge(c.waveStatut ?? "en_attente")}</td>
                      <td className="muted">{c.numeroPolice ?? "—"}</td>
                      <td className="muted">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                  {data.derniers.length === 0 && (
                    <tr><td colSpan={7}><div className="empty">Aucune souscription pour l'instant.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
