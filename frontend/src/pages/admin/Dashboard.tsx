import { useState } from "react";
import { Link } from "react-router-dom";
import { Store, Flame, ShieldCheck, Wallet, ArrowUpRight, TrendingUp, Receipt, FileText, PiggyBank, HeartPulse, Coins } from "lucide-react";
import {
  PageHeader,
  StatCard,
  Card,
  Loader,
  ErrorBox,
  fcfa,
  statutIncendieBadge,
  waveBadge,
  nb,
  Badge,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import type { CatalogueProduitBranche, SouscriptionBranche } from "../../types";

interface AccidentsOverview {
  partenaires: number;
  produits: { produit: string; libelle: string; confirmes: number; enAttente: number }[];
}

interface Overview {
  partenairesTotal: number;
  partenairesActifs: number;
  incendieTotal: number;
  accidentTotal: number;
  primesAccident: number;
  primesIncendie: number;
  chiffreAffaires: number;
  taxes: number;
  fgTotal: number;
  caIncendie: number;
  caAccident: number;
  budgetIncendie: number;
  budgetAccident: number;
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
  // Produits de la sous-branche "Assurances Accidents" (refonte, modèle
  // générique) — comptés séparément de data.accidentTotal (ancien modèle).
  const { data: accidents } = useFetch<AccidentsOverview>("/assurances-accidents/overview");
  // Total des souscriptions confirmées du modèle générique (RelaxMoto/Auto,
  // RelaxAccidents Frais Médicaux/générale, RelaxVoyage, SecurHome+, SecurPro
  // Dommages) — sans quoi les partenaires vendant uniquement ces produits
  // (notamment ceux au QR unique) n'étaient comptés nulle part sur ce tableau
  // de bord, qui ne portait jusqu'ici que sur les deux modèles historiques.
  const { data: generiqueConfirmes } = useFetch<SouscriptionBranche[]>(
    "/assurances-branche/souscriptions?statut=confirme&generiqueSeul=1"
  );
  const generiqueConfirmesTotal = generiqueConfirmes?.length ?? 0;

  // Filtres "type d'assurance" / "type de produit" des dernières souscriptions
  // (vue unifiée tous produits, modèle générique + historiques Incendie/Accident).
  const [sousBrancheFiltre, setSousBrancheFiltre] = useState<"" | "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES">("");
  const [produitFiltre, setProduitFiltre] = useState("");
  const { data: catalogue } = useFetch<CatalogueProduitBranche[]>("/assurances-branche/catalogue");
  const recentParams = new URLSearchParams();
  // Seules les souscriptions confirmées apparaissent ici — celles en attente
  // de paiement se retrouvent sur la page dédiée "Paiement en attente".
  recentParams.set("statut", "confirme");
  if (sousBrancheFiltre) recentParams.set("sousBranche", sousBrancheFiltre);
  if (produitFiltre) recentParams.set("produit", produitFiltre);
  if (from) recentParams.set("from", from);
  if (to) recentParams.set("to", to);
  recentParams.set("limit", "10");
  const { data: recents } = useFetch<SouscriptionBranche[]>(
    `/assurances-branche/souscriptions?${recentParams.toString()}`
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
              label="Primes Dommages TTC"
              value={fcfa(data.primesIncendie)}
              color="#b45309"
              bg="#fdf3e3"
            />
            <StatCard
              icon={<Wallet size={20} />}
              label="Primes Accidents TTC"
              value={fcfa(data.primesAccident)}
              color="#15803d"
              bg="#e8f6ec"
            />
            <StatCard
              icon={<Store size={20} />}
              label="Partenaires actifs"
              value={`${nb(data.partenairesActifs)}/${nb(data.partenairesTotal)}`}
            />
            <StatCard
              icon={<Flame size={20} />}
              label="Souscr. Dommages"
              value={nb(data.incendieTotal)}
              color="#b45309"
              bg="#fdf3e3"
            />
            <StatCard
              icon={<ShieldCheck size={20} />}
              label="Souscr. Accidents"
              value={nb(data.accidentTotal)}
              color="#15803d"
              bg="#e8f6ec"
            />
          </div>

          <div className="stat-grid stat-grid-compact" style={{ marginTop: 16 }}>
            {accidents && (
              <StatCard
                icon={<Store size={20} />}
                label="Partenaires Assurances Accidents & Dommages"
                value={nb(accidents.partenaires)}
              />
            )}
            <StatCard
              icon={<HeartPulse size={20} />}
              label="Souscriptions Assurances Accidents et Dommages"
              value={nb(data.accidentTotal + data.incendieTotal + generiqueConfirmesTotal)}
              trend="Toutes confirmées, Accidents + Dommages"
              color="#15803d"
              bg="#e8f6ec"
            />
            <StatCard
              icon={<Coins size={20} />}
              label="FG totale"
              value={fcfa(data.fgTotal)}
              color="#7c3aed"
              bg="#f3eefe"
            />
            <StatCard
              icon={<PiggyBank size={20} />}
              label="Budget Dommages (mensuel)"
              value={fcfa(data.budgetIncendie)}
              trend="5% du CA prime HT sur 31 jours glissants"
              color="#b45309"
              bg="#fdf3e3"
            />
            <StatCard
              icon={<PiggyBank size={20} />}
              label="Budget Accidents (mensuel)"
              value={fcfa(data.budgetAccident)}
              trend="5% du CA prime HT sur 31 jours glissants"
              color="#15803d"
              bg="#e8f6ec"
            />
          </div>
          {accidents && (
            <Link className="muted" to="/admin/clients-accidents" style={{ fontSize: 12, display: "inline-block", marginTop: 6 }}>
              Voir le détail par produit <ArrowUpRight size={12} style={{ verticalAlign: -2 }} />
            </Link>
          )}

          <Card
            title="Dernières souscriptions"
            style={{ marginTop: 24 }}
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
                  {(catalogue ?? [])
                    .filter((p) => !sousBrancheFiltre || p.sousBranche === sousBrancheFiltre)
                    .map((p) => (
                      <option key={p.code} value={p.code}>{p.libelle}</option>
                    ))}
                </select>
              </div>
            }
            noBody
          >
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Client</th>
                    <th>Partenaire</th>
                    <th>Prime</th>
                    <th>Statut</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(recents ?? []).map((r) => (
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
                      <td>{r.partenaireNom}</td>
                      <td><strong>{fcfa(r.montantPrime)}</strong></td>
                      <td>{r.produit === "incendie_historique" ? statutIncendieBadge(r.statut) : waveBadge(r.statut)}</td>
                      <td className="muted">{new Date(r.createdAt).toLocaleDateString("fr-FR")}</td>
                    </tr>
                  ))}
                  {(recents ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty">Aucune souscription.</div>
                      </td>
                    </tr>
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
