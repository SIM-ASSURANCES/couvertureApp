import { useState } from "react";
import { Calculator, FileCheck, Download } from "lucide-react";
import { PageHeader, Card, fcfa } from "../../components/ui";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { genererContratSecurpro, souscriptionImfToContratSecurpro } from "../../contract";
import type { SouscriptionImf } from "../../types";

type ProduitCode = "securpro" | "securstock" | "coupsdurs_classique" | "coupsdurs_incapacite" | "securecolte";

const PRODUITS: { code: ProduitCode; label: string }[] = [
  { code: "securpro", label: "SECURPRO" },
  { code: "securstock", label: "SECURSTOCK" },
  { code: "coupsdurs_classique", label: "Coups Durs — Classique" },
  { code: "coupsdurs_incapacite", label: "Coups Durs — Incapacité temporaire" },
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

interface BaremeClasse {
  classe: number;
  limiteCapital: number;
  tauxIncendie: number;
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

export default function Simulateur() {
  const [produitCode, setProduitCode] = useState<ProduitCode>("securpro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultat, setResultat] = useState<ResultatFormule | { prime: number; capitalGaranti: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [souscription, setSouscription] = useState<SouscriptionImf | null>(null);
  const [client, setClient] = useState({
    nom: "", prenom: "", telephone: "", email: "",
    typePiece: "cni" as "cni" | "passeport" | "permis_conduire",
    numeroPiece: "",
  });
  const [souscrivant, setSouscrivant] = useState(false);
  const [erreurSouscription, setErreurSouscription] = useState("");

  // SECURPRO
  const [sp, setSp] = useState({
    classe: 1, statutOccupation: "proprietaire" as "proprietaire" | "locataire",
    valeurBatiment: 0, loyerMensuel: 0, contenu: 0, dansMarche: null as boolean | null,
    gardien: false, extincteur: false,
    volContenu: false, majorationVolContenu: false,
    volCaisseCapital: 0, majorationVolCaisse: false,
    ddeCapital: 0, deCapital: 0, bdgCapital: 0,
  });
  const { data: baremeSecurpro } = useFetch<BaremeClasse[]>(
    produitCode === "securpro" ? "/agent-imf/baremes/securpro" : null
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
  });

  // Catalogue à prix fixe
  const [variante, setVariante] = useState("maladie");

  function reset() {
    setResultat(null);
    setError("");
    setSaved(false);
    setSimulationId(null);
    setSouscription(null);
    setErreurSouscription("");
  }

  async function simuler(e: React.FormEvent) {
    e.preventDefault();
    if (produitCode === "securpro" && sp.dansMarche === null) {
      setError("Veuillez répondre à la question sur la localisation du local.");
      return;
    }
    setLoading(true);
    setError("");
    setSaved(false);
    setSimulationId(null);
    setSouscription(null);
    setErreurSouscription("");
    try {
      let entrees: Record<string, unknown>;
      if (produitCode === "securpro") {
        entrees = {
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
      } else if (produitCode === "securstock") {
        entrees = { ...ss };
      } else {
        entrees = { libelleVariante: variante };
      }

      const res = await api.post<{ id: string; resultat: unknown; primeTTC: number }>("/agent-imf/simulations", {
        produitCode,
        entrees,
      });
      setResultat(res.resultat as ResultatFormule);
      setSimulationId(res.id);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function souscrire(e: React.FormEvent) {
    e.preventDefault();
    if (!simulationId) return;
    setSouscrivant(true);
    setErreurSouscription("");
    try {
      const res = await api.post<SouscriptionImf>("/agent-imf/souscriptions", {
        simulationId,
        nom: client.nom,
        prenom: client.prenom,
        telephone: client.telephone,
        email: client.email || undefined,
        typePiece: client.typePiece,
        numeroPiece: client.numeroPiece,
      });
      setSouscription(res);
    } catch (err) {
      setErreurSouscription((err as Error).message);
    } finally {
      setSouscrivant(false);
    }
  }

  const depassement = !!(resultat && "primeTTC" in resultat && resultat.depassementPlafond);
  const peutSouscrire = !!simulationId && !depassement && !souscription;

  const varianteOptions =
    produitCode === "coupsdurs_classique"
      ? [{ value: "maladie", label: "Maladie Coups Durs (500 000 FCFA)" }, { value: "deces", label: "Décès suite à Coups Durs (500 000 FCFA)" }]
      : produitCode === "coupsdurs_incapacite"
      ? [{ value: "plafond_500000", label: "Plafond 500 000 FCFA" }, { value: "plafond_1000000", label: "Plafond 1 000 000 FCFA" }]
      : [{ value: "pack", label: "Pack SECURECOLTE" }];

  return (
    <>
      <PageHeader title="Simulateur" subtitle="Établir un devis pour l'un des produits IMF." />

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

          <form onSubmit={simuler}>
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
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <input type="checkbox" checked={sp.volContenu} onChange={(e) => setSp({ ...sp, volContenu: e.target.checked })} /> Vol contenu
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
                  <label className="label">Classe de risque</label>
                  <select className="select" value={ss.classe} onChange={(e) => setSs({ ...ss, classe: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((c) => <option key={c} value={c}>Classe {c}</option>)}
                  </select>
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
                  <label className="label">Localisation</label>
                  <select className="select" value={ss.localisation} onChange={(e) => setSs({ ...ss, localisation: e.target.value as typeof ss.localisation })}>
                    <option value="hors_marche">Hors d'un marché</option>
                    <option value="abords_marche">Abords d'un marché</option>
                    <option value="marche_zone_industrielle">Dans un marché / zone industrielle</option>
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
              </>
            )}

            {(produitCode === "coupsdurs_classique" || produitCode === "coupsdurs_incapacite" || produitCode === "securecolte") && (
              <div className="field">
                <label className="label">Variante</label>
                <select className="select" value={variante} onChange={(e) => setVariante(e.target.value)}>
                  {varianteOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            <button
              className="btn btn-primary btn-block"
              disabled={loading || (produitCode === "securpro" && sp.dansMarche === null)}
              style={{ marginTop: 16 }}
            >
              <Calculator size={17} /> {loading ? "Calcul…" : "Calculer le devis"}
            </button>
          </form>
        </Card>

        <Card title="Résultat">
          {error && <div className="empty" style={{ color: "var(--danger)" }}>{error}</div>}
          {!error && !resultat && <div className="empty">Renseignez les paramètres puis calculez le devis.</div>}

          {!error && resultat && "primeTTC" in resultat && (
            <>
              {resultat.depassementPlafond ? (
                <div className="empty" style={{ color: "var(--danger)" }}>
                  Les capitaux dépassent le plafond de la classe — souscription manuelle requise.
                </div>
              ) : (
                <>
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
                  {saved && <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>Simulation enregistrée ✓</div>}
                </>
              )}
            </>
          )}

          {!error && resultat && "prime" in resultat && (
            <>
              <table className="tbl" style={{ width: "100%" }}>
                <tbody>
                  <tr><td className="muted">Capital garanti</td><td style={{ textAlign: "right" }}>{fcfa(resultat.capitalGaranti)}</td></tr>
                  <tr><td><strong>Prime TTC</strong></td><td style={{ textAlign: "right" }}><strong>{fcfa(resultat.prime)}</strong></td></tr>
                </tbody>
              </table>
              {saved && <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>Simulation enregistrée ✓</div>}
            </>
          )}
        </Card>
      </div>

      {(peutSouscrire || souscription) && (
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
                {souscription.produitCode === "securpro" && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => genererContratSecurpro(souscriptionImfToContratSecurpro(souscription))}
                  >
                    <Download size={15} /> Télécharger le contrat
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
                    !client.numeroPiece.trim()
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
