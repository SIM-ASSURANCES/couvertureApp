import { useEffect, useState } from "react";
import { Save, RotateCcw, Eye } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fmtDate } from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api, ApiError } from "../../api";

interface JeuCG {
  cle: string;
  libelle: string;
  contenuHtml: string;
  /** false = le contrat sert encore le texte livré avec l'application. */
  personnalise: boolean;
  updatedAt: string | null;
}

/**
 * Édition des Conditions Générales insérées dans les contrats PDF. Tant qu'un
 * jeu n'est pas personnalisé, le contrat continue de servir le texte livré
 * avec l'application ; vider le champ puis enregistrer permet d'y revenir.
 */
export default function ConditionsGenerales() {
  const { data, loading, error, reload } = useFetch<JeuCG[]>("/parametres/conditions-generales");
  const [cleActive, setCleActive] = useState<string | null>(null);
  const [contenu, setContenu] = useState("");
  const [apercu, setApercu] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [toast, setToast] = useState("");

  const jeu = data?.find((j) => j.cle === cleActive) ?? null;

  // Sélectionne le premier jeu au chargement, et recharge le texte à chaque
  // changement d'onglet (ou après un enregistrement, `data` étant rafraîchi).
  useEffect(() => {
    if (!data) return;
    const cible = data.find((j) => j.cle === cleActive) ?? data[0];
    if (!cible) return;
    setCleActive(cible.cle);
    setContenu(cible.contenuHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cleActive]);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function enregistrer() {
    if (!cleActive) return;
    setEnregistrement(true);
    try {
      await api.put(`/parametres/conditions-generales/${cleActive}`, { contenuHtml: contenu });
      notify(contenu.trim() ? "Conditions Générales enregistrées ✓" : "Texte d'origine rétabli ✓");
      reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setEnregistrement(false);
    }
  }

  function reinitialiser() {
    if (!confirm("Revenir au texte livré avec l'application pour ces Conditions Générales ?")) return;
    setContenu("");
  }

  return (
    <>
      <PageHeader
        title="Conditions Générales"
        subtitle="Texte inséré à la fin de chaque contrat PDF, après les conditions particulières."
      />

      <Card style={{ marginTop: 24 }} noBody>
        {loading && <Loader />}
        {error && <div style={{ padding: 20 }}><ErrorBox message={error} /></div>}
        {data && (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              {data.map((j) => (
                <button
                  key={j.cle}
                  className={j.cle === cleActive ? "btn btn-primary" : "btn btn-ghost"}
                  style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => {
                    setCleActive(j.cle);
                    setContenu(j.contenuHtml);
                    setApercu(false);
                  }}
                >
                  {j.libelle}
                </button>
              ))}
            </div>

            {jeu && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  {jeu.personnalise ? (
                    <Badge kind="success">Texte personnalisé</Badge>
                  ) : (
                    <Badge kind="neutral">Texte d'origine</Badge>
                  )}
                  {jeu.updatedAt && (
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      Modifié le {fmtDate(jeu.updatedAt)}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "6px 12px", fontSize: 12.5, marginLeft: "auto" }}
                    onClick={() => setApercu((v) => !v)}
                  >
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
                    // Contenu saisi par un super-administrateur, affiché tel
                    // qu'il apparaîtra dans le PDF — c'est tout l'intérêt de
                    // l'aperçu.
                    dangerouslySetInnerHTML={{ __html: contenu || "<p class='muted'>Aucun texte personnalisé : le contrat utilise le texte livré avec l'application.</p>" }}
                  />
                ) : (
                  <textarea
                    className="input"
                    value={contenu}
                    onChange={(e) => setContenu(e.target.value)}
                    placeholder="Collez ici le texte des Conditions Générales (HTML accepté : &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;…). Laissez vide pour utiliser le texte livré avec l'application."
                    style={{
                      width: "100%",
                      height: "55vh",
                      padding: 14,
                      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      resize: "vertical",
                    }}
                  />
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" disabled={enregistrement} onClick={enregistrer}>
                    <Save size={15} /> {enregistrement ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  {jeu.personnalise && (
                    <button className="btn btn-ghost" disabled={enregistrement} onClick={reinitialiser}>
                      <RotateCcw size={15} /> Revenir au texte d'origine
                    </button>
                  )}
                </div>

                <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                  Les contrats déjà téléchargés ne changent pas : le texte n'est inséré qu'au moment
                  où un contrat est généré.
                </p>
              </>
            )}
          </div>
        )}
      </Card>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
