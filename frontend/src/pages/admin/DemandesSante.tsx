import { Fragment, useState } from "react";
import { Check, X, Send } from "lucide-react";
import { PageHeader, Card, Loader, ErrorBox, Badge, fcfa, fmtDate } from "../../components/ui";
import { BadgeAssurance } from "../../components/BadgeAssurance";
import { useFetch } from "../../useFetch";
import { api } from "../../api";
import {
  ageRevolu,
  libelleGroupeSanguin,
  libelleSituationMatrimoniale,
  type FicheSante,
  type PersonneAssureeSante,
} from "../../assurancesSante";

// Assurances Santé (Solo, Duo, Famille) : le client ne paie pas à la
// souscription. Il dépose une demande, validée ou refusée ici ; la validation
// envoie par SMS le lien de paiement Wave avec le montant exact. Une fois
// payée, la demande devient un contrat (page Contrats).

type Etat = "a_valider" | "a_payer" | "refusees";

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
  partenaire: string;
  agent: string | null;
  validationAt: string | null;
  validationMotif: string | null;
}

interface Reponse {
  compteurs: Record<Etat, number>;
  demandes: Demande[];
}

const ONGLETS: { etat: Etat; libelle: string; vide: string }[] = [
  { etat: "a_valider", libelle: "À valider", vide: "Aucune demande en attente de validation." },
  { etat: "a_payer", libelle: "Validées — en attente de paiement", vide: "Aucune demande validée en attente de paiement." },
  { etat: "refusees", libelle: "Refusées", vide: "Aucune demande refusée." },
];

const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

/** Fiche de l'assuré principal, telle que le client l'a remplie — ce que l'admin examine avant de valider. */
function FicheAssurePrincipal({ d }: { d: Demande }) {
  const f = d.ficheSante;
  const age = d.dateNaissance ? ageRevolu(d.dateNaissance.slice(0, 10)) : null;
  // Indice de masse corporelle : simple calcul à partir du poids et de la taille déclarés.
  const imc = f ? f.poidsKg / (f.tailleCm / 100) ** 2 : null;
  const lignes: [string, string][] = [
    ["Sexe", d.sexe === "masculin" ? "Homme" : d.sexe === "feminin" ? "Femme" : "—"],
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

export default function DemandesSante() {
  const [etat, setEtat] = useState<Etat>("a_valider");
  const { data, loading, error, reload } = useFetch<Reponse>(`/assurances-sante/demandes?etat=${etat}`);
  const [enCours, setEnCours] = useState("");
  const [ficheOuverte, setFicheOuverte] = useState("");
  const [toast, setToast] = useState("");

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 4000);
  }

  async function valider(d: Demande, renvoi: boolean) {
    const qui = [d.prenom, d.nom].filter(Boolean).join(" ");
    const question = renvoi
      ? `Renvoyer à ${qui} un nouveau lien de paiement Wave de ${fcfa(d.montant)} ?`
      : `Valider la demande de ${qui} ?\n\nUn SMS avec le lien de paiement Wave de ${fcfa(d.montant)} lui sera envoyé au ${d.telephone}.`;
    if (!confirm(question)) return;
    setEnCours(d.id);
    try {
      await api.post(`/assurances-sante/demandes/${d.id}/valider`, {});
      notify(renvoi ? "Nouveau lien de paiement envoyé par SMS ✓" : "Demande validée — lien de paiement envoyé par SMS ✓");
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
        subtitle="Solo, Duo, Famille : chaque demande est validée ici avant paiement. La validation envoie au client le lien de paiement Wave par SMS."
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
                        {ficheOuverte === d.id ? "Masquer la fiche" : "Voir la fiche"}
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
                      {etat === "a_payer" && (
                        <>
                          <Badge kind="warning">Lien envoyé le {dateFr(d.validationAt)}</Badge>
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
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
