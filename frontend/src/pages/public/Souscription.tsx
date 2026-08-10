import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";

import { API_BASE } from "../../api";
import {
  genererContratAccident,
  genererContratRelaxAccidentsFraisMedicaux,
  genererContratRelaxVoyage,
  genererContratRelaxAccidentsGenerale,
  genererContratSecurproDommages,
  genererContratSecurhome,
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
  NOMENCLATURE_PROFESSIONS,
  TYPE_COUVERTURE_LABELS,
  type TypeCouverture,
  type ResultatRelaxAccidentsGenerale,
} from "../../relaxAccidentsGenerale";
import { calculerSecurpro, type BaremeClasseSecurpro, type ResultatTarifImf } from "../../offline/tarification";
import { calculerSecurhome, type ResultatSecurhome } from "../../securhomeDommages";
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

// RelaxAccidents Frais Médicaux : pièce d'identité + selfie AVANT le paiement
// (comme RelaxMoto/RelaxAuto) et carte de prise en charge automatique après
// paiement — diverge donc de isAccidentLike (qui reste sur signature +
// photos après paiement pour l'ancien Accident).
function isRelaxAccidentsFraisMedicaux(p?: string): p is "relaxaccidents_fraismedicaux" {
  return p === "relaxaccidents_fraismedicaux";
}

function isRelaxVoyage(p?: string): p is "relaxvoyage" {
  return p === "relaxvoyage";
}

// RelaxAccidents générale (police collective, devis calculé dynamiquement) —
// distincte de RelaxAccidents Frais Médicaux (formule fixe au catalogue).
function isRelaxAccidentsGenerale(p?: string): p is "relaxaccidents" {
  return p === "relaxaccidents";
}

// SecurPro (Assurances Dommages) — réutilise le moteur de calcul déjà utilisé
// côté IMF (frontend/src/offline/tarification.ts), seul le canal de
// distribution (QR partenaire) change.
function isSecurproDommages(p?: string): p is "securpro_dommages" {
  return p === "securpro_dommages";
}

// SecurHome+ (Assurances Dommages) — moteur de calcul propre, voir
// frontend/src/securhomeDommages.ts (miroir de backend/src/services/securhomeDommages.ts).
function isSecurhomeDommages(p?: string): p is "securhome_dommages" {
  return p === "securhome_dommages";
}

// Reprend la nomenclature du document TARIF SECURHOME+_SECURPRO.docx
// (identique à SECURPRO_CLASSE_LABELS déjà utilisé côté backend/contractHtml.ts).
const SECURPRO_CLASSE_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Classe 1 — Bureau",
  2: "Classe 2 — Supérette / boutique de quartier, épicerie, salon de coiffure-beauté / couture, commerce de produits alimentaires",
  3: "Classe 3 — Pressing, pharmacie / dépôt, commerce d'électronique, petite fabrique alimentaire, buvette / restaurant, artisan métal, pâtisserie / boulangerie",
  4: "Classe 4 — Tissus / habillement, meubles, mèches & accessoires de coiffure, quincaillerie, jouets / plastique, librairie / papeterie, tapisserie / bois, cordonnier, réparation d'électroménager",
};

// Listes de capitaux "1er risque" (garanties optionnelles SecurHome+/SecurPro)
// — identiques à backend/src/services/capitauxDommages.ts.
const DDE_CAPITAUX = [1_000_000, 2_000_000] as const;
const DE_CAPITAUX = [100_000, 250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;
const BDG_CAPITAUX = [250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;
const VOL_CAISSE_CAPITAUX = [25_000, 50_000, 100_000, 250_000, 500_000] as const;

interface QrInfo {
  produit:
    | "incendie"
    | "accident"
    | "relaxmoto"
    | "relaxauto"
    | "relaxaccidents_fraismedicaux"
    | "relaxvoyage"
    | "relaxaccidents"
    | "securpro_dommages"
    | "securhome_dommages";
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

// QR unique par partenaire (refonte 2026-08-07) : premier niveau, avant même
// le choix du produit — le prospect choisit son Assurance (Accidents ou
// Dommages). Une fois ce choix fait, GET /public/qr/:token?sousBranche=...
// renvoie le ChooserInfo habituel (liste de produits) sans rien changer côté
// composant en aval.
interface ChooserBrancheOption {
  sousBranche: "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES";
  libelle: string;
}
interface ChooserBrancheInfo {
  partenaire: { id: string; nomCommerce: string };
  options: ChooserBrancheOption[];
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

type Step = "loading" | "choose-branche" | "choose-produit" | "infos" | "confirm" | "retry" | "success" | "error";

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
  if (profession && typeCouverture && effectif) {
    try {
      resultat = calculerRelaxAccidentsGenerale({
        profession,
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
        <select value={profession} onChange={(e) => setProfession(e.target.value)} style={inputStyle}>
          <option value="">Sélectionnez votre profession / type d'activité...</option>
          {([1, 2, 3, 4] as const).map((c) => (
            <optgroup key={c} label={`Classe ${c}`}>
              {NOMENCLATURE_PROFESSIONS.filter((p) => p.classe === c).map((p) => (
                <option key={p.libelle} value={p.libelle}>
                  {p.libelle}
                </option>
              ))}
            </optgroup>
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
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 4 }}>
              <span>Prime nette HT</span>
              <span>{fcfa(resultat.primeNetteHT2)}</span>
            </div>
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

// SecurPro (Assurances Dommages) — réutilise calculerSecurpro déjà utilisé
// côté IMF (frontend/src/offline/tarification.ts) pour l'aperçu en direct ;
// le serveur recalcule systématiquement à la soumission avec le même moteur.
function SecurproDommagesForm({
  nom,
  setNom,
  prenom,
  setPrenom,
  nomCommercial,
  setNomCommercial,
  ville,
  setVille,
  commune,
  setCommune,
  refFacture,
  setRefFacture,
  telephone,
  setTelephone,
  classe,
  setClasse,
  statutOccupation,
  setStatutOccupation,
  valeurBatiment,
  setValeurBatiment,
  loyerMensuel,
  setLoyerMensuel,
  contenu,
  setContenu,
  dansMarche,
  setDansMarche,
  gardien,
  setGardien,
  extincteur,
  setExtincteur,
  volContenu,
  setVolContenu,
  majorationVolContenu,
  setMajorationVolContenu,
  volCaisseCapital,
  setVolCaisseCapital,
  majorationVolCaisse,
  setMajorationVolCaisse,
  ddeCapital,
  setDdeCapital,
  deCapital,
  setDeCapital,
  bdgCapital,
  setBdgCapital,
  bareme,
  sigRef,
}: {
  nom: string;
  setNom: (v: string) => void;
  prenom: string;
  setPrenom: (v: string) => void;
  nomCommercial: string;
  setNomCommercial: (v: string) => void;
  ville: string;
  setVille: (v: string) => void;
  commune: string;
  setCommune: (v: string) => void;
  refFacture: string;
  setRefFacture: (v: string) => void;
  telephone: string;
  setTelephone: (v: string) => void;
  classe: 1 | 2 | 3 | 4 | "";
  setClasse: (v: 1 | 2 | 3 | 4 | "") => void;
  statutOccupation: "proprietaire" | "locataire";
  setStatutOccupation: (v: "proprietaire" | "locataire") => void;
  valeurBatiment: string;
  setValeurBatiment: (v: string) => void;
  loyerMensuel: string;
  setLoyerMensuel: (v: string) => void;
  contenu: string;
  setContenu: (v: string) => void;
  dansMarche: boolean;
  setDansMarche: (v: boolean) => void;
  gardien: boolean;
  setGardien: (v: boolean) => void;
  extincteur: boolean;
  setExtincteur: (v: boolean) => void;
  volContenu: boolean;
  setVolContenu: (v: boolean) => void;
  majorationVolContenu: boolean;
  setMajorationVolContenu: (v: boolean) => void;
  volCaisseCapital: string;
  setVolCaisseCapital: (v: string) => void;
  majorationVolCaisse: boolean;
  setMajorationVolCaisse: (v: boolean) => void;
  ddeCapital: string;
  setDdeCapital: (v: string) => void;
  deCapital: string;
  setDeCapital: (v: string) => void;
  bdgCapital: string;
  setBdgCapital: (v: string) => void;
  bareme: BaremeClasseSecurpro[] | null;
  sigRef: React.RefObject<SignaturePadHandle | null>;
}) {
  const baremeClasse = classe ? bareme?.find((b) => b.classe === classe) : undefined;
  let resultat: ResultatTarifImf | null = null;
  if (classe && baremeClasse) {
    resultat = calculerSecurpro(
      {
        classe,
        statutOccupation,
        valeurBatiment: statutOccupation === "proprietaire" ? Number(valeurBatiment || 0) : undefined,
        loyerMensuel: statutOccupation === "locataire" ? Number(loyerMensuel || 0) : undefined,
        contenu: Number(contenu || 0),
        dansMarche,
        gardien,
        extincteur,
        volContenu,
        majorationVolContenu: volContenu ? majorationVolContenu : undefined,
        volCaisseCapital: volCaisseCapital ? Number(volCaisseCapital) : undefined,
        majorationVolCaisse: volCaisseCapital ? majorationVolCaisse : undefined,
        ddeCapital: ddeCapital ? Number(ddeCapital) : undefined,
        deCapital: deCapital ? Number(deCapital) : undefined,
        bdgCapital: bdgCapital ? Number(bdgCapital) : undefined,
      },
      baremeClasse
    );
  }

  return (
    <>
      <FieldRow label="Prénom *">
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Votre prénom" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Nom *">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Votre nom" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Nom commercial (facultatif)">
        <input
          value={nomCommercial}
          onChange={(e) => setNomCommercial(e.target.value)}
          placeholder="Ex. Ets Banessere"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Ville *">
        <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ex. Abidjan" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Commune *">
        <input value={commune} onChange={(e) => setCommune(e.target.value)} placeholder="Ex. Cocody" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Référence CIE *">
        <input
          value={refFacture}
          onChange={(e) => setRefFacture(e.target.value)}
          placeholder="N° de votre facture CIE"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Activité *">
        <select
          value={classe}
          onChange={(e) => setClasse(e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4) : "")}
          style={inputStyle}
        >
          <option value="">Sélectionnez...</option>
          {([1, 2, 3, 4] as const).map((c) => (
            <option key={c} value={c}>
              {SECURPRO_CLASSE_LABELS[c]}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Statut *">
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={statutOccupation === "proprietaire"} onChange={() => setStatutOccupation("proprietaire")} />
            Propriétaire
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={statutOccupation === "locataire"} onChange={() => setStatutOccupation("locataire")} />
            Locataire
          </label>
        </div>
      </FieldRow>
      {statutOccupation === "proprietaire" ? (
        <FieldRow label="Valeur du bâtiment (FCFA) *">
          <input
            value={valeurBatiment}
            onChange={(e) => setValeurBatiment(e.target.value.replace(/\D/g, ""))}
            type="text"
            inputMode="numeric"
            style={inputStyle}
          />
        </FieldRow>
      ) : (
        <FieldRow label="Loyer mensuel (FCFA) *">
          <input
            value={loyerMensuel}
            onChange={(e) => setLoyerMensuel(e.target.value.replace(/\D/g, ""))}
            type="text"
            inputMode="numeric"
            style={inputStyle}
          />
        </FieldRow>
      )}
      <FieldRow label="Contenu (matériel, mobilier et stock) (FCFA) *">
        <input
          value={contenu}
          onChange={(e) => setContenu(e.target.value.replace(/\D/g, ""))}
          type="text"
          inputMode="numeric"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Local dans un marché ou ses abords ?">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={dansMarche} onChange={(e) => setDansMarche(e.target.checked)} />
          Oui
        </label>
      </FieldRow>
      <FieldRow label="Prévention">
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={gardien} onChange={(e) => setGardien(e.target.checked)} />
            Gardien
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={extincteur} onChange={(e) => setExtincteur(e.target.checked)} />
            Extincteurs
          </label>
        </div>
      </FieldRow>

      <div style={{ fontWeight: 800, fontSize: 15, margin: "18px 0 10px" }}>Garanties optionnelles</div>
      <FieldRow label="Vol contenu">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          <input type="checkbox" checked={volContenu} onChange={(e) => setVolContenu(e.target.checked)} />
          Souscrire (capital 1er risque calculé automatiquement depuis le contenu)
        </label>
        {volContenu && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#5b6b80", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={majorationVolContenu}
              onChange={(e) => setMajorationVolContenu(e.target.checked)}
            />
            Majoration ×1,2 (commerce de mèches & accessoires de coiffure ou d'électronique)
          </label>
        )}
      </FieldRow>
      <FieldRow label="Vol caisse">
        <select value={volCaisseCapital} onChange={(e) => setVolCaisseCapital(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
          <option value="">Aucune</option>
          {VOL_CAISSE_CAPITAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
        {volCaisseCapital && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#5b6b80", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={majorationVolCaisse}
              onChange={(e) => setMajorationVolCaisse(e.target.checked)}
            />
            Majoration ×1,25 (supérette/boutique, quincaillerie, électronique, tissus/habillement/pagnes)
          </label>
        )}
      </FieldRow>
      <FieldRow label="Dégât des eaux (DDE)">
        <select value={ddeCapital} onChange={(e) => setDdeCapital(e.target.value)} style={inputStyle}>
          <option value="">Aucune</option>
          {DDE_CAPITAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Dommages électriques (DE)">
        <select value={deCapital} onChange={(e) => setDeCapital(e.target.value)} style={inputStyle}>
          <option value="">Aucune</option>
          {DE_CAPITAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Bris de glace (BDG)">
        <select value={bdgCapital} onChange={(e) => setBdgCapital(e.target.value)} style={inputStyle}>
          <option value="">Aucune</option>
          {BDG_CAPITAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
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
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: "#004b9c" }}>Aperçu du devis</div>
        {!classe ? (
          <div style={{ fontSize: 12.5, color: "#5b6b80" }}>Sélectionnez une activité pour voir le montant de votre prime.</div>
        ) : resultat?.depassementPlafond ? (
          <div style={{ fontSize: 12.5, color: "#dc2626" }}>
            Les capitaux totaux ({fcfa(Math.round(resultat.capitauxTotaux))}) dépassent le plafond assurable
            automatiquement pour cette classe ({fcfa(resultat.limiteApplicable)}). Contactez SIM Assurances pour une
            étude particulière.
          </div>
        ) : resultat ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 4 }}>
              <span>Prime nette HT</span>
              <span>{fcfa(resultat.primeNetteHT)}</span>
            </div>
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
          <div style={{ fontSize: 12.5, color: "#5b6b80" }}>Chargement du barème…</div>
        )}
      </div>

      <SignaturePad ref={sigRef} label="Signature (facultative)" />
    </>
  );
}

// SecurHome+ (Assurances Dommages) — moteur de calcul propre (aucun barème
// admin, taux en dur comme RelaxAccidents générale), voir
// frontend/src/securhomeDommages.ts.
function SecurhomeDommagesForm({
  nom,
  setNom,
  prenom,
  setPrenom,
  ville,
  setVille,
  commune,
  setCommune,
  refFacture,
  setRefFacture,
  nombrePieces,
  setNombrePieces,
  telephone,
  setTelephone,
  statutOccupation,
  setStatutOccupation,
  valeurBatiment,
  setValeurBatiment,
  loyerMensuel,
  setLoyerMensuel,
  contenu,
  setContenu,
  gardien,
  setGardien,
  extincteur,
  setExtincteur,
  camera,
  setCamera,
  volContenu,
  setVolContenu,
  ddeCapital,
  setDdeCapital,
  deCapital,
  setDeCapital,
  bdgCapital,
  setBdgCapital,
  sigRef,
}: {
  nom: string;
  setNom: (v: string) => void;
  prenom: string;
  setPrenom: (v: string) => void;
  ville: string;
  setVille: (v: string) => void;
  commune: string;
  setCommune: (v: string) => void;
  refFacture: string;
  setRefFacture: (v: string) => void;
  nombrePieces: string;
  setNombrePieces: (v: string) => void;
  telephone: string;
  setTelephone: (v: string) => void;
  statutOccupation: "proprietaire" | "locataire";
  setStatutOccupation: (v: "proprietaire" | "locataire") => void;
  valeurBatiment: string;
  setValeurBatiment: (v: string) => void;
  loyerMensuel: string;
  setLoyerMensuel: (v: string) => void;
  contenu: string;
  setContenu: (v: string) => void;
  gardien: boolean;
  setGardien: (v: boolean) => void;
  extincteur: boolean;
  setExtincteur: (v: boolean) => void;
  camera: boolean;
  setCamera: (v: boolean) => void;
  volContenu: boolean;
  setVolContenu: (v: boolean) => void;
  ddeCapital: string;
  setDdeCapital: (v: string) => void;
  deCapital: string;
  setDeCapital: (v: string) => void;
  bdgCapital: string;
  setBdgCapital: (v: string) => void;
  sigRef: React.RefObject<SignaturePadHandle | null>;
}) {
  let resultat: ResultatSecurhome | null = null;
  let erreur = "";
  try {
    resultat = calculerSecurhome({
      statutOccupation,
      valeurBatiment: statutOccupation === "proprietaire" ? Number(valeurBatiment || 0) : undefined,
      loyerMensuel: statutOccupation === "locataire" ? Number(loyerMensuel || 0) : undefined,
      contenu: Number(contenu || 0),
      gardien,
      extincteur,
      camera,
      volContenu,
      ddeCapital: ddeCapital ? Number(ddeCapital) : undefined,
      deCapital: deCapital ? Number(deCapital) : undefined,
      bdgCapital: bdgCapital ? Number(bdgCapital) : undefined,
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : "Entrées invalides.";
  }

  return (
    <>
      <FieldRow label="Prénom *">
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Votre prénom" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Nom *">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Votre nom" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Ville *">
        <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ex. Abidjan" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Commune *">
        <input value={commune} onChange={(e) => setCommune(e.target.value)} placeholder="Ex. Cocody" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Nombre de pièces">
        <input
          value={nombrePieces}
          onChange={(e) => setNombrePieces(e.target.value.replace(/\D/g, ""))}
          type="text"
          inputMode="numeric"
          placeholder="Ex. 4"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Référence CIE *">
        <input
          value={refFacture}
          onChange={(e) => setRefFacture(e.target.value)}
          placeholder="N° de votre facture CIE"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Statut *">
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={statutOccupation === "proprietaire"} onChange={() => setStatutOccupation("proprietaire")} />
            Propriétaire
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={statutOccupation === "locataire"} onChange={() => setStatutOccupation("locataire")} />
            Locataire
          </label>
        </div>
      </FieldRow>
      {statutOccupation === "proprietaire" ? (
        <FieldRow label="Valeur du bâtiment (FCFA) *">
          <input
            value={valeurBatiment}
            onChange={(e) => setValeurBatiment(e.target.value.replace(/\D/g, ""))}
            type="text"
            inputMode="numeric"
            style={inputStyle}
          />
        </FieldRow>
      ) : (
        <FieldRow label="Loyer mensuel (FCFA) *">
          <input
            value={loyerMensuel}
            onChange={(e) => setLoyerMensuel(e.target.value.replace(/\D/g, ""))}
            type="text"
            inputMode="numeric"
            style={inputStyle}
          />
        </FieldRow>
      )}
      <FieldRow label="Contenu (mobilier et effets personnels) (FCFA) *">
        <input
          value={contenu}
          onChange={(e) => setContenu(e.target.value.replace(/\D/g, ""))}
          type="text"
          inputMode="numeric"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Prévention">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={gardien} onChange={(e) => setGardien(e.target.checked)} />
            Gardien
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={extincteur} onChange={(e) => setExtincteur(e.target.checked)} />
            Extincteurs
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={camera} onChange={(e) => setCamera(e.target.checked)} />
            Caméra
          </label>
        </div>
      </FieldRow>

      <div style={{ fontWeight: 800, fontSize: 15, margin: "18px 0 10px" }}>Garanties optionnelles</div>
      <FieldRow label="Vol contenu">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={volContenu} onChange={(e) => setVolContenu(e.target.checked)} />
          Souscrire (capital 1er risque calculé automatiquement depuis le contenu)
        </label>
      </FieldRow>
      <FieldRow label="Dégât des eaux (DDE)">
        <select value={ddeCapital} onChange={(e) => setDdeCapital(e.target.value)} style={inputStyle}>
          <option value="">Aucune</option>
          {DDE_CAPITAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Dommages électriques (DE)">
        <select value={deCapital} onChange={(e) => setDeCapital(e.target.value)} style={inputStyle}>
          <option value="">Aucune</option>
          {DE_CAPITAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Bris de glace (BDG)">
        <select value={bdgCapital} onChange={(e) => setBdgCapital(e.target.value)} style={inputStyle}>
          <option value="">Aucune</option>
          {BDG_CAPITAUX.map((m) => (
            <option key={m} value={m}>
              {fcfa(m)}
            </option>
          ))}
        </select>
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
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: "#004b9c" }}>Aperçu du devis</div>
        {resultat ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#5b6b80", marginBottom: 4 }}>
              <span>Prime nette HT</span>
              <span>{fcfa(resultat.primeNetteHT)}</span>
            </div>
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
  const [chooserBrancheInfo, setChooserBrancheInfo] = useState<ChooserBrancheInfo | null>(null);
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
  const [villeInc, setVilleInc] = useState("");
  const [communeInc, setCommuneInc] = useState("");
  const [refFactureInc, setRefFactureInc] = useState("");
  // Nouveau scénario (QR sélecteur, plus de QR dédié par formule) : le
  // montant de l'achat détermine la formule (seuil 250 000 FCFA) — saisi
  // avant le reste du formulaire. Vide/non numérique = étape pas encore
  // franchie. Non pertinent pour un ancien QR précis déjà imprimé (voir
  // POST /public/souscriptions/incendie, qui l'ignore dans ce cas).
  const [montantAchatInc, setMontantAchatInc] = useState("");
  const [montantAchatIncConfirme, setMontantAchatIncConfirme] = useState(false);

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
  const [typeCouverture, setTypeCouverture] = useState<TypeCouverture | "">("");
  const [effectif, setEffectif] = useState("1");
  const [montantIJ, setMontantIJ] = useState<string>(String(MONTANTS_IJ[0]));
  const [montantFraisMedicaux, setMontantFraisMedicaux] = useState<string>(String(MONTANTS_FRAIS_MEDICAUX[0]));
  const [montantIPT, setMontantIPT] = useState("0");
  const [montantDecesAccidentel, setMontantDecesAccidentel] = useState("0");

  // Champs SecurPro (Assurances Dommages) — réutilise calculerSecurpro déjà
  // utilisé côté IMF (offline/tarification.ts). `nom`/`prenom`/`telephone`/
  // `sigRef` partagés avec les branches ci-dessus.
  const [nomCommercialSp, setNomCommercialSp] = useState("");
  const [villeSp, setVilleSp] = useState("");
  const [communeSp, setCommuneSp] = useState("");
  const [refFactureSp, setRefFactureSp] = useState("");
  const [classeSp, setClasseSp] = useState<1 | 2 | 3 | 4 | "">("");
  const [statutOccupationSp, setStatutOccupationSp] = useState<"proprietaire" | "locataire">("proprietaire");
  const [valeurBatimentSp, setValeurBatimentSp] = useState("");
  const [loyerMensuelSp, setLoyerMensuelSp] = useState("");
  const [contenuSp, setContenuSp] = useState("0");
  const [dansMarcheSp, setDansMarcheSp] = useState(false);
  const [gardienSp, setGardienSp] = useState(false);
  const [extincteurSp, setExtincteurSp] = useState(false);
  const [volContenuSp, setVolContenuSp] = useState(false);
  const [majorationVolContenuSp, setMajorationVolContenuSp] = useState(false);
  const [volCaisseCapitalSp, setVolCaisseCapitalSp] = useState("");
  const [majorationVolCaisseSp, setMajorationVolCaisseSp] = useState(false);
  const [ddeCapitalSp, setDdeCapitalSp] = useState("");
  const [deCapitalSp, setDeCapitalSp] = useState("");
  const [bdgCapitalSp, setBdgCapitalSp] = useState("");
  const [baremeSecurpro, setBaremeSecurpro] = useState<BaremeClasseSecurpro[] | null>(null);

  // Champs SecurHome+ (Assurances Dommages) — moteur en dur (pas de barème
  // admin), voir frontend/src/securhomeDommages.ts. `nom`/`prenom`/`telephone`/
  // `sigRef` partagés avec les branches ci-dessus.
  const [villeSh, setVilleSh] = useState("");
  const [communeSh, setCommuneSh] = useState("");
  const [refFactureSh, setRefFactureSh] = useState("");
  const [nombrePiecesSh, setNombrePiecesSh] = useState("");
  const [statutOccupationSh, setStatutOccupationSh] = useState<"proprietaire" | "locataire">("proprietaire");
  const [valeurBatimentSh, setValeurBatimentSh] = useState("");
  const [loyerMensuelSh, setLoyerMensuelSh] = useState("");
  const [contenuSh, setContenuSh] = useState("0");
  const [gardienSh, setGardienSh] = useState(false);
  const [extincteurSh, setExtincteurSh] = useState(false);
  const [cameraSh, setCameraSh] = useState(false);
  const [volContenuSh, setVolContenuSh] = useState(false);
  const [ddeCapitalSh, setDdeCapitalSh] = useState("");
  const [deCapitalSh, setDeCapitalSh] = useState("");
  const [bdgCapitalSh, setBdgCapitalSh] = useState("");

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
    // SecurPro (Assurances Dommages)
    nomCommercial?: string | null;
    ville?: string | null;
    communeQuartier?: string | null;
    refFacture?: string | null;
    statutOccupation?: "proprietaire" | "locataire" | null;
    valeurBatiment?: number | null;
    loyerMensuel?: number | null;
    contenu?: number | null;
    dansMarche?: boolean | null;
    nombrePieces?: number | null;
    resultat?: ResultatRelaxAccidentsGenerale | ResultatTarifImf | ResultatSecurhome | null;
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
          produitEffectif === "relaxaccidents" ||
          produitEffectif === "securpro_dommages" ||
          produitEffectif === "securhome_dommages";
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
            souscriptionId: data.souscriptionId,
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
            nomCommercial: data.nomCommercial ?? null,
            ville: data.ville ?? null,
            communeQuartier: data.communeQuartier ?? null,
            refFacture: data.refFacture ?? null,
            statutOccupation: data.statutOccupation ?? null,
            valeurBatiment: data.valeurBatiment ?? null,
            loyerMensuel: data.loyerMensuel ?? null,
            contenu: data.contenu ?? null,
            dansMarche: data.dansMarche ?? null,
            nombrePieces: data.nombrePieces ?? null,
            resultat: data.resultat ?? null,
          });
          setCartePhotosEnvoyees(!!(data.pieceIdentiteUrl && data.selfieUrl));
          setStep("success");
          // RelaxAccidents Frais Médicaux : pièce/selfie déjà déposées avant
          // le paiement — la carte de prise en charge est générée et
          // téléchargée automatiquement, sans étape manuelle supplémentaire.
          // Utilise directement `data.souscriptionId` (pas `result.souscriptionId`,
          // pas encore à jour dans cette fermeture au moment de l'appel).
          if (produitEffectif === "relaxaccidents_fraismedicaux" && data.souscriptionId) {
            telechargerCarte("relaxaccidents_fraismedicaux", data.souscriptionId).catch((e) =>
              setCarteErreur(e instanceof Error ? e.message : "Erreur lors de la génération de la carte.")
            );
          }
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

        // QR unique par partenaire (refonte 2026-08-07) : premier niveau,
        // le prospect choisit d'abord son Assurance (Accidents ou Dommages).
        if (qr.type === "chooser-branche") {
          setChooserBrancheInfo(qr);
          setStep("choose-branche");
          return;
        }

        // QR "sélecteur" : affiche la liste des produits de la sous-branche,
        // le prospect en choisit un.
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
    } else if (isSecurproDommages(produit)) {
      const bareme: BaremeClasseSecurpro[] = await fetch(`${BASE}/public/baremes/securpro`).then((r) => r.json());
      setBaremeSecurpro(bareme);
    }
  }

  /** Choix de l'Assurance depuis l'écran de premier niveau (QR unique, refonte 2026-08-07). */
  async function choisirBranche(sousBranche: "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES") {
    if (!token) return;
    setStep("loading");
    try {
      const r = await fetch(`${BASE}/public/qr/${token}?sousBranche=${sousBranche}`);
      const qr = await r.json();
      if (qr.error) {
        setErrorMsg(qr.error);
        setStep("error");
        return;
      }
      setChooserInfo(qr);
      setStep("choose-produit");
    } catch {
      setErrorMsg("Impossible de charger les informations. Veuillez réessayer.");
      setStep("error");
    }
  }

  /** Retour à l'écran de choix de l'Assurance (uniquement possible depuis un QR unique). */
  function retourChoixAssurance() {
    if (!chooserBrancheInfo) return;
    setChooserInfo(null);
    setStep("choose-branche");
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
    // RelaxAccidents Frais Médicaux n'a plus de pavé de signature (photos
    // pièce/selfie avant paiement à la place) — exclu volontairement ici.
    const signature =
      qrInfo.produit === "accident" ||
      isRelaxVoyage(qrInfo.produit) ||
      isRelaxAccidentsGenerale(qrInfo.produit) ||
      isSecurproDommages(qrInfo.produit) ||
      isSecurhomeDommages(qrInfo.produit)
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
      } else if (qrInfo.produit === "securpro_dommages") {
        const res = await fetch(`${BASE}/public/souscriptions/securpro_dommages/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            nom,
            prenom,
            nomCommercial: nomCommercialSp || undefined,
            ville: villeSp,
            communeQuartier: communeSp,
            refFacture: refFactureSp,
            telephone,
            signature,
            classe: classeSp,
            statutOccupation: statutOccupationSp,
            valeurBatiment: statutOccupationSp === "proprietaire" ? Number(valeurBatimentSp || 0) : undefined,
            loyerMensuel: statutOccupationSp === "locataire" ? Number(loyerMensuelSp || 0) : undefined,
            contenu: Number(contenuSp || 0),
            dansMarche: dansMarcheSp,
            gardien: gardienSp,
            extincteur: extincteurSp,
            volContenu: volContenuSp,
            majorationVolContenu: volContenuSp ? majorationVolContenuSp : undefined,
            volCaisseCapital: volCaisseCapitalSp ? Number(volCaisseCapitalSp) : undefined,
            majorationVolCaisse: volCaisseCapitalSp ? majorationVolCaisseSp : undefined,
            ddeCapital: ddeCapitalSp ? Number(ddeCapitalSp) : undefined,
            deCapital: deCapitalSp ? Number(deCapitalSp) : undefined,
            bdgCapital: bdgCapitalSp ? Number(bdgCapitalSp) : undefined,
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
      } else if (qrInfo.produit === "securhome_dommages") {
        const res = await fetch(`${BASE}/public/souscriptions/securhome_dommages/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrToken: token,
            nom,
            prenom,
            ville: villeSh,
            communeQuartier: communeSh,
            refFacture: refFactureSh,
            nombrePieces: nombrePiecesSh ? Number(nombrePiecesSh) : undefined,
            telephone,
            signature,
            statutOccupation: statutOccupationSh,
            valeurBatiment: statutOccupationSh === "proprietaire" ? Number(valeurBatimentSh || 0) : undefined,
            loyerMensuel: statutOccupationSh === "locataire" ? Number(loyerMensuelSh || 0) : undefined,
            contenu: Number(contenuSh || 0),
            gardien: gardienSh,
            extincteur: extincteurSh,
            camera: cameraSh,
            volContenu: volContenuSh,
            ddeCapital: ddeCapitalSh ? Number(ddeCapitalSh) : undefined,
            deCapital: deCapitalSh ? Number(deCapitalSh) : undefined,
            bdgCapital: bdgCapitalSh ? Number(bdgCapitalSh) : undefined,
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

        // Pièce d'identité + selfie déposées AVANT le paiement (comme
        // RelaxMoto/RelaxAuto) — best-effort, ne bloque jamais le paiement.
        const documentsFraisMedicaux = [
          piecePhotoRx ? { type: typePieceRx, url: piecePhotoRx } : null,
          selfiePhotoRx ? { type: "Selfie" as const, url: selfiePhotoRx } : null,
        ].filter((d): d is { type: "CNI" | "Permis" | "Selfie"; url: string } => d !== null);
        await Promise.all(
          documentsFraisMedicaux.map((doc) =>
            fetch(`${BASE}/public/souscriptions/relaxaccidents_fraismedicaux/${data.souscriptionId}/documents`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(doc),
            }).catch(() => null)
          )
        );

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
            ville: villeInc,
            commune: communeInc,
            refFacture: refFactureInc,
            montantAchat: montantAchatInc ? Number(montantAchatInc) : undefined,
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
      const resultat = result.resultat as ResultatRelaxAccidentsGenerale | undefined;
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
        classe: result.classe ?? resultat.classe,
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
    if (qrInfo.produit === "securpro_dommages") {
      const resultat = result.resultat as ResultatTarifImf | undefined;
      if (!resultat) return;
      const classeFinale = (result.classe ?? classeSp) as 1 | 2 | 3 | 4;
      const statutFinal = (result.statutOccupation ?? statutOccupationSp) as "proprietaire" | "locataire";
      genererContratSecurproDommages({
        numeroPolice: result.numeroPolice ?? "",
        intermediaire: result.partenaire ?? qrInfo.partenaire.nomCommerce,
        dateDebut: result.dateDebut ?? new Date().toISOString(),
        dateFin:
          result.dateFin ??
          new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
        dateSouscription: new Date().toISOString(),
        nom: result.nom ?? nom,
        prenom: result.prenom ?? prenom,
        nomCommercial: result.nomCommercial ?? nomCommercialSp,
        referenceCIE: result.refFacture ?? refFactureSp,
        telephone: result.telephone ?? telephone,
        ville: result.ville ?? villeSp,
        communeQuartier: result.communeQuartier ?? communeSp,
        classeLabel: SECURPRO_CLASSE_LABELS[classeFinale],
        statutOccupation: statutFinal,
        valeurBatimentOuLoyer:
          statutFinal === "locataire"
            ? result.loyerMensuel ?? Number(loyerMensuelSp || 0)
            : result.valeurBatiment ?? Number(valeurBatimentSp || 0),
        contenu: result.contenu ?? Number(contenuSp || 0),
        dansMarche: result.dansMarche ?? dansMarcheSp,
        lignes: resultat.lignes,
        primeNetteHT: resultat.primeNetteHT,
        accessoires: resultat.accessoires,
        taxes: resultat.taxes,
        primeTTC: resultat.primeTTC,
        signature: result.signature ?? null,
      });
      return;
    }
    if (qrInfo.produit === "securhome_dommages") {
      const resultat = result.resultat as ResultatSecurhome | undefined;
      if (!resultat) return;
      const statutFinal = (result.statutOccupation ?? statutOccupationSh) as "proprietaire" | "locataire";
      genererContratSecurhome({
        numeroPolice: result.numeroPolice ?? "",
        partenaire: result.partenaire ?? qrInfo.partenaire.nomCommerce,
        dateDebut: result.dateDebut ?? new Date().toISOString(),
        dateFin:
          result.dateFin ??
          new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
        nom: result.nom ?? nom,
        prenom: result.prenom ?? prenom,
        telephone: result.telephone ?? telephone,
        ville: result.ville ?? villeSh,
        communeQuartier: result.communeQuartier ?? communeSh,
        referenceCIE: result.refFacture ?? refFactureSh,
        nombrePieces: result.nombrePieces ?? (nombrePiecesSh ? Number(nombrePiecesSh) : null),
        statutOccupation: statutFinal,
        valeurBatimentOuLoyer:
          statutFinal === "locataire"
            ? result.loyerMensuel ?? Number(loyerMensuelSh || 0)
            : result.valeurBatiment ?? Number(valeurBatimentSh || 0),
        contenu: result.contenu ?? Number(contenuSh || 0),
        lignes: resultat.lignes,
        primeNetteHT: resultat.primeNetteHT,
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
    // Voir le commentaire de telechargerCarteVirtuelle : pour RelaxVoyage
    // (modèle générique), `paidId` est un id d'échéance — /documents attend
    // le véritable id de souscription, porté par `result.souscriptionId`.
    const souscriptionId = result?.souscriptionId ?? paidId;
    if (!souscriptionId || !cartePieceUrl || !carteSelfieUrl || !qrInfo) return;
    setCartePhotosBusy(true);
    setCarteErreur("");
    try {
      if (qrInfo.produit === "relaxvoyage") {
        const results = await Promise.all(
          [
            { type: "CNI" as const, url: cartePieceUrl },
            { type: "Selfie" as const, url: carteSelfieUrl },
          ].map((doc) =>
            fetch(`${BASE}/public/souscriptions/${qrInfo.produit}/${souscriptionId}/documents`, {
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
    // Pour les produits du modèle générique (RelaxMoto/Auto, RelaxAccidents
    // Frais Médicaux, RelaxVoyage), `paidId` (paramètre `paid` de l'URL de
    // retour Wave) est un identifiant d'ÉCHÉANCE, pas de souscription — or
    // /cartes/png attend un véritable id de souscription. `result.souscriptionId`
    // (renseigné par /contrat) porte la bonne valeur ; on ne retombe sur
    // `paidId` que pour l'ancien Accident, où `paid` est déjà le bon id.
    const souscriptionId = result?.souscriptionId ?? paidId;
    if (!souscriptionId || !qrInfo) return;
    setCarteBusy(true);
    setCarteErreur("");
    try {
      const type =
        isRelax(qrInfo.produit) || qrInfo.produit === "relaxaccidents_fraismedicaux" || qrInfo.produit === "relaxvoyage"
          ? qrInfo.produit
          : "accident";
      await telechargerCarte(type, souscriptionId);
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
                  : qrInfo.produit === "securpro_dommages"
                  ? "SecurPro"
                  : qrInfo.produit === "securhome_dommages"
                  ? "SecurHome+"
                  : qrInfo.produit === "relaxmoto"
                  ? "RelaxMoto"
                  : "RelaxAuto"}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                via {qrInfo.partenaire.nomCommerce}
              </div>
            </div>
          )}
          {!qrInfo && !chooserInfo && chooserBrancheInfo && (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Assurances Accidents et Dommages</div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                via {chooserBrancheInfo.partenaire.nomCommerce}
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

          {/* ── CHOIX DE L'ASSURANCE (QR unique par partenaire) ── */}
          {step === "choose-branche" && chooserBrancheInfo && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>
                Choisissez votre assurance
              </div>
              <div style={{ color: "#5b6b80", fontSize: 13, marginBottom: 20 }}>
                Sélectionnez l'Assurance qui vous intéresse pour découvrir ses produits.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {chooserBrancheInfo.options.map((o) => (
                  <button
                    key={o.sousBranche}
                    type="button"
                    onClick={() => choisirBranche(o.sousBranche)}
                    style={{
                      width: "100%",
                      padding: "20px 22px",
                      border: "2px solid var(--border-strong, #dde3ec)",
                      borderRadius: 14,
                      background: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#0f1b2d" }}>{o.libelle}</div>
                    <span style={{ color: "#004b9c", fontSize: 18 }}>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── SÉLECTEUR DE PRODUIT (Assurances Accidents/Dommages) ── */}
          {step === "choose-produit" && chooserInfo && (
            <div>
              {chooserBrancheInfo && (
                <button
                  type="button"
                  onClick={retourChoixAssurance}
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
                  ← Retour au choix de l'Assurance
                </button>
              )}
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>
                Choisissez votre produit
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

              {isSecurhomeDommages(qrInfo?.produit) ? (
                <SecurhomeDommagesForm
                  nom={nom}
                  setNom={setNom}
                  prenom={prenom}
                  setPrenom={setPrenom}
                  ville={villeSh}
                  setVille={setVilleSh}
                  commune={communeSh}
                  setCommune={setCommuneSh}
                  refFacture={refFactureSh}
                  setRefFacture={setRefFactureSh}
                  nombrePieces={nombrePiecesSh}
                  setNombrePieces={setNombrePiecesSh}
                  telephone={telephone}
                  setTelephone={setTelephone}
                  statutOccupation={statutOccupationSh}
                  setStatutOccupation={setStatutOccupationSh}
                  valeurBatiment={valeurBatimentSh}
                  setValeurBatiment={setValeurBatimentSh}
                  loyerMensuel={loyerMensuelSh}
                  setLoyerMensuel={setLoyerMensuelSh}
                  contenu={contenuSh}
                  setContenu={setContenuSh}
                  gardien={gardienSh}
                  setGardien={setGardienSh}
                  extincteur={extincteurSh}
                  setExtincteur={setExtincteurSh}
                  camera={cameraSh}
                  setCamera={setCameraSh}
                  volContenu={volContenuSh}
                  setVolContenu={setVolContenuSh}
                  ddeCapital={ddeCapitalSh}
                  setDdeCapital={setDdeCapitalSh}
                  deCapital={deCapitalSh}
                  setDeCapital={setDeCapitalSh}
                  bdgCapital={bdgCapitalSh}
                  setBdgCapital={setBdgCapitalSh}
                  sigRef={sigRef}
                />
              ) : isSecurproDommages(qrInfo?.produit) ? (
                <SecurproDommagesForm
                  nom={nom}
                  setNom={setNom}
                  prenom={prenom}
                  setPrenom={setPrenom}
                  nomCommercial={nomCommercialSp}
                  setNomCommercial={setNomCommercialSp}
                  ville={villeSp}
                  setVille={setVilleSp}
                  commune={communeSp}
                  setCommune={setCommuneSp}
                  refFacture={refFactureSp}
                  setRefFacture={setRefFactureSp}
                  telephone={telephone}
                  setTelephone={setTelephone}
                  classe={classeSp}
                  setClasse={setClasseSp}
                  statutOccupation={statutOccupationSp}
                  setStatutOccupation={setStatutOccupationSp}
                  valeurBatiment={valeurBatimentSp}
                  setValeurBatiment={setValeurBatimentSp}
                  loyerMensuel={loyerMensuelSp}
                  setLoyerMensuel={setLoyerMensuelSp}
                  contenu={contenuSp}
                  setContenu={setContenuSp}
                  dansMarche={dansMarcheSp}
                  setDansMarche={setDansMarcheSp}
                  gardien={gardienSp}
                  setGardien={setGardienSp}
                  extincteur={extincteurSp}
                  setExtincteur={setExtincteurSp}
                  volContenu={volContenuSp}
                  setVolContenu={setVolContenuSp}
                  majorationVolContenu={majorationVolContenuSp}
                  setMajorationVolContenu={setMajorationVolContenuSp}
                  volCaisseCapital={volCaisseCapitalSp}
                  setVolCaisseCapital={setVolCaisseCapitalSp}
                  majorationVolCaisse={majorationVolCaisseSp}
                  setMajorationVolCaisse={setMajorationVolCaisseSp}
                  ddeCapital={ddeCapitalSp}
                  setDdeCapital={setDdeCapitalSp}
                  deCapital={deCapitalSp}
                  setDeCapital={setDeCapitalSp}
                  bdgCapital={bdgCapitalSp}
                  setBdgCapital={setBdgCapitalSp}
                  bareme={baremeSecurpro}
                  sigRef={sigRef}
                />
              ) : isRelaxAccidentsGenerale(qrInfo?.produit) ? (
                <RelaxAccidentsGeneraleForm
                  raisonSociale={raisonSociale}
                  setRaisonSociale={setRaisonSociale}
                  profession={profession}
                  setProfession={setProfession}
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
              ) : qrInfo?.produit === "accident" ? (
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
              ) : isRelaxAccidentsFraisMedicaux(qrInfo?.produit) ? (
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
              ) : chooserInfo && !montantAchatIncConfirme ? (
                <FieldRow label="Montant de votre achat (FCFA) *">
                  <input
                    value={montantAchatInc}
                    onChange={(e) => setMontantAchatInc(e.target.value.replace(/\D/g, ""))}
                    type="text"
                    inputMode="numeric"
                    placeholder="Ex. 150000"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 12, color: "#5b6b80", marginTop: 6 }}>
                    La prime est incluse dans le prix de votre achat — moins de 250 000 FCFA : formule 1 000 FCFA,
                    250 000 FCFA ou plus : formule 2 000 FCFA.
                  </div>
                </FieldRow>
              ) : (
                <>
                  {chooserInfo && (
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
                      <div style={{ fontSize: 13, color: "#5b6b80" }}>
                        Formule {Number(montantAchatInc) < 250_000 ? "1 000 FCFA" : "2 000 FCFA"}
                      </div>
                      <div style={{ fontWeight: 800, color: "#004b9c", fontSize: 15 }}>
                        Capital garanti {fcfa(Number(montantAchatInc) < 250_000 ? 500_000 : 1_000_000)}
                      </div>
                    </div>
                  )}
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
                  <FieldRow label="Ville *">
                    <input
                      value={villeInc}
                      onChange={(e) => setVilleInc(e.target.value)}
                      placeholder="Ex. Abidjan"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Commune *">
                    <input
                      value={communeInc}
                      onChange={(e) => setCommuneInc(e.target.value)}
                      placeholder="Ex. Cocody"
                      style={inputStyle}
                    />
                  </FieldRow>
                  <FieldRow label="Référence CIE *">
                    <input
                      value={refFactureInc}
                      onChange={(e) => setRefFactureInc(e.target.value)}
                      placeholder="N° de votre facture CIE"
                      style={inputStyle}
                    />
                  </FieldRow>
                </>
              )}

              {(() => {
                // Étape "montant d'achat" du nouveau scénario Incendie : le
                // bouton "Continuer" remplace le bouton de soumission tant
                // que le montant n'est pas validé (voir formulaire ci-dessus).
                if (qrInfo?.produit === "incendie" && chooserInfo && !montantAchatIncConfirme) {
                  const montantValide = !!montantAchatInc && Number(montantAchatInc) > 0;
                  return (
                    <button
                      type="button"
                      onClick={() => montantValide && setMontantAchatIncConfirme(true)}
                      disabled={!montantValide}
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
                        opacity: montantValide ? 1 : 0.5,
                      }}
                    >
                      Continuer →
                    </button>
                  );
                }
                const bloque =
                  submitting ||
                  (isRelaxAccidentsGenerale(qrInfo?.produit)
                    ? !raisonSociale ||
                      !profession ||
                      !typeCouverture ||
                      !Number.isInteger(Number(effectif)) ||
                      Number(effectif) < 1 ||
                      !phoneLocalPart(telephone) ||
                      (() => {
                        try {
                          calculerRelaxAccidentsGenerale({
                            profession,
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
                      (qrInfo?.produit === "accident"
                        ? !selectedTarifId
                        : !selectedFormule || !sexe || !piecePhotoRx || !selfiePhotoRx)
                    : qrInfo && isRelax(qrInfo.produit)
                    ? !nomRx || !prenomRx || !phoneLocalPart(telephoneRx) || !sexe || !piecePhotoRx || !selfiePhotoRx
                    : isSecurproDommages(qrInfo?.produit)
                    ? !nom ||
                      !prenom ||
                      !villeSp ||
                      !communeSp ||
                      !refFactureSp ||
                      !phoneLocalPart(telephone) ||
                      !classeSp ||
                      (statutOccupationSp === "proprietaire" ? !valeurBatimentSp : !loyerMensuelSp) ||
                      !baremeSecurpro ||
                      (() => {
                        const bar = baremeSecurpro?.find((b) => b.classe === classeSp);
                        if (!bar) return true;
                        const r = calculerSecurpro(
                          {
                            classe: classeSp as 1 | 2 | 3 | 4,
                            statutOccupation: statutOccupationSp,
                            valeurBatiment: statutOccupationSp === "proprietaire" ? Number(valeurBatimentSp || 0) : undefined,
                            loyerMensuel: statutOccupationSp === "locataire" ? Number(loyerMensuelSp || 0) : undefined,
                            contenu: Number(contenuSp || 0),
                            dansMarche: dansMarcheSp,
                            gardien: gardienSp,
                            extincteur: extincteurSp,
                            volContenu: volContenuSp,
                            majorationVolContenu: volContenuSp ? majorationVolContenuSp : undefined,
                            volCaisseCapital: volCaisseCapitalSp ? Number(volCaisseCapitalSp) : undefined,
                            majorationVolCaisse: volCaisseCapitalSp ? majorationVolCaisseSp : undefined,
                            ddeCapital: ddeCapitalSp ? Number(ddeCapitalSp) : undefined,
                            deCapital: deCapitalSp ? Number(deCapitalSp) : undefined,
                            bdgCapital: bdgCapitalSp ? Number(bdgCapitalSp) : undefined,
                          },
                          bar
                        );
                        return r.depassementPlafond;
                      })()
                    : isSecurhomeDommages(qrInfo?.produit)
                    ? !nom ||
                      !prenom ||
                      !villeSh ||
                      !communeSh ||
                      !refFactureSh ||
                      !phoneLocalPart(telephone) ||
                      (statutOccupationSh === "proprietaire" ? !valeurBatimentSh : !loyerMensuelSh) ||
                      (() => {
                        try {
                          calculerSecurhome({
                            statutOccupation: statutOccupationSh,
                            valeurBatiment: statutOccupationSh === "proprietaire" ? Number(valeurBatimentSh || 0) : undefined,
                            loyerMensuel: statutOccupationSh === "locataire" ? Number(loyerMensuelSh || 0) : undefined,
                            contenu: Number(contenuSh || 0),
                            gardien: gardienSh,
                            extincteur: extincteurSh,
                            camera: cameraSh,
                            volContenu: volContenuSh,
                            ddeCapital: ddeCapitalSh ? Number(ddeCapitalSh) : undefined,
                            deCapital: deCapitalSh ? Number(deCapitalSh) : undefined,
                            bdgCapital: bdgCapitalSh ? Number(bdgCapitalSh) : undefined,
                          });
                          return false;
                        } catch {
                          return true;
                        }
                      })()
                    : !phoneLocalPart(telephoneInc) || !villeInc || !communeInc || !refFactureInc);
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
                        isSecurproDommages(qrInfo?.produit) ||
                        isSecurhomeDommages(qrInfo?.produit) ||
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

              {isSecurhomeDommages(qrInfo?.produit) ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>
                    🎉 Souscription confirmée !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    Votre assurance SecurHome+ est activée.
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
              ) : isSecurproDommages(qrInfo?.produit) ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>
                    🎉 Souscription confirmée !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    Votre assurance SecurPro est activée.
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
              ) : isRelaxAccidentsGenerale(qrInfo?.produit) ? (
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
              ) : isRelaxAccidentsFraisMedicaux(qrInfo?.produit) ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>
                    🎉 Félicitations !
                  </div>
                  <div style={{ color: "#5b6b80", fontSize: 14, marginBottom: 20 }}>
                    Votre assurance RelaxAccidents Frais Médicaux est activée pour <strong>3 mois</strong>.
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
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Générée automatiquement à partir des photos fournies avant le paiement.
                  </div>
                  {carteErreur && (
                    <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{carteErreur}</div>
                  )}
                </>
              ) : qrInfo?.produit === "accident" || isRelaxVoyage(qrInfo?.produit) ? (
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
