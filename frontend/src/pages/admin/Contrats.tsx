import { useState } from "react";
import { Download, FileText, Flame, ShieldCheck, Eye, X, FileSpreadsheet, Trash2, CreditCard } from "lucide-react";
import {
  PageHeader,
  Card,
  Loader,
  ErrorBox,
  Badge,
  fcfa,
  fmtDate,
} from "../../components/ui";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { exportExcel } from "../../xlsx";
import {
  genererContratIncendie,
  genererContratAccident,
  genererContratRelaxAccidentsFraisMedicaux,
  genererContratRelaxVoyage,
  genererContratRelaxAccidentsGenerale,
  genererContratSecurproDommages,
  genererContratSecurhome,
} from "../../contract";
import { telechargerCarte } from "../../carte";

// Reprend la nomenclature du document TARIF SECURHOME+_SECURPRO.docx (identique
// à Souscription.tsx / backend/contractHtml.ts) — n'affecte que le libellé
// réimprimé sur un contrat SecurPro déjà émis, jamais le calcul de la prime.
const SECURPRO_CLASSE_LABELS: Record<number, string> = {
  1: "Classe 1 — Bureau",
  2: "Classe 2 — Supérette / boutique de quartier, épicerie, salon de coiffure-beauté / couture, commerce de produits alimentaires",
  3: "Classe 3 — Pressing, pharmacie / dépôt, commerce d'électronique, petite fabrique alimentaire, buvette / restaurant, artisan métal, pâtisserie / boulangerie",
  4: "Classe 4 — Tissus / habillement, meubles, mèches & accessoires de coiffure, quincaillerie, jouets / plastique, librairie / papeterie, tapisserie / bois, cordonnier, réparation d'électroménager",
};

const TYPES_SANS_CONTRAT_TELECHARGEABLE = ["relaxmoto", "relaxauto"] as const;

// Produits ayant une carte virtuelle de prise en charge (en plus, pour ces
// quatre, d'un contrat PDF distinct) — RelaxAccidents générale, SecurHome+ et
// SecurPro Dommages n'en ont pas (police collective/pro, pas d'identité
// individuelle capturée). RelaxMoto/Auto ont une carte mais pas de contrat
// PDF séparé, déjà couverts par TYPES_SANS_CONTRAT_TELECHARGEABLE ci-dessus.
const TYPES_AVEC_CARTE = ["incendie", "accident", "relaxaccidents_fraismedicaux", "relaxvoyage"] as const;
type TypeCarte = "incendie" | "accident" | "relaxmoto" | "relaxauto" | "relaxaccidents_fraismedicaux" | "relaxvoyage";

interface CatalogueEntry {
  sousBranche: "ASSURANCES_ACCIDENTS" | "ASSURANCES_DOMMAGES";
  code: string;
  libelle: string;
}

interface Contrat {
  id: string;
  type: string;
  numeroPolice: string;
  nom: string;
  prenom: string;
  telephone: string;
  montant: number;
  capitalGaranti: number;
  partenaire: string;
  partenaireResponsable?: string | null;
  partenaireLocalisation?: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  date: string;
  refFacture?: string | null;
  commune?: string | null;
  quartier?: string | null;
  numeroMaison?: string | null;
  primeHT?: number | null;
  primeTTC?: number | null;
  taxes?: number | null;
  fg?: number | null;
  dateNaissance?: string | null;
  signature?: string | null;
  produitLibelle?: string;
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
  nomCommercial?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  statutOccupation?: "proprietaire" | "locataire" | null;
  valeurBatiment?: number | null;
  loyerMensuel?: number | null;
  contenu?: number | null;
  dansMarche?: boolean | null;
  nombrePieces?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultat?: any;
}

function produitBadge(c: Contrat, catalogue?: CatalogueEntry[] | null) {
  const entree = catalogue?.find((p) => p.code === c.type);
  const libelle = c.produitLibelle ?? entree?.libelle ?? (c.type === "accident" ? "Accident (historique)" : c.type);
  const estDommages = entree ? entree.sousBranche === "ASSURANCES_DOMMAGES" : c.type === "incendie";
  return estDommages ? (
    <Badge kind="warning">
      <Flame size={13} /> {libelle}
    </Badge>
  ) : (
    <Badge kind="info">
      <ShieldCheck size={13} /> {libelle}
    </Badge>
  );
}

function genererContrat(c: Contrat) {
  const debut = c.dateDebut ?? c.date;
  const fin =
    c.dateFin ??
    new Date(
      new Date(c.date).setMonth(
        new Date(c.date).getMonth() + (c.type === "accident" ? 3 : 12)
      )
    ).toISOString();

  if (TYPES_SANS_CONTRAT_TELECHARGEABLE.includes(c.type as "relaxmoto" | "relaxauto")) {
    telechargerCarte(c.type as "relaxmoto" | "relaxauto", c.id);
    return;
  }
  if (c.type === "accident") {
    genererContratAccident({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "incendie") {
    genererContratIncendie({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      refFacture: c.refFacture ?? null,
      commune: c.commune ?? null,
      quartier: c.quartier ?? null,
      numeroMaison: c.numeroMaison ?? null,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "relaxaccidents_fraismedicaux") {
    genererContratRelaxAccidentsFraisMedicaux({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "relaxvoyage") {
    genererContratRelaxVoyage({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      compagnie: c.compagnie ?? null,
      lieuDepart: c.lieuDepart ?? null,
      lieuArrivee: c.lieuArrivee ?? null,
      numeroTicket: c.numeroTicket ?? null,
      dateDepart: c.dateDepart ?? null,
      numeroPersonneContact: c.numeroPersonneContact ?? null,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      fraisSante: c.fraisSante ?? null,
      bagages: c.bagages ?? null,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "relaxaccidents") {
    const r = c.resultat ?? {};
    genererContratRelaxAccidentsGenerale({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      telephone: c.telephone,
      raisonSociale: c.raisonSociale ?? null,
      profession: c.profession ?? null,
      classe: c.classe ?? r.classe ?? 1,
      typeCouverture: (c.typeCouverture ?? "vie_privee") as
        | "vie_privee"
        | "vie_professionnelle"
        | "vie_privee_professionnelle",
      effectif: c.effectif ?? 1,
      lignes: (r.lignes ?? []).map((l: { garantie: string; montant: number; prime: number }) => ({
        garantie: l.garantie,
        capital: l.montant,
        prime: l.prime,
      })),
      primeNetteHT1: r.primeNetteHT1 ?? 0,
      reductionPct: r.reductionPct ?? 0,
      primeNetteHT2: r.primeNetteHT2 ?? 0,
      accessoires: r.accessoires ?? 0,
      taxes: r.taxes ?? 0,
      primeTTC: r.primeTTC ?? c.montant,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "securhome_dommages") {
    const r = c.resultat ?? {};
    const statutFinal = c.statutOccupation ?? "proprietaire";
    genererContratSecurhome({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      ville: c.ville ?? null,
      communeQuartier: c.communeQuartier ?? null,
      referenceCIE: c.refFacture ?? null,
      nombrePieces: c.nombrePieces ?? null,
      statutOccupation: statutFinal,
      valeurBatimentOuLoyer: statutFinal === "locataire" ? c.loyerMensuel ?? 0 : c.valeurBatiment ?? 0,
      contenu: c.contenu ?? 0,
      lignes: r.lignes ?? [],
      primeNetteHT: r.primeNetteHT ?? 0,
      accessoires: r.accessoires ?? 0,
      taxes: r.taxes ?? 0,
      primeTTC: r.primeTTC ?? c.montant,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "securpro_dommages") {
    const r = c.resultat ?? {};
    const statutFinal = c.statutOccupation ?? "proprietaire";
    genererContratSecurproDommages({
      numeroPolice: c.numeroPolice,
      intermediaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateSouscription: c.date,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      nomCommercial: c.nomCommercial ?? null,
      referenceCIE: c.refFacture ?? null,
      ville: c.ville ?? null,
      communeQuartier: c.communeQuartier ?? null,
      classeLabel: c.classe ? SECURPRO_CLASSE_LABELS[c.classe] ?? `Classe ${c.classe}` : "—",
      statutOccupation: statutFinal,
      valeurBatimentOuLoyer: statutFinal === "locataire" ? c.loyerMensuel ?? 0 : c.valeurBatiment ?? 0,
      contenu: c.contenu ?? 0,
      dansMarche: !!c.dansMarche,
      lignes: r.lignes ?? [],
      primeNetteHT: r.primeNetteHT ?? 0,
      accessoires: r.accessoires ?? 0,
      taxes: r.taxes ?? 0,
      primeTTC: r.primeTTC ?? c.montant,
      signature: c.signature ?? null,
    });
  }
}

/** Route de suppression : les deux modèles historiques gardent leurs routes dédiées, tout le reste passe par le modèle générique. */
function routeSuppression(c: Contrat): string {
  if (c.type === "incendie" || c.type === "accident") return `/souscriptions/${c.type}/${c.id}`;
  return `/assurances-branche/souscriptions/${c.id}`;
}

/** Télécharge la carte virtuelle de prise en charge déjà générée pour ce client (même rendu que côté public). */
async function voirCarte(c: Contrat) {
  try {
    await telechargerCarte(c.type as TypeCarte, c.id);
  } catch (err) {
    alert((err as Error).message);
  }
}

export default function Contrats() {
  const { user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN" || (user?.role === "BRANCH_SUPER_ADMIN" && user.branches?.includes("INCENDIE_ACCIDENT"));
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<Contrat | null>(null);
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q) params.set("q", q);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, loading, error, reload } = useFetch<Contrat[]>(
    `/souscriptions/contrats?${params.toString()}`
  );
  const { data: catalogue } = useFetch<CatalogueEntry[]>("/assurances-branche/catalogue");

  async function supprimer(c: Contrat) {
    if (
      !confirm(
        `Supprimer définitivement le contrat ${c.numeroPolice} (${c.prenom} ${c.nom}) ? Cette action est irréversible, même si la prime a été payée.`
      )
    )
      return;
    try {
      await api.del(routeSuppression(c));
      setDetail(null);
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function exportXlsx() {
    exportExcel(
      (data ?? []).map((c) => ({
        "Produit": c.produitLibelle ?? (c.type === "accident" ? "Accident (historique)" : c.type === "incendie" ? "Incendie Habitation en Inclusion" : c.type),
        "N° police": c.numeroPolice,
        "Prénom": c.prenom,
        "Nom": c.nom,
        "Téléphone": c.telephone,
        "Partenaire": c.partenaire,
        "Prime HT": c.primeHT ?? "",
        "Prime TTC": c.primeTTC ?? c.montant,
        "Taxes": c.taxes ?? "",
        "FG": c.fg ?? "",
        "Capital garanti": c.capitalGaranti,
        "Date d'effet": c.dateDebut ? fmtDate(c.dateDebut) : "",
        "Date d'échéance": c.dateFin ? fmtDate(c.dateFin) : "",
      })),
      "contrats.xlsx"
    );
  }

  return (
    <>
      <PageHeader
        title="Contrats"
        subtitle="Polices émises, tous produits de la branche Assurances Accidents et Dommages."
        actions={
          <button className="btn btn-danger-soft" onClick={exportXlsx}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        }
      />

      <Card title="Filtrer par date d'effet">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Du</label>
            <input
              className="input"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Au</label>
            <input
              className="input"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {(from || to) && (
            <button className="btn btn-ghost" onClick={() => { setFrom(""); setTo(""); }}>
              Réinitialiser
            </button>
          )}
          <span className="muted" style={{ fontSize: 13, marginLeft: "auto" }}>
            {from || to ? `Période : ${from || "début"} → ${to || "aujourd'hui"}` : "Toutes périodes"}
          </span>
        </div>
      </Card>

      <Card
        title={data ? `${data.length} contrats` : "Contrats"}
        style={{ marginTop: 24 }}
        extra={
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="select"
              style={{ width: 220, height: 40 }}
              placeholder="Rechercher (nom, police, tél.)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="select"
              style={{ width: 260, height: 40 }}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Tous produits</option>
              <optgroup label="Assurances Accidents">
                {(catalogue ?? []).filter((p) => p.sousBranche === "ASSURANCES_ACCIDENTS").map((p) => (
                  <option key={p.code} value={p.code}>{p.libelle}</option>
                ))}
              </optgroup>
              <optgroup label="Assurances Dommages">
                {(catalogue ?? []).filter((p) => p.sousBranche === "ASSURANCES_DOMMAGES").map((p) => (
                  <option key={p.code} value={p.code}>{p.libelle}</option>
                ))}
              </optgroup>
            </select>
          </div>
        }
        noBody
      >
        {loading && <Loader />}
        {error && (
          <div style={{ padding: 20 }}>
            <ErrorBox message={error} />
          </div>
        )}
        {data && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>N° police</th>
                  <th>Assuré</th>
                  <th>Partenaire</th>
                  <th>Prime</th>
                  <th>Capital garanti</th>
                  <th>Échéance</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={`${c.type}-${c.id}`}>
                    <td>{produitBadge(c, catalogue)}</td>
                    <td>
                      <strong>{c.numeroPolice || "—"}</strong>
                    </td>
                    <td>
                      {c.prenom} {c.nom}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.telephone}
                      </div>
                    </td>
                    <td>
                      <strong>{c.partenaire}</strong>
                      {c.partenaireResponsable && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireResponsable}</div>
                      )}
                      {c.partenaireLocalisation && (
                        <div className="muted" style={{ fontSize: 12 }}>{c.partenaireLocalisation}</div>
                      )}
                    </td>
                    <td>
                      <strong>{fcfa(c.montant)}</strong>
                    </td>
                    <td className="muted">{fcfa(c.capitalGaranti)}</td>
                    <td className="muted">
                      {c.dateFin ? fmtDate(c.dateFin) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title="Voir les détails"
                          onClick={() => setDetail(c)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "7px 10px" }}
                          title={
                            TYPES_SANS_CONTRAT_TELECHARGEABLE.includes(c.type as "relaxmoto" | "relaxauto")
                              ? "Télécharger la carte de prise en charge"
                              : "Télécharger le contrat"
                          }
                          onClick={() => genererContrat(c)}
                        >
                          <Download size={15} /> {TYPES_SANS_CONTRAT_TELECHARGEABLE.includes(c.type as "relaxmoto" | "relaxauto") ? "Carte" : "PDF"}
                        </button>
                        {TYPES_AVEC_CARTE.includes(c.type as (typeof TYPES_AVEC_CARTE)[number]) && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px" }}
                            title="Voir la carte de prise en charge"
                            onClick={() => voirCarte(c)}
                          >
                            <CreditCard size={15} /> Carte
                          </button>
                        )}
                        {isSuper && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "7px 10px" }}
                            title="Supprimer"
                            onClick={() => supprimer(c)}
                          >
                            <Trash2 size={15} color="var(--danger)" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty">
                        <FileText size={28} />
                        <div>Aucun contrat émis pour le moment.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,27,45,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card, #fff)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {produitBadge(detail, catalogue)}
                <strong style={{ fontSize: 16 }}>{detail.numeroPolice || "—"}</strong>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: "6px 8px" }}
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
                Détails de la prime
              </div>
              <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>Prime HT</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {detail.primeHT != null ? fcfa(detail.primeHT) : "—"}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>Prime TTC</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{fcfa(detail.primeTTC ?? detail.montant)}</div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>Taxes</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {detail.taxes != null ? fcfa(detail.taxes) : "—"}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>FG</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {detail.fg != null ? fcfa(detail.fg) : "—"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 18,
                }}
              >
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>
                  Capital garanti
                </div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {fcfa(detail.capitalGaranti)}
                </div>
              </div>

              <table className="tbl" style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td className="muted" style={{ width: "42%" }}>Assuré(e)</td>
                    <td><strong>{detail.prenom} {detail.nom}</strong></td>
                  </tr>
                  <tr>
                    <td className="muted">Téléphone</td>
                    <td>{detail.telephone}</td>
                  </tr>
                  <tr>
                    <td className="muted">Partenaire</td>
                    <td>
                      {detail.partenaire}
                      {detail.partenaireResponsable && (
                        <div className="muted" style={{ fontSize: 12 }}>{detail.partenaireResponsable}</div>
                      )}
                      {detail.partenaireLocalisation && (
                        <div className="muted" style={{ fontSize: 12 }}>{detail.partenaireLocalisation}</div>
                      )}
                    </td>
                  </tr>
                  {detail.refFacture && (
                    <tr>
                      <td className="muted">Réf. facture</td>
                      <td>{detail.refFacture}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="muted">Date d'effet</td>
                    <td>{detail.dateDebut ? fmtDate(detail.dateDebut) : "—"}</td>
                  </tr>
                  <tr>
                    <td className="muted">Date d'échéance</td>
                    <td>{detail.dateFin ? fmtDate(detail.dateFin) : "—"}</td>
                  </tr>
                  <tr>
                    <td className="muted">Souscrit le</td>
                    <td>{fmtDate(detail.date)}</td>
                  </tr>
                </tbody>
              </table>

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                onClick={() => genererContrat(detail)}
              >
                <Download size={16} />{" "}
                {TYPES_SANS_CONTRAT_TELECHARGEABLE.includes(detail.type as "relaxmoto" | "relaxauto")
                  ? "Télécharger la carte de prise en charge"
                  : "Télécharger le contrat"}
              </button>
              {TYPES_AVEC_CARTE.includes(detail.type as (typeof TYPES_AVEC_CARTE)[number]) && (
                <button
                  className="btn btn-ghost btn-block"
                  style={{ marginTop: 10 }}
                  onClick={() => voirCarte(detail)}
                >
                  <CreditCard size={16} /> Voir la carte de prise en charge
                </button>
              )}
              {isSuper && (
                <button
                  className="btn btn-danger-soft btn-block"
                  style={{ marginTop: 10 }}
                  onClick={() => supprimer(detail)}
                >
                  <Trash2 size={16} /> Supprimer le contrat
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
