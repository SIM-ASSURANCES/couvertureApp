import { useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox } from "../../../components/ui";
import { useFetch } from "../../../useFetch";
import { api } from "../../../api";

interface TarifProduit {
  id: number;
  libelleVariante: string | null;
  prime: number;
  primeHT: number | null;
  fg: number | null;
  taxes: number | null;
  capitalGaranti: number;
  commission: number;
}

// Valeurs de formulaire : les champs facultatifs (primeHT/fg/taxes) sont
// gardés en string pour distinguer "vide" (-> null à l'enregistrement) de 0.
interface TarifFormValues {
  libelleVariante: string;
  prime: string;
  primeHT: string;
  fg: string;
  taxes: string;
  capitalGaranti: string;
  commission: string;
}

function versFormValues(t: TarifProduit): TarifFormValues {
  return {
    libelleVariante: t.libelleVariante ?? "",
    prime: String(t.prime),
    primeHT: t.primeHT != null ? String(t.primeHT) : "",
    fg: t.fg != null ? String(t.fg) : "",
    taxes: t.taxes != null ? String(t.taxes) : "",
    capitalGaranti: String(t.capitalGaranti),
    commission: String(t.commission),
  };
}

const formeVide: TarifFormValues = {
  libelleVariante: "",
  prime: "",
  primeHT: "",
  fg: "",
  taxes: "",
  capitalGaranti: "",
  commission: "0",
};

/** Convertit les valeurs de formulaire en payload pour l'API (nombres, null si vide). */
function versPayload(v: TarifFormValues) {
  const nb = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    libelleVariante: v.libelleVariante.trim() || null,
    prime: Number(v.prime),
    primeHT: nb(v.primeHT),
    fg: nb(v.fg),
    taxes: nb(v.taxes),
    capitalGaranti: Number(v.capitalGaranti),
    commission: Number(v.commission),
  };
}

const cellInputStyle: React.CSSProperties = { width: 110 };

function TarifRow({
  tarif,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  tarif: TarifProduit;
  saving: boolean;
  deleting: boolean;
  onSave: (payload: ReturnType<typeof versPayload>) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<TarifFormValues>(versFormValues(tarif));
  const set = (champ: keyof TarifFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [champ]: e.target.value }));

  return (
    <tr>
      <td><input className="input" style={cellInputStyle} value={form.libelleVariante} onChange={set("libelleVariante")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.prime} onChange={set("prime")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.primeHT} onChange={set("primeHT")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.fg} onChange={set("fg")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.taxes} onChange={set("taxes")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.capitalGaranti} onChange={set("capitalGaranti")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.commission} onChange={set("commission")} /></td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving || deleting} onClick={() => onSave(versPayload(form))} title="Enregistrer">
            <Save size={15} />
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={saving || deleting} onClick={onDelete} title="Supprimer cette formule">
            <Trash2 size={15} color="var(--danger)" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AjouterFormuleRow({ adding, onAdd }: { adding: boolean; onAdd: (payload: ReturnType<typeof versPayload>) => void }) {
  const [form, setForm] = useState<TarifFormValues>(formeVide);
  const set = (champ: keyof TarifFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [champ]: e.target.value }));
  const valide = form.libelleVariante.trim() !== "" && form.prime.trim() !== "" && form.capitalGaranti.trim() !== "";

  return (
    <tr style={{ background: "var(--bg-2)" }}>
      <td><input className="input" style={cellInputStyle} placeholder="Ex. 1500" value={form.libelleVariante} onChange={set("libelleVariante")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.prime} onChange={set("prime")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.primeHT} onChange={set("primeHT")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.fg} onChange={set("fg")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.taxes} onChange={set("taxes")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.capitalGaranti} onChange={set("capitalGaranti")} /></td>
      <td><input className="input" style={cellInputStyle} type="number" min={0} value={form.commission} onChange={set("commission")} /></td>
      <td>
        <button
          className="btn btn-primary"
          style={{ padding: "7px 10px" }}
          disabled={!valide || adding}
          onClick={() => {
            onAdd(versPayload(form));
            setForm(formeVide);
          }}
          title="Ajouter cette formule"
        >
          <Plus size={15} />
        </button>
      </td>
    </tr>
  );
}

function ProduitTarifsTable({ code, libelle }: { code: string; libelle: string }) {
  const { data, loading, error, reload } = useFetch<TarifProduit[]>(`/assurances-accidents/produits/${code}/tarifs`);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function save(id: number, payload: ReturnType<typeof versPayload>) {
    setSaving(id);
    try {
      await api.patch(`/assurances-accidents/tarifs/${id}`, payload);
      notify("Formule mise à jour ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function supprimer(tarif: TarifProduit) {
    if (!confirm(`Supprimer la formule "${tarif.libelleVariante ?? tarif.id}" ?`)) return;
    setDeleting(tarif.id);
    try {
      await api.del(`/assurances-accidents/tarifs/${tarif.id}`);
      notify("Formule supprimée");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  async function ajouter(payload: ReturnType<typeof versPayload>) {
    setAdding(true);
    try {
      await api.post(`/assurances-accidents/produits/${code}/tarifs`, payload);
      notify("Formule ajoutée ✓");
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setAdding(false);
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
              <th>Prime TTC (FCFA)</th>
              <th>Prime HT (FCFA)</th>
              <th>Accessoires (FCFA)</th>
              <th>Taxes (FCFA)</th>
              <th>Capital garanti</th>
              <th>Commission (FCFA)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <TarifRow
                key={t.id}
                tarif={t}
                saving={saving === t.id}
                deleting={deleting === t.id}
                onSave={(payload) => save(t.id, payload)}
                onDelete={() => supprimer(t)}
              />
            ))}
            {data?.length === 0 && (
              <tr><td colSpan={8}><div className="empty">Aucune formule pour ce produit.</div></td></tr>
            )}
            <AjouterFormuleRow adding={adding} onAdd={ajouter} />
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </Card>
  );
}

/**
 * RelaxAccidents générale et SecurHome+ n'ont pas de TarifProduit (prime
 * recalculée à chaque souscription selon la saisie du client) — un taux de
 * commission unique par produit, en %, appliqué sur la prime nette HT.
 */
function CommissionTauxUniqueCard({ code, libelle }: { code: string; libelle: string }) {
  const { data, loading, error, reload } = useFetch<{ code: string; tauxCommission: number }>(
    `/assurances-accidents/produits/${code}/commission`
  );
  const [valeur, setValeur] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const affichee = valeur ?? (data ? String(Math.round(data.tauxCommission * 1000) / 10) : "");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function enregistrer() {
    const pct = Number(affichee);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      notify("Taux invalide (0 à 100%)");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/assurances-accidents/produits/${code}/commission`, { tauxCommission: pct / 100 });
      notify("Commission mise à jour ✓");
      setValeur(null);
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={libelle} style={{ marginBottom: 24 }}>
      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label className="label" style={{ margin: 0 }}>Taux de commission partenaire</label>
          <input
            className="input"
            style={{ width: 100 }}
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={affichee}
            onChange={(e) => setValeur(e.target.value)}
          />
          <span className="muted">%</span>
          <button className="btn btn-primary" style={{ padding: "7px 14px" }} disabled={saving} onClick={enregistrer}>
            <Save size={15} /> Enregistrer
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>Appliqué sur la prime nette HT de chaque devis.</span>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </Card>
  );
}

interface BaremeSecurproCommission {
  classe: number;
  tauxCommission: number;
}

/** SecurPro : un taux de commission par classe de risque (1 à 4). */
function CommissionSecurproTable() {
  const { data, loading, error, reload } = useFetch<BaremeSecurproCommission[]>(
    "/assurances-accidents/baremes/securpro-commission"
  );
  const [valeurs, setValeurs] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function enregistrer(b: BaremeSecurproCommission) {
    const brut = valeurs[b.classe] ?? String(Math.round(b.tauxCommission * 1000) / 10);
    const pct = Number(brut);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      notify("Taux invalide (0 à 100%)");
      return;
    }
    setSaving(b.classe);
    try {
      await api.patch(`/assurances-accidents/baremes/securpro/${b.classe}/commission`, { tauxCommission: pct / 100 });
      notify("Commission mise à jour ✓");
      setValeurs((v) => {
        const { [b.classe]: _omise, ...reste } = v;
        return reste;
      });
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card title="SecurPro — commission par classe de risque" style={{ marginBottom: 24 }}>
      {loading && <Loader />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Classe de risque</th>
                <th>Commission (%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.classe}>
                  <td>Classe {b.classe}</td>
                  <td>
                    <input
                      className="input"
                      style={cellInputStyle}
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={valeurs[b.classe] ?? String(Math.round(b.tauxCommission * 1000) / 10)}
                      onChange={(e) => setValeurs((v) => ({ ...v, [b.classe]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "7px 10px" }}
                      disabled={saving === b.classe}
                      onClick={() => enregistrer(b)}
                      title="Enregistrer"
                    >
                      <Save size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
        Appliqué sur la prime nette HT de chaque devis, selon la classe de risque déduite de la profession/activité.
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
        subtitle="Modifiez une formule existante ou ajoutez-en une nouvelle (ligne grisée en bas de chaque tableau)."
      />
      <div style={{ marginTop: 24 }}>
        <ProduitTarifsTable code="relaxaccidents_fraismedicaux" libelle="RelaxAccidents Frais Médicaux" />
        <ProduitTarifsTable code="relaxmoto" libelle="RelaxMoto" />
        <ProduitTarifsTable code="relaxauto" libelle="RelaxAuto" />
        <ProduitTarifsTable code="relaxvoyage" libelle="RelaxVoyage" />
        <ProduitTarifsTable code="relaxaccidents" libelle="RelaxAccidents générale (formule = classe_statutCNPS, ex. 1_declare)" />

        <h3 style={{ margin: "8px 0 16px" }}>Commission — produits à devis calculé (Assurances Dommages)</h3>
        <CommissionTauxUniqueCard code="securhome_dommages" libelle="SecurHome+" />
        <CommissionSecurproTable />
      </div>
    </>
  );
}
