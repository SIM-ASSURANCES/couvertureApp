import { useState } from "react";
import { Copy, Trash2, Send, Pencil, X, RefreshCw } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, fcfa, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
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

export default function PartenaireCotations() {
  const { data, loading, error, reload } = useFetch<Cotation[]>("/me/cotations");
  const [editId, setEditId] = useState<string | null>(null);
  const [produitCode, setProduitCode] = useState<ProduitCotation>("relaxaccidents");
  const [entrees, setEntrees] = useState<Record<string, unknown>>(entreesParDefaut("relaxaccidents"));
  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [saving, setSaving] = useState(false);
  const [erreurForm, setErreurForm] = useState("");
  const [toast, setToast] = useState("");
  const [copieId, setCopieId] = useState<string | null>(null);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  function changerProduit(p: ProduitCotation) {
    setProduitCode(p);
    setEntrees(entreesParDefaut(p));
    setErreurForm("");
  }

  function ouvrirEdition(c: Cotation) {
    setEditId(c.id);
    setProduitCode(c.produitCode as ProduitCotation);
    setEntrees({ ...entreesParDefaut(c.produitCode as ProduitCotation), ...c.entrees });
    setClientNom(c.clientNom ?? "");
    setClientTelephone(c.clientTelephone ?? "");
    setErreurForm("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setErreurForm("");
    try {
      const payload = {
        produitCode,
        entrees: nettoyerEntrees(produitCode, entrees),
        clientNom: clientNom || undefined,
        clientTelephone: clientTelephone || undefined,
      };
      if (editId) {
        await api.patch(`/me/cotations/${editId}`, payload);
        notify("Devis mis à jour ✓");
      } else {
        await api.post("/me/cotations", payload);
        notify("Devis enregistré ✓");
      }
      annulerEdition();
      reload();
    } catch (err) {
      setErreurForm((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function partager(c: Cotation) {
    try {
      const r = await api.post<Cotation>(`/me/cotations/${c.id}/partager`);
      if (r.lien) {
        await navigator.clipboard.writeText(r.lien).catch(() => null);
        setCopieId(c.id);
        setTimeout(() => setCopieId(null), 2000);
      }
      notify("Lien généré et copié ✓ (valable 7 jours)");
      reload();
    } catch (err) {
      notify((err as Error).message);
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
      await api.del(`/me/cotations/${c.id}`);
      notify("Devis supprimé");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Mes devis"
        subtitle="Préparez un devis (RelaxAccidents, SecurHome, SecurHome+, SecurPro, SecurMoto) et partagez-le à votre client — il n'a plus qu'à payer."
      />

      <div className="grid-2" style={{ marginTop: 24, alignItems: "start" }}>
        <Card title={editId ? "Modifier le devis" : "Nouveau devis"}>
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

            <div style={{ fontWeight: 800, fontSize: 14, margin: "16px 0 8px" }}>Pour retrouver ce devis (facultatif)</div>
            <Field label="Nom du client">
              <input className="input" value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="Ex. Koffi Yao" />
            </Field>
            <Field label="Téléphone du client">
              <input className="input" value={clientTelephone} onChange={(e) => setClientTelephone(e.target.value)} placeholder="Ex. 07 00 00 00 00" />
            </Field>

            {erreurForm && (
              <div style={{ marginBottom: 12 }}>
                <ErrorBox message={erreurForm} />
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Calcul…" : editId ? "Mettre à jour" : "Calculer le devis"}
              </button>
              {editId && (
                <button type="button" className="btn btn-ghost" onClick={annulerEdition}>
                  <X size={15} /> Annuler
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card title={data ? `${data.length} devis` : "Devis"} noBody>
          {loading && <Loader />}
          {error && (
            <div style={{ padding: 20 }}>
              <ErrorBox message={error} />
            </div>
          )}
          {data && data.length === 0 && <div className="empty">Aucun devis pour l'instant.</div>}
          {data && data.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
              {data.map((c) => (
                <div key={c.id} style={{ background: "var(--bg-subtle, #f5f8fc)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.libelleProduit}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {c.libelleFormule}
                      </div>
                    </div>
                    {statutBadgeCotation(c)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{fcfa(c.primeTTC)}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{fmtDate(c.createdAt)}</div>
                  </div>
                  {(c.clientNom || c.clientTelephone) && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                      {c.clientNom} {c.clientTelephone ? `· ${c.clientTelephone}` : ""}
                    </div>
                  )}
                  {c.statut === "envoye" && c.dateExpiration && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                      Valable jusqu'au {fmtDate(c.dateExpiration)}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {c.statut !== "converti" && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => ouvrirEdition(c)}>
                        <Pencil size={13} /> Modifier
                      </button>
                    )}
                    {c.statut === "brouillon" && (
                      <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => partager(c)}>
                        <Send size={13} /> Partager
                      </button>
                    )}
                    {(c.statut === "envoye" || c.statut === "expire") && c.lien && (
                      <>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => copierLien(c)}>
                          <Copy size={13} /> {copieId === c.id ? "Copié ✓" : "Copier le lien"}
                        </button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => partager(c)}>
                          <RefreshCw size={13} /> Renouveler le lien
                        </button>
                      </>
                    )}
                    {c.statut !== "converti" && (
                      <button type="button" className="btn btn-danger-soft" style={{ fontSize: 12 }} onClick={() => supprimer(c)}>
                        <Trash2 size={13} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#0f1b2d", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, zIndex: 50 }}>
          {toast}
        </div>
      )}
    </>
  );
}
