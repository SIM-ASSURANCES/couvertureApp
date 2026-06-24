import { PageHeader, Card, StatCard, Loader, ErrorBox, fcfa } from "../../components/ui";
import { Wallet, FileText, Flame, ShieldCheck } from "lucide-react";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";

interface Overview {
  produit: "incendie" | "accident";
  clientsIncendie: number;
  clientsAccident: number;
  primesIncendie: number;
  primesAccident: number;
  commission: number;
}

export default function PartenaireCommissions() {
  const { user } = useAuth();
  const produit = user?.produit ?? "accident";
  const { data, loading, error } = useFetch<Overview>("/me/overview");

  return (
    <>
      <PageHeader
        title="Mes commissions"
        subtitle="Rémunération sur les souscriptions générées via votre réseau."
      />

      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        produit === "incendie" ? (
          <>
            <div className="stat-grid" style={{ marginTop: 24 }}>
              <StatCard icon={<Wallet size={20} />} label="Commission estimée" value={fcfa(data.commission)} />
              <StatCard icon={<FileText size={20} />} label="Primes Incendie" value={fcfa(data.primesIncendie)} color="#b45309" bg="#fdf3e3" />
              <StatCard icon={<Flame size={20} />} label="Clients Incendie" value={String(data.clientsIncendie)} color="#b45309" bg="#fdf3e3" />
            </div>
            <div style={{ marginTop: 24 }}>
              <Card title="Votre production Incendie">
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Flame size={16} color="#b45309" /> Clients Incendie
                    </span>
                    <strong>{data.clientsIncendie}</strong>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: data.clientsIncendie > 0 ? "100%" : "0%", background: "#b45309" }} />
                  </div>
                </div>
              </Card>
            </div>
          </>
        ) : (
          <>
            <div className="stat-grid" style={{ marginTop: 24 }}>
              <StatCard icon={<Wallet size={20} />} label="Commission estimée" value={fcfa(data.commission)} />
              <StatCard icon={<FileText size={20} />} label="Primes Accident" value={fcfa(data.primesAccident)} color="#15803d" bg="#e8f6ec" />
              <StatCard icon={<ShieldCheck size={20} />} label="Clients Accident" value={String(data.clientsAccident)} color="#15803d" bg="#e8f6ec" />
            </div>
            <div style={{ marginTop: 24 }}>
              <Card title="Votre production Accident">
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ShieldCheck size={16} color="#15803d" /> Clients Accident
                    </span>
                    <strong>{data.clientsAccident}</strong>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: data.clientsAccident > 0 ? "100%" : "0%", background: "#15803d" }} />
                  </div>
                </div>
              </Card>
            </div>
          </>
        )
      )}
    </>
  );
}
