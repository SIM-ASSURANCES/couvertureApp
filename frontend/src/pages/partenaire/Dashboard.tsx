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
  nb,
  Badge,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { useAuth } from "../../auth";
import type { CatalogueProduitBranche, SouscriptionBranche } from "../../types";

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

  // Vue unifiée (modèle générique + historiques), toujours confirmée
  // uniquement — utilisée par la branche Accidents/Dommages ci-dessous
  // (produit === "accident", qui couvre aussi bien l'ancien Accident que les
  // partenaires au QR unique vendant dans les deux Assurances).
  const { data: brancheToutes } = useFetch<SouscriptionBranche[]>("/me/souscriptions-branche");
  const clientsAccidents = brancheToutes?.filter((r) => r.sousBranche === "ASSURANCES_ACCIDENTS").length ?? 0;
  const clientsDommages = brancheToutes?.filter((r) => r.sousBranche === "ASSURANCES_DOMMAGES").length ?? 0;

  const [sousBrancheFiltre, setSousBrancheFiltre] = useState<"" | "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES">("");
  const [produitFiltre, setProduitFiltre] = useState("");
  const { data: catalogueBranche } = useFetch<CatalogueProduitBranche[]>("/me/catalogue-branche");
  const brancheParams = new URLSearchParams();
  if (sousBrancheFiltre) brancheParams.set("sousBranche", sousBrancheFiltre);
  if (produitFiltre) brancheParams.set("produit", produitFiltre);
  brancheParams.set("limit", "15");
  const { data: brancheRecentes } = useFetch<SouscriptionBranche[]>(
    `/me/souscriptions-branche?${brancheParams.toString()}`
  );

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
                <StatCard icon={<Flame size={20} />} label="Clients Incendie" value={nb(data.clientsIncendie)} color="#b45309" bg="#fdf3e3" />
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
                <StatCard icon={<ShieldCheck size={20} />} label="Clients Accidents" value={nb(clientsAccidents)} color="#15803d" bg="#e8f6ec" />
                <StatCard icon={<Flame size={20} />} label="Clients Dommages" value={nb(clientsDommages)} color="#b45309" bg="#fdf3e3" />
                <StatCard icon={<TrendingUp size={20} />} label="Chiffre d'affaires" value={fcfa(data.chiffreAffaires)} />
                <StatCard icon={<Wallet size={20} />} label="Commission estimée" value={fcfa(data.commission)} />
              </div>
              <div style={{ marginTop: 24 }}>
                <Card
                  title="Mes dernières souscriptions"
                  noBody
                  extra={
                    <div style={{ display: "flex", gap: 10 }}>
                      <select
                        className="select"
                        style={{ width: 180, height: 40 }}
                        value={sousBrancheFiltre}
                        onChange={(e) => {
                          setSousBrancheFiltre(e.target.value as "" | "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES");
                          setProduitFiltre("");
                        }}
                      >
                        <option value="">Toutes les Assurances</option>
                        <option value="ASSURANCES_ACCIDENTS">Assurances Accidents</option>
                        <option value="ASSURANCES_DOMMAGES">Assurances Dommages</option>
                      </select>
                      <select
                        className="select"
                        style={{ width: 220, height: 40 }}
                        value={produitFiltre}
                        onChange={(e) => setProduitFiltre(e.target.value)}
                      >
                        <option value="">Tous produits</option>
                        {(catalogueBranche ?? [])
                          .filter((p) => !sousBrancheFiltre || p.sousBranche === sousBrancheFiltre)
                          .map((p) => (
                            <option key={p.code} value={p.code}>{p.libelle}</option>
                          ))}
                      </select>
                    </div>
                  }
                >
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Produit</th>
                          <th>Client</th>
                          <th>Prime</th>
                          <th>Statut</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(brancheRecentes ?? []).map((r) => (
                          <tr key={r.id}>
                            <td>
                              {r.sousBranche === "ASSURANCES_DOMMAGES" ? (
                                <Badge kind="warning"><Flame size={12} /> {r.produitLibelle}</Badge>
                              ) : (
                                <Badge kind="info"><ShieldCheck size={12} /> {r.produitLibelle}</Badge>
                              )}
                            </td>
                            <td>
                              <strong>{[r.prenom, r.nom].filter(Boolean).join(" ") || <span className="muted">—</span>}</strong>
                              <div className="muted" style={{ fontSize: 12 }}>{r.telephone}</div>
                            </td>
                            <td><strong>{fcfa(r.montantPrime)}</strong></td>
                            <td>{r.produit === "incendie_historique" ? statutIncendieBadge(r.statut) : waveBadge(r.statut)}</td>
                            <td className="muted">{fmtDate(r.createdAt)}</td>
                          </tr>
                        ))}
                        {(brancheRecentes ?? []).length === 0 && (
                          <tr><td colSpan={5}><div className="empty">Aucune souscription confirmée.</div></td></tr>
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
