import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { clientApi, clientLogout, getClientUser } from "../../clientAuth";
import PhotoCapture from "../../components/PhotoCapture";
import { telechargerCarte } from "../../carte";
import ReseauSoins from "../../components/ReseauSoins";
import { genererContratDepuisDonnees, type DonneesContrat } from "../../contract";

function fcfa(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

interface Moi {
  id: string;
  nom: string | null;
  prenom: string | null;
  telephone: string;
  produitType: "generique" | "incendie" | "accident";
  carteType: string;
  produitLibelle: string;
  partenaire: string;
  numeroPolice: string | null;
  montantPrime: number;
  capitalGaranti: number;
  cycleFacturation: "annuel" | "mensuel" | null;
  statutAbonnement: "actif" | "suspendu" | "expire" | "resilie" | null;
  dateDebut: string | null;
  dateFin: string | null;
}

interface ProduitDisponible {
  code: string;
  libelle: string;
  montantPrime: number | null;
}

interface Sinistre {
  id: string;
  numeroSinistre: string;
  typeEvenement: string;
  dateSurvenance: string;
  description: string | null;
  statut: "declare" | "en_cours" | "traite" | "rejete";
  createdAt: string;
}

function statutLabel(s: Sinistre["statut"]) {
  if (s === "declare") return "Déclaré";
  if (s === "en_cours") return "En cours de traitement";
  if (s === "traite") return "Traité";
  return "Rejeté";
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  marginBottom: 20,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  border: "1px solid #dde3ec",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  color: "#0f1b2d",
};

export default function ClientDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const renouveleId = searchParams.get("renouvele");

  const [moi, setMoi] = useState<Moi | null>(null);
  const [sinistres, setSinistres] = useState<Sinistre[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState("");
  const [renouvellement, setRenouvellement] = useState(false);
  const [confirmationRenouvellement, setConfirmationRenouvellement] = useState(false);
  const [telechargementCarte, setTelechargementCarte] = useState(false);
  const [telechargementContrat, setTelechargementContrat] = useState(false);
  const [autresProduits, setAutresProduits] = useState<{ qrToken: string | null; produits: ProduitDisponible[] } | null>(null);

  const [afficherFormSinistre, setAfficherFormSinistre] = useState(false);
  const [typeEvenement, setTypeEvenement] = useState("");
  const [dateSurvenance, setDateSurvenance] = useState("");
  const [description, setDescription] = useState("");
  const [photosAccident, setPhotosAccident] = useState<string[]>([]);
  const [envoiSinistre, setEnvoiSinistre] = useState(false);
  const [onglet, setOnglet] = useState<"contrat" | "reseau">("contrat");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function charger() {
    try {
      const [m, s, p] = await Promise.all([
        clientApi.get<Moi>("/moi"),
        clientApi.get<Sinistre[]>("/sinistres"),
        clientApi.get<{ qrToken: string | null; produits: ProduitDisponible[] }>("/produits-disponibles"),
      ]);
      setMoi(m);
      setSinistres(s);
      setAutresProduits(p);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getClientUser()) {
      navigate("/client/connexion");
      return;
    }
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!renouveleId) return;
    const verifier = async () => {
      for (let i = 0; i < 5; i++) {
        try {
          const r = await clientApi.get<{ statut: string }>(`/renouveler/${renouveleId}/verify`);
          if (r.statut === "paye") {
            setConfirmationRenouvellement(true);
            charger();
            return;
          }
          if (r.statut === "echoue") {
            notify("Le paiement de renouvellement a échoué.");
            return;
          }
        } catch {
          /* on réessaie */
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
    };
    verifier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renouveleId]);

  async function renouveler() {
    setRenouvellement(true);
    try {
      const r = await clientApi.post<{ checkoutUrl?: string; sms?: boolean }>("/renouveler");
      if (r.sms) {
        notify("SMS envoyé — rendez-vous en boutique avec une nouvelle réf.facture pour finaliser le renouvellement.");
        setRenouvellement(false);
        return;
      }
      window.location.href = r.checkoutUrl!;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
      setRenouvellement(false);
    }
  }

  async function voirCarte() {
    if (!moi) return;
    setTelechargementCarte(true);
    try {
      await telechargerCarte(moi.carteType, moi.id);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    } finally {
      setTelechargementCarte(false);
    }
  }

  async function telechargerContrat() {
    setTelechargementContrat(true);
    try {
      const c = await clientApi.get<DonneesContrat>("/contrat");
      genererContratDepuisDonnees(c);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    } finally {
      setTelechargementContrat(false);
    }
  }

  async function declarerSinistre(e: React.FormEvent) {
    e.preventDefault();
    setEnvoiSinistre(true);
    try {
      await clientApi.post("/sinistres", {
        typeEvenement,
        dateSurvenance,
        description: description || undefined,
        photosAccidentUrls: photosAccident.length ? photosAccident : undefined,
      });
      notify("Sinistre déclaré ✓");
      setTypeEvenement("");
      setDateSurvenance("");
      setDescription("");
      setPhotosAccident([]);
      setAfficherFormSinistre(false);
      charger();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEnvoiSinistre(false);
    }
  }

  function deconnexion() {
    clientLogout();
    navigate("/client/connexion");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)", padding: "24px 20px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 560, margin: "0 auto" }}>
          <div>
            <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 36, display: "block", marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>Bonjour {moi?.prenom ?? ""}</div>
          </div>
          <button onClick={deconnexion} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "8px 14px", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {([["contrat", "Mon contrat"], ["reseau", "Réseau de soins"]] as const).map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => setOnglet(cle)}
              style={{
                flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                border: onglet === cle ? "none" : "1.5px solid #dde3ec",
                background: onglet === cle ? "#004b9c" : "#fff",
                color: onglet === cle ? "#fff" : "#5b6b80",
              }}
            >
              {libelle}
            </button>
          ))}
        </div>

        {onglet === "reseau" && <ReseauSoins />}

        {onglet === "contrat" && (
          <>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#5b6b80" }}>Chargement…</div>}
        {erreur && <div style={{ color: "#dc2626", textAlign: "center", padding: 20 }}>{erreur}</div>}

        {confirmationRenouvellement && (
          <div style={{ ...card, background: "#e8f6ec", border: "1px solid #bbf7d0" }}>
            <div style={{ fontWeight: 700, color: "#15803d" }}>
              ✓ Contrat renouvelé{moi?.cycleFacturation ? ` pour ${moi.cycleFacturation === "mensuel" ? "un mois" : "un an"} de plus` : ""}
            </div>
          </div>
        )}

        {moi && (
          <>
            <div style={card}>
              <div style={{ fontSize: 13, color: "#5b6b80", fontWeight: 600, marginBottom: 4 }}>{moi.produitLibelle}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1, marginBottom: 12 }}>{moi.numeroPolice}</div>
              {moi.cycleFacturation && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#5b6b80", marginBottom: 4 }}>
                  <span>Formule</span>
                  <strong style={{ color: "#0f1b2d" }}>{moi.cycleFacturation === "annuel" ? "Annuelle" : "Mensuelle"} — {fcfa(moi.montantPrime)}</strong>
                </div>
              )}
              {!moi.cycleFacturation && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#5b6b80", marginBottom: 4 }}>
                  <span>Prime</span>
                  <strong style={{ color: "#0f1b2d" }}>{fcfa(moi.montantPrime)}</strong>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#5b6b80", marginBottom: 4 }}>
                <span>Capital garanti</span>
                <strong style={{ color: "#0f1b2d" }}>{fcfa(moi.capitalGaranti)}</strong>
              </div>
              {moi.dateFin && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#5b6b80", marginBottom: 4 }}>
                  <span>Valable jusqu'au</span>
                  <strong style={{ color: "#0f1b2d" }}>{new Date(moi.dateFin).toLocaleDateString("fr-FR")}</strong>
                </div>
              )}
              <button
                onClick={voirCarte}
                disabled={telechargementCarte}
                style={{
                  marginTop: 14, width: "100%", padding: "12px 0", background: "#fff", color: "#004b9c",
                  border: "1.5px solid #004b9c", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  opacity: telechargementCarte ? 0.5 : 1,
                }}
              >
                {telechargementCarte ? "Génération…" : "🪪 Voir ma carte de prise en charge"}
              </button>
              <button
                onClick={telechargerContrat}
                disabled={telechargementContrat}
                style={{
                  marginTop: 10, width: "100%", padding: "12px 0", background: "#fff", color: "#004b9c",
                  border: "1.5px solid #004b9c", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  opacity: telechargementContrat ? 0.5 : 1,
                }}
              >
                {telechargementContrat ? "Génération…" : "📄 Télécharger mon contrat (PDF)"}
              </button>
              <button
                onClick={renouveler}
                disabled={renouvellement}
                style={{
                  marginTop: 10, width: "100%", padding: "12px 0", background: "#004b9c", color: "#fff",
                  border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  opacity: renouvellement ? 0.5 : 1,
                }}
              >
                {renouvellement
                  ? "Veuillez patienter…"
                  : moi.produitType === "incendie"
                  ? "🔄 Renouveler (nouvelle réf.facture en boutique)"
                  : `🔄 Renouveler mon contrat${moi.cycleFacturation ? ` (${moi.cycleFacturation === "mensuel" ? "1 mois" : "1 an"})` : ""}`}
              </button>
            </div>

            {autresProduits && autresProduits.produits.length > 0 && (
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Autres produits disponibles</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {autresProduits.produits.map((p) => (
                    <a
                      key={p.code}
                      href={autresProduits.qrToken ? `/s/${p.code}/${autresProduits.qrToken}?client=1` : undefined}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: "#f5f8fc", borderRadius: 10, padding: "12px 14px",
                        textDecoration: "none", color: "#0f1b2d",
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.libelle}</span>
                      <span style={{ fontSize: 12.5, color: "#004b9c", fontWeight: 700 }}>Souscrire →</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: afficherFormSinistre ? 16 : 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Sinistres</div>
                <button
                  onClick={() => setAfficherFormSinistre((v) => !v)}
                  style={{ background: "none", border: "1.5px solid #004b9c", color: "#004b9c", padding: "6px 12px", borderRadius: 10, fontSize: 13, cursor: "pointer" }}
                >
                  {afficherFormSinistre ? "Annuler" : "+ Déclarer"}
                </button>
              </div>

              {afficherFormSinistre && (
                <form onSubmit={declarerSinistre} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #eef1f5" }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
                      Type d'événement *
                    </label>
                    <input
                      value={typeEvenement}
                      onChange={(e) => setTypeEvenement(e.target.value)}
                      placeholder="Ex. accident, panne, vol…"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
                      Date de survenance *
                    </label>
                    <input value={dateSurvenance} onChange={(e) => setDateSurvenance(e.target.value)} type="date" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, height: "auto", padding: 12, resize: "vertical" }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    {photosAccident.map((photo, i) => (
                      <PhotoCapture
                        key={i}
                        label={`Photo accident ${i + 1}`}
                        value={photo}
                        onChange={(dataUrl) => {
                          if (dataUrl) {
                            setPhotosAccident((prev) => prev.map((p, idx) => (idx === i ? dataUrl : p)));
                          } else {
                            setPhotosAccident((prev) => prev.filter((_, idx) => idx !== i));
                          }
                        }}
                        capture="environment"
                      />
                    ))}
                    {photosAccident.length < 5 && (
                      <PhotoCapture
                        label={photosAccident.length === 0 ? "Photos de l'accident" : "+ Ajouter une photo"}
                        value={null}
                        onChange={(dataUrl) => {
                          if (dataUrl) setPhotosAccident((prev) => [...prev, dataUrl]);
                        }}
                        capture="environment"
                      />
                    )}
                  </div>
                  <button
                    disabled={envoiSinistre || !typeEvenement || !dateSurvenance}
                    style={{
                      marginTop: 8, width: "100%", padding: "12px 0", background: "#004b9c", color: "#fff",
                      border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                      opacity: envoiSinistre || !typeEvenement || !dateSurvenance ? 0.5 : 1,
                    }}
                  >
                    {envoiSinistre ? "Envoi…" : "Envoyer la déclaration"}
                  </button>
                </form>
              )}

              {sinistres.length === 0 ? (
                <div style={{ color: "#5b6b80", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
                  Aucun sinistre déclaré.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sinistres.map((s) => (
                    <div key={s.id} style={{ background: "#f5f8fc", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                        <span>{s.typeEvenement}</span>
                        <span style={{ color: "#5b6b80" }}>{statutLabel(s.statut)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#5b6b80", marginTop: 2 }}>
                        {s.numeroSinistre} · {new Date(s.dateSurvenance).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
          </>
        )}
      </div>
      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#0f1b2d", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
