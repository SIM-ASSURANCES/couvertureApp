import { useState } from "react";
import { Copy, Trash2, Send, Pencil, X, RefreshCw } from "lucide-react";
import { agentDistApi } from "../../agentDistributionAuth";
import { fcfa, fmtDate } from "../../components/ui";
import { useAgentDistCotations } from "./useAgentDistCotations";
import {
  type ProduitCotation,
  type Cotation,
  PRODUITS_COTATION,
  entreesParDefaut,
  nettoyerEntrees,
  Field,
  statutBadgeCotation,
  ChampsProduitCotation,
} from "../../cotationsCommun";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  marginBottom: 20,
};

/** Onglet "Mes devis" de l'espace agent de distribution — mêmes champs de tarification que l'espace partenaire (voir cotationsCommun.tsx), scopé à cet agent uniquement (/agent-distribution/cotations). */
export default function AgentDistributionCotations({ notify }: { notify: (m: string) => void }) {
  const { data, loading, reload } = useAgentDistCotations();
  const [editId, setEditId] = useState<string | null>(null);
  const [produitCode, setProduitCode] = useState<ProduitCotation>("relaxaccidents");
  const [entrees, setEntrees] = useState<Record<string, unknown>>(entreesParDefaut("relaxaccidents"));
  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [saving, setSaving] = useState(false);
  const [copieId, setCopieId] = useState<string | null>(null);

  function changerProduit(p: ProduitCotation) {
    setProduitCode(p);
    setEntrees(entreesParDefaut(p));
  }

  function ouvrirEdition(c: Cotation) {
    setEditId(c.id);
    setProduitCode(c.produitCode as ProduitCotation);
    setEntrees({ ...entreesParDefaut(c.produitCode as ProduitCotation), ...c.entrees });
    setClientNom(c.clientNom ?? "");
    setClientTelephone(c.clientTelephone ?? "");
  }

  function annulerEdition() {
    setEditId(null);
    changerProduit("relaxaccidents");
    setClientNom("");
    setClientTelephone("");
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        produitCode,
        entrees: nettoyerEntrees(produitCode, entrees),
        clientNom: clientNom || undefined,
        clientTelephone: clientTelephone || undefined,
      };
      if (editId) {
        await agentDistApi.patch(`/cotations/${editId}`, payload);
        notify("Devis mis à jour ✓");
      } else {
        await agentDistApi.post("/cotations", payload);
        notify("Devis enregistré ✓");
      }
      annulerEdition();
      reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function partager(c: Cotation) {
    try {
      const r = await agentDistApi.post<Cotation>(`/cotations/${c.id}/partager`);
      if (r.lien) {
        await navigator.clipboard.writeText(r.lien).catch(() => null);
        setCopieId(c.id);
        setTimeout(() => setCopieId(null), 2000);
      }
      notify("Lien généré et copié ✓ (valable 7 jours)");
      reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function copierLien(c: Cotation) {
    if (!c.lien) return;
    await navigator.clipboard.writeText(c.lien).catch(() => null);
    setCopieId(c.id);
    setTimeout(() => setCopieId(null), 2000);
  }

  async function supprimer(c: Cotation) {
    if (!confirm("Supprimer ce devis ?")) return;
    try {
      await agentDistApi.del(`/cotations/${c.id}`);
      notify("Devis supprimé");
      reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{editId ? "Modifier le devis" : "Nouveau devis"}</div>
        <form onSubmit={enregistrer}>
          {!editId && (
            <Field label="Produit">
              <select className="select" value={produitCode} onChange={(e) => changerProduit(e.target.value as ProduitCotation)}>
                {PRODUITS_COTATION.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.libelle}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <ChampsProduitCotation produitCode={produitCode} entrees={entrees} setChamp={(cle, v) => setEntrees((e) => ({ ...e, [cle]: v }))} />
          <div style={{ fontWeight: 700, fontSize: 13, margin: "14px 0 8px" }}>Pour retrouver ce devis (facultatif)</div>
          <Field label="Nom du client">
            <input className="input" value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="Ex. Koffi Yao" />
          </Field>
          <Field label="Téléphone du client">
            <input className="input" value={clientTelephone} onChange={(e) => setClientTelephone(e.target.value)} placeholder="Ex. 07 00 00 00 00" />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 18px", background: "#004b9c", color: "#fff", border: "none",
                borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Calcul…" : editId ? "Mettre à jour" : "Calculer le devis"}
            </button>
            {editId && (
              <button
                type="button"
                onClick={annulerEdition}
                style={{ padding: "10px 18px", background: "#f5f8fc", color: "#5b6b80", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                <X size={14} style={{ verticalAlign: -2 }} /> Annuler
              </button>
            )}
          </div>
        </form>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Mes devis ({data?.length ?? 0})</div>
        {loading && <div style={{ textAlign: "center", padding: 20, color: "#5b6b80" }}>Chargement…</div>}
        {data && data.length === 0 && <div style={{ color: "#5b6b80", fontSize: 13, textAlign: "center", padding: "12px 0" }}>Aucun devis pour l'instant.</div>}
        {data && data.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.map((c) => (
              <div key={c.id} style={{ background: "#f5f8fc", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.libelleProduit}</div>
                    <div style={{ fontSize: 12, color: "#5b6b80", marginTop: 2 }}>{c.libelleFormule}</div>
                  </div>
                  {statutBadgeCotation(c)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{fcfa(c.primeTTC)}</div>
                  <div style={{ fontSize: 11, color: "#5b6b80" }}>{fmtDate(c.createdAt)}</div>
                </div>
                {(c.clientNom || c.clientTelephone) && (
                  <div style={{ fontSize: 12, color: "#5b6b80", marginTop: 4 }}>
                    {c.clientNom} {c.clientTelephone ? `· ${c.clientTelephone}` : ""}
                  </div>
                )}
                {c.statut === "envoye" && c.dateExpiration && (
                  <div style={{ fontSize: 11, color: "#5b6b80", marginTop: 4 }}>Valable jusqu'au {fmtDate(c.dateExpiration)}</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {c.statut !== "converti" && (
                    <button type="button" onClick={() => ouvrirEdition(c)} style={btnGhost}>
                      <Pencil size={12} style={{ verticalAlign: -2 }} /> Modifier
                    </button>
                  )}
                  {c.statut === "brouillon" && (
                    <button type="button" onClick={() => partager(c)} style={btnPrimary}>
                      <Send size={12} style={{ verticalAlign: -2 }} /> Partager
                    </button>
                  )}
                  {(c.statut === "envoye" || c.statut === "expire") && c.lien && (
                    <>
                      <button type="button" onClick={() => copierLien(c)} style={btnGhost}>
                        <Copy size={12} style={{ verticalAlign: -2 }} /> {copieId === c.id ? "Copié ✓" : "Copier le lien"}
                      </button>
                      <button type="button" onClick={() => partager(c)} style={btnGhost}>
                        <RefreshCw size={12} style={{ verticalAlign: -2 }} /> Renouveler
                      </button>
                    </>
                  )}
                  {c.statut !== "converti" && (
                    <button type="button" onClick={() => supprimer(c)} style={btnDanger}>
                      <Trash2 size={12} style={{ verticalAlign: -2 }} /> Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const btnGhost: React.CSSProperties = { padding: "6px 10px", background: "#fff", border: "1px solid #dde3ec", color: "#5b6b80", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: "6px 10px", background: "#004b9c", border: "none", color: "#fff", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "6px 10px", background: "#fde8e8", border: "none", color: "#dc2626", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
