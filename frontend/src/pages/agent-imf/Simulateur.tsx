import { useState } from "react";
import { Calculator } from "lucide-react";
import { PageHeader, Card, fcfa } from "../../components/ui";
import { api } from "../../api";

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

  // SECURPRO
  const [sp, setSp] = useState({
    classe: 1, statutOccupation: "proprietaire" as "proprietaire" | "locataire",
    valeurBatiment: 0, loyerMensuel: 0, contenu: 0, dansMarche: false,
    gardien: false, extincteur: false,
    volContenu: false, majorationVolContenu: false,
    volCaisseCapital: 0, majorationVolCaisse: false,
    ddeCapital: 0, deCapital: 0, bdgCapital: 0,
  });

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
  }

  async function simuler(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      let entrees: Record<string, unknown>;
      if (produitCode === "securpro") {
        entrees = {
          classe: sp.classe,
          statutOccupation: sp.statutOccupation,
          valeurBatiment: sp.statutOccupation === "proprietaire" ? sp.valeurBatiment : undefined,
          loyerMensuel: sp.statutOccupation === "locataire" ? sp.loyerMensuel : undefined,
          contenu: sp.contenu,
          dansMarche: sp.dansMarche,
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

      const res = await api.post<{ resultat: unknown; primeTTC: number }>("/agent-imf/simulations", {
        produitCode,
        entrees,
      });
      setResultat(res.resultat as ResultatFormule);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

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
                  <label className="label">Classe de risque</label>
                  <select className="select" value={sp.classe} onChange={(e) => setSp({ ...sp, classe: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((c) => <option key={c} value={c}>Classe {c}</option>)}
                  </select>
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
                    <input type="checkbox" checked={sp.dansMarche} onChange={(e) => setSp({ ...sp, dansMarche: e.target.checked })} /> Dans / abords d'un marché
                  </label>
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

            <button className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 16 }}>
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
    </>
  );
}
