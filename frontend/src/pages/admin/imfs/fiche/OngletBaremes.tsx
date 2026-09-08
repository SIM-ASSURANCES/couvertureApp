import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Card, Loader, ErrorBox } from "../../../../components/ui";
import { useFetch } from "../../../../useFetch";
import { api } from "../../../../api";
import type {
  ImfBaremes,
  ImfBaremeSecurproLigne,
  ImfBaremeSecurstockLigne,
  ImfPalierSecurecolteLigne,
  ImfTarifFixeLigne,
} from "../../../../types";

const LIBELLE_PRODUIT: Record<string, string> = { coupsdurs: "Coups Durs", securecolte: "SECURECOLTE" };
const LIBELLE_SEUIL: Record<string, string> = { forte: "Sécheresse forte", moyenne: "Sécheresse moyenne", faible: "Sécheresse faible" };

/** Champ numérique compact ; `value` en string pour distinguer "vide" de 0. */
function Num({
  value,
  onChange,
  step,
  disabled,
  width = 120,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: string;
  disabled?: boolean;
  width?: number;
}) {
  return (
    <input
      className="input"
      type="number"
      step={step}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width, maxWidth: "100%" }}
    />
  );
}

/* ── SECURPRO ── */

function SecurproRow({ b, imfId, notify, reload }: { b: ImfBaremeSecurproLigne; imfId: string; notify: (m: string) => void; reload: () => void }) {
  const initial = { limite: String(b.limiteCapital), taux: String(b.tauxIncendie * 1000), comm: String(b.tauxCommission * 100) };
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(initial), [b]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = f.limite !== initial.limite || f.taux !== initial.taux || f.comm !== initial.comm;

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/imf-partenaires/${imfId}/baremes/securpro/${b.classe}`, {
        limiteCapital: Number(f.limite),
        tauxIncendie: Number(f.taux) / 1000,
        tauxCommission: Number(f.comm) / 100,
      });
      notify(`SECURPRO classe ${b.classe} — enregistré ✓`);
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td><strong>Classe {b.classe}</strong></td>
      <td><Num value={f.limite} onChange={(v) => setF({ ...f, limite: v })} width={140} /></td>
      <td><Num value={f.taux} onChange={(v) => setF({ ...f, taux: v })} step="0.001" /></td>
      <td><Num value={f.comm} onChange={(v) => setF({ ...f, comm: v })} step="0.5" width={90} /></td>
      <td>
        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving || !dirty} onClick={save}>
          <Save size={15} />
        </button>
      </td>
    </tr>
  );
}

/* ── SECURSTOCK ── */

function SecurstockRow({ b, imfId, notify, reload }: { b: ImfBaremeSecurstockLigne; imfId: string; notify: (m: string) => void; reload: () => void }) {
  const initial = {
    limite: String(b.limiteCapital),
    t1: String(b.tauxDommageElectrique * 100),
    t2: String(b.tauxAutreCause * 100),
    comm: String(b.tauxCommission * 100),
  };
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(initial), [b]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = f.limite !== initial.limite || f.t1 !== initial.t1 || f.t2 !== initial.t2 || f.comm !== initial.comm;

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/imf-partenaires/${imfId}/baremes/securstock/${b.classe}`, {
        limiteCapital: Number(f.limite),
        tauxDommageElectrique: Number(f.t1) / 100,
        tauxAutreCause: Number(f.t2) / 100,
        tauxCommission: Number(f.comm) / 100,
      });
      notify(`SECURSTOCK classe ${b.classe} — enregistré ✓`);
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td><strong>Classe {b.classe}</strong></td>
      <td><Num value={f.limite} onChange={(v) => setF({ ...f, limite: v })} width={140} /></td>
      <td><Num value={f.t1} onChange={(v) => setF({ ...f, t1: v })} step="0.01" width={90} /></td>
      <td><Num value={f.t2} onChange={(v) => setF({ ...f, t2: v })} step="0.01" width={90} /></td>
      <td><Num value={f.comm} onChange={(v) => setF({ ...f, comm: v })} step="0.5" width={90} /></td>
      <td>
        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving || !dirty} onClick={save}>
          <Save size={15} />
        </button>
      </td>
    </tr>
  );
}

/* ── SECURECOLTE — paliers ── */

function PalierRow({ p, imfId, notify, reload }: { p: ImfPalierSecurecolteLigne; imfId: string; notify: (m: string) => void; reload: () => void }) {
  const initial = { pct: String(p.pourcentageIndice * 100), montant: String(p.montantIndemnite) };
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(initial), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = f.pct !== initial.pct || f.montant !== initial.montant;

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/imf-partenaires/${imfId}/baremes/securecolte/${p.seuil}`, {
        pourcentageIndice: Number(f.pct) / 100,
        montantIndemnite: Number(f.montant),
      });
      notify(`${LIBELLE_SEUIL[p.seuil] ?? p.seuil} — enregistré ✓`);
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td><strong>{LIBELLE_SEUIL[p.seuil] ?? p.seuil}</strong></td>
      <td><Num value={f.pct} onChange={(v) => setF({ ...f, pct: v })} step="0.5" width={90} /></td>
      <td><Num value={f.montant} onChange={(v) => setF({ ...f, montant: v })} width={140} /></td>
      <td>
        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving || !dirty} onClick={save}>
          <Save size={15} />
        </button>
      </td>
    </tr>
  );
}

/* ── Tarifs fixes (COUPS DURS / SECURECOLTE) ── */

function TarifFixeRow({ t, imfId, notify, reload }: { t: ImfTarifFixeLigne; imfId: string; notify: (m: string) => void; reload: () => void }) {
  const s = (n: number | null) => (n != null ? String(n) : "");
  const initial = {
    prime: String(t.prime),
    primeHT: s(t.primeHT),
    fg: s(t.fg),
    taxes: s(t.taxes),
    capital: String(t.capitalGaranti),
    comm: String(t.commission * 100),
  };
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(initial), [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => f[k] !== initial[k]);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/imf-partenaires/${imfId}/baremes/tarif-fixe/${t.produitCode}/${encodeURIComponent(t.libelleVariante)}`, {
        prime: Number(f.prime),
        primeHT: f.primeHT === "" ? null : Number(f.primeHT),
        fg: f.fg === "" ? null : Number(f.fg),
        taxes: f.taxes === "" ? null : Number(f.taxes),
        capitalGaranti: Number(f.capital),
        commission: Number(f.comm) / 100,
      });
      notify(`${LIBELLE_PRODUIT[t.produitCode] ?? t.produitCode} / ${t.libelleVariante} — enregistré ✓`);
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{LIBELLE_PRODUIT[t.produitCode] ?? t.produitCode}</td>
      <td><strong>{t.libelleVariante}</strong></td>
      <td><Num value={f.prime} onChange={(v) => setF({ ...f, prime: v })} width={100} /></td>
      <td><Num value={f.primeHT} onChange={(v) => setF({ ...f, primeHT: v })} width={100} /></td>
      <td><Num value={f.fg} onChange={(v) => setF({ ...f, fg: v })} width={90} /></td>
      <td><Num value={f.taxes} onChange={(v) => setF({ ...f, taxes: v })} width={90} /></td>
      <td><Num value={f.capital} onChange={(v) => setF({ ...f, capital: v })} width={120} /></td>
      <td><Num value={f.comm} onChange={(v) => setF({ ...f, comm: v })} step="0.5" width={80} /></td>
      <td>
        <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving || !dirty} onClick={save}>
          <Save size={15} />
        </button>
      </td>
    </tr>
  );
}

export default function OngletBaremes({ imfId, notify }: { imfId: string; notify: (m: string) => void }) {
  const { data, loading, error, reload } = useFetch<ImfBaremes>(`/imf-partenaires/${imfId}/baremes`);

  if (loading) return <Loader />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <p className="muted" style={{ margin: 0 }}>
        Barèmes et tarifs propres à cette IMF, initialisés depuis les valeurs en vigueur. Les taux sont saisis en
        pourcentage (le taux incendie SECURPRO en ‰). Le moteur de tarification les appliquera à la mise en place des
        écrans de souscription (phase 3).
      </p>

      <Card title="SECURPRO — barème par classe de risque" noBody>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Limite de capitaux (FCFA)</th>
                <th>Taux incendie (‰)</th>
                <th>Commission (%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.securpro.map((b) => (
                <SecurproRow key={b.classe} b={b} imfId={imfId} notify={notify} reload={reload} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="SECURSTOCK — barème par classe de risque" noBody>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Limite de capitaux (FCFA)</th>
                <th>T1 — dommage électrique (%)</th>
                <th>T2 — autre cause (%)</th>
                <th>Commission (%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.securstock.map((b) => (
                <SecurstockRow key={b.classe} b={b} imfId={imfId} notify={notify} reload={reload} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="SECURECOLTE — paliers de sécheresse (indice ARC)" noBody>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Palier</th>
                <th>Seuil de l'indice (%)</th>
                <th>Indemnité par hectare (FCFA)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.securecolte.map((p) => (
                <PalierRow key={p.seuil} p={p} imfId={imfId} notify={notify} reload={reload} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Tarifs fixes — Coups Durs & SECURECOLTE" noBody>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Variante</th>
                <th>Prime TTC</th>
                <th>Prime HT</th>
                <th>Frais gestion</th>
                <th>Taxes</th>
                <th>Capital garanti</th>
                <th>Commission (%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.tarifsFixes.map((t) => (
                <TarifFixeRow key={`${t.produitCode}:${t.libelleVariante}`} t={t} imfId={imfId} notify={notify} reload={reload} />
              ))}
              {data.tarifsFixes.length === 0 && (
                <tr><td colSpan={9}><div className="empty">Aucun tarif fixe.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12, padding: "10px 16px 4px" }}>
          Montants en FCFA. Prime HT / frais de gestion / taxes sont facultatifs (laisser vide = non ventilé).
        </div>
      </Card>
    </div>
  );
}
