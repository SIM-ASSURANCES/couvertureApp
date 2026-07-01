import { useState } from "react";
import { Flame, ShieldCheck, Wallet, FileText, TrendingUp } from "lucide-react";
import {
  PageHeader,
  StatCard,
  Card,
  Loader,
  ErrorBox,
  fcfa,
  waveBadge,
  statutIncendieBadge,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";

interface Overview {
  partenaire: { nomCommerce: string; nomResponsable: string; localisation: string };
  produit: "incendie" | "accident";
  clientsIncendie: number;
  clientsAccident: number;
  primesIncendie: number;
  primesAccident: number;
  chiffreAffaires: number;
  commission: number;
}
interface Sous {
  incendie: {
    id: string;
    telephone: string;
    nom?: string;
    prenom?: string;
    refFacture?: string;
    statut: string;
    createdAt: string;
  }[];
  accident: {
    id: string;
    prenom: string;
    nom: string;
    telephone: string;
    montantPrime: number;
    waveStatut: string;
    numeroPolice?: string;
    createdAt: string;
  }[];
}

export default function PartenaireDashboard() {
  const { user } = useAuth();
  const produit = user?.produit ?? "accident";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const { data, loading, error } = useFetch<Overview>(
    `/me/overview${qs ? `?${qs}` : ""}`
  );
  const { data: sous } = useFetch<Sous>("/me/souscriptions");

  const periodeLabel =
    from || to
      ? `Période : ${from || "début"} → ${to || "aujourd'hui"}`
      : "Toutes périodes";

  return (
    <>
      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <PageHeader
            title={`Bonjour, ${data.partenaire.nomResponsable.split(" ")[0]} 👋`}
            subtitle={`${data.partenaire.nomCommerce} — ${data.partenaire.localisation}`}
          />

          {/* Filtre de période */}
          <Card title="Filtrer par période" style={{ marginTop: 24 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Du</label>
                <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Au</label>
                <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
              {(from || to) && (
                <button className="btn btn-ghost" onClick={() => { setFrom(""); setTo(""); }}>Réinitialiser</button>
              )}
              <span className="muted" style={{ fontSize: 13, marginLeft: "auto" }}>{periodeLabel}</span>
            </div>
          </Card>

          {produit === "incendie" ? (
            <>
              <div className="stat-grid" style={{ marginTop: 24 }}>
                <StatCard icon={<Flame size={20} />} label="Clients Incendie" value={String(data.clientsIncendie)} color="#b45309" bg="#fdf3e3" />
                <StatCard icon={<FileText size={20} />} label="Primes Incendie" value={fcfa(data.primesIncendie)} color="#b45309" bg="#fdf3e3" />
                <StatCard icon={<TrendingUp size={20} />} label="Chiffre d'affaires" value={fcfa(data.chiffreAffaires)} />
                <StatCard icon={<Wallet size={20} />} label="Commission estimée" value={fcfa(data.commission)} />
              </div>
              <div style={{ marginTop: 24 }}>
                <Card title="Mes dernières souscriptions Incendie" noBody>
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Téléphone</th>
                          <th>Nom</th>
                          <th>Réf. facture</th>
                          <th>Statut</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sous?.incendie.map((c) => (
                          <tr key={c.id}>
                            <td><strong>{c.telephone}</strong></td>
                            <td>{c.prenom || c.nom ? `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() : <span className="muted">Non renseigné</span>}</td>
                            <td>{c.refFacture ?? <span className="muted">—</span>}</td>
                            <td>{statutIncendieBadge(c.statut)}</td>
                            <td className="muted">{fmtDate(c.createdAt)}</td>
                          </tr>
                        ))}
                        {sous && sous.incendie.length === 0 && (
                          <tr><td colSpan={5}><div className="empty">Aucune souscription Incendie.</div></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </>
          ) : (
            <>
              <div className="stat-grid" style={{ marginTop: 24 }}>
                <StatCard icon={<ShieldCheck size={20} />} label="Clients Accident" value={String(data.clientsAccident)} color="#15803d" bg="#e8f6ec" />
                <StatCard icon={<FileText size={20} />} label="Primes Accident" value={fcfa(data.primesAccident)} color="#15803d" bg="#e8f6ec" />
                <StatCard icon={<TrendingUp size={20} />} label="Chiffre d'affaires" value={fcfa(data.chiffreAffaires)} />
                <StatCard icon={<Wallet size={20} />} label="Commission estimée" value={fcfa(data.commission)} />
              </div>
              <div style={{ marginTop: 24 }}>
                <Card title="Mes dernières souscriptions Accident" noBody>
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Prime</th>
                          <th>Paiement</th>
                          <th>N° police</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sous?.accident.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{c.prenom} {c.nom}</strong>
                              <div className="muted" style={{ fontSize: 12 }}>{c.telephone}</div>
                            </td>
                            <td>{fcfa(c.montantPrime)}</td>
                            <td>{waveBadge(c.waveStatut)}</td>
                            <td className="muted">{c.numeroPolice ?? "—"}</td>
                            <td className="muted">{fmtDate(c.createdAt)}</td>
                          </tr>
                        ))}
                        {sous && sous.accident.length === 0 && (
                          <tr><td colSpan={5}><div className="empty">Aucune souscription Accident.</div></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
