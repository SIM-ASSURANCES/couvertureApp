import { useEffect, useState } from "react";
import { Save, RotateCcw, Eye } from "lucide-react";
import { Loader, ErrorBox, Badge, fmtDate } from "../../../../components/ui";
import { useFetch } from "../../../../useFetch";
import { api, ApiError } from "../../../../api";
import type { ImfDocumentModeleView } from "../../../../types";

/**
 * Documents propres à une IMF (Conditions Générales, notice, mentions
 * d'attestation). Tant qu'un document n'est pas personnalisé, le rendu
 * retombera sur celui de la branche (câblage phase 3) ; vider le champ puis
 * enregistrer permet d'y revenir.
 */
export default function OngletDocuments({ imfId, notify }: { imfId: string; notify: (m: string) => void }) {
  const { data, loading, error, reload } = useFetch<ImfDocumentModeleView[]>(`/imf-partenaires/${imfId}/documents`);
  const [cleActive, setCleActive] = useState<string | null>(null);
  const [contenu, setContenu] = useState("");
  const [apercu, setApercu] = useState(false);
  const [saving, setSaving] = useState(false);

  const doc = data?.find((d) => d.cle === cleActive) ?? null;

  useEffect(() => {
    if (!data) return;
    const cible = data.find((d) => d.cle === cleActive) ?? data[0];
    if (!cible) return;
    setCleActive(cible.cle);
    setContenu(cible.contenuHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function enregistrer() {
    if (!cleActive) return;
    setSaving(true);
    try {
      await api.put(`/imf-partenaires/${imfId}/documents/${cleActive}`, { contenuHtml: contenu });
      notify(contenu.trim() ? "Document enregistré ✓" : "Retour au document de la branche ✓");
      reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  function reinitialiser() {
    if (!confirm("Revenir au document de la branche pour ce modèle ?")) return;
    setContenu("");
  }

  if (loading) return <Loader />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {data.map((d) => (
          <button
            key={d.cle}
            className={d.cle === cleActive ? "btn btn-primary" : "btn btn-ghost"}
            style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => {
              setCleActive(d.cle);
              setContenu(d.contenuHtml);
              setApercu(false);
            }}
          >
            {d.libelle}
          </button>
        ))}
      </div>

      {doc && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            {doc.personnalise ? <Badge kind="success">Personnalisé pour cette IMF</Badge> : <Badge kind="neutral">Document de la branche</Badge>}
            {doc.updatedAt && <span className="muted" style={{ fontSize: 12.5 }}>Modifié le {fmtDate(doc.updatedAt)}</span>}
            <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5, marginLeft: "auto" }} onClick={() => setApercu((v) => !v)}>
              <Eye size={14} /> {apercu ? "Modifier le texte" : "Aperçu"}
            </button>
          </div>

          {apercu ? (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 20,
                maxHeight: "55vh",
                overflowY: "auto",
                background: "#fff",
                fontSize: 13,
                lineHeight: 1.55,
              }}
              dangerouslySetInnerHTML={{
                __html: contenu || "<p class='muted'>Aucun texte personnalisé : le rendu utilisera le document de la branche.</p>",
              }}
            />
          ) : (
            <textarea
              className="input"
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              placeholder="Collez ici le contenu du document (HTML accepté : <h3>, <p>, <ul>…). Laissez vide pour utiliser le document de la branche."
              style={{
                width: "100%",
                height: "50vh",
                padding: 14,
                fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                fontSize: 12.5,
                lineHeight: 1.5,
                resize: "vertical",
              }}
            />
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={saving} onClick={enregistrer}>
              <Save size={15} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {doc.personnalise && (
              <button className="btn btn-ghost" disabled={saving} onClick={reinitialiser}>
                <RotateCcw size={15} /> Revenir au document de la branche
              </button>
            )}
          </div>

          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Les contrats déjà générés ne changent pas : le contenu n'est inséré qu'au moment où un document est produit.
          </p>
        </>
      )}
    </div>
  );
}
