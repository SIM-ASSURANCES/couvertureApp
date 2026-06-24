import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { PageHeader, Card, Loader, fcfa } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { useAuth } from "../../auth";

interface Tarif {
  id: number;
  prime: number;
  primeHT: number | null;
  fg: number | null;
  taxes: number | null;
  capitalGaranti: number;
  commission: number;
}

interface TarifForm {
  prime: string;
  primeHT: string;
  fg: string;
  taxes: string;
  capitalGaranti: string;
  commission: string;
}

const emptyTarifForm: TarifForm = { prime: "", primeHT: "", fg: "", taxes: "", capitalGaranti: "", commission: "" };

function TarifTable({
  title,
  produit,
  tarifs,
  isSuper,
  onReload,
  onToast,
}: {
  title: string;
  produit: "accident" | "incendie";
  tarifs: Tarif[];
  isSuper: boolean;
  onReload: () => void;
  onToast: (m: string) => void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TarifForm>(emptyTarifForm);
  const [addForm, setAddForm] = useState<TarifForm>(emptyTarifForm);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  function startEdit(t: Tarif) {
    setEditId(t.id);
    setEditForm({
      prime: String(t.prime),
      primeHT: t.primeHT != null ? String(t.primeHT) : "",
      fg: t.fg != null ? String(t.fg) : "",
      taxes: t.taxes != null ? String(t.taxes) : "",
      capitalGaranti: String(t.capitalGaranti),
      commission: String(t.commission),
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm(emptyTarifForm);
  }

  async function saveEdit(id: number) {
    setSaving(true);
    try {
      await api.patch(`/parametres/tarifs/${produit}/${id}`, {
        prime: Number(editForm.prime),
        primeHT: editForm.primeHT !== "" ? Number(editForm.primeHT) : null,
        fg: editForm.fg !== "" ? Number(editForm.fg) : null,
        taxes: editForm.taxes !== "" ? Number(editForm.taxes) : null,
        capitalGaranti: Number(editForm.capitalGaranti),
        commission: Number(editForm.commission),
      });
      onToast("Tarif mis à jour ✓");
      setEditId(null);
      onReload();
    } catch (e) { onToast((e as Error).message); }
    finally { setSaving(false); }
  }

  async function deleteTarif(id: number) {
    if (!confirm("Supprimer ce tarif ?")) return;
    try {
      await api.del(`/parametres/tarifs/${produit}/${id}`);
      onToast("Tarif supprimé ✓");
      onReload();
    } catch (e) { onToast((e as Error).message); }
  }

  async function addTarif() {
    setSaving(true);
    try {
      await api.post(`/parametres/tarifs/${produit}`, {
        prime: Number(addForm.prime),
        primeHT: addForm.primeHT !== "" ? Number(addForm.primeHT) : null,
        fg: addForm.fg !== "" ? Number(addForm.fg) : null,
        taxes: addForm.taxes !== "" ? Number(addForm.taxes) : null,
        capitalGaranti: Number(addForm.capitalGaranti),
        commission: Number(addForm.commission),
      });
      onToast("Tarif ajouté ✓");
      setAdding(false);
      setAddForm(emptyTarifForm);
      onReload();
    } catch (e) { onToast((e as Error).message); }
    finally { setSaving(false); }
  }

  const inputSm: React.CSSProperties = {
    height: 34, borderRadius: 8, border: "1px solid var(--border-strong)",
    padding: "0 8px", fontSize: 13, fontFamily: "inherit", width: "100%",
    outline: "none", color: "var(--text)",
  };

  return (
    <Card
      title={title}
      extra={
        isSuper ? (
          <button className="btn btn-primary" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => { setAdding(true); setEditId(null); }}>
            <Plus size={14} /> Ajouter
          </button>
        ) : undefined
      }
      noBody
    >
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Prime TTC (FCFA)</th>
              <th>Prime HT (FCFA)</th>
              <th>FG (FCFA)</th>
              <th>Taxes (FCFA)</th>
              <th>Capital garanti</th>
              <th>Commission</th>
              {isSuper && <th style={{ width: 90 }}></th>}
            </tr>
          </thead>
          <tbody>
            {tarifs.map((t) =>
              editId === t.id ? (
                <tr key={t.id} style={{ background: "var(--sim-primary-50)" }}>
                  <td><input style={inputSm} type="number" value={editForm.prime} onChange={(e) => setEditForm({ ...editForm, prime: e.target.value })} /></td>
                  <td><input style={inputSm} type="number" step="0.01" placeholder="—" value={editForm.primeHT} onChange={(e) => setEditForm({ ...editForm, primeHT: e.target.value })} /></td>
                  <td><input style={inputSm} type="number" step="0.01" placeholder="—" value={editForm.fg} onChange={(e) => setEditForm({ ...editForm, fg: e.target.value })} /></td>
                  <td><input style={inputSm} type="number" step="0.01" placeholder="—" value={editForm.taxes} onChange={(e) => setEditForm({ ...editForm, taxes: e.target.value })} /></td>
                  <td><input style={inputSm} type="number" value={editForm.capitalGaranti} onChange={(e) => setEditForm({ ...editForm, capitalGaranti: e.target.value })} /></td>
                  <td><input style={inputSm} type="number" step="0.01" value={editForm.commission} onChange={(e) => setEditForm({ ...editForm, commission: e.target.value })} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-primary" style={{ padding: "5px 10px" }} disabled={saving} onClick={() => saveEdit(t.id)}><Check size={14} /></button>
                      <button className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={cancelEdit}><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td><strong>{fcfa(t.prime)}</strong></td>
                  <td className="muted">{t.primeHT != null ? t.primeHT.toFixed(2) + " FCFA" : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                  <td className="muted">{t.fg != null ? t.fg.toFixed(2) + " FCFA" : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                  <td className="muted">{t.taxes != null ? t.taxes.toFixed(2) + " FCFA" : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                  <td>{fcfa(t.capitalGaranti)}</td>
                  <td className="muted">{t.commission.toFixed(2)} FCFA</td>
                  {isSuper && (
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: "5px 8px" }} title="Modifier" onClick={() => startEdit(t)}><Pencil size={13} /></button>
                        <button className="btn btn-danger-soft" style={{ padding: "5px 8px" }} title="Supprimer" onClick={() => deleteTarif(t.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            )}

            {/* Ligne d'ajout */}
            {adding && isSuper && (
              <tr style={{ background: "var(--success-50)" }}>
                <td><input style={inputSm} type="number" placeholder="ex: 1500" value={addForm.prime} onChange={(e) => setAddForm({ ...addForm, prime: e.target.value })} /></td>
                <td><input style={inputSm} type="number" step="0.01" placeholder="optionnel" value={addForm.primeHT} onChange={(e) => setAddForm({ ...addForm, primeHT: e.target.value })} /></td>
                <td><input style={inputSm} type="number" step="0.01" placeholder="optionnel" value={addForm.fg} onChange={(e) => setAddForm({ ...addForm, fg: e.target.value })} /></td>
                <td><input style={inputSm} type="number" step="0.01" placeholder="optionnel" value={addForm.taxes} onChange={(e) => setAddForm({ ...addForm, taxes: e.target.value })} /></td>
                <td><input style={inputSm} type="number" placeholder="ex: 750000" value={addForm.capitalGaranti} onChange={(e) => setAddForm({ ...addForm, capitalGaranti: e.target.value })} /></td>
                <td><input style={inputSm} type="number" step="0.01" placeholder="ex: 266.67" value={addForm.commission} onChange={(e) => setAddForm({ ...addForm, commission: e.target.value })} /></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-primary" style={{ padding: "5px 10px" }} disabled={saving || !addForm.prime || !addForm.capitalGaranti || !addForm.commission} onClick={addTarif}><Check size={14} /></button>
                    <button className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => { setAdding(false); setAddForm(emptyTarifForm); }}><X size={14} /></button>
                  </div>
                </td>
              </tr>
            )}

            {tarifs.length === 0 && !adding && (
              <tr><td colSpan={isSuper ? 7 : 6}><div className="empty">Aucun tarif configuré.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Parametres() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";

  const { data: tarifsAcc, reload: reloadAcc } = useFetch<Tarif[]>("/parametres/tarifs/accident");
  const { data: tarifsInc, reload: reloadInc } = useFetch<Tarif[]>("/parametres/tarifs/incendie");

  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle="Barèmes de tarification des produits d'assurance."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24, maxWidth: 860 }}>

        {/* ── Tarification Accident ── */}
        {tarifsAcc ? (
          <TarifTable
            title="Barème Assurance Accident"
            produit="accident"
            tarifs={tarifsAcc}
            isSuper={isSuper}
            onReload={reloadAcc}
            onToast={notify}
          />
        ) : <Loader />}

        {/* ── Tarification Incendie ── */}
        {tarifsInc ? (
          <TarifTable
            title="Barème Assurance Incendie"
            produit="incendie"
            tarifs={tarifsInc}
            isSuper={isSuper}
            onReload={reloadInc}
            onToast={notify}
          />
        ) : <Loader />}

        {!isSuper && (
          <p className="muted" style={{ fontSize: 13 }}>
            Seul le Super Administrateur peut modifier les barèmes de tarification.
          </p>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
