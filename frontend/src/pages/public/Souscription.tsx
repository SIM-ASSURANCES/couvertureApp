import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { API_BASE } from "../../api";
const BASE = API_BASE;

interface QrInfo {
  produit: "incendie" | "accident";
  partenaire: { id: string; nomCommerce: string };
  tarifIncendie?: { id: number; prime: number; capitalGaranti: number } | null;
}

interface TarifAccident {
  id: number;
  prime: number;
  capitalGaranti: number;
  commission: number;
}

type Step = "loading" | "infos" | "confirm" | "success" | "error";

function fcfa(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function TarifCard({
  prime,
  capitalGaranti,
  selected,
  onSelect,
}: {
  prime: number;
  capitalGaranti: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        width: "100%",
        padding: "20px 22px",
        border: `2px solid ${selected ? "var(--sim-primary)" : "var(--border-strong)"}`,
        borderRadius: 14,
        background: selected ? "var(--sim-primary-50)" : "#fff",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--sim-primary)" }}>
          {fcfa(prime)}
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)", marginLeft: 6 }}>
            / an
          </span>
        </div>
        <div style={{ marginTop: 6, color: "var(--text-2)", fontSize: 13 }}>
          Capital garanti :{" "}
          <strong style={{ color: "var(--text)" }}>{fcfa(capitalGaranti)}</strong>
        </div>
      </div>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: `2px solid ${selected ? "var(--sim-primary)" : "var(--border-strong)"}`,
          background: selected ? "var(--sim-primary)" : "transparent",
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  );
}

export default function Souscription() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>("loading");
  const [qrInfo, setQrInfo] = useState<QrInfo | null>(null);
  const [tarifsAcc, setTarifsAcc] = useState<TarifAccident[]>([]);
  const [selectedTarifId, setSelectedTarifId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Champs accident
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");

  // Champs incendie
  const [telephoneInc, setTelephoneInc] = useState("");
  const [prenomInc, setPrenomInc] = useState("");
  const [nomInc, setNomInc] = useState("");

  // Résultat souscription
  const [result, setResult] = useState<{
    checkoutUrl?: string;
    numeroPolice?: string;
    lienToken?: string;
    montant?: number;
    capitalGaranti?: number;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg("Token QR manquant.");
      setStep("error");
      return;
    }

    Promise.all([
      fetch(`${BASE}/public/qr/${token}`).then((r) => r.json()),
      fetch(`${BASE}/public/tarifs/accident`).then((r) => r.json()),
    ])
      .then(([qr, acc]) => {
        if (qr.error) {
          setErrorMsg(qr.error);
          setStep("error");
          return;
        }
        setQrInfo(qr);
        setTarifsAcc(acc);

        if (qr.produit === "accident") {
          if (acc.length > 0) setSelectedTarifId(acc[0].id);
        } else {
          if (qr.tarifIncendie) setSelectedTarifId(qr.tarifIncendie.id);
        }
        setStep("infos");
      })
      .catch(() => {
        setErrorMsg("Impossible de charger les informations. Veuillez réessayer.");
        setStep("error");
      });
  }, [token]);

  async function handleSubmit() {
    if (!qrInfo || !token || !selectedTarifId) return;
    setSubmitting(true);
    try {
      if (qrInfo.produit === "accident") {
        const res = await fetch(`${BASE}/public/souscriptions/accident/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            nom,
            prenom,
            telephone,
            tarifAccidentId: selectedTarifId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur lors de la souscription");
        setResult({
          checkoutUrl: data.checkoutUrl,
          montant: data.montant,
          capitalGaranti: data.capitalGaranti,
        });
        setStep("confirm");
      } else {
        const res = await fetch(`${BASE}/public/souscriptions/incendie`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            telephone: telephoneInc,
            nom: nomInc,
            prenom: prenomInc,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur lors de la souscription");
        setResult({ lienToken: data.lienToken });
        setStep("success");
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erreur inattendue");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function simulateWavePayment() {
    if (!result) return;
    setSubmitting(true);
    try {
      const souscriptionId = new URL(result.checkoutUrl!).searchParams.get("ref");
      const res = await fetch(`${BASE}/public/wave/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ souscriptionId, status: "confirme" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult((prev) => ({ ...prev, numeroPolice: data.numeroPolice }));
      setStep("success");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Paiement échoué");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTarif =
    qrInfo?.produit === "accident"
      ? tarifsAcc.find((t) => t.id === selectedTarifId)
      : qrInfo?.tarifIncendie ?? undefined;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #004b9c 0%, #16215e 100%)",
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
        {/* Header */}
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
          {qrInfo && (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                Assurance{" "}
                {qrInfo.produit === "incendie" ? "Incendie" : "Accident"}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                via {qrInfo.partenaire.nomCommerce}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "28px 32px" }}>
          {/* ── CHARGEMENT ── */}
          {step === "loading" && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: "3px solid #e9edf3",
                  borderTopColor: "#004b9c",
                  borderRadius: "50%",
                  margin: "0 auto",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              <div style={{ marginTop: 14, color: "#5b6b80", fontSize: 14 }}>
                Chargement…
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── ERREUR ── */}
          {step === "error" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#dc2626" }}>
                Une erreur est survenue
              </div>
              <div style={{ marginTop: 8, color: "#5b6b80", fontSize: 14 }}>
                {errorMsg}
              </div>
            </div>
          )}

          {/* ── FORMULAIRE ── */}
          {step === "infos" && (
            <div>
              {/* Sélecteur de tarif pour l'accident */}
              {qrInfo?.produit === "accident" && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#5b6b80", marginBottom: 10 }}>
                    Choisissez votre formule
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {tarifsAcc.map((t) => (
                      <TarifCard
                        key={t.id}
                        prime={t.prime}
                        capitalGaranti={t.capitalGaranti}
                        selected={selectedTarifId === t.id}
                        onSelect={() => setSelectedTarifId(t.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Récapitulatif tarif incendie */}
              {qrInfo?.produit === "incendie" && selectedTarif && (
                <div
                  style={{
                    background: "var(--sim-primary-50, #e6f1fb)",
                    borderRadius: 10,
                    padding: "12px 16px",
                    marginBottom: 22,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 13, color: "#5b6b80" }}>Tarif appliqué</div>
                  <div style={{ fontWeight: 800, color: "#004b9c", fontSize: 15 }}>
                    {fcfa(selectedTarif.prime)} / an
                  </div>
                </div>
              )}

              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 18 }}>
                Vos informations
              </div>

              {qrInfo?.produit === "accident" ? (
                <>
                  <FieldRow label="Prénom *">
                    <input
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      placeholder="Votre prénom"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Nom *">
                    <input
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      placeholder="Votre nom"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Téléphone * (pour recevoir votre confirmation)">
                    <input
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      placeholder="+225 07 00 00 00 00"
                      type="tel"
                      style={inputStyle}
                    />
                  </FieldRow>
                </>
              ) : (
                <>
                  <FieldRow label="Téléphone * (pour recevoir le lien WhatsApp)">
                    <input
                      value={telephoneInc}
                      onChange={(e) => setTelephoneInc(e.target.value)}
                      placeholder="+225 07 00 00 00 00"
                      type="tel"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Prénom (optionnel)">
                    <input
                      value={prenomInc}
                      onChange={(e) => setPrenomInc(e.target.value)}
                      placeholder="Votre prénom"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Nom (optionnel)">
                    <input
                      value={nomInc}
                      onChange={(e) => setNomInc(e.target.value)}
                      placeholder="Votre nom"
                      style={inputStyle}
                    />
                  </FieldRow>
                </>
              )}

              <button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (qrInfo?.produit === "accident"
                    ? !nom || !prenom || !telephone || !selectedTarifId
                    : !telephoneInc)
                }
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "13px 0",
                  background: "#004b9c",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                  opacity:
                    submitting ||
                    (qrInfo?.produit === "accident"
                      ? !nom || !prenom || !telephone || !selectedTarifId
                      : !telephoneInc)
                      ? 0.5
                      : 1,
                }}
              >
                {submitting
                  ? "Traitement…"
                  : qrInfo?.produit === "accident"
                  ? "Passer au paiement →"
                  : "Confirmer la souscription →"}
              </button>
            </div>
          )}

          {/* ── ÉTAPE 3 : PAIEMENT WAVE (accident) ── */}
          {step === "confirm" && qrInfo?.produit === "accident" && result && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: "#e6f1fb",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 18px",
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="#004b9c"/>
                </svg>
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                Paiement Wave
              </div>
              <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 24 }}>
                Montant à payer :{" "}
                <strong style={{ color: "#004b9c", fontSize: 18 }}>
                  {fcfa(result.montant!)}
                </strong>
                <br />
                Capital garanti :{" "}
                <strong>{fcfa(result.capitalGaranti!)}</strong>
              </div>

              <div
                style={{
                  background: "#f5f8fc",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 20,
                  fontSize: 12,
                  color: "#5b6b80",
                  wordBreak: "break-all",
                }}
              >
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Lien de paiement (simulé) :
                </div>
                {result.checkoutUrl}
              </div>

              <button
                onClick={simulateWavePayment}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "13px 0",
                  background: "#004b9c",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                {submitting ? "Confirmation…" : "Simuler le paiement Wave ✓"}
              </button>
            </div>
          )}

          {/* ── SUCCÈS ── */}
          {step === "success" && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  background: "#e8f6ec",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 20px",
                }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="#15803d"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {qrInfo?.produit === "accident" ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                    Paiement confirmé !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    Votre assurance accident est activée.
                  </div>
                  {result?.numeroPolice && (
                    <div
                      style={{
                        background: "#e8f6ec",
                        border: "1px solid #bbf7d0",
                        borderRadius: 12,
                        padding: "16px 20px",
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>
                        Numéro de police
                      </div>
                      <div
                        style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginTop: 4 }}
                      >
                        {result.numeroPolice}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "#5b6b80" }}>
                    Un lien WhatsApp vous a été envoyé pour compléter votre dossier.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                    Souscription enregistrée !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 16 }}>
                    Un lien de complétion vous a été envoyé par WhatsApp.
                  </div>
                  <div
                    style={{
                      background: "#e6f1fb",
                      borderRadius: 10,
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "#004b9c",
                    }}
                  >
                    Vous recevrez sous peu un message WhatsApp avec votre lien de
                    complétion de formulaire.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "#5b6b80",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
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
