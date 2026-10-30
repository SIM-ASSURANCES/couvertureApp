// Partie commune entre l'espace partenaire (pages/partenaire/Cotations.tsx)
// et l'espace agent de distribution (pages/agent-distribution/Cotations.tsx)
// pour le parcours "Mes devis" — un seul jeu de champs de tarification par
// produit, jamais dupliqué entre les deux espaces.
import { useEffect, useState } from "react";
import { Badge, fcfa } from "./components/ui";
import { API_BASE } from "./api";
import { libellePeriodicite } from "./periodiciteDommages";

// Miroir des listes de capitaux autorisés (SecurHome+/SecurPro) — voir
// backend/src/services/capitauxDommages.ts. Dupliqué ici comme dans
// pages/public/Souscription.tsx (même convention sur ce projet).
export const DDE_CAPITAUX = [1_000_000, 2_000_000] as const;
export const DE_CAPITAUX = [100_000, 250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;
export const BDG_CAPITAUX = [250_000, 500_000, 1_000_000, 1_500_000, 2_000_000] as const;
export const VOL_CAISSE_CAPITAUX = [25_000, 50_000, 100_000, 250_000, 500_000] as const;

export const ACTIVITES_RELAXACCIDENTS: { classe: 1 | 2 | 3 | 4; libelle: string }[] = [
  { classe: 1, libelle: "Classe 1 — Bureau et commerce sans manutention" },
  { classe: 2, libelle: "Classe 2 — Petit commerce et artisanat sans outils dangereux" },
  { classe: 3, libelle: "Classe 3 — Agriculture, transport et métiers manuels avec engins" },
  { classe: 4, libelle: "Classe 4 — Chantier et métiers à haut risque" },
];

export type ProduitCotation =
  | "relaxaccidents"
  | "relaxmoto"
  | "relaxauto"
  | "relaxaccidents_fraismedicaux"
  | "relaxaccidents_fraismedicaux_livreurs"
  | "relaxvoyage"
  | "sante_solo"
  | "sante_duo"
  | "sante_famille"
  | "securhome"
  | "securhome_dommages"
  | "securpro_dommages"
  | "securmoto";

// Depuis le 2026-10-28, tous les produits ont un devis (prime et garanties connues d'avance
// comprises). Miroir de backend/src/services/cotations.ts::PRODUITS_COTATION.
export const PRODUITS_COTATION: { code: ProduitCotation; libelle: string }[] = [
  { code: "relaxaccidents", libelle: "RelaxAccidents (générale)" },
  { code: "relaxmoto", libelle: "RelaxMoto" },
  { code: "relaxauto", libelle: "RelaxAuto" },
  { code: "relaxaccidents_fraismedicaux", libelle: "RelaxAccidents Frais Médicaux" },
  { code: "relaxaccidents_fraismedicaux_livreurs", libelle: "RelaxAccidents Frais Médicaux Livreurs/MotoTaxis" },
  { code: "relaxvoyage", libelle: "RelaxVoyage" },
  { code: "sante_solo", libelle: "Assurance Santé Solo" },
  { code: "sante_duo", libelle: "Assurance Santé Duo" },
  { code: "sante_famille", libelle: "Assurance Santé Famille" },
  { code: "securhome", libelle: "SecurHome" },
  { code: "securhome_dommages", libelle: "SecurHome+" },
  { code: "securpro_dommages", libelle: "SecurPro" },
  { code: "securmoto", libelle: "SecurMoto" },
];

export function entreesParDefaut(produitCode: ProduitCotation): Record<string, unknown> {
  switch (produitCode) {
    case "relaxaccidents":
      return { classe: 1, cnpsDeclare: true, cycle: "annuel", moyenDeplacement: "voiture" };
    // Produits Dommages : `cycle` vide = pas encore choisi (obligatoire à la saisie, voir ChampPeriodicite).
    case "relaxmoto":
    case "relaxauto":
      return { cycle: "mensuel", nombrePeriodes: 1 };
    case "relaxaccidents_fraismedicaux":
    case "relaxaccidents_fraismedicaux_livreurs":
      return { formule: "" };
    case "relaxvoyage":
    case "sante_solo":
    case "sante_duo":
    case "sante_famille":
      return { formule: "" };
    case "securhome":
      return { nombrePieces: 1, statutOccupation: "proprietaire", cycle: "" };
    case "securhome_dommages":
      return {
        cycle: "",
        statutOccupation: "proprietaire",
        valeurBatiment: "",
        loyerMensuel: "",
        contenu: "",
        gardien: false,
        extincteur: false,
        camera: false,
        volContenu: false,
        ddeCapital: "",
        deCapital: "",
        bdgCapital: "",
      };
    case "securpro_dommages":
      return {
        cycle: "",
        classe: 1,
        statutOccupation: "proprietaire",
        valeurBatiment: "",
        loyerMensuel: "",
        contenu: "",
        dansMarche: false,
        gardien: false,
        extincteur: false,
        volContenu: false,
        majorationVolContenu: false,
        volCaisseCapital: "",
        majorationVolCaisse: false,
        ddeCapital: "",
        deCapital: "",
        bdgCapital: "",
      };
    case "securmoto":
      return { valeurMoto: "", ageMoto: "NEUVE", cycle: "" };
  }
}

/** Nettoie les champs numériques ("" -> absent) avant envoi au serveur — les valeurs vides restent des chaînes côté état local pour que l'input reste contrôlable. */
export function nettoyerEntrees(produitCode: ProduitCotation, e: Record<string, unknown>): Record<string, unknown> {
  const nettoyees = nettoyerEntreesProduit(produitCode, e);
  // Périodicité (produits Dommages) : un choix vide n'est jamais envoyé — le
  // formulaire l'exige (radios `required`), le serveur rejetterait "".
  if (nettoyees.cycle === "" || nettoyees.cycle === undefined) {
    const { cycle: _cycle, ...sansCycle } = nettoyees;
    return sansCycle;
  }
  return nettoyees;
}

function nettoyerEntreesProduit(produitCode: ProduitCotation, e: Record<string, unknown>): Record<string, unknown> {
  const toNum = (v: unknown) => (v === "" || v == null ? undefined : Number(v));
  if (produitCode === "relaxaccidents" || produitCode === "securhome") return e;
  // Produits à tarif fixe : formule choisie dans le barème (le Décès des RelaxAccidents Frais Médicaux est inclus).
  if (produitCode === "relaxmoto" || produitCode === "relaxauto") {
    // Annuel : toujours une seule période, quelle que soit la valeur gardée d'une saisie mensuelle.
    return { cycle: e.cycle, nombrePeriodes: e.cycle === "annuel" ? 1 : Number(e.nombrePeriodes) || 1 };
  }
  if (
    produitCode === "relaxaccidents_fraismedicaux" ||
    produitCode === "relaxaccidents_fraismedicaux_livreurs" ||
    produitCode === "relaxvoyage" ||
    produitCode === "sante_solo" ||
    produitCode === "sante_duo" ||
    produitCode === "sante_famille"
  ) {
    return { formule: e.formule };
  }
  const communs = {
    ...e,
    contenu: toNum(e.contenu) ?? 0,
    valeurBatiment: toNum(e.valeurBatiment),
    loyerMensuel: toNum(e.loyerMensuel),
    ddeCapital: toNum(e.ddeCapital),
    deCapital: toNum(e.deCapital),
    bdgCapital: toNum(e.bdgCapital),
  };
  if (produitCode === "securpro_dommages") {
    return { ...communs, volCaisseCapital: toNum(e.volCaisseCapital) };
  }
  if (produitCode === "securmoto") {
    return { valeurMoto: toNum(e.valeurMoto) ?? 0, ageMoto: e.ageMoto, cycle: e.cycle };
  }
  return communs;
}

/** Une garantie couverte par un devis (voir backend services/cotations.ts::garantiesCotation). */
export interface GarantieDevis {
  libelle: string;
  capital?: number;
  prime?: number;
  detail?: string;
}

export interface Cotation {
  id: string;
  token: string;
  produitCode: string;
  libelleProduit: string;
  entrees: Record<string, unknown>;
  resultat: unknown;
  primeTTC: number;
  capitalGaranti: number;
  /** Garanties couvertes par ce devis. */
  garanties?: GarantieDevis[];
  libelleFormule: string;
  clientNom: string | null;
  clientTelephone: string | null;
  statut: "brouillon" | "envoye" | "converti" | "expire";
  dateExpiration: string | null;
  createdAt: string;
  souscriptionId: string | null;
  lien: string | null;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

/**
 * Garanties couvertes par un devis (2026-10-23) : libellé, capital garanti et,
 * pour SecurPro/SecurHome+ dont chaque garantie est tarifée, sa prime. Les
 * garanties non choisies ne figurent pas dans un devis — elles ne sont pas
 * facturées non plus.
 */
export function GarantiesDevis({ garanties }: { garanties?: GarantieDevis[] }) {
  if (!garanties || garanties.length === 0) return null;
  return (
    <div style={{ marginTop: 10, borderTop: "1px solid #e3e9f1", paddingTop: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#5b6b80", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
        Garanties du devis
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {garanties.map((g, i) => (
          <div key={`${g.libelle}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
            <span>
              {g.libelle}
              {g.detail && <span style={{ color: "#5b6b80" }}> — {g.detail}</span>}
            </span>
            <span style={{ whiteSpace: "nowrap", color: "#0f1b2d", fontWeight: 600 }}>
              {g.detail ? "" : g.capital ? fcfa(g.capital) : ""}
              {g.prime != null && <span style={{ color: "#5b6b80", fontWeight: 500 }}>{g.capital && !g.detail ? " · " : ""}prime {fcfa(g.prime)}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function statutBadgeCotation(c: Cotation) {
  const expire = c.statut === "envoye" && c.dateExpiration != null && new Date(c.dateExpiration) < new Date();
  if (c.statut === "converti") return <Badge kind="success">Converti en souscription</Badge>;
  if (c.statut === "expire" || expire) return <Badge kind="danger">Expiré</Badge>;
  if (c.statut === "envoye") return <Badge kind="info">Partagé</Badge>;
  return <Badge kind="neutral">Brouillon</Badge>;
}

/**
 * Périodicité de la prime des produits Dommages (annuelle, ou mensuelle = prime
 * annuelle ÷ 10) — choix OBLIGATOIRE : aucune option présélectionnée, les radios
 * sont `required` (le formulaire refuse l'envoi tant qu'aucune n'est cochée).
 */
function ChampPeriodicite({ entrees, setChamp }: { entrees: Record<string, unknown>; setChamp: (cle: string, valeur: unknown) => void }) {
  return (
    <Field label="Périodicité de la prime (à choisir)">
      <div style={{ display: "flex", gap: 16 }}>
        {(["annuel", "mensuel"] as const).map((v) => (
          <label key={v} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name="cycle-dommages" required checked={entrees.cycle === v} onChange={() => setChamp("cycle", v)} />{" "}
            {libellePeriodicite(v)}
          </label>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Prime mensuelle = prime annuelle ÷ 10.
      </div>
    </Field>
  );
}

interface LigneBareme {
  id: string;
  libelleVariante: string | null;
  prime: number;
  capitalGaranti: number;
  donneesSpecifiques?: { tauxPriseEnCharge?: number; capitalDeces?: number } | null;
}

/** Barème public d'un produit (formules et primes), pour proposer le choix de la formule. */
function useBaremeProduit(code: string): { lignes: LigneBareme[]; chargement: boolean } {
  const [lignes, setLignes] = useState<LigneBareme[]>([]);
  const [chargement, setChargement] = useState(true);
  useEffect(() => {
    let annule = false;
    setChargement(true);
    fetch(`${API_BASE}/public/tarifs/${code}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LigneBareme[]) => !annule && setLignes(Array.isArray(d) ? d : []))
      .catch(() => !annule && setLignes([]))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [code]);
  return { lignes, chargement };
}

/** Choix de la formule (ligne de barème) d'un produit à tarif fixe : RelaxAccidents FM, RelaxVoyage, Santé. */
function ChampFormule({
  produitCode,
  entrees,
  setChamp,
}: {
  produitCode: ProduitCotation;
  entrees: Record<string, unknown>;
  setChamp: (cle: string, valeur: unknown) => void;
}) {
  const { lignes, chargement } = useBaremeProduit(produitCode);
  const libelle = (l: LigneBareme) => {
    const taux = l.donneesSpecifiques?.tauxPriseEnCharge;
    if (produitCode.startsWith("relaxaccidents_fraismedicaux")) {
      const deces = l.donneesSpecifiques?.capitalDeces;
      return `${fcfa(l.prime)} — frais médicaux ${fcfa(l.capitalGaranti)}${deces ? ` · décès ${fcfa(deces)}` : ""}`;
    }
    if (taux != null) return `${l.libelleVariante} — ${fcfa(l.prime)} (prise en charge ${taux} %)`;
    return `${l.libelleVariante ?? ""} — ${fcfa(l.prime)}`;
  };
  return (
    <Field label="Formule">
      <select className="select" required value={String(entrees.formule ?? "")} onChange={(e) => setChamp("formule", e.target.value)}>
        <option value="">{chargement ? "Chargement…" : "Choisir une formule"}</option>
        {lignes.map((l) => (
          <option key={l.id} value={l.libelleVariante ?? ""}>
            {libelle(l)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Champs de tarification spécifiques au produit sélectionné — entrées seulement (jamais l'identité du client, saisie par lui-même au moment de payer). */
export function ChampsProduitCotation({
  produitCode,
  entrees,
  setChamp,
}: {
  produitCode: ProduitCotation;
  entrees: Record<string, unknown>;
  setChamp: (cle: string, valeur: unknown) => void;
}) {
  const num = (cle: string) => (
    <input
      className="input"
      value={String(entrees[cle] ?? "")}
      onChange={(e) => setChamp(cle, e.target.value.replace(/\D/g, ""))}
      inputMode="numeric"
    />
  );
  const bool = (cle: string, libelle: string) => (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={!!entrees[cle]} onChange={(e) => setChamp(cle, e.target.checked)} />
      {libelle}
    </label>
  );
  const selectCapital = (cle: string, liste: readonly number[]) => (
    <select className="select" value={String(entrees[cle] ?? "")} onChange={(e) => setChamp(cle, e.target.value)}>
      <option value="">Aucune</option>
      {liste.map((m) => (
        <option key={m} value={m}>
          {fcfa(m)}
        </option>
      ))}
    </select>
  );

  if (produitCode === "relaxmoto" || produitCode === "relaxauto") {
    return (
      <>
        <Field label="Formule">
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" name="cycle-relax" checked={entrees.cycle === "mensuel"} onChange={() => setChamp("cycle", "mensuel")} /> Mensuelle
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input
                type="radio"
                name="cycle-relax"
                checked={entrees.cycle === "annuel"}
                onChange={() => {
                  setChamp("cycle", "annuel");
                  // Annuelle : une seule période (un an) — pas de nombre de mois payés d'avance.
                  setChamp("nombrePeriodes", 1);
                }}
              />{" "}
              Annuelle
            </label>
          </div>
        </Field>
        {entrees.cycle !== "annuel" && (
          <Field label="Nombre de mois payés d'avance (1 à 12)">
            <input
              className="input"
              inputMode="numeric"
              value={String(entrees.nombrePeriodes ?? 1)}
              onChange={(e) => setChamp("nombrePeriodes", Math.min(12, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))}
            />
          </Field>
        )}
      </>
    );
  }

  // RelaxAccidents Frais Médicaux : la formule porte aussi le Décès (plus d'option depuis le 2026-10-30).
  if (
    produitCode === "relaxaccidents_fraismedicaux" ||
    produitCode === "relaxaccidents_fraismedicaux_livreurs" ||
    produitCode === "relaxvoyage" ||
    produitCode === "sante_solo" ||
    produitCode === "sante_duo" ||
    produitCode === "sante_famille"
  ) {
    return <ChampFormule produitCode={produitCode} entrees={entrees} setChamp={setChamp} />;
  }

  if (produitCode === "relaxaccidents") {
    return (
      <>
        <Field label="Activité (classe de risque)">
          <select className="select" value={Number(entrees.classe)} onChange={(e) => setChamp("classe", Number(e.target.value))}>
            {ACTIVITES_RELAXACCIDENTS.map((a) => (
              <option key={a.classe} value={a.classe}>
                {a.libelle}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Statut CNPS">
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={!!entrees.cnpsDeclare} onChange={() => setChamp("cnpsDeclare", true)} /> Déclaré
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={!entrees.cnpsDeclare} onChange={() => setChamp("cnpsDeclare", false)} /> Non déclaré
            </label>
          </div>
        </Field>
        <Field label="Périodicité">
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={entrees.cycle === "annuel"} onChange={() => setChamp("cycle", "annuel")} /> Annuel
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={entrees.cycle === "mensuel"} onChange={() => setChamp("cycle", "mensuel")} /> Mensuel
            </label>
          </div>
        </Field>
        <Field label="Moyen de déplacement">
          <select className="select" value={String(entrees.moyenDeplacement)} onChange={(e) => setChamp("moyenDeplacement", e.target.value)}>
            <option value="voiture">Voiture</option>
            <option value="moto_tricycle">Moto / Tricycle</option>
            <option value="autres">Autres</option>
          </select>
        </Field>
      </>
    );
  }

  if (produitCode === "securhome") {
    return (
      <>
        <Field label="Nombre de pièces">
          <select className="select" value={Number(entrees.nombrePieces)} onChange={(e) => setChamp("nombrePieces", Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} pièce{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Statut d'occupation">
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={entrees.statutOccupation === "proprietaire"} onChange={() => setChamp("statutOccupation", "proprietaire")} /> Propriétaire
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={entrees.statutOccupation === "locataire"} onChange={() => setChamp("statutOccupation", "locataire")} /> Locataire
            </label>
          </div>
        </Field>
        <ChampPeriodicite entrees={entrees} setChamp={setChamp} />
      </>
    );
  }

  if (produitCode === "securmoto") {
    return (
      <>
        <Field label="Valeur de la moto (FCFA)">{num("valeurMoto")}</Field>
        <Field label="Ancienneté">
          <select className="select" value={String(entrees.ageMoto)} onChange={(e) => setChamp("ageMoto", e.target.value)}>
            <option value="NEUVE">Neuve</option>
            <option value="1 AN">1 an</option>
            <option value="2 ANS">2 ans</option>
          </select>
        </Field>
        <ChampPeriodicite entrees={entrees} setChamp={setChamp} />
      </>
    );
  }

  // securhome_dommages (SecurHome+) et securpro_dommages (SecurPro) — mêmes questions,
  // SecurPro en ajoute deux (classe de risque, marché).
  return (
    <>
      {produitCode === "securpro_dommages" && (
        <Field label="Classe de risque">
          <select className="select" value={Number(entrees.classe)} onChange={(e) => setChamp("classe", Number(e.target.value))}>
            {[1, 2, 3, 4].map((c) => (
              <option key={c} value={c}>
                Classe {c}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Statut d'occupation">
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={entrees.statutOccupation === "proprietaire"} onChange={() => setChamp("statutOccupation", "proprietaire")} /> Propriétaire
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="radio" checked={entrees.statutOccupation === "locataire"} onChange={() => setChamp("statutOccupation", "locataire")} /> Locataire
          </label>
        </div>
      </Field>
      {entrees.statutOccupation === "proprietaire" ? (
        <Field label="Valeur du bâtiment (FCFA)">{num("valeurBatiment")}</Field>
      ) : (
        <Field label="Loyer mensuel (FCFA)">{num("loyerMensuel")}</Field>
      )}
      <Field label="Contenu (matériel, mobilier et stock) (FCFA)">{num("contenu")}</Field>
      {produitCode === "securpro_dommages" && <Field label="Local dans un marché ou ses abords ?">{bool("dansMarche", "Oui")}</Field>}
      <Field label="Prévention">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {bool("gardien", "Gardien")}
          {bool("extincteur", "Extincteur")}
          {produitCode === "securhome_dommages" && bool("camera", "Caméra")}
        </div>
      </Field>
      <ChampPeriodicite entrees={entrees} setChamp={setChamp} />
      <div style={{ fontWeight: 800, fontSize: 14, margin: "16px 0 8px" }}>Garanties optionnelles</div>
      <Field label="Vol contenu">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {bool("volContenu", "Souscrire (capital 1er risque calculé automatiquement)")}
          {produitCode === "securpro_dommages" && !!entrees.volContenu && (
            <div style={{ marginLeft: 22 }}>{bool("majorationVolContenu", "Majoration ×1,2 (mèches/coiffure, électronique)")}</div>
          )}
        </div>
      </Field>
      {produitCode === "securpro_dommages" && (
        <Field label="Vol caisse">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {selectCapital("volCaisseCapital", VOL_CAISSE_CAPITAUX)}
            {!!entrees.volCaisseCapital && (
              <div>{bool("majorationVolCaisse", "Majoration ×1,25 (supérette, quincaillerie, électronique, tissus)")}</div>
            )}
          </div>
        </Field>
      )}
      <Field label="Dégât des eaux">{selectCapital("ddeCapital", DDE_CAPITAUX)}</Field>
      <Field label="Dommages électriques">{selectCapital("deCapital", DE_CAPITAUX)}</Field>
      <Field label="Bris de glace">{selectCapital("bdgCapital", BDG_CAPITAUX)}</Field>
    </>
  );
}
