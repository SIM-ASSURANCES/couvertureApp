import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fmtDate } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { exportExcel } from "../../../xlsx";
import SouscriptionsGroupees from "./SouscriptionsGroupees";
import type { SouscriptionImf } from "../../../types";

const PRODUITS = [
  { value: "", label: "Tous produits" },
  { value: "securpro", label: "SECURPRO" },
  { value: "securstock", label: "SECURSTOCK" },
  { value: "coupsdurs", label: "Coups Durs" },
  { value: "coupsdurs_classique", label: "Coups Durs — Classique (ancien)" },
  { value: "coupsdurs_incapacite", label: "Coups Durs — Incapacité (ancien)" },
  { value: "securecolte", label: "SECURECOLTE" },
];

/** Contrats IMF actifs de tout le réseau, regroupés par zone puis par agence. */
export default function Contrats() {
  const [produitCode, setProduitCode] = useState("");
  const params = new URLSearchParams();
  if (produitCode) params.set("produitCode", produitCode);
  const { data, loading, error } = useFetch<SouscriptionImf[]>(`/imf/contrats?${params.toString()}`);

  function exporter() {
    if (!data) return;
    exportExcel(
      data.map((s) => ({
        "N° de police": s.numeroPolice,
        "Client": `${s.prenom} ${s.nom}`,
        "Téléphone": s.telephone,
        "Produit": s.produitCode,
        "Zone": s.zoneNom ?? "",
        "Agence": s.agenceNom ?? "",
        "Agent": s.agentNom ?? s.adminNom ?? "",
        "Ville": s.ville ?? "",
        "Commune ou quartier": s.communeQuartier ?? "",
        "Prime TTC": s.primeTTC,
        "Statut": s.statut,
        "Date": fmtDate(s.createdAt),
      })),
      "contrats-imf.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Contrats IMF"
        subtitle="Contrats actifs du réseau, regroupés par zone et par agence."
      />

      <Card
        title={data ? `${data.length} contrats` : "Contrats"}
        extra={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select className="select" style={{ width: 220, height: 40 }} value={produitCode} onChange={(e) => setProduitCode(e.target.value)}>
              {PRODUITS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={exporter} disabled={!data || data.length === 0}>
              <FileSpreadsheet size={15} /> Export Excel
            </button>
          </div>
        }
        noBody
        style={{ marginTop: 24 }}
      >
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && <SouscriptionsGroupees rows={data} />}
      </Card>
    </>
  );
}
