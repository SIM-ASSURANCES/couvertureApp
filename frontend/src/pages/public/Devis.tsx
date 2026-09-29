import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { API_BASE } from "../../api";
import { fcfa } from "../../components/ui";
import SignaturePad, { type SignaturePadHandle } from "../../components/SignaturePad";
import PhotoCapture from "../../components/PhotoCapture";

const BASE = API_BASE;

interface CotationPublique {
  token: string;
  produitCode: string;
  libelleProduit: string;
  libelleFormule: string;
  primeTTC: number;
  capitalGaranti: number;
  clientNom: string | null;
  partenaire: string;
  statut: "envoye" | "converti" | "expire";
  souscriptionId: string | null;
  dateExpiration: string | null;
}

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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const NECESSITE_PIECE_IDENTITE = new Set(["relaxaccidents"]);
const CHAMPS_COMMERCE = new Set(["securhome_dommages", "securpro_dommages"]);

/**
 * Page publique du parcours devis (Cotation) : lecture par lien partagé
 * (/devis/:token), collecte de l'identité du client (jamais saisie par le
 * partenaire/agent, voir cotationsCommun.tsx) puis paiement Wave — même
 * mécanisme que la souscription directe par QR, mais le prix vient du devis
 * déjà calculé (jamais resaisi/recalculé ici). Paiement Wave uniquement pour
 * cette première version (pas de Djogana/Peya Pay sur ce parcours).
 */
export default function Devis() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const paidEcheanceId = params.get("paid");
  const paiementEchec = params.get("paiement") === "echec";
  const produitRetour = params.get("produit");
  const enRetourDePaiement = !!paidEcheanceId || paiementEchec;

  const [cotation, setCotation] = useState<CotationPublique | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [etape, setEtape] = useState<"recap" | "formulaire" | "paiement">("recap");

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [sexe, setSexe] = useState<"masculin" | "feminin" | "">("");
  const [civilite, setCivilite] = useState<"M." | "MLLE" | "MME" | "">("");
  const [ville, setVille] = useState("");
  const [commune, setCommune] = useState("");
  const [adresse, setAdresse] = useState("");
  const [numeroPieceIdentite, setNumeroPieceIdentite] = useState("");
  const [nomCommercial, setNomCommercial] = useState("");
  const [communeQuartier, setCommuneQuartier] = useState("");
  const [refFacture, setRefFacture] = useState("");
  const [typePiece, setTypePiece] = useState<"CNI" | "Passeport">("CNI");
  const [piecePhoto, setPiecePhoto] = useState<string | null>(null);
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurForm, setErreurForm] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/public/cotations/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Devis introuvable");
        setCotation(data);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setChargement(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !cotation) return;
    setErreurForm("");
    if (NECESSITE_PIECE_IDENTITE.has(cotation.produitCode) && !piecePhoto) {
      setErreurForm("Merci d'ajouter une photo de votre pièce d'identité.");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch(`${BASE}/public/cotations/${token}/souscrire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          prenom,
          telephone,
          dateNaissance: dateNaissance || undefined,
          sexe: sexe || undefined,
          civilite: civilite || undefined,
          ville: ville || undefined,
          commune: commune || undefined,
          adresse: adresse || undefined,
          numeroPieceIdentite: numeroPieceIdentite || undefined,
          nomCommercial: nomCommercial || undefined,
          communeQuartier: communeQuartier || undefined,
          refFacture: refFacture || undefined,
          signature: sigRef.current?.isEmpty() ? undefined : sigRef.current?.toDataURL() ?? undefined,
          moyenPaiement: "wave",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la souscription");

      if (NECESSITE_PIECE_IDENTITE.has(cotation.produitCode)) {
        const documents = [
          piecePhoto ? { type: typePiece, url: piecePhoto } : null,
          selfiePhoto ? { type: "Selfie" as const, url: selfiePhoto } : null,
        ].filter((d): d is { type: "CNI" | "Passeport" | "Selfie"; url: string } => d !== null);
        await Promise.all(
          documents.map((doc) =>
            fetch(`${BASE}/public/souscriptions/${cotation.produitCode}/${data.souscriptionId}/documents`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(doc),
            }).catch(() => null)
          )
        );
      }

      setEtape("paiement");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      setErreurForm(err instanceof Error ? err.message : "Erreur");
      setEnvoi(false);
    }
  }

  if (enRetourDePaiement) {
    return <RetourPaiement produitCode={produitRetour} echeanceId={paidEcheanceId} echec={paiementEchec} />;
  }

  if (chargement) {
    return <PageCentree><div style={{ color: "#5b6b80" }}>Chargement du devis…</div></PageCentree>;
  }
  if (erreur || !cotation) {
    return (
      <PageCentree>
        <div style={{ color: "#dc2626", textAlign: "center" }}>{erreur || "Devis introuvable."}</div>
      </PageCentree>
    );
  }
  if (cotation.statut === "expire") {
    return (
      <PageCentree>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Ce devis a expiré</div>
          <div style={{ color: "#5b6b80", fontSize: 13.5 }}>Contactez {cotation.partenaire} pour obtenir un nouveau devis.</div>
        </div>
      </PageCentree>
    );
  }
  if (cotation.statut === "converti") {
    return (
      <PageCentree>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Ce devis a déjà été payé</div>
          <div style={{ color: "#5b6b80", fontSize: 13.5 }}>Contactez {cotation.partenaire} si vous pensez qu'il s'agit d'une erreur.</div>
        </div>
      </PageCentree>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)", padding: "28px 20px", color: "#fff" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <img src="/logo_sim.webp" alt="SIM Assurances" style={{ height: 24, display: "block", marginBottom: 10 }} />
          <div style={{ fontSize: 13, opacity: 0.85 }}>Devis proposé par</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{cotation.partenaire}</div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.06)", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#5b6b80", marginBottom: 2 }}>{cotation.libelleProduit}</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{cotation.libelleFormule}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderTop: "1px solid #eef1f5" }}>
            <span style={{ fontSize: 13, color: "#5b6b80" }}>Prime à payer</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#004b9c" }}>{fcfa(cotation.primeTTC)}</span>
          </div>
          {cotation.capitalGaranti > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ fontSize: 13, color: "#5b6b80" }}>Capital garanti</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{fcfa(cotation.capitalGaranti)}</span>
            </div>
          )}
        </div>

        {etape === "recap" && (
          <button
            onClick={() => setEtape("formulaire")}
            style={{ width: "100%", padding: "14px 0", background: "#004b9c", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Souscrire et payer
          </button>
        )}

        {etape !== "recap" && (
          <form onSubmit={soumettre} style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Vos informations</div>
            <FieldRow label="Nom *">
              <input required value={nom} onChange={(e) => setNom(e.target.value)} style={inputStyle} />
            </FieldRow>
            <FieldRow label="Prénom *">
              <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} style={inputStyle} />
            </FieldRow>
            <FieldRow label="Téléphone *">
              <input required value={telephone} onChange={(e) => setTelephone(e.target.value)} style={inputStyle} inputMode="numeric" maxLength={10} />
            </FieldRow>

            {cotation.produitCode === "relaxaccidents" && (
              <>
                <FieldRow label="Date de naissance">
                  <input type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} style={inputStyle} max={new Date().toISOString().slice(0, 10)} />
                </FieldRow>
                <FieldRow label="Sexe">
                  <select value={sexe} onChange={(e) => setSexe(e.target.value as typeof sexe)} style={inputStyle}>
                    <option value="">—</option>
                    <option value="masculin">Masculin</option>
                    <option value="feminin">Féminin</option>
                  </select>
                </FieldRow>
                <FieldRow label="Civilité">
                  <select value={civilite} onChange={(e) => setCivilite(e.target.value as typeof civilite)} style={inputStyle}>
                    <option value="">—</option>
                    <option value="M.">M.</option>
                    <option value="MLLE">Mlle</option>
                    <option value="MME">Mme</option>
                  </select>
                </FieldRow>
                <FieldRow label="Ville">
                  <input value={ville} onChange={(e) => setVille(e.target.value)} style={inputStyle} />
                </FieldRow>
                <FieldRow label="Commune">
                  <input value={commune} onChange={(e) => setCommune(e.target.value)} style={inputStyle} />
                </FieldRow>
                <FieldRow label="Adresse">
                  <input value={adresse} onChange={(e) => setAdresse(e.target.value)} style={inputStyle} />
                </FieldRow>
                <FieldRow label="Numéro de pièce d'identité">
                  <input value={numeroPieceIdentite} onChange={(e) => setNumeroPieceIdentite(e.target.value)} style={inputStyle} />
                </FieldRow>
                <FieldRow label="Type de pièce">
                  <div style={{ display: "flex", gap: 16 }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" checked={typePiece === "CNI"} onChange={() => setTypePiece("CNI")} /> CNI
                    </label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" checked={typePiece === "Passeport"} onChange={() => setTypePiece("Passeport")} /> Passeport
                    </label>
                  </div>
                </FieldRow>
                <PhotoCapture label="Photo de la pièce d'identité *" value={piecePhoto} onChange={setPiecePhoto} capture="environment" required />
                <PhotoCapture label="Selfie" value={selfiePhoto} onChange={setSelfiePhoto} capture="user" />
              </>
            )}

            {CHAMPS_COMMERCE.has(cotation.produitCode) && (
              <>
                {cotation.produitCode === "securpro_dommages" && (
                  <FieldRow label="Nom commercial">
                    <input value={nomCommercial} onChange={(e) => setNomCommercial(e.target.value)} style={inputStyle} />
                  </FieldRow>
                )}
                <FieldRow label="Ville">
                  <input value={ville} onChange={(e) => setVille(e.target.value)} style={inputStyle} />
                </FieldRow>
                <FieldRow label="Commune / Quartier">
                  <input value={communeQuartier} onChange={(e) => setCommuneQuartier(e.target.value)} style={inputStyle} />
                </FieldRow>
                <FieldRow label="Référence facture">
                  <input value={refFacture} onChange={(e) => setRefFacture(e.target.value)} style={inputStyle} />
                </FieldRow>
              </>
            )}

            <SignaturePad ref={sigRef} label="Signature (facultative)" />

            {erreurForm && <div style={{ color: "#dc2626", fontSize: 13, margin: "10px 0" }}>{erreurForm}</div>}

            <button
              type="submit"
              disabled={envoi}
              style={{ width: "100%", marginTop: 16, padding: "14px 0", background: "#004b9c", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: envoi ? 0.6 : 1 }}
            >
              {envoi ? "Redirection vers Wave…" : `Payer ${fcfa(cotation.primeTTC)} avec Wave`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RetourPaiement({ produitCode, echeanceId, echec }: { produitCode: string | null; echeanceId: string | null; echec: boolean }) {
  const [statut, setStatut] = useState<"verification" | "confirme" | "en_attente" | "echec">(echec ? "echec" : "verification");

  useEffect(() => {
    if (echec || !produitCode || !echeanceId) return;
    fetch(`${BASE}/public/souscriptions/${produitCode}/echeances/${echeanceId}/verify`)
      .then((r) => r.json())
      .then((d) => setStatut(d.statut === "confirme" ? "confirme" : "en_attente"))
      .catch(() => setStatut("en_attente"));
  }, [produitCode, echeanceId, echec]);

  return (
    <PageCentree>
      <div style={{ textAlign: "center", maxWidth: 340 }}>
        {statut === "verification" && <div style={{ color: "#5b6b80" }}>Vérification du paiement…</div>}
        {statut === "confirme" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Paiement confirmé</div>
            <div style={{ color: "#5b6b80", fontSize: 13.5 }}>Votre souscription est active. Vous recevrez votre contrat par SMS/WhatsApp.</div>
          </>
        )}
        {statut === "en_attente" && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Paiement en cours de vérification</div>
            <div style={{ color: "#5b6b80", fontSize: 13.5 }}>Si vous avez bien payé sur Wave, votre souscription sera confirmée sous peu.</div>
          </>
        )}
        {statut === "echec" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>❌</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Paiement non abouti</div>
            <div style={{ color: "#5b6b80", fontSize: 13.5 }}>Contactez votre partenaire pour réessayer.</div>
          </>
        )}
      </div>
    </PageCentree>
  );
}

function PageCentree({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {children}
    </div>
  );
}
