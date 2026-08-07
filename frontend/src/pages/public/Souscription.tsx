import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";

import { API_BASE } from "../../api";
import {
  genererContratAccident,
  genererContratRelaxAccidentsFraisMedicaux,
  genererContratRelaxVoyage,
  genererContratRelaxAccidentsGenerale,
} from "../../contract";
import { telechargerCarte } from "../../carte";
import SignaturePad, { type SignaturePadHandle } from "../../components/SignaturePad";
import PhotoCapture from "../../components/PhotoCapture";
import {
  calculerRelaxAccidentsGenerale,
  MONTANTS_IJ,
  MONTANTS_FRAIS_MEDICAUX,
  MONTANT_IPT_MAX,
  MONTANT_DECES_ACCIDENTEL_MAX,
  CLASSE_LABELS,
  TYPE_COUVERTURE_LABELS,
  type Classe,
  type TypeCouverture,
  type ResultatRelaxAccidentsGenerale,
} from "../../relaxAccidentsGenerale";
const BASE = API_BASE;

function isRelax(p?: string): p is "relaxmoto" | "relaxauto" {
  return p === "relaxmoto" || p === "relaxauto";
}

// RelaxAccidents Frais Médicaux (nouveau produit, refonte Assurances
// Accidents/Dommages) reprend exactement le même formulaire qu'Accident
// (dont il remplace les souscriptions) — mêmes champs, mêmes deux formules.
function isAccidentLike(p?: string): p is "accident" | "relaxaccidents_fraismedicaux" {
  return p === "accident" || p === "relaxaccidents_fraismedicaux";
}

function isRelaxVoyage(p?: string): p is "relaxvoyage" {
  return p === "relaxvoyage";
}

// RelaxAccidents générale (police collective, devis calculé dynamiquement) —
// distincte de RelaxAccidents Frais Médicaux (formule fixe au catalogue).
function isRelaxAccidentsGenerale(p?: string): p is "relaxaccidents" {
  return p === "relaxaccidents";
}

interface QrInfo {
  produit:
    | "incendie"
    | "accident"
    | "relaxmoto"
    | "relaxauto"
    | "relaxaccidents_fraismedicaux"
    | "relaxvoyage"
    | "relaxaccidents";
  partenaire: { id: string; nomCommerce: string };
  montantPrime?: number | null;
  capitalGaranti?: number | null;
}

// QR "sélecteur" (refonte Assurances Accidents/Dommages) : un seul QR par
// partenaire/Assurance — le prospect choisit son produit après le scan.
interface ChooserProduit {
  code: string;
  libelle: string;
  disponible: boolean;
  montantPrime: number | null;
  capitalGaranti: number | null;
  // Renseigné uniquement pour Incendie (pont vers le modèle historique) —
  // le clic redirige alors vers /s/incendie/:token plutôt que de continuer
  // avec le token du sélecteur.
  token?: string;
}

interface ChooserInfo {
  sousBranche: string;
  partenaire: { id: string; nomCommerce: string };
  produits: ChooserProduit[];
}

interface TarifAccident {
  id: number;
  prime: number;
  capitalGaranti: number;
  commission: number;
}

interface TarifRelax {
  id: number;
  libelleVariante: "annuel" | "mensuel";
  prime: number;
  capitalGaranti: number;
}

interface TarifFormule {
  id: number;
  libelleVariante: string | null;
  prime: number;
  capitalGaranti: number;
}

type Step = "loading" | "choose-produit" | "infos" | "confirm" | "retry" | "success" | "error";

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

function SexeField({
  value,
  onChange,
}: {
  value: "masculin" | "feminin" | "";
  onChange: (v: "masculin" | "feminin") => void;
}) {
  return (
    <FieldRow label="Sexe *">
      <div style={{ display: "flex", gap: 16 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="radio" checked={value === "masculin"} onChange={() => onChange("masculin")} />
          Masculin
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="radio" checked={value === "feminin"} onChange={() => onChange("feminin")} />
          Féminin
        </label>
      </div>
    </FieldRow>
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

// RelaxAccidents générale : formulaire d'entreprise (police collective) +
// aperçu du devis recalculé en direct à chaque changement de champ (même
// formule que le service backend, voir ../../relaxAccidentsGenerale — jamais
// envoyé tel quel au serveur, qui recalcule systématiquement à la soumission).
function RelaxAccidentsGeneraleForm({
  raisonSociale,
  setRaisonSociale,
  profession,
  setProfession,
  classe,
  setClasse,
  typeCouverture,
  setTypeCouverture,
  effectif,
  setEffectif,
  montantIJ,
  setMontantIJ,
  montantFraisMedicaux,
  setMontantFraisMedicaux,
  montantIPT,
  setMontantIPT,
  montantDecesAccidentel,
  setMontantDecesAccidentel,
  telephone,
  setTelephone,
  sigRef,
}: {
  raisonSociale: string;
  setRaisonSociale: (v: string) => void;
  profession: string;
  setProfession: (v: string) => void;
  classe: Classe | "";
  setClasse: (v: Classe | "") => void;
  typeCouverture: TypeCouverture | "";
  setTypeCouverture: (v: TypeCouverture | "") => void;
  effectif: string;
  setEffectif: (v: string) => void;
  montantIJ: string;
  setMontantIJ: (v: string) => void;
  montantFraisMedicaux: string;
  setMontantFraisMedicaux: (v: string) => void;
  montantIPT: string;
  setMontantIPT: (v: string) => void;
  montantDecesAccidentel: string;
  setMontantDecesAccidentel: (v: string) => void;
  telephone: string;
  setTelephone: (v: string) => void;
  sigRef: React.RefObject<SignaturePadHandle | null>;
}) {
  let resultat: ResultatRelaxAccidentsGenerale | null = null;
  let erreur = "";
  if (classe && typeCouverture && effectif) {
    try {
      resultat = calculerRelaxAccidentsGenerale({
        classe,
        typeCouverture,
        effectif: Number(effectif),
        montantIJ: Number(montantIJ),
        montantFraisMedicaux: Number(montantFraisMedicaux),
        montantIPT: Number(montantIPT),
        montantDecesAccidentel: Number(montantDecesAccidentel),
      });
    } catch (e) {
      erreur = e instanceof Error ? e.message : "Entrées invalides.";
    }
  }

  return (
    <>
      <FieldRow label="Raison sociale / Nom de l'entreprise *">
        <input
          value={raisonSociale}
          onChange={(e) => setRaisonSociale(e.target.value)}
          placeholder="Ex. BANESSERE CASA"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Profession / Type d'activité *">
        <input
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          placeholder="Ex. Construction bâtiment"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Classe de risque *">
        <select
          value={classe}
          onChange={(e) => setClasse(e.target.value ? (Number(e.target.value) as Classe) : "")}
          style={inputStyle}
        >
          <option value="">Sélectionnez...</option>
          {([1, 2, 3, 4] as Classe[]).map((c) => (
            <option key={c} value={c}>
              {CLASSE_LABELS[c]}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Effectif à assurer *">
        <input
          value={effectif}
          onChange={(e) => setEffectif(e.target.value.replace(/\D/g, ""))}
          type="text"
          inputMode="numeric"
          placeholder="Ex. 10"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Type de couverture *">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(["vie_privee", "vie_professionnelle", "vie_privee_professionnelle"] as TypeCouverture[]).map((t) => (
            <label key={t} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={typeCouverture === t} onChange={() => setTypeCouverture(t)} />
              {TYPE_COUVERTURE_LABELS[t]}
            </label>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Indemnité Journalière *">
        <select value={montantIJ} onChange={(e) => setMontantIJ(e.target.value)} style={inputStyle}>
          {MONTANTS_IJ.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Frais médicaux *">
        <select value={montantFraisMedicaux} onChange={(e) => setMontantFraisMedicaux(e.target.value)} style={inputStyle}>
          {MONTANTS_FRAIS_MEDICAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label={`Invalidité Permanente Totale (max ${fcfa(MONTANT_IPT_MAX)}) *`}>
        <input
          value={montantIPT}
          onChange={(e) => setMontantIPT(e.target.value.replace(/\D/g, ""))}
          type="text"
          inputMode="numeric"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label={`Décès Accidentel (max ${fcfa(MONTANT_DECES_ACCIDENTEL_MAX)}) *`}>
        <input
          value={montantDecesAccidentel}
          onChange={(e) => setMontantDecesAccidentel(e.target.value.replace(/\D/g, ""))}
          type="text"
          inputMode="numeric"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Téléphone * (pour recevoir votre confirmation)">
        <PhoneInput value={telephone} onChange={setTelephone} />
      </FieldRow>

      <div
        style={{
          background: "var(--sim-primary-50, #e6f1fb)",
          borderRadius: 12,
          padding: "14px 16px",
          margin: "18px 0",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: "#004b9c" }}>
          Aperçu du devis
        </div>
        {resultat ? (
          <>
            {resultat.lignes.map((l) => (
              <div
                key={l.garantie}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 4 }}
              >
                <span>{l.garantie}</span>
                <span>{fcfa(l.prime)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #cfe0f5", margin: "8px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 4 }}>
              <span>Prime nette HT ({resultat.effectif} pers.)</span>
              <span>{fcfa(resultat.primeNetteHT1)}</span>
            </div>
            {resultat.reductionPct > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 4 }}>
                <span>Réduction com. effectif (-{Math.round(resultat.reductionPct * 100)}%)</span>
                <span>-{fcfa(resultat.primeNetteHT1 - resultat.primeNetteHT2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 4 }}>
              <span>Accessoires</span>
              <span>{fcfa(resultat.accessoires)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 8 }}>
              <span>Taxes</span>
              <span>{fcfa(resultat.taxes)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#004b9c" }}>
              <span>PRIME TTC</span>
              <span>{fcfa(resultat.primeTTC)}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "#5b6b80" }}>
            {erreur || "Renseignez les champs ci-dessus pour voir le montant de votre prime."}
          </div>
        )}
      </div>

      <SignaturePad ref={sigRef} label="Signature (facultative)" />
    </>
  );
}

export default function Souscription() {
  const { token, produit: produitParam } = useParams<{ token: string; produit?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paidId = searchParams.get("paid");
  const retryId = searchParams.get("retry");
  const paiementEchec = searchParams.get("paiement") === "echec";
  // Avant la résolution du QR (ou pour le retour Wave, où qrInfo n'est pas
  // encore chargé), le produit vient du segment d'URL — "accident" par
  // défaut pour compat avec l'ancienne route /souscription/:token.
  const produitEffectif = produitParam || "accident";

  const [step, setStep] = useState<Step>("loading");
  const [qrInfo, setQrInfo] = useState<QrInfo | null>(null);
  const [chooserInfo, setChooserInfo] = useState<ChooserInfo | null>(null);
  const [tarifsAcc, setTarifsAcc] = useState<TarifAccident[]>([]);
  const [selectedTarifId, setSelectedTarifId] = useState<number | null>(null);
  const [tarifsFormule, setTarifsFormule] = useState<TarifFormule[]>([]);
  const [selectedFormule, setSelectedFormule] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Champs accident
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState(PHONE_PREFIX);
  const [dateNaissance, setDateNaissance] = useState("");
  // Affiché sur la carte de prise en charge (refonte Novelia) — partagé par
  // les branches accident-like, RelaxVoyage et RelaxMoto/RelaxAuto.
  const [sexe, setSexe] = useState<"masculin" | "feminin" | "">("");
  const sigRef = useRef<SignaturePadHandle>(null);
  const [retrySignature, setRetrySignature] = useState<string | null>(null);

  // Champs incendie
  const [telephoneInc, setTelephoneInc] = useState(PHONE_PREFIX);
  const [prenomInc, setPrenomInc] = useState("");
  const [nomInc, setNomInc] = useState("");
  const [communeInc, setCommuneInc] = useState("");
  const [quartierInc, setQuartierInc] = useState("");

  // Champs RelaxVoyage (en plus de nom/prenom/telephone/dateNaissance,
  // partagés avec la branche isAccidentLike ci-dessus)
  const [compagnie, setCompagnie] = useState("");
  const [lieuDepart, setLieuDepart] = useState("");
  const [lieuArrivee, setLieuArrivee] = useState("");
  const [numeroTicket, setNumeroTicket] = useState("");
  const [dateDepart, setDateDepart] = useState("");
  const [numeroPersonneContact, setNumeroPersonneContact] = useState(PHONE_PREFIX);

  // Champs RelaxAccidents générale (police collective, devis calculé
  // dynamiquement — pas de tarif au catalogue). `telephone`/`sigRef` sont
  // partagés avec la branche isAccidentLike/isRelaxVoyage ci-dessus.
  const [raisonSociale, setRaisonSociale] = useState("");
  const [profession, setProfession] = useState("");
  const [classe, setClasse] = useState<Classe | "">("");
  const [typeCouverture, setTypeCouverture] = useState<TypeCouverture | "">("");
  const [effectif, setEffectif] = useState("1");
  const [montantIJ, setMontantIJ] = useState<string>(String(MONTANTS_IJ[0]));
  const [montantFraisMedicaux, setMontantFraisMedicaux] = useState<string>(String(MONTANTS_FRAIS_MEDICAUX[0]));
  const [montantIPT, setMontantIPT] = useState("0");
  const [montantDecesAccidentel, setMontantDecesAccidentel] = useState("0");

  // Champs RelaxMoto/RelaxAuto
  const [tarifsRelax, setTarifsRelax] = useState<TarifRelax[]>([]);
  const [cycle, setCycle] = useState<"annuel" | "mensuel">("annuel");
  const [nomRx, setNomRx] = useState("");
  const [prenomRx, setPrenomRx] = useState("");
  const [telephoneRx, setTelephoneRx] = useState(PHONE_PREFIX);
  const [typePieceRx, setTypePieceRx] = useState<"CNI" | "Permis">("CNI");
  const [piecePhotoRx, setPiecePhotoRx] = useState<string | null>(null);
  const [selfiePhotoRx, setSelfiePhotoRx] = useState<string | null>(null);

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
    dateNaissance?: string;
    nom?: string;
    prenom?: string;
    telephone?: string;
    partenaire?: string;
    signature?: string | null;
    pieceIdentiteUrl?: string | null;
    selfieUrl?: string | null;
    compagnie?: string | null;
    lieuDepart?: string | null;
    lieuArrivee?: string | null;
    numeroTicket?: string | null;
    dateDepart?: string | null;
    numeroPersonneContact?: string | null;
    fraisSante?: number | null;
    bagages?: string | null;
    raisonSociale?: string | null;
    profession?: string | null;
    classe?: number | null;
    typeCouverture?: string | null;
    effectif?: number | null;
    resultat?: ResultatRelaxAccidentsGenerale | null;
  } | null>(null);

  // Carte virtuelle de prise en charge — collecte pièce d'identité + selfie
  // après confirmation du paiement (accident), ou téléchargement direct
  // (relax : ces photos sont déjà capturées avant paiement).
  const [cartePieceUrl, setCartePieceUrl] = useState<string | null>(null);
  const [carteSelfieUrl, setCarteSelfieUrl] = useState<string | null>(null);
  const [cartePhotosEnvoyees, setCartePhotosEnvoyees] = useState(false);
  const [cartePhotosBusy, setCartePhotosBusy] = useState(false);
  const [carteBusy, setCarteBusy] = useState(false);
  const [carteErreur, setCarteErreur] = useState("");

  useEffect(() => {
    // Retour depuis Wave après paiement réussi
    if (paidId) {
      const finaliser = async () => {
        // Les produits sur le modèle générique (RelaxMoto/RelaxAuto, et
        // désormais RelaxAccidents Frais Médicaux/RelaxVoyage) partagent les
        // mêmes routes "echeances/:id/verify" + ":id/contrat" — seul l'ancien
        // Accident garde ses routes dédiées.
        const generique =
          isRelax(produitEffectif) ||
          produitEffectif === "relaxaccidents_fraismedicaux" ||
          produitEffectif === "relaxvoyage" ||
          produitEffectif === "relaxaccidents";
        const urlVerify = generique
          ? `${BASE}/public/souscriptions/${produitEffectif}/echeances/${paidId}/verify`
          : `${BASE}/public/souscriptions/accident/${paidId}/verify`;
        const urlContrat = generique
          ? `${BASE}/public/souscriptions/${produitEffectif}/${paidId}/contrat`
          : `${BASE}/public/souscriptions/accident/${paidId}/contrat`;

        // 1) Confirme le paiement via Wave (filet de sécurité si le webhook n'arrive pas).
        //    Plusieurs tentatives : Wave peut mettre quelques secondes à valider.
        let statut = "en_attente";
        for (let i = 0; i < 5; i++) {
          try {
            const r = await fetch(urlVerify);
            const v = await r.json();
            statut = v.statut ?? statut;
            if (statut === "confirme" || statut === "paye" || statut === "echoue") break;
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

        // 2) Récupère le contrat (relax : disponible seulement quand la 1ère échéance est confirmée)
        try {
          const r = await fetch(urlContrat);
          const data = await r.json();
          if (data.error) {
            setErrorMsg(
              "Paiement en cours de validation. Actualisez la page dans quelques instants."
            );
            setStep("error");
            return;
          }
          setQrInfo({
            produit: (generique ? produitEffectif : "accident") as QrInfo["produit"],
            partenaire: { id: "", nomCommerce: data.partenaire ?? "" },
          });
          setResult({
            numeroPolice: data.numeroPolice,
            montant: data.montant,
            capitalGaranti: data.capitalGaranti,
            dateDebut: data.dateDebut,
            dateFin: data.dateFin,
            dateNaissance: data.dateNaissance,
            nom: data.nom,
            prenom: data.prenom,
            telephone: data.telephone,
            partenaire: data.partenaire,
            signature: data.signature,
            pieceIdentiteUrl: data.pieceIdentiteUrl ?? null,
            selfieUrl: data.selfieUrl ?? null,
            compagnie: data.compagnie ?? null,
            lieuDepart: data.lieuDepart ?? null,
            lieuArrivee: data.lieuArrivee ?? null,
            numeroTicket: data.numeroTicket ?? null,
            dateDepart: data.dateDepart ?? null,
            numeroPersonneContact: data.numeroPersonneContact ?? null,
            fraisSante: data.fraisSante ?? null,
            bagages: data.bagages ?? null,
            raisonSociale: data.raisonSociale ?? null,
            profession: data.profession ?? null,
            classe: data.classe ?? null,
            typeCouverture: data.typeCouverture ?? null,
            effectif: data.effectif ?? null,
            resultat: data.resultat ?? null,
          });
          setCartePhotosEnvoyees(!!(data.pieceIdentiteUrl && data.selfieUrl));
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
          setRetrySignature(data.signature ?? null);
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

    fetch(`${BASE}/public/qr/${token}`)
      .then((r) => r.json())
      .then(async (qr) => {
        if (qr.error) {
          setErrorMsg(qr.error);
          setStep("error");
          return;
        }

        // QR "sélecteur" (refonte Assurances Accidents/Dommages) : affiche la
        // liste des produits de la sous-branche, le prospect en choisit un.
        if (qr.type === "chooser") {
          setChooserInfo(qr);
          setStep("choose-produit");
          return;
        }

        setQrInfo(qr);
        await chargerTarifsProduit(qr.produit);
        setStep("infos");
      })
      .catch(() => {
        setErrorMsg("Impossible de charger les informations. Veuillez réessayer.");
        setStep("error");
      });
  }, [token, paidId, retryId, paiementEchec, produitEffectif]);

  /** Charge les tarifs/formules du produit choisi (QR précis, ou après sélection depuis un QR sélecteur). */
  async function chargerTarifsProduit(produit: string) {
    if (produit === "accident") {
      const acc = await fetch(`${BASE}/public/tarifs/accident`).then((r) => r.json());
      // La formule 1000 FCFA doit apparaître en premier et être sélectionnée par défaut.
      const accTriee = [...acc].sort(
        (a: TarifAccident, b: TarifAccident) =>
          (a.prime === 1000 ? -1 : b.prime === 1000 ? 1 : a.prime - b.prime)
      );
      setTarifsAcc(accTriee);
      if (accTriee.length > 0) setSelectedTarifId(accTriee[0].id);
    } else if (produit === "relaxaccidents_fraismedicaux" || produit === "relaxvoyage") {
      const formules: TarifFormule[] = await fetch(`${BASE}/public/tarifs/${produit}`).then((r) => r.json());
      // RelaxAccidents Frais Médicaux : la formule 1000 FCFA doit apparaître
      // en premier et être sélectionnée par défaut. RelaxVoyage : ordre croissant.
      const formulesTriees =
        produit === "relaxaccidents_fraismedicaux"
          ? [...formules].sort((a, b) => (a.prime === 1000 ? -1 : b.prime === 1000 ? 1 : a.prime - b.prime))
          : [...formules].sort((a, b) => a.prime - b.prime);
      setTarifsFormule(formulesTriees);
      if (formulesTriees.length > 0) setSelectedFormule(formulesTriees[0].libelleVariante);
    } else if (isRelax(produit)) {
      const tarifs: TarifRelax[] = await fetch(`${BASE}/public/tarifs/${produit}`).then((r) => r.json());
      setTarifsRelax(tarifs);
      setCycle("annuel");
    }
  }

  /** Choix d'un produit depuis l'écran sélecteur (QR "sélecteur" — Assurance Accidents/Dommages). */
  async function choisirProduit(p: ChooserProduit) {
    if (!p.disponible) return;
    // Incendie reste sur le modèle historique : redirige vers son propre
    // token dédié plutôt que de continuer avec celui du sélecteur.
    if (p.token) {
      navigate(`/s/incendie/${p.token}`, { replace: true });
      return;
    }
    if (!chooserInfo) return;
    setQrInfo({ produit: p.code as QrInfo["produit"], partenaire: chooserInfo.partenaire });
    setStep("loading");
    await chargerTarifsProduit(p.code);
    setStep("infos");
  }

  /** Retour à l'écran sélecteur (uniquement possible si on y est arrivé via un QR "sélecteur"). */
  function retourListeProduits() {
    if (!chooserInfo) return;
    setQrInfo(null);
    setStep("choose-produit");
  }

  async function handleSubmit() {
    if (!qrInfo || !token) return;
    if (qrInfo.produit === "accident" && !selectedTarifId) return;
    if ((qrInfo.produit === "relaxaccidents_fraismedicaux" || qrInfo.produit === "relaxvoyage") && !selectedFormule) return;
    // Signature facultative : envoyée si le client a signé, sinon on continue sans.
    const signature =
      isAccidentLike(qrInfo.produit) || isRelaxVoyage(qrInfo.produit) || isRelaxAccidentsGenerale(qrInfo.produit)
        ? sigRef.current?.toDataURL() ?? undefined
        : undefined;
    setSubmitting(true);
    try {
      if (qrInfo.produit === "relaxaccidents") {
        const res = await fetch(`${BASE}/public/souscriptions/relaxaccidents/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            raisonSociale,
            profession,
            telephone,
            signature,
            classe,
            typeCouverture,
            effectif: Number(effectif),
            montantIJ: Number(montantIJ),
            montantFraisMedicaux: Number(montantFraisMedicaux),
            montantIPT: Number(montantIPT),
            montantDecesAccidentel: Number(montantDecesAccidentel),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur lors de la souscription");
        setResult({
          checkoutUrl: data.checkoutUrl,
          souscriptionId: data.souscriptionId,
          montant: data.montant,
          resultat: data.resultat,
        });
        window.location.href = data.checkoutUrl;
        return;
      } else if (qrInfo.produit === "relaxvoyage") {
        const res = await fetch(`${BASE}/public/souscriptions/relaxvoyage/initiate-formule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            nom,
            prenom,
            telephone,
            dateNaissance,
            sexe: sexe || undefined,
            formule: selectedFormule,
            signature,
            compagnie,
            lieuDepart,
            lieuArrivee,
            numeroTicket,
            dateDepart,
            numeroPersonneContact,
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
        window.location.href = data.checkoutUrl;
        return;
      } else if (qrInfo.produit === "accident") {
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
            signature,
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
      } else if (qrInfo.produit === "relaxaccidents_fraismedicaux") {
        const res = await fetch(`${BASE}/public/souscriptions/relaxaccidents_fraismedicaux/initiate-formule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            nom,
            prenom,
            telephone,
            dateNaissance,
            sexe: sexe || undefined,
            formule: selectedFormule,
            signature,
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
        window.location.href = data.checkoutUrl;
        return;
      } else if (isRelax(qrInfo.produit)) {
        const produit = qrInfo.produit;
        const res = await fetch(`${BASE}/public/souscriptions/${produit}/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            nom: nomRx,
            prenom: prenomRx,
            telephone: telephoneRx,
            sexe: sexe || undefined,
            cycle,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur lors de la souscription");

        // Dépôt des photos (pièce d'identité + selfie) — best-effort, ne bloque
        // jamais le paiement si l'envoi échoue (aucune perte de la vente).
        const documents = [
          piecePhotoRx ? { type: typePieceRx, url: piecePhotoRx } : null,
          selfiePhotoRx ? { type: "Selfie" as const, url: selfiePhotoRx } : null,
        ].filter((d): d is { type: "CNI" | "Permis" | "Selfie"; url: string } => d !== null);
        await Promise.all(
          documents.map((doc) =>
            fetch(`${BASE}/public/souscriptions/${produit}/${data.souscriptionId}/documents`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(doc),
            }).catch(() => null)
          )
        );

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
            commune: communeInc,
            quartier: quartierInc,
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
    if (qrInfo.produit === "relaxaccidents") {
      const resultat = result.resultat;
      if (!resultat) return;
      genererContratRelaxAccidentsGenerale({
        numeroPolice: result.numeroPolice ?? "",
        partenaire: result.partenaire ?? qrInfo.partenaire.nomCommerce,
        dateDebut: result.dateDebut ?? new Date().toISOString(),
        dateFin:
          result.dateFin ??
          new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
        telephone: result.telephone ?? telephone,
        raisonSociale: result.raisonSociale ?? raisonSociale,
        profession: result.profession ?? profession,
        classe: result.classe ?? (classe as number),
        typeCouverture: (result.typeCouverture ?? typeCouverture) as
          | "vie_privee"
          | "vie_professionnelle"
          | "vie_privee_professionnelle",
        effectif: result.effectif ?? Number(effectif),
        lignes: resultat.lignes.map((l) => ({ garantie: l.garantie, capital: l.montant, prime: l.prime })),
        primeNetteHT1: resultat.primeNetteHT1,
        reductionPct: resultat.reductionPct,
        primeNetteHT2: resultat.primeNetteHT2,
        accessoires: resultat.accessoires,
        taxes: resultat.taxes,
        primeTTC: resultat.primeTTC,
        signature: result.signature ?? null,
      });
      return;
    }
    const contrat = {
      numeroPolice: result.numeroPolice ?? "",
      partenaire: result.partenaire ?? qrInfo.partenaire.nomCommerce,
      dateDebut: result.dateDebut ?? new Date().toISOString(),
      dateFin:
        result.dateFin ??
        new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
      dateNaissance: result.dateNaissance ?? null,
      nom: result.nom ?? nom,
      prenom: result.prenom ?? prenom,
      telephone: result.telephone ?? telephone,
      montant: result.montant ?? 0,
      capitalGaranti: result.capitalGaranti ?? 0,
      signature: result.signature ?? null,
    };
    if (qrInfo.produit === "relaxvoyage") {
      genererContratRelaxVoyage({
        ...contrat,
        compagnie: result.compagnie ?? compagnie,
        lieuDepart: result.lieuDepart ?? lieuDepart,
        lieuArrivee: result.lieuArrivee ?? lieuArrivee,
        numeroTicket: result.numeroTicket ?? numeroTicket,
        dateDepart: result.dateDepart ?? dateDepart,
        numeroPersonneContact: result.numeroPersonneContact ?? numeroPersonneContact,
        fraisSante: result.fraisSante ?? null,
        bagages: result.bagages ?? null,
      });
    } else if (qrInfo.produit === "relaxaccidents_fraismedicaux") {
      genererContratRelaxAccidentsFraisMedicaux(contrat);
    } else {
      genererContratAccident(contrat);
    }
  }

  // RelaxAccidents Frais Médicaux/RelaxVoyage (modèle générique) : les photos
  // sont déposées via les mêmes routes /documents que RelaxMoto/RelaxAuto —
  // pas de colonnes pieceIdentiteUrl/selfieUrl dédiées comme sur l'ancien Accident.
  async function envoyerPhotosCarteAccident() {
    if (!paidId || !cartePieceUrl || !carteSelfieUrl || !qrInfo) return;
    setCartePhotosBusy(true);
    setCarteErreur("");
    try {
      if (qrInfo.produit === "relaxaccidents_fraismedicaux" || qrInfo.produit === "relaxvoyage") {
        const results = await Promise.all(
          [
            { type: "CNI" as const, url: cartePieceUrl },
            { type: "Selfie" as const, url: carteSelfieUrl },
          ].map((doc) =>
            fetch(`${BASE}/public/souscriptions/${qrInfo.produit}/${paidId}/documents`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(doc),
            })
          )
        );
        if (results.some((r) => !r.ok)) throw new Error("Erreur lors de l'envoi des photos");
      } else {
        const res = await fetch(`${BASE}/public/souscriptions/accident/${paidId}/carte-photos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pieceIdentiteUrl: cartePieceUrl, selfieUrl: carteSelfieUrl }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Erreur lors de l'envoi des photos");
      }
      setCartePhotosEnvoyees(true);
    } catch (e) {
      setCarteErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCartePhotosBusy(false);
    }
  }

  async function telechargerCarteVirtuelle() {
    if (!paidId || !qrInfo) return;
    setCarteBusy(true);
    setCarteErreur("");
    try {
      const type =
        isRelax(qrInfo.produit) || qrInfo.produit === "relaxaccidents_fraismedicaux" || qrInfo.produit === "relaxvoyage"
          ? qrInfo.produit
          : "accident";
      await telechargerCarte(type, paidId);
    } catch (e) {
      setCarteErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCarteBusy(false);
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
                {qrInfo.produit === "incendie"
                  ? "Assurance Incendie"
                  : isAccidentLike(qrInfo.produit)
                  ? "RelaxAccidents Frais Médicaux"
                  : qrInfo.produit === "relaxaccidents"
                  ? "RelaxAccidents (entreprise)"
                  : qrInfo.produit === "relaxvoyage"
                  ? "RelaxVoyage"
                  : qrInfo.produit === "relaxmoto"
                  ? "RelaxMoto"
                  : "RelaxAuto"}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                via {qrInfo.partenaire.nomCommerce}
              </div>
            </div>
          )}
          {!qrInfo && chooserInfo && (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {chooserInfo.sousBranche === "ASSURANCES_ACCIDENTS" ? "Assurances Accidents" : "Assurances Dommages"}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                via {chooserInfo.partenaire.nomCommerce}
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

          {/* ── SÉLECTEUR DE PRODUIT (QR "sélecteur" Assurances Accidents/Dommages) ── */}
          {step === "choose-produit" && chooserInfo && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>
                Choisissez votre assurance
              </div>
              <div style={{ color: "#5b6b80", fontSize: 13, marginBottom: 20 }}>
                Sélectionnez le produit qui vous intéresse pour poursuivre votre souscription.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {chooserInfo.produits.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => choisirProduit(p)}
                    disabled={!p.disponible}
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      border: "2px solid var(--border-strong, #dde3ec)",
                      borderRadius: 14,
                      background: p.disponible ? "#fff" : "#f5f8fc",
                      cursor: p.disponible ? "pointer" : "default",
                      textAlign: "left",
                      opacity: p.disponible ? 1 : 0.6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#0f1b2d" }}>{p.libelle}</div>
                      {p.disponible ? (
                        p.montantPrime != null && (
                          <div style={{ fontSize: 13, color: "#5b6b80", marginTop: 2 }}>
                            À partir de {fcfa(p.montantPrime)}
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: 12, color: "#b45309", marginTop: 2, fontWeight: 600 }}>
                          Bientôt disponible
                        </div>
                      )}
                    </div>
                    {p.disponible && (
                      <span style={{ color: "#004b9c", fontSize: 18 }}>→</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── FORMULAIRE ── */}
          {step === "infos" && (
            <div>
              {chooserInfo && (
                <button
                  type="button"
                  onClick={retourListeProduits}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: "none",
                    padding: 0,
                    marginBottom: 18,
                    color: "#004b9c",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ← Retour à la liste des produits
                </button>
              )}

              {/* Sélecteur de tarif pour l'accident (ancien modèle, en transition) */}
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

              {/* Sélecteur de formule pour RelaxAccidents Frais Médicaux / RelaxVoyage */}
              {(qrInfo?.produit === "relaxaccidents_fraismedicaux" || qrInfo?.produit === "relaxvoyage") && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#5b6b80", marginBottom: 10 }}>
                    Choisissez votre formule
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {tarifsFormule.map((t) => (
                      <TarifCard
                        key={t.id}
                        prime={t.prime}
                        capitalGaranti={t.capitalGaranti}
                        selected={selectedFormule === t.libelleVariante}
                        onSelect={() => setSelectedFormule(t.libelleVariante)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Sélecteur de formule pour RelaxMoto/RelaxAuto */}
              {qrInfo && isRelax(qrInfo.produit) && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#5b6b80", marginBottom: 10 }}>
                    Choisissez votre formule
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[...tarifsRelax]
                      .sort((a, b) => (a.libelleVariante === "annuel" ? -1 : b.libelleVariante === "annuel" ? 1 : 0))
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setCycle(t.libelleVariante)}
                          style={{
                            width: "100%",
                            padding: "16px 20px",
                            border: `2px solid ${cycle === t.libelleVariante ? "var(--sim-primary)" : "var(--border-strong)"}`,
                            borderRadius: 14,
                            background: cycle === t.libelleVariante ? "var(--sim-primary-50)" : "#fff",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ fontSize: 13, color: "#5b6b80", fontWeight: 600 }}>
                            {t.libelleVariante === "annuel" ? "Prime annuelle" : "Prime mensuelle"}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--sim-primary)", marginTop: 2 }}>
                            {fcfa(t.prime)}
                            {t.libelleVariante === "mensuel" && <span style={{ fontSize: 13, fontWeight: 600, color: "#5b6b80" }}> / mois</span>}
                          </div>
                        </button>
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

              {isRelaxAccidentsGenerale(qrInfo?.produit) ? (
                <RelaxAccidentsGeneraleForm
                  raisonSociale={raisonSociale}
                  setRaisonSociale={setRaisonSociale}
                  profession={profession}
                  setProfession={setProfession}
                  classe={classe}
                  setClasse={setClasse}
                  typeCouverture={typeCouverture}
                  setTypeCouverture={setTypeCouverture}
                  effectif={effectif}
                  setEffectif={setEffectif}
                  montantIJ={montantIJ}
                  setMontantIJ={setMontantIJ}
                  montantFraisMedicaux={montantFraisMedicaux}
                  setMontantFraisMedicaux={setMontantFraisMedicaux}
                  montantIPT={montantIPT}
                  setMontantIPT={setMontantIPT}
                  montantDecesAccidentel={montantDecesAccidentel}
                  setMontantDecesAccidentel={setMontantDecesAccidentel}
                  telephone={telephone}
                  setTelephone={setTelephone}
                  sigRef={sigRef}
                />
              ) : isRelaxVoyage(qrInfo?.produit) ? (
                <>
                  <FieldRow label="Prénom *">
                    <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Votre prénom" style={inputStyle} />
                  </FieldRow>
                  <FieldRow label="Nom *">
                    <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Votre nom" style={inputStyle} />
                  </FieldRow>
                  <FieldRow label="Téléphone * (pour recevoir votre confirmation)">
                    <PhoneInput value={telephone} onChange={setTelephone} />
                  </FieldRow>
                  <FieldRow label="Date de naissance *">
                    <input value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} type="date" style={inputStyle} />
                  </FieldRow>
                  <SexeField value={sexe} onChange={setSexe} />
                  <FieldRow label="Compagnie de transport *">
                    <input value={compagnie} onChange={(e) => setCompagnie(e.target.value)} placeholder="Ex. UTB" style={inputStyle} />
                  </FieldRow>
                  <FieldRow label="Lieu de départ *">
                    <input value={lieuDepart} onChange={(e) => setLieuDepart(e.target.value)} placeholder="Ex. Abidjan" style={inputStyle} />
                  </FieldRow>
                  <FieldRow label="Lieu d'arrivée *">
                    <input value={lieuArrivee} onChange={(e) => setLieuArrivee(e.target.value)} placeholder="Ex. Bouaké" style={inputStyle} />
                  </FieldRow>
                  <FieldRow label="Numéro de ticket *">
                    <input value={numeroTicket} onChange={(e) => setNumeroTicket(e.target.value)} placeholder="N° du ticket de voyage" style={inputStyle} />
                  </FieldRow>
                  <FieldRow label="Date de départ *">
                    <input value={dateDepart} onChange={(e) => setDateDepart(e.target.value)} type="date" style={inputStyle} />
                  </FieldRow>
                  <FieldRow label="Numéro de la personne à contacter *">
                    <PhoneInput value={numeroPersonneContact} onChange={setNumeroPersonneContact} />
                  </FieldRow>
                  <SignaturePad ref={sigRef} label="Signature (facultative)" />
                </>
              ) : isAccidentLike(qrInfo?.produit) ? (
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
                  <SexeField value={sexe} onChange={setSexe} />
                  <SignaturePad ref={sigRef} label="Signature (facultative)" />
                </>
              ) : qrInfo && isRelax(qrInfo.produit) ? (
                <>
                  <FieldRow label="Prénom *">
                    <input
                      value={prenomRx}
                      onChange={(e) => setPrenomRx(e.target.value)}
                      placeholder="Votre prénom"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Nom *">
                    <input
                      value={nomRx}
                      onChange={(e) => setNomRx(e.target.value)}
                      placeholder="Votre nom"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Téléphone * (pour recevoir vos accès par SMS)">
                    <PhoneInput value={telephoneRx} onChange={setTelephoneRx} />
                  </FieldRow>
                  <SexeField value={sexe} onChange={setSexe} />
                  <FieldRow label="Pièce d'identité *">
                    <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={typePieceRx === "CNI"} onChange={() => setTypePieceRx("CNI")} />
                        CNI
                      </label>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={typePieceRx === "Permis"} onChange={() => setTypePieceRx("Permis")} />
                        Permis de conduire
                      </label>
                    </div>
                  </FieldRow>
                  <PhotoCapture
                    label={`Photo de votre ${typePieceRx === "CNI" ? "CNI" : "permis"}`}
                    value={piecePhotoRx}
                    onChange={setPiecePhotoRx}
                    capture="environment"
                    required
                  />
                  <PhotoCapture
                    label="Selfie (photo de votre visage)"
                    value={selfiePhotoRx}
                    onChange={setSelfiePhotoRx}
                    capture="user"
                    required
                  />
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
                  <FieldRow label="Commune">
                    <input
                      value={communeInc}
                      onChange={(e) => setCommuneInc(e.target.value)}
                      placeholder="Ex. Cocody"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Quartier">
                    <input
                      value={quartierInc}
                      onChange={(e) => setQuartierInc(e.target.value)}
                      placeholder="Ex. Angré"
                      style={inputStyle}
                    />
                  </FieldRow>
                </>
              )}

              {(() => {
                const bloque =
                  submitting ||
                  (isRelaxAccidentsGenerale(qrInfo?.produit)
                    ? !raisonSociale ||
                      !profession ||
                      !classe ||
                      !typeCouverture ||
                      !Number.isInteger(Number(effectif)) ||
                      Number(effectif) < 1 ||
                      !phoneLocalPart(telephone) ||
                      (() => {
                        try {
                          calculerRelaxAccidentsGenerale({
                            classe: classe as Classe,
                            typeCouverture: typeCouverture as TypeCouverture,
                            effectif: Number(effectif),
                            montantIJ: Number(montantIJ),
                            montantFraisMedicaux: Number(montantFraisMedicaux),
                            montantIPT: Number(montantIPT),
                            montantDecesAccidentel: Number(montantDecesAccidentel),
                          });
                          return false;
                        } catch {
                          return true;
                        }
                      })()
                    : isRelaxVoyage(qrInfo?.produit)
                    ? !nom ||
                      !prenom ||
                      !phoneLocalPart(telephone) ||
                      !dateNaissance ||
                      !sexe ||
                      !selectedFormule ||
                      !compagnie ||
                      !lieuDepart ||
                      !lieuArrivee ||
                      !numeroTicket ||
                      !dateDepart ||
                      !phoneLocalPart(numeroPersonneContact)
                    : isAccidentLike(qrInfo?.produit)
                    ? !nom ||
                      !prenom ||
                      !phoneLocalPart(telephone) ||
                      !dateNaissance ||
                      (qrInfo?.produit === "accident" ? !selectedTarifId : !selectedFormule || !sexe)
                    : qrInfo && isRelax(qrInfo.produit)
                    ? !nomRx || !prenomRx || !phoneLocalPart(telephoneRx) || !sexe || !piecePhotoRx || !selfiePhotoRx
                    : !phoneLocalPart(telephoneInc));
                return (
                  <button
                    onClick={handleSubmit}
                    disabled={bloque}
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
                      opacity: bloque ? 0.5 : 1,
                    }}
                  >
                    {submitting
                      ? "Traitement…"
                      : isAccidentLike(qrInfo?.produit) ||
                        isRelaxVoyage(qrInfo?.produit) ||
                        isRelaxAccidentsGenerale(qrInfo?.produit) ||
                        (qrInfo && isRelax(qrInfo.produit))
                      ? "Passer au paiement →"
                      : "Confirmer la souscription →"}
                  </button>
                );
              })()}
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
                        signature: retrySignature,
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

              {isRelaxAccidentsGenerale(qrInfo?.produit) ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>
                    🎉 Souscription confirmée !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    L'assurance RelaxAccidents de <strong>{result?.raisonSociale ?? raisonSociale}</strong> est activée
                    pour <strong>{result?.effectif ?? effectif} personne(s)</strong>.
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
                      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginTop: 4 }}>
                        {result.numeroPolice}
                      </div>
                      {result.resultat && (
                        <div style={{ fontSize: 12, color: "#15803d", marginTop: 8 }}>
                          Prime TTC : {fcfa(result.resultat.primeTTC)}
                        </div>
                      )}
                      {result.dateFin && (
                        <div style={{ fontSize: 12, color: "#15803d", marginTop: 4 }}>
                          Valable jusqu'au {new Date(result.dateFin).toLocaleDateString("fr-FR")}
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
              ) : isAccidentLike(qrInfo?.produit) || isRelaxVoyage(qrInfo?.produit) ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>
                    🎉 Félicitations !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    {isRelaxVoyage(qrInfo?.produit) ? (
                      <>Votre assurance voyage est activée.</>
                    ) : (
                      <>Votre assurance accidents est activée pour <strong>3 mois</strong>.</>
                    )}
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

                  {cartePhotosEnvoyees ? (
                    <>
                      <button
                        onClick={telechargerCarteVirtuelle}
                        disabled={carteBusy}
                        style={{
                          width: "100%",
                          padding: "13px 0",
                          background: "#fff",
                          color: "#004b9c",
                          border: "1.5px solid #004b9c",
                          borderRadius: 12,
                          fontWeight: 700,
                          fontSize: 15,
                          cursor: carteBusy ? "default" : "pointer",
                          marginTop: 12,
                          opacity: carteBusy ? 0.6 : 1,
                        }}
                      >
                        {carteBusy ? "Génération…" : "⬇ Télécharger ma carte de prise en charge"}
                      </button>
                      {carteErreur && (
                        <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{carteErreur}</div>
                      )}
                    </>
                  ) : (
                    <div style={{ textAlign: "left", marginTop: 22 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                        Carte virtuelle de prise en charge
                      </div>
                      <div style={{ color: "#5b6b80", fontSize: 12.5, marginBottom: 12 }}>
                        Ajoutez une photo de votre pièce d'identité et un selfie pour obtenir votre carte.
                      </div>
                      <PhotoCapture
                        label="Photo de votre pièce d'identité (CNI/Permis)"
                        value={cartePieceUrl}
                        onChange={setCartePieceUrl}
                        capture="environment"
                      />
                      <PhotoCapture
                        label="Selfie (photo de votre visage)"
                        value={carteSelfieUrl}
                        onChange={setCarteSelfieUrl}
                        capture="user"
                      />
                      <button
                        onClick={envoyerPhotosCarteAccident}
                        disabled={cartePhotosBusy || !cartePieceUrl || !carteSelfieUrl}
                        style={{
                          width: "100%",
                          padding: "13px 0",
                          background: "#fff",
                          color: "#004b9c",
                          border: "1.5px solid #004b9c",
                          borderRadius: 12,
                          fontWeight: 700,
                          fontSize: 15,
                          cursor: "pointer",
                          opacity: cartePhotosBusy || !cartePieceUrl || !carteSelfieUrl ? 0.5 : 1,
                        }}
                      >
                        {cartePhotosBusy ? "Envoi…" : "Obtenir ma carte de prise en charge"}
                      </button>
                      {carteErreur && (
                        <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{carteErreur}</div>
                      )}
                    </div>
                  )}
                </>
              ) : qrInfo && isRelax(qrInfo.produit) ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>
                    🎉 Bienvenue chez SIM Assurances !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    Votre contrat {qrInfo.produit === "relaxmoto" ? "RelaxMoto" : "RelaxAuto"} est activé.
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
                        Numéro de contrat
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginTop: 4 }}>
                        {result.numeroPolice}
                      </div>
                      {result.dateFin && (
                        <div style={{ fontSize: 12, color: "#15803d", marginTop: 8 }}>
                          Valable jusqu'au {new Date(result.dateFin).toLocaleDateString("fr-FR")}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    style={{
                      background: "#e6f1fb",
                      borderRadius: 10,
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "#004b9c",
                    }}
                  >
                    Vous avez reçu un SMS avec votre mot de passe et le lien de
                    votre espace client — vous pourrez y renouveler votre
                    contrat et déclarer un sinistre.
                  </div>

                  <button
                    onClick={telechargerCarteVirtuelle}
                    disabled={carteBusy}
                    style={{
                      width: "100%",
                      padding: "13px 0",
                      background: "#fff",
                      color: "#004b9c",
                      border: "1.5px solid #004b9c",
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: carteBusy ? "default" : "pointer",
                      marginTop: 12,
                      opacity: carteBusy ? 0.6 : 1,
                    }}
                  >
                    {carteBusy ? "Génération…" : "⬇ Télécharger ma carte de prise en charge"}
                  </button>
                  {carteErreur && (
                    <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{carteErreur}</div>
                  )}
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
