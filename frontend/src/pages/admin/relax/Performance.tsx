import { Bike, Car, TrendingUp } from "lucide-react";
import { PageHeader, StatCard, Card, Loader, ErrorBox, fcfa } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import type { Partenaire, SouscriptionRelax } from "../../../types";

interface Overview {
  partenairesRelax: number;
  produits: { produit: string; libelle: string; confirmes: number; enAttente: number }[];
}

export default function RelaxPerformance() {
  const { data: overview, loading, error } = useFetch<Overview>("/relax/overview");
  const { data: partenaires } = useFetch<Partenaire[]>("/partenaires?branche=RELAX");
  const { data: souscriptions } = useFetch<SouscriptionRelax[]>("/relax/souscriptions");

  const commissionParPartenaire = new Map<string, number>();
  for (const s of souscriptions ?? []) {
    commissionParPartenaire.set(
      s.partenaireId,
      (commissionParPartenaire.get(s.partenaireId) ?? 0) + (s.commissionCalculee ?? 0)
    );
  }

  const moto = overview?.produits.find((p) => p.produit === "relaxmoto");
  const auto = overview?.produits.find((p) => p.produit === "relaxauto");
  const commissionTotale = [...commissionParPartenaire.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Performance & Commissions — Relax"
        subtitle="Vue simplifiée par partenaire (v1)."
      />

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {overview && (
        <div className="stat-grid stat-grid-7" style={{ marginTop: 24 }}>
          <StatCard icon={<TrendingUp size={20} />} label="Commissions générées" value={fcfa(commissionTotale)} />
          <StatCard icon={<Bike size={20} />} label="RelaxMoto confirmés" value={String(moto?.confirmes ?? 0)} color="#16215E" bg="#eceefb" />
          <StatCard icon={<Car size={20} />} label="RelaxAuto confirmés" value={String(auto?.confirmes ?? 0)} color="#51AEE2" bg="#eaf6fd" />
        </div>
      )}

      <Card title="Par partenaire" noBody style={{ marginTop: 24 }}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Partenaire</th>
                <th>Localisation</th>
                <th>Clients Relax</th>
                <th>Commission générée</th>
              </tr>
            </thead>
            <tbody>
              {(partenaires ?? []).map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.nomCommerce}</strong></td>
                  <td className="muted">{p.localisation}</td>
                  <td className="muted">{p.clientsRelax ?? 0}</td>
                  <td><strong>{fcfa(commissionParPartenaire.get(p.id) ?? 0)}</strong></td>
                </tr>
              ))}
              {(partenaires ?? []).length === 0 && (
                <tr><td colSpan={4}><div className="empty">Aucun partenaire Relax pour l'instant.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
