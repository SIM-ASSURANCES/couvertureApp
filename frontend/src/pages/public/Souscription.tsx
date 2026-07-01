import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { API_BASE } from "../../api";
const BASE = API_BASE;

interface QrInfo {
  produit: "incendie" | "accident";
  partenaire: { id: string; nomCommerce: string };
  montantPrime?: number | null;
  capitalGaranti?: number | null;
}

interface TarifAccident {
  id: number;
  prime: number;
  capitalGaranti: number;
  commission: number;
}

type Step = "loading" | "infos" | "confirm" | "retry" | "success" | "error";

const PHONE_PREFIX = "+225";
function phoneLocalPart(v: string) {
  return v.startsWith(PHONE_PREFIX) ? v.slice(PHONE_PREFIX.length) : v;
}

function fcfa(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function PhoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        border: "1px solid #dde3ec",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          padding: "0 12px",
          height: 44,
          display: "flex",
          alignItems: "center",
          background: "#f5f8fc",
          color: "#5b6b80",
          fontWeight: 700,
          fontSize: 14,
          borderRight: "1px solid #dde3ec",
        }}
      >
        {PHONE_PREFIX}
      </span>
      <input
        value={phoneLocalPart(value)}
        onChange={(e) =>
          onChange(PHONE_PREFIX + e.target.value.replace(/\D/g, "").slice(0, 10))
        }
        placeholder="07 00 00 00 00"
        type="tel"
        style={{ ...inputStyle, border: "none", borderRadius: 0, flex: 1 }}
      />
    </div>
  );
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
  const [searchParams] = useSearchParams();
  const paidId = searchParams.get("paid");
  const retryId = searchParams.get("retry");
  const paiementEchec = searchParams.get("paiement") === "echec";

  const [step, setStep] = useState<Step>("loading");
  const [qrInfo, setQrInfo] = useState<QrInfo | null>(null);
  const [tarifsAcc, setTarifsAcc] = useState<TarifAccident[]>([]);
  const [selectedTarifId, setSelectedTarifId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Champs accident
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState(PHONE_PREFIX);
  const [dateNaissance, setDateNaissance] = useState("");

  // Champs incendie
  const [telephoneInc, setTelephoneInc] = useState(PHONE_PREFIX);
  const [prenomInc, setPrenomInc] = useState("");
  const [nomInc, setNomInc] = useState("");

  // Résultat souscription
  const [result, setResult] = useState<{
    checkoutUrl?: string;
    souscriptionId?: string;
    numeroPolice?: string;
    lienToken?: string;
    montant?: number;
    capitalGaranti?: number;
    dateDebut?: string;
    dateFin?: string;
    nom?: string;
    prenom?: string;
    telephone?: string;
    partenaire?: string;
  } | null>(null);

  useEffect(() => {
    // Retour depuis Wave après paiement réussi
    if (paidId) {
      const finaliser = async () => {
        // 1) Confirme le paiement via Wave (filet de sécurité si le webhook n'arrive pas).
        //    Plusieurs tentatives : Wave peut mettre quelques secondes à valider.
        let statut = "en_attente";
        for (let i = 0; i < 5; i++) {
          try {
            const r = await fetch(
              `${BASE}/public/souscriptions/accident/${paidId}/verify`
            );
            const v = await r.json();
            statut = v.statut ?? statut;
            if (statut === "confirme" || statut === "echoue") break;
          } catch {
            /* on réessaie */
          }
          await new Promise((res) => setTimeout(res, 2000));
        }

        if (statut === "echoue") {
          setErrorMsg("Le paiement n'a pas abouti. Veuillez réessayer.");
          setStep("error");
          return;
        }

        // 2) Récupère le contrat
        try {
          const r = await fetch(
            `${BASE}/public/souscriptions/accident/${paidId}/contrat`
          );
          const data = await r.json();
          if (data.error) {
            setErrorMsg(
              "Paiement en cours de validation. Actualisez la page dans quelques instants."
            );
            setStep("error");
            return;
          }
          setQrInfo({
            produit: "accident",
            partenaire: { id: "", nomCommerce: data.partenaire ?? "" },
          });
          setResult({
            numeroPolice: data.numeroPolice,
            montant: data.montant,
            capitalGaranti: data.capitalGaranti,
            dateDebut: data.dateDebut,
            dateFin: data.dateFin,
            nom: data.nom,
            prenom: data.prenom,
            telephone: data.telephone,
            partenaire: data.partenaire,
          });
          setStep("success");
        } catch {
          setErrorMsg("Erreur lors de la récupération du contrat.");
          setStep("error");
        }
      };
      finaliser();
      return;
    }

    // Relance depuis SMS (paiement échoué)
    if (retryId) {
      fetch(`${BASE}/public/souscriptions/accident/${retryId}/info`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setErrorMsg("Souscription introuvable."); setStep("error"); return; }
          setQrInfo({ produit: "accident", partenaire: { id: "", nomCommerce: data.partenaire } });
          setNom(data.nom);
          setPrenom(data.prenom);
          setTelephone(data.telephone);
          setDateNaissance(data.dateNaissance ? String(data.dateNaissance).slice(0, 10) : "");
          setResult({ montant: data.montant, capitalGaranti: data.capitalGaranti, partenaire: data.partenaire });
          setStep("retry");
        })
        .catch(() => { setErrorMsg("Erreur lors du chargement."); setStep("error"); });
      return;
    }

    // Retour depuis Wave après échec (paramètre URL)
    if (paiementEchec) {
      setErrorMsg("Le paiement Wave a échoué ou a été annulé. Veuillez réessayer.");
      setStep("error");
      return;
    }

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
        }
        setStep("infos");
      })
      .catch(() => {
        setErrorMsg("Impossible de charger les informations. Veuillez réessayer.");
        setStep("error");
      });
  }, [token, paidId, retryId, paiementEchec]);

  async function handleSubmit() {
    if (!qrInfo || !token) return;
    if (qrInfo.produit === "accident" && !selectedTarifId) return;
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
            dateNaissance,
            tarifAccidentId: selectedTarifId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur lors de la souscription");
        setResult({
          checkoutUrl: data.checkoutUrl,
          souscriptionId: data.souscriptionId,
          montant: data.montant,
          capitalGaranti: data.capitalGaranti,
        });
        // Redirection immédiate vers Wave (ou stub = success URL directe)
        window.location.href = data.checkoutUrl;
        return;
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

  function telechargerContrat() {
    if (!result || !qrInfo) return;
    // Données de l'assuré : priorité aux champs du result (retour depuis Wave), fallback état local
    const _prenom = result.prenom ?? prenom;
    const _nom = result.nom ?? nom;
    const _telephone = result.telephone ?? telephone;
    const _partenaire = result.partenaire ?? qrInfo.partenaire.nomCommerce;
    const debut = result.dateDebut ? new Date(result.dateDebut) : new Date();
    const fin = result.dateFin
      ? new Date(result.dateFin)
      : new Date(new Date().setMonth(new Date().getMonth() + 3));
    const d = (x: Date) => x.toLocaleDateString("fr-FR");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Contrat ${result.numeroPolice ?? ""}</title>
<style>
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
  body{margin:0;color:#0f1b2d;padding:40px;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #004b9c;padding-bottom:16px;margin-bottom:24px;}
  .brand img{height:56px;display:block;}
  .pol{text-align:right;font-size:13px;color:#5b6b80;}
  .pol b{display:block;font-size:18px;color:#0f1b2d;letter-spacing:1px;}
  h1{font-size:20px;margin:0 0 6px;}
  .sub{color:#5b6b80;font-size:13px;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;}
  td{padding:10px 12px;border:1px solid #e3e9f1;font-size:14px;}
  td.k{background:#f5f8fc;font-weight:600;width:42%;color:#5b6b80;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px;}
  .box{border:1px solid #e3e9f1;border-radius:10px;padding:14px 16px;}
  .box .l{font-size:11px;color:#5b6b80;text-transform:uppercase;letter-spacing:.05em;}
  .box .v{font-size:17px;font-weight:800;margin-top:4px;}
  .note{font-size:12px;color:#5b6b80;border-top:1px solid #e3e9f1;padding-top:16px;margin-top:24px;}
  .sign{display:flex;justify-content:space-between;margin-top:48px;font-size:13px;color:#5b6b80;}
  @media print{body{padding:24px;}}
</style></head><body>
  <div class="head">
    <div class="brand"><img src="${window.location.origin}/logo.webp" alt="SIM Assurances" /></div>
    <div class="pol">N° de police<b>${result.numeroPolice ?? "—"}</b></div>
  </div>
  <h1>Contrat d'Assurance Accident</h1>
  <div class="sub">Distribué via ${_partenaire}</div>
  <div class="grid">
    <div class="box"><div class="l">Prime payée</div><div class="v">${fcfa(result.montant ?? 0)}</div></div>
    <div class="box"><div class="l">Frais de soins médicaux</div><div class="v">${fcfa(result.capitalGaranti ?? 0)}</div></div>
  </div>
  <table>
    <tr><td class="k">Assuré(e)</td><td>${_prenom} ${_nom}</td></tr>
    <tr><td class="k">Téléphone</td><td>${_telephone}</td></tr>
    <tr><td class="k">Date d'effet</td><td>${d(debut)}</td></tr>
    <tr><td class="k">Date d'échéance</td><td>${d(fin)}</td></tr>
    <tr><td class="k">Durée</td><td>3 mois</td></tr>
  </table>
  <div class="note">Ce contrat atteste de la souscription d'une assurance accident d'une durée de trois (03) mois,
  prenant effet le ${d(debut)} et arrivant à échéance le ${d(fin)}. La garantie est acquise sous réserve du
  paiement effectif de la prime. Document généré électroniquement par SIM Assurances CI.</div>
  <div class="sign"><div>Fait à Abidjan, le ${d(new Date())}</div><div>Pour SIM Assurances CI</div></div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
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

              {/* Récapitulatif incendie : capital garanti uniquement (prime masquée) */}
              {qrInfo?.produit === "incendie" && qrInfo.capitalGaranti && (
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
                  <div style={{ fontSize: 13, color: "#5b6b80" }}>Capital garanti</div>
                  <div style={{ fontWeight: 800, color: "#004b9c", fontSize: 15 }}>
                    {fcfa(qrInfo.capitalGaranti)}
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
                    <PhoneInput value={telephone} onChange={setTelephone} />
                  </FieldRow>
                  <FieldRow label="Date de naissance *">
                    <input
                      value={dateNaissance}
                      onChange={(e) => setDateNaissance(e.target.value)}
                      type="date"
                      style={inputStyle}
                    />
                  </FieldRow>
                </>
              ) : (
                <>
                  <FieldRow label="Téléphone * (pour recevoir le lien par SMS)">
                    <PhoneInput value={telephoneInc} onChange={setTelephoneInc} />
                  </FieldRow>
                  <FieldRow label="Prénom">
                    <input
                      value={prenomInc}
                      onChange={(e) => setPrenomInc(e.target.value)}
                      placeholder="Votre prénom"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Nom">
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
                    ? !nom ||
                      !prenom ||
                      !phoneLocalPart(telephone) ||
                      !dateNaissance ||
                      !selectedTarifId
                    : !phoneLocalPart(telephoneInc))
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
                      ? !nom ||
                        !prenom ||
                        !phoneLocalPart(telephone) ||
                        !dateNaissance ||
                        !selectedTarifId
                      : !phoneLocalPart(telephoneInc))
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

          {/* ── RELANCE PAIEMENT (après échec Wave) ── */}
          {step === "retry" && result && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: "#dc2626" }}>
                Votre paiement a échoué
              </div>
              <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 24 }}>
                Bonjour <strong>{prenom}</strong>, votre paiement Wave de{" "}
                <strong style={{ color: "#004b9c" }}>{fcfa(result.montant!)}</strong> n'a pas abouti.
                <br />Cliquez ci-dessous pour finaliser votre assurance.
              </div>
              <div style={{
                background: "#f5f8fc",
                borderRadius: 12,
                padding: "14px 18px",
                marginBottom: 20,
                textAlign: "left",
                fontSize: 13,
              }}>
                <div><strong>Assuré :</strong> {prenom} {nom}</div>
                <div><strong>Capital garanti :</strong> {fcfa(result.capitalGaranti!)}</div>
              </div>
              <button
                onClick={async () => {
                  if (!token || !result.montant) return;
                  setSubmitting(true);
                  try {
                    const res = await fetch(`${BASE}/public/souscriptions/accident/initiate`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        qrToken: token,
                        nom,
                        prenom,
                        telephone,
                        dateNaissance,
                        tarifAccidentId: selectedTarifId ?? undefined,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    window.location.href = data.checkoutUrl;
                  } catch (e: unknown) {
                    setErrorMsg(e instanceof Error ? e.message : "Erreur");
                    setStep("error");
                  } finally {
                    setSubmitting(false);
                  }
                }}
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
                {submitting ? "Traitement…" : `Payer ${fcfa(result.montant!)} avec Wave`}
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
                  <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>
                    🎉 Félicitations !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    Votre assurance accident est activée pour <strong>3 mois</strong>.
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
                      {result.dateFin && (
                        <div style={{ fontSize: 12, color: "#15803d", marginTop: 8 }}>
                          Valable jusqu'au{" "}
                          {new Date(result.dateFin).toLocaleDateString("fr-FR")}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={telechargerContrat}
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
                    }}
                  >
                    ⬇ Télécharger mon contrat
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                    Souscription enregistrée !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 16 }}>
                    Un lien de complétion vous a été envoyé par SMS.
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
                    Vous recevrez sous peu un SMS avec votre lien de
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
