import { useEffect, useMemo, useState } from "react";
import { Save, Check } from "lucide-react";
import { Card, Loader, ErrorBox } from "../../../../components/ui";
import { useFetch } from "../../../../useFetch";
import { api } from "../../../../api";
import type { ImfProduitConfig } from "../../../../types";

type Draft = {
  actif: boolean;
  plafond: string; // vide = null
  garanties: { code: string; libelle: string; actif: boolean; plafond: string }[];
};

function toDraft(p: ImfProduitConfig): Draft {
  return {
    actif: p.actif,
    plafond: p.plafond != null ? String(p.plafond) : "",
    garanties: p.garanties.map((g) => ({
      code: g.code,
      libelle: g.libelle,
      actif: g.actif,
      plafond: g.plafond != null ? String(g.plafond) : "",
    })),
  };
}

function memeValeur(a: Draft, p: ImfProduitConfig): boolean {
  if (a.actif !== p.actif) return false;
  if ((a.plafond === "" ? null : Number(a.plafond)) !== p.plafond) return false;
  return a.garanties.every((g, i) => {
    const ref = p.garanties[i];
    return ref && g.actif === ref.actif && (g.plafond === "" ? null : Number(g.plafond)) === ref.plafond;
  });
}

function ProduitCard({
  produit,
  imfId,
  notify,
  reload,
}: {
  produit: ImfProduitConfig;
  imfId: string;
  notify: (m: string) => void;
  reload: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(produit));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(toDraft(produit)), [produit]);

  const dirty = !memeValeur(draft, produit);

  function setGarantie(i: number, patch: Partial<{ actif: boolean; plafond: string }>) {
    setDraft((d) => ({
      ...d,
      garanties: d.garanties.map((g, j) => (i === j ? { ...g, ...patch } : g)),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        actif: draft.actif,
        plafond: draft.plafond === "" ? null : Number(draft.plafond),
        garanties: draft.garanties.map((g) => ({
          code: g.code,
          actif: g.actif,
          plafond: g.plafond === "" ? null : Number(g.plafond),
        })),
      };
      await api.patch(`/imf-partenaires/${imfId}/produits/${produit.code}`, body);
      notify(`${produit.libelle} — enregistré ✓`);
      reload();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={produit.libelle}
      extra={
        <span className={`badge ${produit.aFormule ? "info" : "neutral"}`}>
          {produit.aFormule ? "Tarif à formule" : "Prix fixe"}
        </span>
      }
      style={{ marginBottom: 18 }}
    >
      <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", marginBottom: 14 }}>
        <input type="checkbox" checked={draft.actif} onChange={(e) => setDraft((d) => ({ ...d, actif: e.target.checked }))} />
        <span style={{ fontWeight: 600 }}>Produit proposé par cette IMF</span>
      </label>

      <div className="field" style={{ maxWidth: 260 }}>
        <label className="label">Plafond de capital (FCFA)</label>
        <input
          className="input"
          type="number"
          min={0}
          placeholder="Barème par défaut"
          value={draft.plafond}
          onChange={(e) => setDraft((d) => ({ ...d, plafond: e.target.value }))}
          disabled={!draft.actif}
        />
      </div>

      <div className="table-wrap" style={{ marginTop: 6, opacity: draft.actif ? 1 : 0.55 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Garantie</th>
              <th style={{ width: 90 }}>Activée</th>
              <th style={{ width: 200 }}>Plafond (FCFA)</th>
            </tr>
          </thead>
          <tbody>
            {draft.garanties.map((g, i) => (
              <tr key={g.code}>
                <td>{g.libelle}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={g.actif}
                    disabled={!draft.actif}
                    onChange={(e) => setGarantie(i, { actif: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    placeholder="—"
                    value={g.plafond}
                    disabled={!draft.actif || !g.actif}
                    onChange={(e) => setGarantie(i, { plafond: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {dirty ? <Save size={16} /> : <Check size={16} />} {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "À jour"}
        </button>
      </div>
    </Card>
  );
}

export default function OngletProduits({ imfId, notify }: { imfId: string; notify: (m: string) => void }) {
  const { data, loading, error, reload } = useFetch<ImfProduitConfig[]>(`/imf-partenaires/${imfId}/produits`);
  const actifs = useMemo(() => (data ?? []).filter((p) => p.actif).length, [data]);

  if (loading) return <Loader />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        {actifs} produit{actifs > 1 ? "s" : ""} proposé{actifs > 1 ? "s" : ""} sur {data.length}. Désactivez un produit
        ou une garantie, ou plafonnez un capital, spécifiquement pour cette IMF. Le moteur de tarification appliquera
        ces réglages à la mise en place des écrans de souscription (phase 3).
      </p>
      {data.map((p) => (
        <ProduitCard key={p.code} produit={p} imfId={imfId} notify={notify} reload={reload} />
      ))}
    </>
  );
}
