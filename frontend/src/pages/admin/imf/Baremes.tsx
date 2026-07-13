import { useState } from "react";
import { Save } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";
import type { BaremeSecurpro, BaremeSecurstock } from "../../../types";

function SecurproTable() {
  const { data, loading, error, reload } = useFetch<BaremeSecurpro[]>("/imf/baremes/securpro");
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function save(classe: number, limiteCapital: number, tauxIncendie: number) {
    setSaving(classe);
    try {
      await api.patch(`/imf/baremes/securpro/${classe}`, { limiteCapital, tauxIncendie });
      notify(`Classe ${classe} mise à jour ✓`);
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
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Classe</th>
              <th>Limite de capitaux (FCFA)</th>
              <th>Taux Incendie (‰)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <BaremeRow
                key={b.classe}
                classe={b.classe}
                limite={b.limiteCapital}
                taux={b.tauxIncendie * 1000}
                saving={saving === b.classe}
                onSave={(limite, tauxPourMille) => save(b.classe, limite, tauxPourMille / 1000)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function SecurstockTable() {
  const { data, loading, error, reload } = useFetch<BaremeSecurstock[]>("/imf/baremes/securstock");
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function save(classe: number, limiteCapital: number, t1: number, t2: number) {
    setSaving(classe);
    try {
      await api.patch(`/imf/baremes/securstock/${classe}`, {
        limiteCapital,
        tauxDommageElectrique: t1,
        tauxAutreCause: t2,
      });
      notify(`Classe ${classe} mise à jour ✓`);
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
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Classe</th>
              <th>Limite de capitaux (FCFA)</th>
              <th>T1 — dommage électrique (%)</th>
              <th>T2 — autre cause (%)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <SecurstockRow
                key={b.classe}
                classe={b.classe}
                limite={b.limiteCapital}
                t1={b.tauxDommageElectrique * 100}
                t2={b.tauxAutreCause * 100}
                saving={saving === b.classe}
                onSave={(limite, t1pct, t2pct) => save(b.classe, limite, t1pct / 100, t2pct / 100)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function BaremeRow({
  classe, limite, taux, saving, onSave,
}: { classe: number; limite: number; taux: number; saving: boolean; onSave: (limite: number, taux: number) => void }) {
  const [l, setL] = useState(limite);
  const [t, setT] = useState(taux);
  return (
    <tr>
      <td><strong>Classe {classe}</strong></td>
      <td><input className="input" type="number" value={l} onChange={(e) => setL(Number(e.target.value))} /></td>
      <td><input className="input" type="number" step="0.001" value={t} onChange={(e) => setT(Number(e.target.value))} /></td>
      <td>
        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving} onClick={() => onSave(l, t)}>
          <Save size={15} />
        </button>
      </td>
    </tr>
  );
}

function SecurstockRow({
  classe, limite, t1, t2, saving, onSave,
}: { classe: number; limite: number; t1: number; t2: number; saving: boolean; onSave: (limite: number, t1: number, t2: number) => void }) {
  const [l, setL] = useState(limite);
  const [a, setA] = useState(t1);
  const [b, setB] = useState(t2);
  return (
    <tr>
      <td><strong>Classe {classe}</strong></td>
      <td><input className="input" type="number" value={l} onChange={(e) => setL(Number(e.target.value))} /></td>
      <td><input className="input" type="number" step="0.01" value={a} onChange={(e) => setA(Number(e.target.value))} /></td>
      <td><input className="input" type="number" step="0.01" value={b} onChange={(e) => setB(Number(e.target.value))} /></td>
      <td>
        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving} onClick={() => onSave(l, a, b)}>
          <Save size={15} />
        </button>
      </td>
    </tr>
  );
}

export default function Baremes() {
  return (
    <>
      <PageHeader title="Barèmes" subtitle="Taux et plafonds par classe de risque — SECURPRO et SECURSTOCK." />
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
        <Card title="SECURPRO">
          <SecurproTable />
        </Card>
        <Card title="SECURSTOCK">
          <SecurstockTable />
        </Card>
      </div>
    </>
  );
}
