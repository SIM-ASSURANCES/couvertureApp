import { HeartPulse, Store, Clock, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, StatCard, Card, Loader, ErrorBox, fcfa, fmtDate, waveBadge, nb } from "../../../components/ui";
import { useFetch } from "../../../useFetch";

interface Overview {
  partenaires: number;
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

export default function AssurancesAccidentsDashboard() {
  const { data, loading, error } = useFetch<Overview>("/assurances-accidents/overview");

  const fraisMedicaux = data?.produits.find((p) => p.produit === "relaxaccidents_fraismedicaux");
  const totalConfirmes = (data?.produits ?? []).reduce((s, p) => s + p.confirmes, 0);
  const totalEnAttente = (data?.produits ?? []).reduce((s, p) => s + p.enAttente, 0);

  return (
    <>
      <PageHeader
        title="Tableau de bord — Assurances Accidents"
        subtitle="Vue d'ensemble de la sous-branche Assurances Accidents (RelaxAccidents…)."
      />

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="stat-grid stat-grid-7" style={{ marginTop: 24 }}>
            <StatCard icon={<Store size={20} />} label="Partenaires" value={nb(data.partenaires)} />
            <StatCard
              icon={<HeartPulse size={20} />}
              label="RelaxAccidents Frais Médicaux actifs"
              value={nb(fraisMedicaux?.confirmes ?? 0)}
              color="#15803d"
              bg="#e8f6ec"
            />
            <StatCard icon={<HeartPulse size={20} />} label="Total contrats actifs" value={nb(totalConfirmes)} />
            <StatCard
              icon={<Clock size={20} />}
              label="Paiements en attente"
              value={nb(totalEnAttente)}
              color="#b45309"
              bg="#fdf3e3"
            />
          </div>

          <Card
            title="Dernières souscriptions confirmées"
            extra={
              <Link className="muted" to="/admin/assurances-accidents/clients" style={{ fontSize: 13 }}>
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
