import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { Loader, ErrorBox } from "./ui";
import { useFetch } from "../useFetch";
import { api } from "../api";
import {
  GROUPES_SANGUINS,
  SAISIE_FICHE_SANTE_VIDE,
  SITUATIONS_MATRIMONIALES,
  ficheSanteDepuisSaisie,
  libelleGroupeSanguin,
  type FicheSante,
  type PersonneAssureeSante,
  type SaisieFicheSante,
} from "../assurancesSante";

// Correction, par un admin, des informations d'un client qui s'est trompé à
// la souscription. Le serveur décide des champs corrigeables (ceux que le
// produit a collectés) : cette fenêtre affiche exactement ceux qu'il renvoie.
// Produit, formule, prime, dates et numéro de police ne se corrigent pas ici.

export type ModeleSouscription = "generique" | "incendie" | "accident";

interface Fiche {
  produitLibelle: string;
  numeroPolice: string | null;
  champs: Record<string, string | null>;
  sante: { ficheSante: FicheSante | null; personnesAssurees: PersonneAssureeSante[] } | null;
  avertissements: string[];
}

const LIBELLES: Record<string, string> = {
  nom: "Nom",
  prenom: "Prénom",
  telephone: "Téléphone",
  dateNaissance: "Date de naissance",
  sexe: "Sexe",
  email: "Email",
  civilite: "Civilité",
  ville: "Ville",
  commune: "Commune",
  adresse: "Adresse",
  numeroPieceIdentite: "N° de la pièce d'identité",
};

const OPTIONS: Record<string, { valeur: string; libelle: string }[]> = {
  sexe: [
    { valeur: "masculin", libelle: "Homme" },
    { valeur: "feminin", libelle: "Femme" },
  ],
  civilite: [
    { valeur: "M.", libelle: "M." },
    { valeur: "MLLE", libelle: "Mlle" },
    { valeur: "MME", libelle: "Mme" },
  ],
};

export default function CorrectionIdentiteModal({
  souscriptionId,
  modele,
  onClose,
  onSaved,
}: {
  souscriptionId: string;
  modele: ModeleSouscription;
  onClose: () => void;
  /** Appelé après une correction enregistrée, avec le message à afficher à l'admin. */
  onSaved: (message: string) => void;
}) {
  const { data, loading, error } = useFetch<Fiche>(`/assurances-branche/souscriptions/${souscriptionId}/identite?modele=${modele}`);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [fiche, setFiche] = useState<SaisieFicheSante>(SAISIE_FICHE_SANTE_VIDE);
  const [personnes, setPersonnes] = useState<PersonneAssureeSante[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!data) return;
    setChamps(Object.fromEntries(Object.entries(data.champs).map(([cle, v]) => [cle, v ?? ""])));
    const f = data.sante?.ficheSante;
    setFiche(
      f
        ? {
            profession: f.profession,
            lieuResidence: f.lieuResidence,
            numeroCmu: f.numeroCmu ?? "",
            email: "",
            situationMatrimoniale: f.situationMatrimoniale,
            poidsKg: String(f.poidsKg),
            tailleCm: String(f.tailleCm),
            tensionArterielle: f.tensionArterielle,
            groupeSanguin: f.groupeSanguin,
          }
        : SAISIE_FICHE_SANTE_VIDE
    );
    setPersonnes(data.sante?.personnesAssurees ?? []);
  }, [data]);

  const sante = !!data?.sante;
  const ficheRenseignee = [fiche.profession, fiche.lieuResidence, fiche.numeroCmu, fiche.situationMatrimoniale, fiche.poidsKg, fiche.tailleCm, fiche.tensionArterielle, fiche.groupeSanguin].some(
    (v) => String(v).trim() !== ""
  );

  async function enregistrer() {
    if (!data) return;
    setErreur("");
    const ficheSante = sante && ficheRenseignee ? ficheSanteDepuisSaisie(fiche) : null;
    if (sante && ficheRenseignee && !ficheSante) {
      setErreur("Fiche de l'assuré principal incomplète ou invalide (profession, résidence, situation, poids, taille, tension au format 120/80, groupe sanguin).");
      return;
    }
    if (personnes.some((p) => !p.nom.trim() || !p.prenom.trim() || !p.dateNaissance)) {
      setErreur("Chaque personne couverte doit avoir un prénom, un nom et une date de naissance.");
      return;
    }
    setEnCours(true);
    try {
      const r = await api.patch<{ modifies: string[]; avertissements: string[] }>(`/assurances-branche/souscriptions/${souscriptionId}/identite`, {
        modele,
        champs,
        ...(ficheSante ? { ficheSante } : {}),
        ...(sante ? { personnesAssurees: personnes.map((p) => ({ ...p, nom: p.nom.trim(), prenom: p.prenom.trim() })) } : {}),
      });
      onSaved(
        r.modifies.length === 0
          ? "Aucune modification à enregistrer."
          : ["Informations du client corrigées ✓", ...r.avertissements].join("\n\n")
      );
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  const champFiche = (cle: keyof SaisieFicheSante) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiche({ ...fiche, [cle]: e.target.value });
  const titreSection: React.CSSProperties = { fontSize: 11, textTransform: "uppercase", fontWeight: 700, margin: "18px 0 10px" };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--card, #fff)", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "92vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <strong style={{ fontSize: 16 }}>Corriger les informations du client</strong>
            {data && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {data.produitLibelle}
                {data.numeroPolice ? ` · ${data.numeroPolice}` : ""}
              </div>
            )}
          </div>
          <button className="btn btn-ghost" style={{ padding: "6px 8px" }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "18px 22px 22px" }}>
          {loading && <Loader />}
          {error && <ErrorBox message={error} />}
          {data && (
            <>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
                Seules les informations du client se corrigent ici. Le produit, la prime, les dates et le numéro de police ne changent pas ;
                le contrat et la facture reprennent la correction dès leur prochain téléchargement.
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                {Object.keys(data.champs).map((cle) => (
                  <div className="field" key={cle} style={{ marginBottom: 0, gridColumn: cle === "nom" && sante ? "1 / -1" : undefined }}>
                    <label className="label">{cle === "nom" && sante ? "Nom complet" : LIBELLES[cle] ?? cle}</label>
                    {OPTIONS[cle] ? (
                      <select className="select" value={champs[cle] ?? ""} onChange={(e) => setChamps({ ...champs, [cle]: e.target.value })}>
                        <option value="">—</option>
                        {OPTIONS[cle].map((o) => (
                          <option key={o.valeur} value={o.valeur}>
                            {o.libelle}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        type={cle === "dateNaissance" ? "date" : cle === "email" ? "email" : "text"}
                        max={cle === "dateNaissance" ? new Date().toISOString().slice(0, 10) : undefined}
                        value={champs[cle] ?? ""}
                        onChange={(e) => setChamps({ ...champs, [cle]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>

              {sante && (
                <>
                  <div className="muted" style={titreSection}>Fiche de l'assuré principal</div>
                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Profession</label>
                      <input className="input" value={fiche.profession} onChange={champFiche("profession")} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Lieu de résidence</label>
                      <input className="input" value={fiche.lieuResidence} onChange={champFiche("lieuResidence")} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">N° CMU (optionnel)</label>
                      <input className="input" value={fiche.numeroCmu} onChange={champFiche("numeroCmu")} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Situation matrimoniale</label>
                      <select className="select" value={fiche.situationMatrimoniale} onChange={champFiche("situationMatrimoniale")}>
                        <option value="">—</option>
                        {SITUATIONS_MATRIMONIALES.map((s) => (
                          <option key={s.valeur} value={s.valeur}>
                            {s.libelle}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Poids (kg)</label>
                      <input className="input" inputMode="decimal" value={fiche.poidsKg} onChange={champFiche("poidsKg")} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Taille (cm)</label>
                      <input className="input" inputMode="decimal" value={fiche.tailleCm} onChange={champFiche("tailleCm")} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Tension artérielle (ex : 120/80)</label>
                      <input className="input" value={fiche.tensionArterielle} onChange={champFiche("tensionArterielle")} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label">Groupe sanguin</label>
                      <select className="select" value={fiche.groupeSanguin} onChange={champFiche("groupeSanguin")}>
                        <option value="">—</option>
                        {GROUPES_SANGUINS.map((g) => (
                          <option key={g} value={g}>
                            {libelleGroupeSanguin(g)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {personnes.length > 0 && <div className="muted" style={titreSection}>Personnes couvertes</div>}
                  {personnes.map((p, i) => {
                    const changer = (cle: "nom" | "prenom" | "dateNaissance") => (e: React.ChangeEvent<HTMLInputElement>) =>
                      setPersonnes(personnes.map((x, j) => (j === i ? { ...x, [cle]: e.target.value } : x)));
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 150px", gap: 10, marginBottom: 10 }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label className="label">{p.lien === "conjoint" ? "Conjoint(e) — prénom" : "Enfant — prénom"}</label>
                          <input className="input" value={p.prenom} onChange={changer("prenom")} />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label className="label">Nom</label>
                          <input className="input" value={p.nom} onChange={changer("nom")} />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label className="label">Né(e) le</label>
                          <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={p.dateNaissance} onChange={changer("dateNaissance")} />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {data.avertissements.map((a) => (
                <div key={a} style={{ marginTop: 14, background: "#fdf3e3", border: "1px solid #f5d9a8", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#7a4a05" }}>
                  {a}
                </div>
              ))}
              {erreur && (
                <div style={{ marginTop: 14 }}>
                  <ErrorBox message={erreur} />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={enCours}>
                  Annuler
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={enregistrer} disabled={enCours}>
                  <Save size={16} /> {enCours ? "Enregistrement…" : "Enregistrer la correction"}
                </button>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 10, textAlign: "center" }}>
                La correction est inscrite au journal d'activité avec votre nom.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
