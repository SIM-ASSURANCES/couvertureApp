import { useState } from "react";
import { Save } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";

interface TarifProduit {
  id: number;
  libelleVariante: string | null;
  prime: number;
  capitalGaranti: number;
  commission: number;
}

function TarifRow({
  tarif,
  saving,
  onSave,
}: {
  tarif: TarifProduit;
  saving: boolean;
  onSave: (commission: number) => void;
}) {
  const [commission, setCommission] = useState(tarif.commission);
  return (
    <tr>
      <td><strong>{tarif.libelleVariante ?? "—"}</strong></td>
      <td>{fcfa(tarif.prime)}</td>
      <td>{fcfa(tarif.capitalGaranti)}</td>
      <td>
        <input
          className="input"
          type="number"
          min={0}
          value={commission}
          onChange={(e) => setCommission(Number(e.target.value))}
        />
      </td>
      <td>
        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving} onClick={() => onSave(commission)}>
          <Save size={15} />
        </button>
      </td>
    </tr>
  );
}

function ProduitTarifsTable({ code, libelle }: { code: string; libelle: string }) {
  const { data, loading, error, reload } = useFetch<TarifProduit[]>(`/assurances-accidents/produits/${code}/tarifs`);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function save(id: number, commission: number) {
    setSaving(id);
    try {
      await api.patch(`/assurances-accidents/tarifs/${id}`, { commission });
      notify("Commission mise à jour ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <Loader />;
  if (error) return <ErrorBox message={error} />;

  return (
    <Card title={libelle} style={{ marginBottom: 24 }}>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Formule</th>
              <th>Prime</th>
              <th>Capital garanti</th>
              <th>Commission (FCFA)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <TarifRow key={t.id} tarif={t} saving={saving === t.id} onSave={(c) => save(t.id, c)} />
            ))}
            {data?.length === 0 && (
              <tr><td colSpan={5}><div className="empty">Aucune formule pour ce produit.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </Card>
  );
}

export default function AssurancesAccidentsTarifs() {
  return (
    <>
      <PageHeader
        title="Tarifs — Assurances Accidents"
        subtitle="Commission par formule (prime et capital garanti fixés au catalogue)."
      />
      <div style={{ marginTop: 24 }}>
        <ProduitTarifsTable code="relaxaccidents_fraismedicaux" libelle="RelaxAccidents Frais Médicaux" />
        <ProduitTarifsTable code="relaxmoto" libelle="RelaxMoto" />
        <ProduitTarifsTable code="relaxvoyage" libelle="RelaxVoyage" />
      </div>
    </>
  );
}
