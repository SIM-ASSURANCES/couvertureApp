import { useState } from "react";
import { useParams, Link, Outlet, NavLink } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fmtDate, nb } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import type { Imf } from "../../../types";

/** Contexte fourni aux onglets de la fiche IMF via <Outlet context=…> (voir fiche/OngletRoutes.tsx). */
export type ImfFicheContext = {
  imf: Imf;
  imfId: string;
  reload: () => void;
  notify: (m: string) => void;
};

const ONGLETS: { seg: string; label: string }[] = [
  { seg: "general", label: "Général" },
  { seg: "reseau", label: "Réseau" },
  { seg: "simulateur", label: "Simulateur" },
  { seg: "portefeuille", label: "Portefeuille" },
  { seg: "produits", label: "Produits & garanties" },
  { seg: "baremes", label: "Barèmes & tarifs" },
  { seg: "documents", label: "Documents" },
];

/**
 * Layout d'une IMF partenaire : chargé une fois, il fournit l'IMF aux onglets
 * (routes filles `/admin/imfs/:imfId/<onglet>`). Le fil d'Ariane et la barre
 * d'onglets constituent la navigation secondaire dans le contexte de l'IMF.
 */
export default function ImfFicheLayout() {
  const { imfId } = useParams();
  const { data, loading, error, reload } = useFetch<Imf>(imfId ? `/imf-partenaires/${imfId}` : null);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2800);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", marginBottom: 8, flexWrap: "wrap" }}>
        <Link to="/admin/imfs" style={{ color: "inherit", textDecoration: "none" }}>IMF Partenaires</Link>
        <ChevronRight size={13} />
        <Link to="/admin/imfs/liste" style={{ color: "inherit", textDecoration: "none" }}>Les IMF</Link>
        {data && (
          <>
            <ChevronRight size={13} />
            <span style={{ color: "var(--text-1, inherit)", fontWeight: 600 }}>{data.nom}</span>
          </>
        )}
      </div>

      <PageHeader
        title={data ? data.nom : "IMF"}
        subtitle={data ? `Code ${data.code} · créée le ${fmtDate(data.createdAt)}` : undefined}
        actions={
          <Link to="/admin/imfs/liste" className="btn btn-ghost" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <ArrowLeft size={16} /> Retour
          </Link>
        }
      />

      {loading && <Loader />}
      {error && <div style={{ marginTop: 24 }}><ErrorBox message={error} /></div>}

      {data && imfId && (
        <>
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <Card><div style={{ fontSize: 20, fontWeight: 800 }}>{data.statut === "actif" ? "Actif" : "Inactif"}</div><div className="muted" style={{ fontSize: 13 }}>Statut</div></Card>
            <Card><div style={{ fontSize: 20, fontWeight: 800 }}>{nb(data.nbZones)}</div><div className="muted" style={{ fontSize: 13 }}>Zones</div></Card>
            <Card><div style={{ fontSize: 20, fontWeight: 800 }}>{nb(data.nbAgences)}</div><div className="muted" style={{ fontSize: 13 }}>Agences</div></Card>
            <Card><div style={{ fontSize: 20, fontWeight: 800 }}>{nb(data.nbSouscriptions)}</div><div className="muted" style={{ fontSize: 13 }}>Souscriptions</div></Card>
          </div>

          <div className="tabs">
            {ONGLETS.map((o) => (
              <NavLink key={o.seg} to={o.seg} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
                {o.label}
              </NavLink>
            ))}
          </div>

          <Outlet context={{ imf: data, imfId, reload, notify } satisfies ImfFicheContext} />
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
