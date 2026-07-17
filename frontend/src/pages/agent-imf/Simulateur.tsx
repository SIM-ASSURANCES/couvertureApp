import { useEffect, useRef, useState } from "react";
import { FileCheck, Download, Plus, X, WifiOff } from "lucide-react";
import { PageHeader, Card, Badge, fcfa } from "../../components/ui";
import { api } from "../../api";
import { genererContratImf, contratImfDisponible } from "../../contract";
import SignaturePad, { type SignaturePadHandle } from "../../components/SignaturePad";
import { useOnline } from "../../offline/useOnline";
import { useBaremeCache } from "../../offline/useBaremes";
import { calculerSecurpro as calculerSecurproLocal, calculerSecurstock as calculerSecurstockLocal, type SecurproInput, type SecurstockInput } from "../../offline/tarification";
import { tarifCatalogueHorsLigne, calculerCoupsdursHorsLigne } from "../../offline/catalogue";
import { putQueueItem, type SouscriptionEnAttente } from "../../offline/db";
import type { SouscriptionImf } from "../../types";

type ProduitCode = "securpro" | "securstock" | "coupsdurs" | "securecolte";

const PRODUITS: { code: ProduitCode; label: string }[] = [
  { code: "securpro", label: "SECURPRO" },
  { code: "securstock", label: "SECURSTOCK" },
  { code: "coupsdurs", label: "Coups Durs" },
  { code: "securecolte", label: "SECURECOLTE" },
];

const VOL_CAISSE_CAPITAUX = [25000, 50000, 100000, 250000, 500000];
const DDE_CAPITAUX = [1000000, 2000000];
const DE_CAPITAUX = [100000, 250000, 500000, 1000000, 1500000, 2000000];
const BDG_CAPITAUX = [250000, 500000, 1000000, 1500000, 2000000];
const PLAFOND_MARCHE = 5_000_000;

const SECURPRO_CLASSES: { classe: number; label: string }[] = [
  { classe: 1, label: "Bureau" },
  {
    classe: 2,
    label:
      "Supérette / boutique de quartier, épicerie, salon de coiffure-beauté / couture, commerce de produits alimentaires",
  },
  {
    classe: 3,
    label:
      "Pressing, pharmacie / dépôt, commerce d'électronique, petite fabrique alimentaire, buvette / restaurant, artisan métal, pâtisserie / boulangerie",
  },
  {
    classe: 4,
    label:
      "Tissus / habillement, meubles, mèches & accessoires de coiffure, quincaillerie, jouets / plastique, librairie / papeterie, tapisserie / bois, cordonnier, réparation d'électroménager",
  },
];

const SECURSTOCK_CLASSES: { classe: number; label: string }[] = [
  { classe: 1, label: "Produits très peu inflammables (métaux, verre, céramique, électroménager, plastiques rigides)" },
  { classe: 2, label: "Produits à combustion lente (bois, papier, cartons, vêtements, chaussures, alimentaire sec)" },
  { classe: 3, label: "Produits inflammables usuels (produits de beauté, ménagers, plastiques souples, électronique à batterie)" },
  { classe: 4, label: "Produits fortement inflammables (parfums en gros, peintures, solvants, tissus denses, mousse)" },
];

// Plafond imposé dès que le local est dans un marché / à ses abords / en zone
// industrielle, quelle que soit la classe (fiche produit SECURSTOCK, §7 NB).
const PLAFOND_MARCHE_SECURSTOCK = 1_000_000;

const AFFECTIONS: { value: string; label: string }[] = [
  { value: "cancer", label: "Cancer" },
  { value: "diabete", label: "Diabète" },
  { value: "hypertension", label: "Hypertension" },
  { value: "cardiaque", label: "Maladies cardiaques" },
  { value: "vih", label: "VIH" },
  { value: "ulcere", label: "Ulcère" },
  { value: "fatigue", label: "Fatigue" },
  { value: "maladie_sang", label: "Maladie de sang" },
  { value: "insuffisance_renale", label: "Insuffisance rénale" },
  { value: "asthme", label: "Asthme" },
];

function defaultSante() {
  return {
    taille: 0, poids: 0,
    fumeur: false, cigarettesParJour: 0,
    sportif: false, sportifNiveau: "amateur" as "amateur" | "professionnel",
    infirmite: false, infirmiteTaux: "", infirmiteNature: "",
    maladieRecente: false, maladieRecentePrecisions: "",
    touxFievre: false,
    diarrheeFrequente: false,
    transfusion: false,
    enceinte: false,
    affections: [] as string[],
    affectionsPrecisions: "",
  };
}

interface Beneficiaire { nom: string; contact: string; lien: string; pourcentage: number }

/** Question oui/non compacte, utilisée dans la déclaration de bonne santé COUPS DURS. */
function OuiNon({ label, value, onChange }: { label: React.ReactNode; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
          <input type="radio" checked={value === true} onChange={() => onChange(true)} /> Oui
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
          <input type="radio" checked={value === false} onChange={() => onChange(false)} /> Non
        </label>
      </div>
    </div>
  );
}

interface BaremeClasse {
  classe: number;
  limiteCapital: number;
  tauxIncendie: number;
}

interface BaremeClasseSecurstock {
  classe: number;
  limiteCapital: number;
}

interface LignePrime {
  garantie: string;
  capital?: number;
  prime: number;
}
interface ResultatFormule {
  depassementPlafond: boolean;
  lignes: LignePrime[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
}

/**
 * `apiBase` permet de réutiliser le même simulateur dans deux espaces :
 *  - "/agent-imf" (par défaut) : l'agent connecté, souscription rattachée à lui ;
 *  - "/imf" : l'admin, souscription directe (sans agent/zone/agence).
 * Les endpoints (baremes/securpro, simulations, souscriptions) existent sous
 * les deux préfixes avec la même forme de requête/réponse.
 */
export default function Simulateur({ apiBase = "/agent-imf" }: { apiBase?: string }) {
  const [produitCode, setProduitCode] = useState<ProduitCode>("securpro");
  const [error, setError] = useState("");
  const [resultat, setResultat] = useState<
    ResultatFormule | { lignes: LignePrime[]; primeTTC: number } | { prime: number; capitalGaranti: number } | null
  >(null);
  const [souscription, setSouscription] = useState<SouscriptionImf | null>(null);
  const [client, setClient] = useState({
    nom: "", prenom: "", telephone: "", email: "",
    typePiece: "cni" as "cni" | "passeport" | "permis_conduire",
    numeroPiece: "", ville: "", communeQuartier: "",
  });
  const [souscrivant, setSouscrivant] = useState(false);
  const [erreurSouscription, setErreurSouscription] = useState("");
  const sigRef = useRef<SignaturePadHandle>(null);
  const online = useOnline();
  const [souscriptionHorsLigne, setSouscriptionHorsLigne] = useState<SouscriptionEnAttente | null>(null);
  const [entreesCourantes, setEntreesCourantes] = useState<Record<string, unknown> | null>(null);
  const [resultatCourant, setResultatCourant] = useState<unknown>(null);
  const [primeTTCCourante, setPrimeTTCCourante] = useState(0);
  // Passe à true au clic sur « Je souscris » : révèle le formulaire d'identité
  // du client. Le devis lui-même est déjà calculé en direct avant ça.
  const [pretASouscrire, setPretASouscrire] = useState(false);

  // SECURPRO
  const [sp, setSp] = useState({
    classe: 1, statutOccupation: "proprietaire" as "proprietaire" | "locataire",
    valeurBatiment: 0, loyerMensuel: 0, contenu: 0, dansMarche: null as boolean | null,
    gardien: false, extincteur: false,
    volContenu: false, majorationVolContenu: false,
    volCaisseCapital: 0, majorationVolCaisse: false,
    ddeCapital: 0, deCapital: 0, bdgCapital: 0,
  });
  const baremeSecurpro = useBaremeCache<BaremeClasse[]>(
    "baremes_securpro",
    produitCode === "securpro" ? `${apiBase}/baremes/securpro` : null,
    online
  );
  const limiteClasseSecurpro = baremeSecurpro?.find((b) => b.classe === sp.classe)?.limiteCapital;
  const limiteApplicableSecurpro =
    limiteClasseSecurpro !== undefined
      ? sp.dansMarche
        ? Math.min(limiteClasseSecurpro, PLAFOND_MARCHE)
        : limiteClasseSecurpro
      : undefined;

  // SECURSTOCK
  const [ss, setSs] = useState({
    classe: 1, capitalDeclare: 0,
    densite: "aere" as "aere" | "normal" | "compact" | "tres_compact" | "entasse",
    localisation: "hors_marche" as "hors_marche" | "abords_marche" | "marche_zone_industrielle",
    installationElectrique: "securisee" as "securisee" | "acceptable" | "degradee" | "dangereuse",
    prevention: "aucun" as "extincteurs_alarme_formation_eau" | "extincteurs_eau" | "extincteurs_seuls" | "aucun",
    gardien: false,
    cameraSurveillance: null as boolean | null,
  });
  const baremeSecurstock = useBaremeCache<BaremeClasseSecurstock[]>(
    "baremes_securstock",
    produitCode === "securstock" ? `${apiBase}/baremes/securstock` : null,
    online
  );
  const limiteClasseSecurstock = baremeSecurstock?.find((b) => b.classe === ss.classe)?.limiteCapital;
  const limiteApplicableSecurstock =
    limiteClasseSecurstock !== undefined
      ? ss.localisation !== "hors_marche"
        ? Math.min(limiteClasseSecurstock, PLAFOND_MARCHE_SECURSTOCK)
        : limiteClasseSecurstock
      : undefined;

  // SECURECOLTE : variante unique du catalogue ("pack")
  const [variante, setVariante] = useState("pack");

  // COUPS DURS (produit fusionné) : Maladie est incluse d'office (garantie
  // socle, non désactivable), Décès est une case à cocher facultative,
  // Incapacité temporaire est un plafond optionnel (500 000 OU 1 000 000,
  // jamais les deux) — voir calculerCoupsdursHorsLigne().
  const [cd, setCd] = useState({ deces: false, incapacite: null as null | "plafond_500000" | "plafond_1000000" });
  const estCoupsdurs = produitCode === "coupsdurs";
  const necessiteBeneficiaires = estCoupsdurs && cd.deces;

  // COUPS DURS : déclaration de bonne santé + bénéficiaires (si Décès coché)
  const [sante, setSante] = useState(defaultSante());
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
  const totalBeneficiaires = beneficiaires.reduce((s, b) => s + (b.pourcentage || 0), 0);

  // SECURECOLTE : 1 hectare = 1 pack — la prime et le capital garanti du
  // catalogue sont multipliés par la superficie déclarée. La valeur du
  // package reste purement déclarative (sans effet sur le tarif).
  const estSecurecolte = produitCode === "securecolte";
  const [secol, setSecol] = useState({ valeurPackage: 0, superficieHa: 0 });

  function toggleAffection(a: string) {
    setSante((s) => ({
      ...s,
      affections: s.affections.includes(a) ? s.affections.filter((x) => x !== a) : [...s.affections, a],
    }));
  }
  function ajouterBeneficiaire() {
    setBeneficiaires((b) => [...b, { nom: "", contact: "", lien: "", pourcentage: 0 }]);
  }
  function retirerBeneficiaire(i: number) {
    setBeneficiaires((b) => b.filter((_, idx) => idx !== i));
  }
  function majBeneficiaire(i: number, patch: Partial<Beneficiaire>) {
    setBeneficiaires((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  // Le mode hors-ligne n'est offert que dans l'espace agent : l'admin
  // travaille depuis un poste normalement toujours connecté, et les routes
  // /imf/... n'implémentent pas l'idempotence par offlineId (voir sync.ts).
  const offlineCapable = apiBase === "/agent-imf";
  const modeHorsLigne = offlineCapable && !online;

  /**
   * Devis calculé en direct, sans bouton ni requête serveur, à chaque
   * modification d'un paramètre — via le même moteur que le mode hors-ligne
   * (offline/tarification.ts, offline/catalogue.ts). Aucune simulation n'est
   * persistée à ce stade : elle n'est créée côté serveur (avec recalcul sur
   * le barème EN VIGUEUR, seule source de vérité) qu'au moment de la
   * conversion effective en souscription — voir souscrire().
   */
  useEffect(() => {
    let nextResultat: ResultatFormule | { lignes: LignePrime[]; primeTTC: number } | { prime: number; capitalGaranti: number } | null = null;
    let nextEntrees: Record<string, unknown> | null = null;
    let nextPrimeTTC = 0;
    let nextError = "";

    if (produitCode === "securpro") {
      if (sp.dansMarche !== null && baremeSecurpro) {
        const bareme = baremeSecurpro.find((b) => b.classe === sp.classe);
        if (bareme) {
          const entrees: Record<string, unknown> = {
            classe: sp.classe,
            statutOccupation: sp.statutOccupation,
            valeurBatiment: sp.statutOccupation === "proprietaire" ? sp.valeurBatiment : undefined,
            loyerMensuel: sp.statutOccupation === "locataire" ? sp.loyerMensuel : undefined,
            contenu: sp.contenu,
            dansMarche: !!sp.dansMarche,
            gardien: sp.gardien,
            extincteur: sp.extincteur,
            volContenu: sp.volContenu,
            majorationVolContenu: sp.majorationVolContenu,
            volCaisseCapital: sp.volCaisseCapital || undefined,
            majorationVolCaisse: sp.majorationVolCaisse,
            ddeCapital: sp.ddeCapital || undefined,
            deCapital: sp.deCapital || undefined,
            bdgCapital: sp.bdgCapital || undefined,
          };
          const r = calculerSecurproLocal(
            entrees as unknown as SecurproInput,
            bareme as unknown as { classe: 1 | 2 | 3 | 4; limiteCapital: number; tauxIncendie: number }
          );
          nextResultat = r as ResultatFormule;
          nextEntrees = entrees;
          nextPrimeTTC = r.primeTTC;
        }
      }
    } else if (produitCode === "securstock") {
      if (baremeSecurstock && ss.cameraSurveillance !== null) {
        const bareme = baremeSecurstock.find((b) => b.classe === ss.classe);
        if (bareme) {
          const entrees: Record<string, unknown> = { ...ss };
          const r = calculerSecurstockLocal(
            entrees as unknown as SecurstockInput,
            bareme as { classe: 1 | 2 | 3 | 4; limiteCapital: number; tauxDommageElectrique: number; tauxAutreCause: number }
          );
          if ("nonAssurable" in r && r.nonAssurable) {
            nextError = r.motif;
          } else {
            nextResultat = r as ResultatFormule;
            nextEntrees = entrees;
            nextPrimeTTC = r.primeTTC;
          }
        }
      }
    } else if (produitCode === "coupsdurs") {
      const r = calculerCoupsdursHorsLigne(cd.deces, cd.incapacite);
      if (r) {
        nextEntrees = {
          deces: cd.deces,
          incapacite: cd.incapacite,
          sante,
          beneficiaires: cd.deces ? beneficiaires : undefined,
        };
        nextResultat = r;
        nextPrimeTTC = r.primeTTC;
      }
    } else if (secol.superficieHa > 0) {
      // SECURECOLTE : 1 hectare = 1 pack — prime et capital garanti du
      // catalogue multipliés par la superficie déclarée.
      const t = tarifCatalogueHorsLigne(produitCode, variante);
      if (t) {
        nextEntrees = {
          libelleVariante: variante,
          valeurPackage: secol.valeurPackage || undefined,
          superficieHa: secol.superficieHa,
        };
        const primeCalculee = Math.round(t.prime * secol.superficieHa);
        nextResultat = { prime: primeCalculee, capitalGaranti: Math.round(t.capitalGaranti * secol.superficieHa) };
        nextPrimeTTC = primeCalculee;
      }
    }

    setResultat(nextResultat);
    setEntreesCourantes(nextEntrees);
    setResultatCourant(nextResultat);
    setPrimeTTCCourante(nextPrimeTTC);
    setError(nextError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produitCode, sp, ss, variante, sante, beneficiaires, baremeSecurpro, baremeSecurstock, cd, secol]);

  function reset() {
    setSouscription(null);
    setSouscriptionHorsLigne(null);
    setErreurSouscription("");
    setPretASouscrire(false);
    sigRef.current?.clear();
    setSante(defaultSante());
    setBeneficiaires([]);
    setSecol({ valeurPackage: 0, superficieHa: 0 });
    setCd({ deces: false, incapacite: null });
  }

  async function souscrire(e: React.FormEvent) {
    e.preventDefault();
    if (!entreesCourantes || depassement) return;
    setSouscrivant(true);
    setErreurSouscription("");
    try {
      if (modeHorsLigne) {
        const offlineId = crypto.randomUUID();
        const item: SouscriptionEnAttente = {
          offlineId,
          apiBase,
          produitCode,
          entrees: entreesCourantes,
          resultat: resultatCourant,
          primeTTC: primeTTCCourante,
          client: {
            nom: client.nom,
            prenom: client.prenom,
            telephone: client.telephone,
            email: client.email || undefined,
            typePiece: client.typePiece,
            numeroPiece: client.numeroPiece,
            ville: client.ville,
            communeQuartier: client.communeQuartier,
            signature: sigRef.current?.toDataURL() ?? undefined,
          },
          tempNumero: `TMP-${Date.now().toString(36).toUpperCase()}`,
          createdAt: new Date().toISOString(),
          statut: "en_attente",
        };
        await putQueueItem(item);
        setSouscriptionHorsLigne(item);
        return;
      }
      // En ligne : la simulation n'a jamais été persistée pendant la saisie
      // (devis calculé en direct côté client) — on la crée maintenant, ce qui
      // déclenche un recalcul serveur sur le barème EN VIGUEUR (seule source
      // de vérité), puis on convertit aussitôt en souscription.
      const simulation = await api.post<{ id: string }>(`${apiBase}/simulations`, {
        produitCode,
        entrees: entreesCourantes,
      });
      const res = await api.post<SouscriptionImf>(`${apiBase}/souscriptions`, {
        simulationId: simulation.id,
        nom: client.nom,
        prenom: client.prenom,
        telephone: client.telephone,
        email: client.email || undefined,
        typePiece: client.typePiece,
        numeroPiece: client.numeroPiece,
        ville: client.ville,
        communeQuartier: client.communeQuartier,
        signature: sigRef.current?.toDataURL() ?? undefined,
      });
      setSouscription(res);
    } catch (err) {
      setErreurSouscription((err as Error).message);
    } finally {
      setSouscrivant(false);
    }
  }

  const depassement = !!(resultat && "depassementPlafond" in resultat && resultat.depassementPlafond);
  const devisValide = !!resultat && !depassement;
  const peutSouscrire = devisValide && !souscription && !souscriptionHorsLigne;
  const primeVolLigne = resultat && "lignes" in resultat ? resultat.lignes.find((l) => l.garantie === "Vol") : undefined;

  return (
    <>
      <PageHeader title="Simulateur" subtitle="Établir un devis pour l'un des produits IMF." />

      {modeHorsLigne && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.12)", color: "#b45309", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <WifiOff size={16} />
          Mode hors-ligne : le devis est calculé localement à titre indicatif (barèmes mis en cache) et la souscription sera mise en file d'attente jusqu'à la reconnexion — le montant définitif sera confirmé par le serveur à la synchronisation.
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 24 }}>
        <Card title="Paramètres">
          <div className="field">
            <label className="label">Produit</label>
            <select
              className="select"
              value={produitCode}
              onChange={(e) => { setProduitCode(e.target.value as ProduitCode); reset(); }}
            >
              {PRODUITS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </div>

          <div>
            {produitCode === "securpro" && (
              <>
                <div className="field">
                  <label className="label">Le local se trouve-t-il dans un marché ou à ses abords ? <span className="req">*</span></label>
                  <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="radio"
                        name="dansMarche"
                        checked={sp.dansMarche === true}
                        onChange={() => setSp({ ...sp, dansMarche: true })}
                      /> Oui
                    </label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="radio"
                        name="dansMarche"
                        checked={sp.dansMarche === false}
                        onChange={() => setSp({ ...sp, dansMarche: false })}
                      /> Non
                    </label>
                  </div>
                  {sp.dansMarche === null && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Cette réponse détermine la limite de capitaux assurables.
                    </div>
                  )}
                </div>

                <div className="field">
                  <label className="label">Classe de risque</label>
                  <select className="select" value={sp.classe} onChange={(e) => setSp({ ...sp, classe: Number(e.target.value) })}>
                    {SECURPRO_CLASSES.map((c) => (
                      <option key={c.classe} value={c.classe}>{c.label}</option>
                    ))}
                  </select>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {limiteApplicableSecurpro !== undefined
                      ? `Limite de capitaux assurables : ${fcfa(limiteApplicableSecurpro)}`
                      : "Chargement de la limite de capitaux…"}
                  </div>
                </div>
                <div className="field">
                  <label className="label">Statut d'occupation</label>
                  <select className="select" value={sp.statutOccupation} onChange={(e) => setSp({ ...sp, statutOccupation: e.target.value as "proprietaire" | "locataire" })}>
                    <option value="proprietaire">Propriétaire</option>
                    <option value="locataire">Locataire</option>
                  </select>
                </div>
                {sp.statutOccupation === "proprietaire" ? (
                  <div className="field">
                    <label className="label">Valeur du bâtiment (hors terrain)</label>
                    <input className="input" type="number" value={sp.valeurBatiment} onChange={(e) => setSp({ ...sp, valeurBatiment: Number(e.target.value) })} />
                  </div>
                ) : (
                  <div className="field">
                    <label className="label">Loyer mensuel</label>
                    <input className="input" type="number" value={sp.loyerMensuel} onChange={(e) => setSp({ ...sp, loyerMensuel: Number(e.target.value) })} />
                  </div>
                )}
                <div className="field">
                  <label className="label">Contenu déclaré</label>
                  <input className="input" type="number" value={sp.contenu} onChange={(e) => setSp({ ...sp, contenu: Number(e.target.value) })} />
                </div>
                <div className="field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={sp.gardien} onChange={(e) => setSp({ ...sp, gardien: e.target.checked })} /> Gardien
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={sp.extincteur} onChange={(e) => setSp({ ...sp, extincteur: e.target.checked })} /> Extincteur
                  </label>
                </div>

                <div className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <label className="label">Garanties optionnelles</label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, justifyContent: "space-between" }}>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="checkbox" checked={sp.volContenu} onChange={(e) => setSp({ ...sp, volContenu: e.target.checked })} />
                      Vol contenu
                    </span>
                    {sp.volContenu && primeVolLigne && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {fcfa(primeVolLigne.prime)}{sp.volCaisseCapital ? " (incl. vol caisse)" : ""}
                      </span>
                    )}
                  </label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 13 }}>Vol caisse</span>
                    <select className="select" style={{ width: 160 }} value={sp.volCaisseCapital} onChange={(e) => setSp({ ...sp, volCaisseCapital: Number(e.target.value) })}>
                      <option value={0}>Non souscrit</option>
                      {VOL_CAISSE_CAPITAUX.map((c) => <option key={c} value={c}>{fcfa(c)}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 13 }}>Dégât des eaux</span>
                    <select className="select" style={{ width: 160 }} value={sp.ddeCapital} onChange={(e) => setSp({ ...sp, ddeCapital: Number(e.target.value) })}>
                      <option value={0}>Non souscrit</option>
                      {DDE_CAPITAUX.map((c) => <option key={c} value={c}>{fcfa(c)}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 13 }}>Dommages électriques</span>
                    <select className="select" style={{ width: 160 }} value={sp.deCapital} onChange={(e) => setSp({ ...sp, deCapital: Number(e.target.value) })}>
                      <option value={0}>Non souscrit</option>
                      {DE_CAPITAUX.map((c) => <option key={c} value={c}>{fcfa(c)}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 13 }}>Bris de glace</span>
                    <select className="select" style={{ width: 160 }} value={sp.bdgCapital} onChange={(e) => setSp({ ...sp, bdgCapital: Number(e.target.value) })}>
                      <option value={0}>Non souscrit</option>
                      {BDG_CAPITAUX.map((c) => <option key={c} value={c}>{fcfa(c)}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {produitCode === "securstock" && (
              <>
                <div className="field">
                  <label className="label">Où se trouve le local de stockage ? <span className="req">*</span></label>
                  <select className="select" value={ss.localisation} onChange={(e) => setSs({ ...ss, localisation: e.target.value as typeof ss.localisation })}>
                    <option value="hors_marche">Hors d'un marché</option>
                    <option value="abords_marche">Abords d'un marché</option>
                    <option value="marche_zone_industrielle">Dans un marché / zone industrielle</option>
                  </select>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Un local dans un marché ou à ses abords plafonne les capitaux assurables.
                  </div>
                </div>
                <div className="field">
                  <label className="label">Classe de risque</label>
                  <select className="select" value={ss.classe} onChange={(e) => setSs({ ...ss, classe: Number(e.target.value) })}>
                    {SECURSTOCK_CLASSES.map((c) => (
                      <option key={c.classe} value={c.classe}>{c.label}</option>
                    ))}
                  </select>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {limiteApplicableSecurstock !== undefined
                      ? `Limite de capitaux assurables : ${fcfa(limiteApplicableSecurstock)}`
                      : "Chargement de la limite de capitaux…"}
                  </div>
                </div>
                <div className="field">
                  <label className="label">Capital déclaré (stock nanti)</label>
                  <input className="input" type="number" value={ss.capitalDeclare} onChange={(e) => setSs({ ...ss, capitalDeclare: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label className="label">Densité</label>
                  <select className="select" value={ss.densite} onChange={(e) => setSs({ ...ss, densite: e.target.value as typeof ss.densite })}>
                    <option value="aere">Aéré, bien organisé</option>
                    <option value="normal">Normal</option>
                    <option value="compact">Compact</option>
                    <option value="tres_compact">Très compact</option>
                    <option value="entasse">Entassé / dangereux</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Installation électrique</label>
                  <select className="select" value={ss.installationElectrique} onChange={(e) => setSs({ ...ss, installationElectrique: e.target.value as typeof ss.installationElectrique })}>
                    <option value="securisee">Sécurisée</option>
                    <option value="acceptable">Acceptable</option>
                    <option value="degradee">Dégradée</option>
                    <option value="dangereuse">Dangereuse (non assurable)</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Dispositif anti-incendie</label>
                  <select className="select" value={ss.prevention} onChange={(e) => setSs({ ...ss, prevention: e.target.value as typeof ss.prevention })}>
                    <option value="aucun">Aucun</option>
                    <option value="extincteurs_seuls">Extincteurs uniquement</option>
                    <option value="extincteurs_eau">Extincteurs + accès eau</option>
                    <option value="extincteurs_alarme_formation_eau">Extincteurs + alarme + formation + accès eau</option>
                  </select>
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={ss.gardien} onChange={(e) => setSs({ ...ss, gardien: e.target.checked })} /> Gardien
                </label>
                <div className="field" style={{ marginTop: 10 }}>
                  <OuiNon
                    label={<>Y a-t-il une caméra de surveillance ? <span className="req">*</span></>}
                    value={ss.cameraSurveillance}
                    onChange={(v) => setSs({ ...ss, cameraSurveillance: v })}
                  />
                </div>
              </>
            )}

            {produitCode === "securecolte" && (
              <div className="field">
                <label className="label">Variante</label>
                <select className="select" value={variante} onChange={(e) => setVariante(e.target.value)}>
                  <option value="pack">Pack SECURECOLTE</option>
                </select>
              </div>
            )}

            {estCoupsdurs && (
              <>
                <div className="field">
                  <label className="label">Option 1 — Classique</label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, opacity: 0.7 }}>
                    <input type="checkbox" checked disabled />
                    Maladie Coups Durs (500 000 FCFA)
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <input type="checkbox" checked={cd.deces} onChange={(e) => setCd({ ...cd, deces: e.target.checked })} />
                    Décès suite à Coups Durs (500 000 FCFA)
                  </label>
                </div>

                <div className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <label className="label">Option 2 — Incapacité temporaire</label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={cd.incapacite !== null}
                      onChange={(e) => setCd({ ...cd, incapacite: e.target.checked ? "plafond_500000" : null })}
                    />
                    Incapacité temporaire de l'emprunteur
                  </label>
                  {cd.incapacite !== null && (
                    <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name="plafondIncapacite"
                          checked={cd.incapacite === "plafond_500000"}
                          onChange={() => setCd({ ...cd, incapacite: "plafond_500000" })}
                        /> 500 000 FCFA
                      </label>
                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name="plafondIncapacite"
                          checked={cd.incapacite === "plafond_1000000"}
                          onChange={() => setCd({ ...cd, incapacite: "plafond_1000000" })}
                        /> 1 000 000 FCFA
                      </label>
                    </div>
                  )}
                </div>
              </>
            )}

            {estSecurecolte && (
              <>
                <div className="field">
                  <label className="label">Valeur du package <span className="req">*</span></label>
                  <input
                    className="input"
                    type="number"
                    value={secol.valeurPackage || ""}
                    onChange={(e) => setSecol({ ...secol, valeurPackage: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label className="label">Superficie du champ (ha) <span className="req">*</span></label>
                  <input
                    className="input"
                    type="number"
                    value={secol.superficieHa || ""}
                    onChange={(e) => setSecol({ ...secol, superficieHa: Number(e.target.value) })}
                  />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 8 }}>
                  Informations déclaratives : sans effet sur la prime ni le capital garanti du pack.
                </div>
              </>
            )}

            {estCoupsdurs && (
              <div className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <label className="label">Déclaration de bonne santé <span className="req">*</span></label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  Les réponses inexactes ou les omissions intentionnelles peuvent entraîner la nullité du contrat.
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13 }}>Taille (cm)</span>
                    <input className="input" type="number" value={sante.taille} onChange={(e) => setSante({ ...sante, taille: Number(e.target.value) })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13 }}>Poids (kg)</span>
                    <input className="input" type="number" value={sante.poids} onChange={(e) => setSante({ ...sante, poids: Number(e.target.value) })} />
                  </div>
                </div>

                <OuiNon label="Fumez-vous ?" value={sante.fumeur} onChange={(v) => setSante({ ...sante, fumeur: v })} />
                {sante.fumeur && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 13 }}>Cigarettes par jour</span>
                    <input className="input" type="number" value={sante.cigarettesParJour} onChange={(e) => setSante({ ...sante, cigarettesParJour: Number(e.target.value) })} />
                  </div>
                )}

                <OuiNon label="Pratiquez-vous un sport ?" value={sante.sportif} onChange={(v) => setSante({ ...sante, sportif: v })} />
                {sante.sportif && (
                  <div style={{ marginBottom: 10 }}>
                    <select className="select" value={sante.sportifNiveau} onChange={(e) => setSante({ ...sante, sportifNiveau: e.target.value as "amateur" | "professionnel" })}>
                      <option value="amateur">Amateur</option>
                      <option value="professionnel">Professionnel</option>
                    </select>
                  </div>
                )}

                <OuiNon label="Êtes-vous atteint d'une infirmité ?" value={sante.infirmite} onChange={(v) => setSante({ ...sante, infirmite: v })} />
                {sante.infirmite && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <input className="input" placeholder="Taux" value={sante.infirmiteTaux} onChange={(e) => setSante({ ...sante, infirmiteTaux: e.target.value })} />
                    <input className="input" placeholder="Nature" value={sante.infirmiteNature} onChange={(e) => setSante({ ...sante, infirmiteNature: e.target.value })} />
                  </div>
                )}

                <OuiNon label="Avez-vous été malade pendant ces 5 dernières années ?" value={sante.maladieRecente} onChange={(v) => setSante({ ...sante, maladieRecente: v })} />
                {sante.maladieRecente && (
                  <input className="input" style={{ marginBottom: 10 }} placeholder="Précisions" value={sante.maladieRecentePrecisions} onChange={(e) => setSante({ ...sante, maladieRecentePrecisions: e.target.value })} />
                )}

                <OuiNon label="Toussez-vous depuis quelque temps avec de la fièvre ?" value={sante.touxFievre} onChange={(v) => setSante({ ...sante, touxFievre: v })} />
                <OuiNon label="Faites-vous souvent de la diarrhée ?" value={sante.diarrheeFrequente} onChange={(v) => setSante({ ...sante, diarrheeFrequente: v })} />
                <OuiNon label="Avez-vous déjà reçu une transfusion de sang ?" value={sante.transfusion} onChange={(v) => setSante({ ...sante, transfusion: v })} />
                <OuiNon label="Êtes-vous enceinte ?" value={sante.enceinte} onChange={(v) => setSante({ ...sante, enceinte: v })} />

                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Souffrez-vous de :</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                    {AFFECTIONS.map((a) => (
                      <label key={a.value} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                        <input type="checkbox" checked={sante.affections.includes(a.value)} onChange={() => toggleAffection(a.value)} /> {a.label}
                      </label>
                    ))}
                  </div>
                </div>
                {sante.affections.length > 0 && (
                  <input className="input" style={{ marginTop: 10 }} placeholder="Précisions sur les affections cochées" value={sante.affectionsPrecisions} onChange={(e) => setSante({ ...sante, affectionsPrecisions: e.target.value })} />
                )}
              </div>
            )}

            {necessiteBeneficiaires && (
              <div className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <label className="label">Bénéficiaires en cas de décès <span className="req">*</span></label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  La somme des parts doit être égale à 100 %.
                </div>
                {beneficiaires.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input className="input" placeholder="Nom et prénoms" value={b.nom} onChange={(e) => majBeneficiaire(i, { nom: e.target.value })} style={{ flex: 2, minWidth: 120 }} />
                    <input className="input" placeholder="Contact" value={b.contact} onChange={(e) => majBeneficiaire(i, { contact: e.target.value })} style={{ flex: 1, minWidth: 90 }} />
                    <input className="input" placeholder="Lien" value={b.lien} onChange={(e) => majBeneficiaire(i, { lien: e.target.value })} style={{ flex: 1, minWidth: 90 }} />
                    <input className="input" type="number" placeholder="%" value={b.pourcentage || ""} onChange={(e) => majBeneficiaire(i, { pourcentage: Number(e.target.value) })} style={{ width: 70 }} />
                    <button type="button" className="btn btn-ghost" style={{ padding: "6px 8px" }} onClick={() => retirerBeneficiaire(i)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost" onClick={ajouterBeneficiaire} style={{ marginTop: 4 }}>
                  <Plus size={15} /> Ajouter un bénéficiaire
                </button>
                <div className="muted" style={{ fontSize: 12, marginTop: 8, color: Math.round(totalBeneficiaires) === 100 ? undefined : "var(--danger)" }}>
                  Total : {totalBeneficiaires}% {Math.round(totalBeneficiaires) === 100 ? "✓" : "(doit être égal à 100 %)"}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={
                !devisValide ||
                (necessiteBeneficiaires && Math.round(totalBeneficiaires) !== 100) ||
                (estSecurecolte && (!secol.valeurPackage || !secol.superficieHa))
              }
              style={{ marginTop: 16 }}
              onClick={() => setPretASouscrire(true)}
            >
              <FileCheck size={17} /> Je souscris
            </button>
          </div>
        </Card>

        <Card title="Résultat">
          {error && <div className="empty" style={{ color: "var(--danger)" }}>{error}</div>}
          {!error && !resultat && <div className="empty">Renseignez les paramètres pour voir le devis.</div>}

          {!error && resultat && "depassementPlafond" in resultat && (
            <>
              {resultat.depassementPlafond ? (
                <div className="empty" style={{ color: "var(--danger)" }}>
                  Les capitaux dépassent le plafond de la classe — souscription manuelle requise.
                </div>
              ) : (
                <table className="tbl" style={{ width: "100%" }}>
                  <tbody>
                    {resultat.lignes.map((l, i) => (
                      <tr key={i}>
                        <td>{l.garantie}{l.capital ? ` (${fcfa(l.capital)})` : ""}</td>
                        <td style={{ textAlign: "right" }}>{fcfa(l.prime)}</td>
                      </tr>
                    ))}
                    <tr><td className="muted">Prime nette HT</td><td style={{ textAlign: "right" }}>{fcfa(resultat.primeNetteHT)}</td></tr>
                    <tr><td className="muted">Accessoires</td><td style={{ textAlign: "right" }}>{fcfa(resultat.accessoires)}</td></tr>
                    <tr><td className="muted">Taxes</td><td style={{ textAlign: "right" }}>{fcfa(resultat.taxes)}</td></tr>
                    <tr><td><strong>Prime TTC</strong></td><td style={{ textAlign: "right" }}><strong>{fcfa(resultat.primeTTC)}</strong></td></tr>
                  </tbody>
                </table>
              )}
            </>
          )}

          {!error && resultat && "lignes" in resultat && !("depassementPlafond" in resultat) && (
            <table className="tbl" style={{ width: "100%" }}>
              <tbody>
                {resultat.lignes.map((l, i) => (
                  <tr key={i}>
                    <td>{l.garantie}{l.capital ? ` (${fcfa(l.capital)})` : ""}</td>
                    <td style={{ textAlign: "right" }}>{fcfa(l.prime)}</td>
                  </tr>
                ))}
                <tr><td><strong>Prime TTC</strong></td><td style={{ textAlign: "right" }}><strong>{fcfa(resultat.primeTTC)}</strong></td></tr>
              </tbody>
            </table>
          )}

          {!error && resultat && "prime" in resultat && (
            <table className="tbl" style={{ width: "100%" }}>
              <tbody>
                <tr><td className="muted">Capital garanti</td><td style={{ textAlign: "right" }}>{fcfa(resultat.capitalGaranti)}</td></tr>
                <tr><td><strong>Prime TTC</strong></td><td style={{ textAlign: "right" }}><strong>{fcfa(resultat.prime)}</strong></td></tr>
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {((pretASouscrire && peutSouscrire) || souscription || souscriptionHorsLigne) && (
        <div style={{ marginTop: 24 }}>
          <Card title="Souscription">
            {souscription ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FileCheck size={20} color="var(--success, #16a34a)" />
                  <div>
                    <div style={{ fontWeight: 700 }}>Souscription créée — {souscription.numeroPolice}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {souscription.prenom} {souscription.nom} · {fcfa(souscription.primeTTC)}
                    </div>
                  </div>
                </div>
                {contratImfDisponible(souscription.produitCode) && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => genererContratImf(souscription)}
                  >
                    <Download size={15} /> Télécharger le contrat
                  </button>
                )}
              </div>
            ) : souscriptionHorsLigne ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <WifiOff size={20} color="#b45309" />
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      Enregistrée hors-ligne — {souscriptionHorsLigne.tempNumero} <Badge kind="warning">En attente de synchronisation</Badge>
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {souscriptionHorsLigne.client.prenom} {souscriptionHorsLigne.client.nom} · {fcfa(souscriptionHorsLigne.primeTTC)} (estimation)
                      {" · "}sera synchronisée et confirmée par le serveur automatiquement dès la reconnexion.
                    </div>
                  </div>
                </div>
                {contratImfDisponible(souscriptionHorsLigne.produitCode) && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      genererContratImf({
                        id: souscriptionHorsLigne.offlineId,
                        numeroPolice: souscriptionHorsLigne.tempNumero,
                        agentId: null,
                        simulationId: null,
                        produitCode: souscriptionHorsLigne.produitCode,
                        nom: souscriptionHorsLigne.client.nom,
                        prenom: souscriptionHorsLigne.client.prenom,
                        telephone: souscriptionHorsLigne.client.telephone,
                        email: souscriptionHorsLigne.client.email ?? null,
                        typePiece: souscriptionHorsLigne.client.typePiece,
                        numeroPiece: souscriptionHorsLigne.client.numeroPiece,
                        ville: souscriptionHorsLigne.client.ville,
                        communeQuartier: souscriptionHorsLigne.client.communeQuartier,
                        signature: souscriptionHorsLigne.client.signature ?? null,
                        entrees: souscriptionHorsLigne.entrees,
                        resultat: souscriptionHorsLigne.resultat as Record<string, unknown>,
                        primeTTC: souscriptionHorsLigne.primeTTC,
                        statut: "active",
                        createdAt: souscriptionHorsLigne.createdAt,
                      })
                    }
                  >
                    <Download size={15} /> Télécharger le contrat (provisoire)
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={souscrire}>
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  Identité du client pour transformer ce devis en souscription, sans ressaisir les paramètres tarifaires.
                </p>
                <div className="field">
                  <label className="label">Nom <span className="req">*</span></label>
                  <input className="input" required value={client.nom} onChange={(e) => setClient({ ...client, nom: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Prénom <span className="req">*</span></label>
                  <input className="input" required value={client.prenom} onChange={(e) => setClient({ ...client, prenom: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Téléphone <span className="req">*</span></label>
                  <input className="input" required value={client.telephone} onChange={(e) => setClient({ ...client, telephone: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Email</label>
                  <input className="input" type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Type de pièce <span className="req">*</span></label>
                  <select
                    className="select"
                    value={client.typePiece}
                    onChange={(e) => setClient({ ...client, typePiece: e.target.value as typeof client.typePiece })}
                  >
                    <option value="cni">CNI</option>
                    <option value="passeport">Passeport</option>
                    <option value="permis_conduire">Permis de conduire</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">N° de la pièce <span className="req">*</span></label>
                  <input className="input" required value={client.numeroPiece} onChange={(e) => setClient({ ...client, numeroPiece: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Ville <span className="req">*</span></label>
                  <input className="input" required value={client.ville} onChange={(e) => setClient({ ...client, ville: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Commune ou quartier <span className="req">*</span></label>
                  <input className="input" required value={client.communeQuartier} onChange={(e) => setClient({ ...client, communeQuartier: e.target.value })} />
                </div>
                <SignaturePad ref={sigRef} label="Signature du souscripteur (facultative)" />
                {erreurSouscription && (
                  <div className="empty" style={{ color: "var(--danger)", marginBottom: 12 }}>{erreurSouscription}</div>
                )}
                <button
                  className="btn btn-primary btn-block"
                  disabled={
                    souscrivant ||
                    !client.nom.trim() ||
                    !client.prenom.trim() ||
                    !client.telephone.trim() ||
                    !client.numeroPiece.trim() ||
                    !client.ville.trim() ||
                    !client.communeQuartier.trim()
                  }
                >
                  <FileCheck size={17} /> {souscrivant ? "Création…" : "Créer la souscription"}
                </button>
              </form>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
