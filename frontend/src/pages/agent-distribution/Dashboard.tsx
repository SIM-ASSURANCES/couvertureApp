import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Flame, ShieldCheck, Wallet, PiggyBank, HandCoins, Send } from "lucide-react";
import { agentDistApi, agentDistLogout, getAgentDistUser } from "../../agentDistributionAuth";

function fcfa(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR");
}

interface Moi {
  id: string;
  nom: string;
  telephone: string;
  localisation: string | null;
  statut: "actif" | "inactif";
  partenaireNom: string;
  produit: "incendie" | "accident";
  // QR "sélecteur" (refonte Assurances Accidents/Dommages), remplace produit
  // si renseigné.
  sousBranche?: "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES" | null;
  forcerChangementMotDePasse: boolean;
}

interface Qr {
  produit: string;
  token: string;
  dataUrl: string;
}

interface Souscription {
  id: string;
  produit: "incendie" | "accident";
  nom: string | null;
  prenom: string | null;
  telephone: string;
  montantPrime: number;
  statut: string;
  createdAt: string;
}

interface Demande {
  id: string;
  montant: number;
  statut: "en_attente" | "validee" | "rejetee";
  createdAt: string;
  traiteeAt?: string | null;
  motifRejet?: string | null;
}

interface Commission {
  totale: number;
  encaissee: number;
  due: number;
  canRequest: boolean;
  enAttente: boolean;
  prochaineDate: string | null;
  demandes: Demande[];
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

function badge(statut: "en_attente" | "validee" | "rejetee") {
  const styles: Record<string, React.CSSProperties> = {
    en_attente: { background: "#fdf3e3", color: "#b45309" },
    validee: { background: "#e8f6ec", color: "#15803d" },
    rejetee: { background: "#fde8e8", color: "#dc2626" },
  };
  const labels: Record<string, string> = { en_attente: "En attente", validee: "Validée", rejetee: "Rejetée" };
  return (
    <span style={{ ...styles[statut], padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>
      {labels[statut]}
    </span>
  );
}

export default function AgentDistributionDashboard() {
  const navigate = useNavigate();
  const [moi, setMoi] = useState<Moi | null>(null);
  const [onglet, setOnglet] = useState<"activite" | "commissions">("activite");
  const [qrIncendie1000, setQrIncendie1000] = useState<Qr | null>(null);
  const [qrIncendie2000, setQrIncendie2000] = useState<Qr | null>(null);
  const [qrAccident, setQrAccident] = useState<Qr | null>(null);
  const [qrSelecteur, setQrSelecteur] = useState<Qr | null>(null);
  const [souscriptions, setSouscriptions] = useState<Souscription[]>([]);
  const [commission, setCommission] = useState<Commission | null>(null);
  const [demandeEnCours, setDemandeEnCours] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState("");

  const [ancienMotDePasse, setAncienMotDePasse] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [changement, setChangement] = useState(false);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  }

  async function chargerCommission() {
    setCommission(await agentDistApi.get<Commission>("/commission"));
  }

  useEffect(() => {
    if (!getAgentDistUser()) {
      navigate("/agent-distribution/connexion");
      return;
    }
    (async () => {
      try {
        const m = await agentDistApi.get<Moi>("/moi");
        setMoi(m);
        if (m.forcerChangementMotDePasse) return;
        const s = await agentDistApi.get<{ incendie: Souscription[]; accident: Souscription[] }>("/souscriptions");
        setSouscriptions([...s.incendie, ...s.accident].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        if (m.sousBranche) {
          setQrSelecteur(await agentDistApi.get<Qr>(`/qr/${m.sousBranche}`));
        } else if (m.produit === "incendie") {
          const [q1, q2] = await Promise.all([
            agentDistApi.get<Qr>("/qr/incendie1000"),
            agentDistApi.get<Qr>("/qr/incendie2000"),
          ]);
          setQrIncendie1000(q1);
          setQrIncendie2000(q2);
        } else {
          setQrAccident(await agentDistApi.get<Qr>("/qr/accident"));
        }
        await chargerCommission();
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    setChangement(true);
    try {
      await agentDistApi.patch("/mot-de-passe", { ancienMotDePasse, nouveauMotDePasse });
      setAncienMotDePasse("");
      setNouveauMotDePasse("");
      if (moi?.forcerChangementMotDePasse) {
        setLoading(true);
        setMoi({ ...moi, forcerChangementMotDePasse: false });
        const s = await agentDistApi.get<{ incendie: Souscription[]; accident: Souscription[] }>("/souscriptions");
        setSouscriptions([...s.incendie, ...s.accident].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        if (moi.sousBranche) {
          setQrSelecteur(await agentDistApi.get<Qr>(`/qr/${moi.sousBranche}`));
        } else if (moi.produit === "incendie") {
          const [q1, q2] = await Promise.all([
            agentDistApi.get<Qr>("/qr/incendie1000"),
            agentDistApi.get<Qr>("/qr/incendie2000"),
          ]);
          setQrIncendie1000(q1);
          setQrIncendie2000(q2);
        } else {
          setQrAccident(await agentDistApi.get<Qr>("/qr/accident"));
        }
        await chargerCommission();
        setLoading(false);
      } else {
        notify("Mot de passe modifié ✓");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    } finally {
      setChangement(false);
    }
  }

  async function demanderRetrait() {
    setDemandeEnCours(true);
    try {
      await agentDistApi.post("/commission/demande", {});
      notify("Demande envoyée ✓ En attente de validation.");
      await chargerCommission();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDemandeEnCours(false);
    }
  }

  function deconnexion() {
    agentDistLogout();
    navigate("/agent-distribution/connexion");
  }

  const doitChangerMotDePasse = !!moi?.forcerChangementMotDePasse;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)", padding: "24px 20px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 560, margin: "0 auto" }}>
          <div>
            <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 24, display: "block", marginBottom: 8 }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>Bonjour {moi?.nom ?? ""}</div>
            {moi && <div style={{ fontSize: 12, opacity: 0.8 }}>Agent de {moi.partenaireNom}</div>}
          </div>
          <button onClick={deconnexion} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#5b6b80" }}>Chargement…</div>}
        {erreur && <div style={{ color: "#dc2626", textAlign: "center", padding: 20 }}>{erreur}</div>}

        {moi && doitChangerMotDePasse && !loading && (
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Bienvenue !</div>
            <p className="muted" style={{ fontSize: 13, color: "#5b6b80", marginTop: 0, marginBottom: 18 }}>
              Pour votre sécurité, choisissez votre propre mot de passe avant d'accéder à votre espace.
            </p>
            <form onSubmit={changerMotDePasse}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
                  Mot de passe provisoire reçu
                </label>
                <input type="password" value={ancienMotDePasse} onChange={(e) => setAncienMotDePasse(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
                  Nouveau mot de passe (6 caractères minimum)
                </label>
                <input type="password" value={nouveauMotDePasse} onChange={(e) => setNouveauMotDePasse(e.target.value)} style={inputStyle} />
              </div>
              <button
                disabled={changement || !ancienMotDePasse || nouveauMotDePasse.length < 6}
                style={{
                  width: "100%", padding: "12px 0", background: "#004b9c", color: "#fff",
                  border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  opacity: changement || !ancienMotDePasse || nouveauMotDePasse.length < 6 ? 0.5 : 1,
                }}
              >
                {changement ? "Validation…" : "Valider mon mot de passe"}
              </button>
            </form>
          </div>
        )}

        {moi && !doitChangerMotDePasse && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <button
                onClick={() => setOnglet("activite")}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 700,
                  background: onglet === "activite" ? "#004b9c" : "#fff",
                  color: onglet === "activite" ? "#fff" : "#5b6b80",
                  boxShadow: onglet === "activite" ? "none" : "0 2px 8px rgba(0,0,0,0.05)",
                }}
              >
                Mon activité
              </button>
              <button
                onClick={() => setOnglet("commissions")}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 700,
                  background: onglet === "commissions" ? "#004b9c" : "#fff",
                  color: onglet === "commissions" ? "#fff" : "#5b6b80",
                  boxShadow: onglet === "commissions" ? "none" : "0 2px 8px rgba(0,0,0,0.05)",
                }}
              >
                Commissions
              </button>
            </div>

            {onglet === "activite" && (
              <>
                <div style={card}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Mon/mes QR code(s)</div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
                    {moi.sousBranche ? (
                      qrSelecteur && (
                        <div style={{ textAlign: "center" }}>
                          <img src={qrSelecteur.dataUrl} alt="QR" style={{ width: 170, height: 170, border: "1px solid #eee", borderRadius: 10, padding: 6 }} />
                          <a className="btn" style={{ display: "block", marginTop: 8, fontSize: 12 }} href={qrSelecteur.dataUrl} download="qr-assurance.png">
                            <Download size={13} style={{ verticalAlign: -2 }} /> Télécharger
                          </a>
                        </div>
                      )
                    ) : moi.produit === "incendie" ? (
                      <>
                        {qrIncendie1000 && (
                          <div style={{ textAlign: "center" }}>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6, color: "#5b6b80" }}>Jusqu'à 250 000 FCFA</div>
                            <img src={qrIncendie1000.dataUrl} alt="QR" style={{ width: 150, height: 150, border: "1px solid #eee", borderRadius: 10, padding: 6 }} />
                            <a className="btn" style={{ display: "block", marginTop: 8, fontSize: 12 }} href={qrIncendie1000.dataUrl} download="qr-incendie1000.png">
                              <Download size={13} style={{ verticalAlign: -2 }} /> Télécharger
                            </a>
                          </div>
                        )}
                        {qrIncendie2000 && (
                          <div style={{ textAlign: "center" }}>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6, color: "#5b6b80" }}>Au-dessus de 250 000 FCFA</div>
                            <img src={qrIncendie2000.dataUrl} alt="QR" style={{ width: 150, height: 150, border: "1px solid #eee", borderRadius: 10, padding: 6 }} />
                            <a className="btn" style={{ display: "block", marginTop: 8, fontSize: 12 }} href={qrIncendie2000.dataUrl} download="qr-incendie2000.png">
                              <Download size={13} style={{ verticalAlign: -2 }} /> Télécharger
                            </a>
                          </div>
                        )}
                      </>
                    ) : (
                      qrAccident && (
                        <div style={{ textAlign: "center" }}>
                          <img src={qrAccident.dataUrl} alt="QR" style={{ width: 170, height: 170, border: "1px solid #eee", borderRadius: 10, padding: 6 }} />
                          <a className="btn" style={{ display: "block", marginTop: 8, fontSize: 12 }} href={qrAccident.dataUrl} download="qr-accident.png">
                            <Download size={13} style={{ verticalAlign: -2 }} /> Télécharger
                          </a>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div style={card}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Mes souscriptions ({souscriptions.length})</div>
                  {souscriptions.length === 0 ? (
                    <div style={{ color: "#5b6b80", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
                      Aucune souscription pour l'instant.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {souscriptions.map((s) => (
                        <div key={s.id} style={{ background: "#f5f8fc", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                            <span>
                              {s.produit === "incendie" ? <Flame size={13} style={{ verticalAlign: -2 }} /> : <ShieldCheck size={13} style={{ verticalAlign: -2 }} />}
                              {" "}{s.prenom ?? ""} {s.nom ?? ""}
                            </span>
                            <span>{fcfa(s.montantPrime)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#5b6b80", marginTop: 2 }}>
                            {s.telephone} · {fmtDate(s.createdAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {onglet === "commissions" && commission && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                  <div style={{ ...card, flex: "1 1 140px", margin: 0, padding: 14, textAlign: "center" }}>
                    <Wallet size={18} color="#004b9c" style={{ marginBottom: 6 }} />
                    <div style={{ fontSize: 11, color: "#5b6b80", fontWeight: 600 }}>Totale</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{fcfa(commission.totale)}</div>
                  </div>
                  <div style={{ ...card, flex: "1 1 140px", margin: 0, padding: 14, textAlign: "center", background: "#e8f6ec" }}>
                    <PiggyBank size={18} color="#15803d" style={{ marginBottom: 6 }} />
                    <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600 }}>Encaissée</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#15803d" }}>{fcfa(commission.encaissee)}</div>
                  </div>
                  <div style={{ ...card, flex: "1 1 140px", margin: 0, padding: 14, textAlign: "center", background: "#fdf3e3" }}>
                    <HandCoins size={18} color="#b45309" style={{ marginBottom: 6 }} />
                    <div style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>Due</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#b45309" }}>{fcfa(commission.due)}</div>
                  </div>
                </div>

                <div style={{ ...card, marginTop: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Demander le versement</div>
                  <p className="muted" style={{ fontSize: 12.5, color: "#5b6b80", marginTop: 0, marginBottom: 14 }}>
                    Vous pouvez demander le versement de votre commission due toutes les 2 semaines.
                  </p>
                  <button
                    onClick={demanderRetrait}
                    disabled={!commission.canRequest || demandeEnCours}
                    style={{
                      width: "100%", padding: "12px 0", background: "#004b9c", color: "#fff",
                      border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      opacity: !commission.canRequest || demandeEnCours ? 0.5 : 1,
                    }}
                  >
                    <Send size={15} />
                    {demandeEnCours ? "Envoi…" : `Demander (${fcfa(commission.due)})`}
                  </button>
                  {!commission.canRequest && (
                    <p className="muted" style={{ fontSize: 12, color: "#5b6b80", marginTop: 10, marginBottom: 0 }}>
                      {commission.enAttente
                        ? "Une demande est déjà en attente de validation par l'administration."
                        : commission.due <= 0
                        ? "Aucune commission due actuellement."
                        : commission.prochaineDate
                        ? `Prochaine demande possible le ${new Date(commission.prochaineDate).toLocaleDateString("fr-FR")}.`
                        : ""}
                    </p>
                  )}
                </div>

                <div style={{ ...card, marginTop: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Historique des demandes</div>
                  {commission.demandes.length === 0 ? (
                    <div style={{ color: "#5b6b80", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
                      Aucune demande pour l'instant.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {commission.demandes.map((d) => (
                        <div key={d.id} style={{ background: "#f5f8fc", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                            <strong>{fcfa(d.montant)}</strong>
                            {badge(d.statut)}
                          </div>
                          <div style={{ fontSize: 12, color: "#5b6b80", marginTop: 4 }}>
                            {fmtDate(d.createdAt)}
                            {d.traiteeAt ? ` · traitée le ${fmtDate(d.traiteeAt)}` : ""}
                            {d.motifRejet ? ` · ${d.motifRejet}` : ""}
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
