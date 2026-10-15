import { Fragment, useState } from "react";
import { Check, X, Send, Pencil, FileText, Image as ImageIcon } from "lucide-react";
import CorrectionIdentiteModal from "../../components/CorrectionIdentiteModal";
import { PageHeader, Card, Loader, ErrorBox, Badge, fcfa, fmtDate } from "../../components/ui";
import { BadgeAssurance } from "../../components/BadgeAssurance";
import { useFetch } from "../../useFetch";
import { api, downloadCsv } from "../../api";
import {
  ageRevolu,
  libelleGroupeSanguin,
  libelleSituationMatrimoniale,
  type FicheSante,
  type PersonneAssureeSante,
  type ReponsesSante,
  type RubriqueSante,
} from "../../assurancesSante";

// Assurances Santé (Solo, Duo, Famille) : le client ne paie pas à la
// souscription. Il dépose une demande (fiches des personnes assurées et
// questionnaire médical de chacune), validée ou refusée ici. La validation
// envoie par SMS le lien où le client dépose ses pièces (CNI recto-verso +
// photo pour les adultes, extrait de naissance + photo pour les enfants) ; une
// fois toutes les pièces déposées, il peut payer. Une fois payée, la demande
// devient un contrat (page Contrats).

type Etat = "a_valider" | "pieces" | "a_payer" | "refusees";

interface PiecesDemande {
  complet: boolean;
  personnes: { index: number; intitule: string; nomComplet: string; pieces: { type: string; libelle: string; deposee: boolean }[] }[];
}

interface Demande {
  id: string;
  createdAt: string;
  produitLibelle: string;
  description: string;
  tauxPriseEnCharge: number | null;
  montant: number;
  nom: string | null;
  prenom: string | null;
  telephone: string;
  email: string | null;
  sexe: "masculin" | "feminin" | null;
  dateNaissance: string | null;
  // Fiche de l'assuré principal, dont ses données de santé : absente pour une
  // demande déposée avant l'ajout du formulaire.
  ficheSante: FicheSante | null;
  personnesAssurees: PersonneAssureeSante[];
  /** « Assuré principal », « Conjoint(e) », « Enfant 1 »… dans l'ordre du questionnaire. */
  intitulesPersonnes: string[];
  /** Réponses au questionnaire médical, une entrée par personne ; `null` pour une demande antérieure. */
  questionnaire: { personnes: { reponses: ReponsesSante }[]; signeLe: string | null } | null;
  pieces: PiecesDemande;
  partenaire: string;
  agent: string | null;
  validationAt: string | null;
  validationMotif: string | null;
}

interface Reponse {
  compteurs: Record<Etat, number>;
  /** Les questions telles que posées au souscripteur (source unique côté serveur). */
  questionnaireSpec: RubriqueSante[];
  demandes: Demande[];
}

interface PieceDeposee {
  personneIndex: number;
  intitule: string;
  nomComplet: string;
  type: string;
  libelle: string;
  url: string;
}

const ONGLETS: { etat: Etat; libelle: string; vide: string }[] = [
  { etat: "a_valider", libelle: "À valider", vide: "Aucune demande en attente de validation." },
  { etat: "pieces", libelle: "Validées — pièces à fournir", vide: "Aucune demande en attente de pièces." },
  { etat: "a_payer", libelle: "Pièces reçues — à payer", vide: "Aucune demande dont les pièces sont complètes et le paiement en attente." },
  { etat: "refusees", libelle: "Refusées", vide: "Aucune demande refusée." },
];

const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
const libelleSexe = (s: string | null | undefined) => (s === "masculin" ? "Homme" : s === "feminin" ? "Femme" : "—");

/** Fiche de l'assuré principal, telle que le client l'a remplie — ce que l'admin examine avant de valider. */
function FicheAssurePrincipal({ d }: { d: Demande }) {
  const f = d.ficheSante;
  const age = d.dateNaissance ? ageRevolu(d.dateNaissance.slice(0, 10)) : null;
  // Indice de masse corporelle : simple calcul à partir du poids et de la taille déclarés.
  const imc = f ? f.poidsKg / (f.tailleCm / 100) ** 2 : null;
  const lignes: [string, string][] = [
    ["Sexe", libelleSexe(d.sexe)],
    ["Date de naissance", `${dateFr(d.dateNaissance)}${age != null ? ` (${age} ans)` : ""}`],
    ["Email", d.email || "—"],
    ...(f
      ? ([
          ["Profession", f.profession],
          ["Lieu de résidence", f.lieuResidence],
          ["N° CMU", f.numeroCmu || "—"],
          ["Situation matrimoniale", libelleSituationMatrimoniale(f.situationMatrimoniale)],
          ["Poids", `${f.poidsKg} kg`],
          ["Taille", `${f.tailleCm} cm`],
          ["IMC (calculé)", imc != null ? imc.toFixed(1).replace(".", ",") : "—"],
          ["Tension artérielle", f.tensionArterielle],
          ["Groupe sanguin", libelleGroupeSanguin(f.groupeSanguin)],
        ] as [string, string][])
      : []),
  ];
  return (
    <div style={{ padding: "14px 18px", background: "var(--bg-2)" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Fiche de l'assuré principal</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px 24px" }}>
        {lignes.map(([label, valeur]) => (
          <div key={label} style={{ fontSize: 13 }}>
            <span className="muted">{label} : </span>
            <strong>{valeur}</strong>
          </div>
        ))}
      </div>
      {!f && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Fiche détaillée non renseignée pour cette demande.</div>}
    </div>
  );
}

/** Conjoint et enfants : fiches complètes d'après le bulletin d'adhésion. */
function FichePersonnesCouvertes({ d }: { d: Demande }) {
  if (d.personnesAssurees.length === 0) return null;
  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Personnes couvertes</div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Qualité</th>
              <th>Nom et prénoms</th>
              <th>Naissance</th>
              <th>Sexe</th>
              <th>Lieu de résidence</th>
              <th>Profession</th>
              <th>N° CMU</th>
              <th>Téléphone</th>
            </tr>
          </thead>
          <tbody>
            {d.personnesAssurees.map((p, i) => (
              <tr key={i}>
                <td>{d.intitulesPersonnes[i + 1] ?? (p.lien === "conjoint" ? "Conjoint(e)" : "Enfant")}</td>
                <td>
                  <strong>
                    {p.prenom} {p.nom}
                  </strong>
                </td>
                <td>{dateFr(p.dateNaissance)}</td>
                <td>{libelleSexe(p.sexe)}</td>
                <td>{p.lieuResidence || "—"}</td>
                <td>{p.profession || "—"}</td>
                <td>{p.numeroCmu || "—"}</td>
                <td>{p.telephone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CelluleReponse({ valeur, applicable }: { valeur: boolean | string | undefined; applicable: boolean }) {
  if (!applicable) return <span className="muted">s.o.</span>;
  if (valeur === undefined) return <span className="muted">—</span>;
  if (typeof valeur === "boolean") {
    return valeur ? <strong style={{ color: "#b91c1c" }}>OUI</strong> : <span style={{ color: "#166534" }}>non</span>;
  }
  return <span style={{ fontSize: 12 }}>{valeur}</span>;
}

/** Questionnaire médical : les réponses de chaque personne, question par question, telles que le souscripteur les a données. */
function QuestionnaireMedical({ d, spec }: { d: Demande; spec: RubriqueSante[] }) {
  const q = d.questionnaire;
  if (!q) {
    return (
      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }} className="muted">
        Demande déposée avant la mise en place du questionnaire médical : aucune réponse disponible.
      </div>
    );
  }
  const sexes = [d.sexe, ...d.personnesAssurees.map((p) => p.sexe ?? null)];
  // Une réponse « oui » mérite l'attention de l'admin : résumé en tête (hors les deux questions « autres »).
  const alertes = q.personnes.flatMap((p, i) =>
    spec.flatMap((r) =>
      r.questions
        .filter((qu) => qu.type === "oui_non" && p.reponses[qu.cle] === true && qu.cle !== "assure_avant")
        .map((qu) => `${d.intitulesPersonnes[i] ?? `Personne ${i + 1}`} : ${qu.libelle}`)
    )
  );
  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          Questionnaire médical{q.signeLe ? ` — déclaré exact et sincère le ${dateFr(q.signeLe)}` : ""}
        </div>
        <button
          className="btn btn-ghost"
          style={{ padding: "5px 12px", fontSize: 12.5 }}
          onClick={() => downloadCsv(`/assurances-sante/demandes/${d.id}/questionnaire.pdf`, `bulletin-sante-${d.id.slice(0, 8)}.pdf`).catch((e) => alert((e as Error).message))}
        >
          <FileText size={14} /> Bulletin + questionnaire (PDF)
        </button>
      </div>
      {alertes.length > 0 ? (
        <div style={{ fontSize: 12.5, background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>
          <strong>Antécédents déclarés :</strong> {alertes.join(" · ")}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>
          Aucun antécédent déclaré dans les rubriques à réponse « oui / non ».
        </div>
      )}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Antécédents médicaux</th>
              {q.personnes.map((_, i) => (
                <th key={i} style={{ textAlign: "center" }}>
                  {d.intitulesPersonnes[i] ?? `Personne ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.map((r) => (
              <Fragment key={r.numero}>
                <tr>
                  <td colSpan={q.personnes.length + 1} style={{ background: "var(--bg-2)", fontWeight: 700, fontSize: 12.5 }}>
                    {r.numero}- {r.titre}
                  </td>
                </tr>
                {r.questions.map((qu) => (
                  <tr key={qu.cle}>
                    <td style={{ fontSize: 12.5 }}>{qu.libelle}</td>
                    {q.personnes.map((p, i) => (
                      <td key={i} style={{ textAlign: "center" }}>
                        <CelluleReponse
                          valeur={p.reponses[qu.cle]}
                          applicable={(!qu.sexe || qu.sexe === sexes[i]) && (!qu.siOui || p.reponses[qu.siOui] === true)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Pièces déposées par le souscripteur après validation : images chargées à la demande. */
function PiecesDeposees({ d }: { d: Demande }) {
  const [pieces, setPieces] = useState<PieceDeposee[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  async function charger() {
    setChargement(true);
    setErreur("");
    try {
      setPieces(await api.get<PieceDeposee[]>(`/assurances-sante/demandes/${d.id}/pieces`));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  const attendues = d.pieces.personnes.reduce((n, p) => n + p.pieces.length, 0);
  const deposees = d.pieces.personnes.reduce((n, p) => n + p.pieces.filter((x) => x.deposee).length, 0);
  const parPersonne = new Map<number, PieceDeposee[]>();
  for (const p of pieces ?? []) parPersonne.set(p.personneIndex, [...(parPersonne.get(p.personneIndex) ?? []), p]);

  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          Pièces fournies : {deposees} / {attendues}
        </div>
        {deposees > 0 && !pieces && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={charger} disabled={chargement}>
            <ImageIcon size={14} /> {chargement ? "Chargement…" : "Voir les pièces"}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: 12.5, marginBottom: pieces ? 12 : 0 }}>
        {d.pieces.personnes.map((p) => (
          <div key={p.index}>
            <strong>{p.intitule}</strong> :{" "}
            {p.pieces.map((x) => (
              <span key={x.type} style={{ marginRight: 8, color: x.deposee ? "#15803d" : "#b45309" }}>
                {x.deposee ? "✓" : "✗"} {x.libelle}
              </span>
            ))}
          </div>
        ))}
      </div>
      {erreur && <ErrorBox message={erreur} />}
      {pieces &&
        [...parPersonne.entries()].map(([index, liste]) => (
          <div key={index} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>
              {liste[0].intitule} — {liste[0].nomComplet}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {liste.map((p) => (
                <a key={p.type} href={p.url} download={`${p.intitule}-${p.type}.jpg`} title="Télécharger" style={{ textDecoration: "none", color: "inherit" }}>
                  <img src={p.url} alt={p.libelle} style={{ width: 150, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", display: "block" }} />
                  <div style={{ fontSize: 11.5, textAlign: "center", marginTop: 3 }}>{p.libelle}</div>
                </a>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

export default function DemandesSante() {
  const [etat, setEtat] = useState<Etat>("a_valider");
  const { data, loading, error, reload } = useFetch<Reponse>(`/assurances-sante/demandes?etat=${etat}`);
  const [enCours, setEnCours] = useState("");
  const [ficheOuverte, setFicheOuverte] = useState("");
  const [correctionId, setCorrectionId] = useState("");
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 4000);
  }

  async function valider(d: Demande, renvoi: boolean) {
    const qui = [d.prenom, d.nom].filter(Boolean).join(" ");
    const question = renvoi
      ? `Renvoyer à ${qui} le lien de dépôt de ses documents ?`
      : `Valider la demande de ${qui} ?\n\nUn SMS avec le lien pour télécharger ses documents (CNI recto-verso + photo pour les adultes, extrait de naissance + photo pour les enfants) lui sera envoyé au ${d.telephone}. Le bouton de paiement (${fcfa(d.montant)}) apparaîtra dès que tous les documents seront téléchargés.`;
    if (!confirm(question)) return;
    setEnCours(d.id);
    try {
      await api.post(`/assurances-sante/demandes/${d.id}/valider`, {});
      notify(renvoi ? "Lien de dépôt des documents renvoyé par SMS ✓" : "Demande validée — lien de dépôt des documents envoyé par SMS ✓");
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setEnCours("");
    }
  }

  async function refuser(d: Demande) {
    const motif = prompt(
      `Refuser la demande de ${[d.prenom, d.nom].filter(Boolean).join(" ")} ?\n\nMotif (facultatif, visible des administrateurs seulement). Le client est prévenu par SMS.`,
      ""
    );
    if (motif === null) return;
    setEnCours(d.id);
    try {
      await api.post(`/assurances-sante/demandes/${d.id}/refuser`, { motif: motif.trim() || undefined });
      notify("Demande refusée — le client est prévenu par SMS.");
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setEnCours("");
    }
  }

  const onglet = ONGLETS.find((o) => o.etat === etat)!;

  return (
    <>
      <PageHeader
        title="Demandes Santé"
        subtitle="Solo, Duo, Famille : chaque demande (fiches et questionnaire médical) est validée ici. La validation envoie au client le lien pour télécharger ses documents, puis il paie par Wave."
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 16px" }}>
        {ONGLETS.map((o) => (
          <button
            key={o.etat}
            className={etat === o.etat ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setEtat(o.etat)}
          >
            {o.libelle}
            {data && <span style={{ marginLeft: 8, opacity: 0.8 }}>({data.compteurs[o.etat]})</span>}
          </button>
        ))}
      </div>

      <Card title={onglet.libelle} noBody>
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
                  <th>Demande du</th>
                  <th>Produit</th>
                  <th>Souscripteur</th>
                  <th>Personnes couvertes</th>
                  <th>Prime annuelle</th>
                  <th>Partenaire</th>
                  <th style={{ width: 210 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.demandes.map((d) => (
                  <Fragment key={d.id}>
                  <tr>
                    <td className="muted">{fmtDate(d.createdAt)}</td>
                    <td>
                      <BadgeAssurance sousBranche="ASSURANCES_SANTE">{d.produitLibelle}</BadgeAssurance>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {d.tauxPriseEnCharge != null ? `Prise en charge à ${d.tauxPriseEnCharge} %` : "—"}
                      </div>
                    </td>
                    <td>
                      <strong>{[d.prenom, d.nom].filter(Boolean).join(" ") || "—"}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {d.telephone} · né(e) le {dateFr(d.dateNaissance)}
                      </div>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 12, marginTop: 6 }}
                        onClick={() => setFicheOuverte(ficheOuverte === d.id ? "" : d.id)}
                      >
                        {ficheOuverte === d.id ? "Masquer la fiche" : "Voir la fiche et le questionnaire"}
                      </button>
                      {/* Le client s'est trompé (nom, date de naissance, téléphone…) : à corriger avant de valider. */}
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 12, marginTop: 6, marginLeft: 6 }}
                        onClick={() => setCorrectionId(d.id)}
                      >
                        <Pencil size={12} /> Corriger
                      </button>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {d.personnesAssurees.length === 0 ? (
                        <span className="muted">Le souscripteur seul</span>
                      ) : (
                        d.personnesAssurees.map((p, i) => (
                          <div key={i}>
                            {p.lien === "conjoint" ? "Conjoint(e)" : "Enfant"} : {p.prenom} {p.nom}{" "}
                            <span className="muted">({dateFr(p.dateNaissance)})</span>
                          </div>
                        ))
                      )}
                    </td>
                    <td>
                      <strong>{fcfa(d.montant)}</strong>
                    </td>
                    <td>
                      {d.partenaire}
                      {d.agent && <div className="muted" style={{ fontSize: 12 }}>via {d.agent}</div>}
                    </td>
                    <td>
                      {etat === "a_valider" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-primary" style={{ padding: "7px 12px" }} disabled={enCours === d.id} onClick={() => valider(d, false)}>
                            <Check size={15} /> Valider
                          </button>
                          <button className="btn btn-ghost" style={{ padding: "7px 12px" }} disabled={enCours === d.id} onClick={() => refuser(d)}>
                            <X size={15} color="var(--danger)" /> Refuser
                          </button>
                        </div>
                      )}
                      {(etat === "pieces" || etat === "a_payer") && (
                        <>
                          <Badge kind={etat === "a_payer" ? "success" : "warning"}>
                            {etat === "a_payer" ? "Pièces complètes — paiement en attente" : `Lien envoyé le ${dateFr(d.validationAt)}`}
                          </Badge>
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button className="btn btn-ghost" style={{ padding: "7px 12px" }} disabled={enCours === d.id} onClick={() => valider(d, true)}>
                              <Send size={15} /> Renvoyer le lien
                            </button>
                            <button className="btn btn-ghost" style={{ padding: "7px 10px" }} disabled={enCours === d.id} onClick={() => refuser(d)} title="Refuser">
                              <X size={15} color="var(--danger)" />
                            </button>
                          </div>
                        </>
                      )}
                      {etat === "refusees" && (
                        <>
                          <Badge kind="danger">Refusée le {dateFr(d.validationAt)}</Badge>
                          {d.validationMotif && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{d.validationMotif}</div>}
                        </>
                      )}
                    </td>
                  </tr>
                  {ficheOuverte === d.id && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <FicheAssurePrincipal d={d} />
                        <FichePersonnesCouvertes d={d} />
                        <QuestionnaireMedical d={d} spec={data.questionnaireSpec} />
                        {(etat === "pieces" || etat === "a_payer") && <PiecesDeposees d={d} />}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
                {data.demandes.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">{onglet.vide}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {correctionId && (
        <CorrectionIdentiteModal
          souscriptionId={correctionId}
          modele="generique"
          onClose={() => setCorrectionId("")}
          onSaved={(message) => {
            setCorrectionId("");
            reload();
            notify(message.split("\n")[0]);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
