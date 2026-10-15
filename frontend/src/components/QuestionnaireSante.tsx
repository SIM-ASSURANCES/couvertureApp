import { useState } from "react";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";
import {
  premiereQuestionManquante,
  questionDeclenchee,
  type QuestionSante,
  type ReponsesSante,
  type RubriqueSante,
} from "../assurancesSante";

export interface PersonneQuestionnaire {
  /** « Assuré principal », « Conjoint(e) », « Enfant 1 »… */
  intitule: string;
  nom: string;
  sexe: string | null;
}

/**
 * Questionnaire médical des Assurances Santé (bulletin d'adhésion du
 * 2026-10-15), page qui suit les informations personnelles : une personne
 * assurée à la fois (onglets), toutes les questions obligatoires, puis la
 * mention « Déclare exact et sincère » et la signature. Les questions viennent
 * du serveur (source unique) ; le serveur revérifie les réponses.
 */
export default function QuestionnaireSante({
  rubriques,
  personnes,
  reponses,
  setReponses,
  declare,
  setDeclare,
  sigRef,
}: {
  rubriques: RubriqueSante[];
  personnes: PersonneQuestionnaire[];
  reponses: ReponsesSante[];
  setReponses: (v: ReponsesSante[]) => void;
  declare: boolean;
  setDeclare: (v: boolean) => void;
  sigRef: React.RefObject<SignaturePadHandle | null>;
}) {
  const [actif, setActif] = useState(0);
  const personne = personnes[actif];
  const mesReponses = reponses[actif] ?? {};

  const modifier = (cle: string, valeur: boolean | string) =>
    setReponses(reponses.map((r, i) => (i === actif ? { ...r, [cle]: valeur } : r)));

  const complete = (i: number) => premiereQuestionManquante(rubriques, personnes[i].sexe, reponses[i] ?? {}) === null;
  const manquante = premiereQuestionManquante(rubriques, personne.sexe, mesReponses);

  const bouton = (q: QuestionSante, valeur: boolean, libelle: string) => {
    const choisi = mesReponses[q.cle] === valeur;
    const couleur = valeur ? "#b91c1c" : "#166534";
    return (
      <button
        key={libelle}
        type="button"
        onClick={() => modifier(q.cle, valeur)}
        style={{
          flex: 1,
          height: 38,
          borderRadius: 9,
          border: choisi ? `1.5px solid ${couleur}` : "1.5px solid #dde3ec",
          background: choisi ? (valeur ? "#fee2e2" : "#dcfce7") : "#fff",
          color: choisi ? couleur : "#5b6b80",
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
        }}
      >
        {libelle}
      </button>
    );
  };

  const champ = (q: QuestionSante) => {
    if (q.type === "oui_non") {
      return (
        <div style={{ display: "flex", gap: 8, width: 150, flexShrink: 0 }}>
          {bouton(q, true, "Oui")}
          {bouton(q, false, "Non")}
        </div>
      );
    }
    const requis = !!q.siOui;
    return (
      <input
        value={typeof mesReponses[q.cle] === "string" ? (mesReponses[q.cle] as string) : ""}
        onChange={(e) => modifier(q.cle, e.target.value)}
        inputMode={q.type === "nombre" ? "numeric" : "text"}
        maxLength={q.type === "nombre" ? 1 : 300}
        placeholder={q.type === "nombre" ? "1 à 9" : requis ? "Précisez…" : "Facultatif — laisser vide si aucune"}
        style={{
          width: q.type === "nombre" ? 90 : "100%",
          height: 40,
          borderRadius: 9,
          border: "1.5px solid #dde3ec",
          padding: "0 10px",
          fontSize: 13.5,
          fontFamily: "inherit",
        }}
      />
    );
  };

  return (
    <>
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Questionnaire médical</div>
      <div style={{ fontSize: 12.5, color: "#5b6b80", marginBottom: 12, lineHeight: 1.5 }}>
        Vous êtes tenu de déclarer toutes les affections de chaque personne assurée, sous peine de la déchéance de la
        garantie. <strong>Répondre à toutes les questions est obligatoire.</strong>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {personnes.map((p, i) => {
          const fait = complete(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActif(i)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: actif === i ? "1.5px solid #004b9c" : "1.5px solid #dde3ec",
                background: actif === i ? "#e6f1fb" : "#fff",
                color: actif === i ? "#004b9c" : "#5b6b80",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {fait ? "✓ " : ""}
              {p.intitule}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
        {personne.intitule}
        {personne.nom ? ` — ${personne.nom}` : ""}
      </div>

      {rubriques.map((r) => {
        const questions = r.questions.filter((q) => (!q.sexe || q.sexe === personne.sexe) && questionDeclenchee(q, mesReponses));
        if (questions.length === 0) return null;
        return (
          <div key={r.numero} style={{ border: "1px solid #e3e8f0", borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: "#004b9c", marginBottom: 8 }}>
              {r.numero}- {r.titre}
            </div>
            {questions.map((q) => {
              const enLigne = q.type === "oui_non" || q.type === "nombre";
              return (
                <div
                  key={q.cle}
                  style={{
                    display: "flex",
                    flexDirection: enLigne ? "row" : "column",
                    alignItems: enLigne ? "center" : "stretch",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 0",
                    borderTop: "1px solid #f1f4f8",
                  }}
                >
                  <div style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{q.libelle}</div>
                  {champ(q)}
                </div>
              );
            })}
          </div>
        );
      })}

      {manquante && (
        <div style={{ fontSize: 12.5, color: "#dc2626", fontWeight: 600, margin: "4px 0 12px" }}>
          {personne.intitule} : répondez à « {manquante.libelle} ».
        </div>
      )}

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, margin: "16px 0 10px", cursor: "pointer" }}>
        <input type="checkbox" checked={declare} onChange={(e) => setDeclare(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          Je déclare <strong>exacts et sincères</strong> les renseignements fournis pour moi et pour chaque personne assurée.
        </span>
      </label>
      <SignaturePad ref={sigRef} label="Signature de l'adhérent (facultative)" />
    </>
  );
}
