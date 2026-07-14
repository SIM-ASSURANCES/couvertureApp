import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../../api";
import { genererContratIncendie } from "../../contract";
import SignaturePad, { type SignaturePadHandle } from "../../components/SignaturePad";

const BASE = API_BASE;

function fcfa(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

interface Souscription {
  id: string;
  nom: string | null;
  prenom: string | null;
  telephone: string;
  email: string | null;
  refFacture: string | null;
  commune: string | null;
  quartier: string | null;
  numeroMaison: string | null;
  montant: number;
  capitalGaranti: number;
  statut: string;
  partenaire: string;
  numeroPolice: string;
  dateDebut: string;
  dateFin: string;
  signature?: string | null;
}

type Step = "loading" | "form" | "success" | "error";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d4ddea",
  fontSize: 15,
  outline: "none",
};

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#5b6b80", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function SouscriptionComplement() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>("loading");
  const [data, setData] = useState<Souscription | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [refFacture, setRefFacture] = useState("");
  const [commune, setCommune] = useState("");
  const [quartier, setQuartier] = useState("");
  const [numeroMaison, setNumeroMaison] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg("Lien invalide.");
      setStep("error");
      return;
    }
    fetch(`${BASE}/public/souscriptions/incendie/${token}`)
      .then((r) => r.json())
      .then((d: Souscription & { error?: string }) => {
        if (d.error) {
          setErrorMsg("Lien invalide ou expiré.");
          setStep("error");
          return;
        }
        setData(d);
        setNom(d.nom ?? "");
        setPrenom(d.prenom ?? "");
        setRefFacture(d.refFacture ?? "");
        setCommune(d.commune ?? "");
        setQuartier(d.quartier ?? "");
        setNumeroMaison(d.numeroMaison ?? "");
        // Déjà complété → directement la page de contrat
        setStep(d.statut === "complet" && d.refFacture ? "success" : "form");
      })
      .catch(() => {
        setErrorMsg("Impossible de charger votre souscription.");
        setStep("error");
      });
  }, [token]);

  async function handleSubmit() {
    if (!refFacture.trim() || !commune.trim() || !quartier.trim()) {
      setErrorMsg("Réf.facture, commune et quartier sont obligatoires.");
      return;
    }
    // Signature facultative : on l'envoie si le client a signé, sinon on
    // poursuit sans (le contrat pourra être signé après impression).
    const signature = sigRef.current?.toDataURL() ?? undefined;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${BASE}/public/souscriptions/incendie/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          prenom,
          refFacture: refFacture.trim(),
          commune: commune.trim(),
          quartier: quartier.trim(),
          numeroMaison: numeroMaison.trim(),
          signature,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur lors de la validation");
      setData((prev) =>
        prev
          ? {
              ...prev,
              nom,
              prenom,
              refFacture: refFacture.trim(),
              commune: commune.trim(),
              quartier: quartier.trim(),
              numeroMaison: numeroMaison.trim(),
              statut: "complet",
              signature,
            }
          : prev
      );
      setStep("success");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f8fc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "'Montserrat', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)",
            padding: "28px 32px 24px",
            color: "#fff",
          }}
        >
          <img
            src="/logo_sim.webp"
            alt="SIM Assurances"
            style={{ height: 48, marginBottom: 16, display: "block" }}
          />
          <div style={{ fontSize: 18, fontWeight: 800 }}>Assurance Incendie</div>
          {data && (
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
              via {data.partenaire}
            </div>
          )}
        </div>

        <div style={{ padding: "28px 32px" }}>
          {step === "loading" && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#5b6b80" }}>
              Chargement…
            </div>
          )}

          {step === "error" && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Une erreur est survenue</div>
              <div style={{ color: "#5b6b80", fontSize: 14 }}>{errorMsg}</div>
            </div>
          )}

          {step === "form" && data && (
            <>
              <div
                style={{
                  background: "#e6f1fb",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 22,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 13, color: "#5b6b80" }}>Capital garanti</div>
                <div style={{ fontWeight: 800, color: "#004b9c", fontSize: 15 }}>
                  {fcfa(data.capitalGaranti)}
                </div>
              </div>

              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>
                Finalisez votre souscription
              </div>
              <div style={{ color: "#5b6b80", fontSize: 13, marginBottom: 18 }}>
                Renseignez votre numéro de facture pour activer votre contrat.
              </div>

              <FieldRow label="Prénom">
                <input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Votre prénom"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Nom">
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Votre nom"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Réf. facture *">
                <input
                  value={refFacture}
                  onChange={(e) => setRefFacture(e.target.value)}
                  placeholder="Ex. FAC-2026-0001"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Commune *">
                <input
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  placeholder="Ex. Cocody"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="Quartier *">
                <input
                  value={quartier}
                  onChange={(e) => setQuartier(e.target.value)}
                  placeholder="Ex. Angré"
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="N° de maison (optionnel)">
                <input
                  value={numeroMaison}
                  onChange={(e) => setNumeroMaison(e.target.value)}
                  placeholder="Ex. Ilot 12, lot 34"
                  style={inputStyle}
                />
              </FieldRow>

              <SignaturePad ref={sigRef} label="Signature (facultative)" />

              {errorMsg && (
                <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 12,
                  border: "none",
                  background: submitting ? "#7da6d6" : "#004b9c",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: submitting ? "default" : "pointer",
                  marginTop: 6,
                }}
              >
                {submitting ? "Validation…" : "Valider et obtenir mon contrat"}
              </button>
            </>
          )}

          {step === "success" && data && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
                Souscription confirmée
              </div>
              <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                Votre Assurance Incendie est active.
                <br />
                N° de police : <strong>{data.numeroPolice}</strong>
              </div>

              <div
                style={{
                  background: "#f5f8fc",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 22,
                  textAlign: "left",
                  fontSize: 14,
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <strong>Capital garanti :</strong> {fcfa(data.capitalGaranti)}
                </div>
                <div>
                  <strong>Assuré(e) :</strong> {data.prenom} {data.nom}
                </div>
              </div>

              <button
                onClick={() => genererContratIncendie(data)}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#004b9c",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                Télécharger mon contrat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
