import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { API_BASE } from "../../api";
import PhotoCapture from "../../components/PhotoCapture";

const BASE = API_BASE;

type TypePiece = "cni_recto" | "cni_verso" | "photo" | "extrait_naissance";

interface EtatPieces {
  produit: string;
  nomSouscripteur: string | null;
  montant: number;
  statut: "pieces" | "a_payer" | "paye";
  complet: boolean;
  personnes: {
    index: number;
    intitule: string;
    nomComplet: string;
    adulte: boolean;
    pieces: { type: TypePiece; libelle: string; deposee: boolean }[];
  }[];
}

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;

/**
 * Assurances Santé — page où le souscripteur dépose ses pièces après la
 * validation de sa demande (lien reçu par SMS, 2026-10-15) : CNI recto + verso
 * et photo numérique pour chaque adulte, extrait de naissance et photo
 * numérique pour chaque enfant. Quand tout est déposé, un bouton lui permet de
 * payer sa prime (montant exact). Aucune donnée de santé n'est affichée ici.
 */
export default function SantePieces() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const retourPaiement = searchParams.get("paid") === "1";
  const paiementEchec = searchParams.get("paiement") === "echec";

  const [etat, setEtat] = useState<EtatPieces | null>(null);
  const [erreurChargement, setErreurChargement] = useState("");
  const [erreur, setErreur] = useState("");
  const [apercus, setApercus] = useState<Record<string, string>>({});
  const [envoiEnCours, setEnvoiEnCours] = useState<string | null>(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/public/sante/pieces/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lien invalide");
      setEtat(data as EtatPieces);
      setErreurChargement("");
    } catch (e) {
      setErreurChargement((e as Error).message || "Impossible de charger la page. Réessayez.");
    }
  }, [token]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function deposer(personneIndex: number, type: TypePiece, image: string | null) {
    if (!image) return;
    const cle = `${personneIndex}:${type}`;
    setErreur("");
    setApercus((a) => ({ ...a, [cle]: image }));
    setEnvoiEnCours(cle);
    try {
      const res = await fetch(`${BASE}/public/sante/pieces/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personneIndex, type, image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'envoi a échoué. Réessayez.");
      setEtat(data as EtatPieces);
    } catch (e) {
      setApercus((a) => {
        const { [cle]: _retire, ...reste } = a;
        return reste;
      });
      setErreur((e as Error).message);
    } finally {
      setEnvoiEnCours(null);
    }
  }

  async function payer() {
    setErreur("");
    setPaiementEnCours(true);
    try {
      const res = await fetch(`${BASE}/public/sante/pieces/${token}/payer`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de lancer le paiement. Réessayez.");
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setErreur((e as Error).message);
      setPaiementEnCours(false);
    }
  }

  const carte: React.CSSProperties = {
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
    marginBottom: 16,
  };

  if (erreurChargement) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "60px 20px", textAlign: "center", fontFamily: "Montserrat, sans-serif" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Lien indisponible</div>
        <div style={{ color: "#5b6b80", fontSize: 14 }}>{erreurChargement}</div>
      </div>
    );
  }
  if (!etat) {
    return <div style={{ padding: 60, textAlign: "center", fontFamily: "Montserrat, sans-serif", color: "#5b6b80" }}>Chargement…</div>;
  }

  const total = etat.personnes.reduce((n, p) => n + p.pieces.length, 0);
  const deposees = etat.personnes.reduce((n, p) => n + p.pieces.filter((x) => x.deposee).length, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7fb", fontFamily: "Montserrat, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)", padding: "24px 20px", color: "#fff" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 24, display: "block", marginBottom: 10 }} />
          <div style={{ fontSize: 13, opacity: 0.85 }}>Demande validée</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{etat.produit}</div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 60px" }}>
        {etat.statut === "paye" ? (
          <div style={{ ...carte, textAlign: "center" }}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>🎉</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Paiement reçu — votre contrat est activé</div>
            <div style={{ color: "#5b6b80", fontSize: 14, lineHeight: 1.5 }}>
              Vous allez recevoir un SMS pour accéder à votre contrat et à votre facture. Votre carte physique de prise en
              charge vous sera remise par SIM Assurances sous 7 jours.
            </div>
          </div>
        ) : (
          <>
            <div style={{ ...carte, background: "#e6f1fb" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#004b9c", marginBottom: 6 }}>
                {etat.nomSouscripteur ? `Bonjour ${etat.nomSouscripteur},` : "Bonjour,"} téléchargez vos documents
              </div>
              <div style={{ fontSize: 13, color: "#0f1b2d", lineHeight: 1.5 }}>
                Pour chaque adulte : la <strong>carte d'identité (recto et verso)</strong> et une{" "}
                <strong>photo numérique</strong>. Pour chaque enfant : l'<strong>extrait de naissance</strong> et une{" "}
                <strong>photo numérique</strong>. Quand tout est téléchargé, vous pourrez payer votre prime.
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#004b9c" }}>
                {deposees} / {total} document{total > 1 ? "s" : ""} téléchargé{total > 1 ? "s" : ""}
              </div>
            </div>

            {etat.personnes.map((p) => (
              <div key={p.index} style={carte}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{p.intitule}</div>
                <div style={{ fontSize: 12.5, color: "#5b6b80", marginBottom: 10 }}>{p.nomComplet}</div>
                {p.pieces.map((piece) => {
                  const cle = `${p.index}:${piece.type}`;
                  return (
                    <div key={piece.type} style={{ borderTop: "1px solid #eef1f5", paddingTop: 8, marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{piece.libelle}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: piece.deposee ? "#15803d" : "#b45309" }}>
                          {envoiEnCours === cle ? "Envoi…" : piece.deposee ? "✓ Téléchargé" : "À télécharger"}
                        </span>
                      </div>
                      <PhotoCapture
                        label={piece.deposee ? "Remplacer ce document" : "Prendre ou choisir une photo"}
                        value={apercus[cle] ?? null}
                        onChange={(img) => void deposer(p.index, piece.type, img)}
                        capture={piece.type === "photo" ? "user" : "environment"}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            {erreur && <div style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px", fontWeight: 600 }}>{erreur}</div>}
            {paiementEchec && (
              <div style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px", fontWeight: 600 }}>
                Le paiement n'a pas abouti. Vous pouvez réessayer ci-dessous.
              </div>
            )}

            {etat.complet ? (
              <div style={{ ...carte, textAlign: "center" }}>
                {retourPaiement && (
                  <div style={{ fontSize: 13, color: "#92400e", background: "#fef3c7", borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}>
                    Nous confirmons votre paiement… Si le montant a bien été débité, votre contrat s'activera dans quelques instants.{" "}
                    <button type="button" onClick={() => void charger()} style={{ background: "none", border: "none", color: "#004b9c", fontWeight: 700, cursor: "pointer", padding: 0 }}>
                      Actualiser
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 13, color: "#5b6b80" }}>Tous vos documents sont téléchargés. Prime à payer</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#004b9c", margin: "4px 0 14px" }}>{fcfa(etat.montant)}</div>
                <button
                  type="button"
                  onClick={() => void payer()}
                  disabled={paiementEnCours}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    background: "#004b9c",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                    opacity: paiementEnCours ? 0.6 : 1,
                  }}
                >
                  {paiementEnCours ? "Redirection vers Wave…" : `Payer ${fcfa(etat.montant)} avec Wave`}
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", fontSize: 13, color: "#5b6b80" }}>
                Le bouton de paiement apparaîtra dès que tous les documents seront téléchargés.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
