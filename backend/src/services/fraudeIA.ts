import { prisma } from "../db.js";
import { numeroPoliceIncendieSynthetique } from "./notify.js";

/**
 * Résultat de l'analyse anti-fraude IA (OpenRouter) — purement indicatif :
 * n'automatise jamais la décision, ne bloque jamais la déclaration ni la
 * validation/rejet manuelle par l'admin (voir routes/assurancesBranche.ts
 * PATCH .../sinistres/:id/statut).
 */
export interface AnalyseIA {
  correspondanceNom: boolean | null;
  correspondanceDateNaissance: boolean | null;
  pieceAuthentique: boolean | null;
  photosAccidentAuthentiques: boolean | null;
  niveauRisque: "faible" | "moyen" | "eleve";
  explication: string;
  erreur?: string;
}

function analyseErreur(message: string): AnalyseIA {
  return {
    correspondanceNom: null,
    correspondanceDateNaissance: null,
    pieceAuthentique: null,
    photosAccidentAuthentiques: null,
    niveauRisque: "moyen",
    explication: "",
    erreur: message,
  };
}

async function enregistrer(sinistreId: string, resultat: AnalyseIA): Promise<void> {
  await prisma.sinistreRelax.update({
    where: { id: sinistreId },
    data: { analyseIA: resultat as unknown as object, analyseIAAt: new Date() },
  });
}

interface IdentiteContrat {
  nom: string | null;
  prenom: string | null;
  dateNaissance: Date | null;
  numeroPolice: string | null;
  pieceIdentiteUrl: string | null;
}

async function resoudreIdentite(
  produitType: string,
  souscriptionId: string
): Promise<IdentiteContrat | null> {
  if (produitType === "incendie") {
    const s = await prisma.souscriptionIncendie.findUnique({ where: { id: souscriptionId } });
    if (!s) return null;
    return {
      nom: s.nom,
      prenom: s.prenom,
      dateNaissance: s.dateNaissance,
      numeroPolice: numeroPoliceIncendieSynthetique(s.id, s.dateDebut ?? s.createdAt),
      pieceIdentiteUrl: s.pieceIdentiteUrl,
    };
  }
  if (produitType === "accident") {
    const s = await prisma.souscriptionAccident.findUnique({ where: { id: souscriptionId } });
    if (!s) return null;
    return {
      nom: s.nom,
      prenom: s.prenom,
      dateNaissance: s.dateNaissance,
      numeroPolice: s.numeroPolice,
      pieceIdentiteUrl: s.pieceIdentiteUrl,
    };
  }
  const s = await prisma.souscription.findUnique({ where: { id: souscriptionId } });
  if (!s) return null;
  let pieceIdentiteUrl = s.pieceIdentiteUrl;
  if (!pieceIdentiteUrl) {
    const doc = await prisma.document.findFirst({
      where: { souscriptionId, type: { in: ["CNI", "Permis", "Passeport"] } },
      orderBy: { createdAt: "desc" },
    });
    pieceIdentiteUrl = doc?.url ?? null;
  }
  return {
    nom: s.nom,
    prenom: s.prenom,
    dateNaissance: s.dateNaissance,
    numeroPolice: s.numeroPolice,
    pieceIdentiteUrl,
  };
}

/**
 * Lance l'analyse anti-fraude IA d'un sinistre déjà créé et enregistre le
 * résultat sur la ligne (`analyseIA`/`analyseIAAt`) — appelée en
 * fire-and-forget depuis POST /client/sinistres, ne doit jamais lever
 * d'exception (toute erreur est capturée et stockée comme résultat dégradé).
 */
export async function analyserSinistreIA(sinistreId: string): Promise<void> {
  try {
    const sinistre = await prisma.sinistreRelax.findUnique({ where: { id: sinistreId } });
    if (!sinistre) return;

    const souscriptionId =
      sinistre.souscriptionIncendieId ?? sinistre.souscriptionAccidentId ?? sinistre.souscriptionId;
    if (!souscriptionId) {
      await enregistrer(sinistreId, analyseErreur("Souscription introuvable pour ce sinistre."));
      return;
    }
    const identite = await resoudreIdentite(sinistre.produitType, souscriptionId);
    if (!identite) {
      await enregistrer(sinistreId, analyseErreur("Souscription introuvable pour ce sinistre."));
      return;
    }
    if (!identite.pieceIdentiteUrl) {
      await enregistrer(sinistreId, analyseErreur("Pièce d'identité non disponible pour ce contrat."));
      return;
    }
    if (sinistre.photosAccidentUrls.length === 0) {
      await enregistrer(sinistreId, analyseErreur("Aucune photo de l'accident fournie."));
      return;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await enregistrer(sinistreId, analyseErreur("Analyse IA non configurée (OPENROUTER_API_KEY manquant)."));
      return;
    }

    const nomComplet = `${identite.prenom ?? ""} ${identite.nom ?? ""}`.trim() || "(non renseigné)";
    const dateNaissanceStr = identite.dateNaissance
      ? identite.dateNaissance.toISOString().slice(0, 10)
      : "(non renseignée)";

    const prompt = `Tu es un assistant anti-fraude pour un assureur. Voici les informations du CONTRAT en base :
- Nom et prénom : ${nomComplet}
- Date de naissance : ${dateNaissanceStr}
- Numéro de police : ${identite.numeroPolice ?? "(non renseigné)"}
- Type d'événement déclaré : ${sinistre.typeEvenement}
- Date de survenance déclarée : ${sinistre.dateSurvenance.toISOString().slice(0, 10)}

La première image est la PIÈCE D'IDENTITÉ associée au contrat. Les images suivantes sont les PHOTOS DE L'ACCIDENT fournies par le client à l'appui de sa déclaration de sinistre.

Analyse et réponds UNIQUEMENT avec un objet JSON strict, sans aucun texte autour, au format exact :
{
  "correspondanceNom": true|false|null,
  "correspondanceDateNaissance": true|false|null,
  "pieceAuthentique": true|false|null,
  "photosAccidentAuthentiques": true|false|null,
  "niveauRisque": "faible"|"moyen"|"eleve",
  "explication": "résumé court en français de ton analyse et des points d'attention"
}
- "correspondanceNom"/"correspondanceDateNaissance" : le nom/la date de naissance lisibles sur la pièce d'identité correspondent-ils aux informations du contrat ? null si illisible.
- "pieceAuthentique" : la pièce d'identité a-t-elle l'apparence d'un document authentique (pas de signe évident de montage, de capture d'écran, de falsification) ? null si tu ne peux pas te prononcer.
- "photosAccidentAuthentiques" : les photos de l'accident semblent-elles authentiques et cohérentes avec le type d'événement déclaré (pas une image générique, réutilisée, ou manifestement sans rapport) ? null si tu ne peux pas te prononcer.
- "niveauRisque" : ton évaluation globale du risque de fraude.`;

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: prompt }];
    content.push({ type: "image_url", image_url: { url: identite.pieceIdentiteUrl } });
    for (const url of sinistre.photosAccidentUrls) {
      content.push({ type: "image_url", image_url: { url } });
    }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      await enregistrer(sinistreId, analyseErreur(`Erreur API IA (${resp.status}) : ${detail.slice(0, 300)}`));
      return;
    }

    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const texte = data.choices?.[0]?.message?.content;
    if (!texte) {
      await enregistrer(sinistreId, analyseErreur("Réponse IA vide."));
      return;
    }

    let parsed: Partial<AnalyseIA>;
    try {
      parsed = JSON.parse(texte);
    } catch {
      await enregistrer(sinistreId, analyseErreur("Réponse IA non exploitable (JSON invalide)."));
      return;
    }

    await enregistrer(sinistreId, {
      correspondanceNom: parsed.correspondanceNom ?? null,
      correspondanceDateNaissance: parsed.correspondanceDateNaissance ?? null,
      pieceAuthentique: parsed.pieceAuthentique ?? null,
      photosAccidentAuthentiques: parsed.photosAccidentAuthentiques ?? null,
      niveauRisque: parsed.niveauRisque ?? "moyen",
      explication: parsed.explication ?? "",
    });
  } catch (e) {
    await enregistrer(sinistreId, analyseErreur(`Erreur inattendue : ${(e as Error).message}`)).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────
// Analyse anti-fraude d'une souscription entrée par l'API partenaire
// ─────────────────────────────────────────────────────────────────────
// Le canal API n'a pas d'agent humain dans la boucle : les photos KYC
// (pièce d'identité + selfie) sont transmises par le système du partenaire.
// On vérifie donc, à la création, la cohérence pièce ↔ selfie ↔ identité
// déclarée. Résultat purement indicatif, stocké sur la Souscription
// (`analyseIA` / `analyseIAAt` / `niveauRisqueIA`) — ne bloque jamais.

/**
 * Résultat de l'analyse anti-fraude IA d'une souscription API. Champs
 * distincts de `AnalyseIA` (sinistres) : ici on compare une pièce d'identité
 * à un selfie et à l'identité saisie, pas des photos d'accident.
 */
export interface AnalyseIASouscription {
  correspondanceNom: boolean | null;
  correspondanceDateNaissance: boolean | null;
  pieceAuthentique: boolean | null;
  correspondanceSelfie: boolean | null;
  selfieAuthentique: boolean | null;
  niveauRisque: "faible" | "moyen" | "eleve";
  explication: string;
  erreur?: string;
}

function analyseSouscriptionErreur(message: string): AnalyseIASouscription {
  return {
    correspondanceNom: null,
    correspondanceDateNaissance: null,
    pieceAuthentique: null,
    correspondanceSelfie: null,
    selfieAuthentique: null,
    niveauRisque: "moyen",
    explication: "",
    erreur: message,
  };
}

async function enregistrerSouscription(
  souscriptionId: string,
  resultat: AnalyseIASouscription
): Promise<void> {
  await prisma.souscription.update({
    where: { id: souscriptionId },
    data: {
      analyseIA: resultat as unknown as object,
      analyseIAAt: new Date(),
      // Une analyse en échec ne doit pas apparaître comme un risque "moyen"
      // réel dans les filtres admin : on ne dénormalise le niveau que si
      // l'analyse a abouti.
      niveauRisqueIA: resultat.erreur ? null : resultat.niveauRisque,
    },
  });
}

/**
 * Analyse anti-fraude IA d'une souscription créée via l'API partenaire.
 * Appelée en fire-and-forget depuis POST /api/partner/v1/souscriptions ;
 * ne lève jamais d'exception (toute erreur est capturée et stockée comme
 * résultat dégradé).
 */
export async function analyserSouscriptionApiIA(souscriptionId: string): Promise<void> {
  try {
    const s = await prisma.souscription.findUnique({
      where: { id: souscriptionId },
      include: {
        documents: {
          where: { type: "Selfie" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!s) return;

    const selfieUrl = s.documents[0]?.url ?? null;
    if (!s.pieceIdentiteUrl) {
      await enregistrerSouscription(souscriptionId, analyseSouscriptionErreur("Pièce d'identité non disponible."));
      return;
    }
    if (!selfieUrl) {
      await enregistrerSouscription(souscriptionId, analyseSouscriptionErreur("Selfie non disponible."));
      return;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await enregistrerSouscription(
        souscriptionId,
        analyseSouscriptionErreur("Analyse IA non configurée (OPENROUTER_API_KEY manquant).")
      );
      return;
    }

    const nomComplet = `${s.prenom ?? ""} ${s.nom ?? ""}`.trim() || "(non renseigné)";
    const dateNaissanceStr = s.dateNaissance
      ? s.dateNaissance.toISOString().slice(0, 10)
      : "(non renseignée)";

    const prompt = `Tu es un assistant anti-fraude pour un assureur. Une souscription vient d'être enregistrée via l'API d'un partenaire (aucun agent humain n'a vu le client). Voici l'identité SAISIE dans le formulaire :
- Nom et prénom : ${nomComplet}
- Date de naissance : ${dateNaissanceStr}

La première image est la PIÈCE D'IDENTITÉ fournie. La seconde image est le SELFIE du souscripteur.

Analyse et réponds UNIQUEMENT avec un objet JSON strict, sans aucun texte autour, au format exact :
{
  "correspondanceNom": true|false|null,
  "correspondanceDateNaissance": true|false|null,
  "pieceAuthentique": true|false|null,
  "correspondanceSelfie": true|false|null,
  "selfieAuthentique": true|false|null,
  "niveauRisque": "faible"|"moyen"|"eleve",
  "explication": "résumé court en français de ton analyse et des points d'attention"
}
- "correspondanceNom"/"correspondanceDateNaissance" : le nom/la date de naissance lisibles sur la pièce d'identité correspondent-ils à l'identité saisie ? null si illisible.
- "pieceAuthentique" : la pièce d'identité a-t-elle l'apparence d'un document authentique (pas de montage, de capture d'écran, de photo de photo, de falsification évidente) ? null si tu ne peux pas te prononcer.
- "correspondanceSelfie" : la personne du selfie est-elle vraisemblablement la même que celle photographiée sur la pièce d'identité ? null si l'un des visages est inexploitable.
- "selfieAuthentique" : le selfie est-il une vraie prise de vue en direct (pas une photo d'écran, pas une photo d'une autre photo, pas une image générée) ? null si tu ne peux pas te prononcer.
- "niveauRisque" : ton évaluation globale du risque de fraude à la souscription.`;

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: s.pieceIdentiteUrl } },
      { type: "image_url", image_url: { url: selfieUrl } },
    ];

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      await enregistrerSouscription(
        souscriptionId,
        analyseSouscriptionErreur(`Erreur API IA (${resp.status}) : ${detail.slice(0, 300)}`)
      );
      return;
    }

    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const texte = data.choices?.[0]?.message?.content;
    if (!texte) {
      await enregistrerSouscription(souscriptionId, analyseSouscriptionErreur("Réponse IA vide."));
      return;
    }

    let parsed: Partial<AnalyseIASouscription>;
    try {
      parsed = JSON.parse(texte);
    } catch {
      await enregistrerSouscription(
        souscriptionId,
        analyseSouscriptionErreur("Réponse IA non exploitable (JSON invalide).")
      );
      return;
    }

    await enregistrerSouscription(souscriptionId, {
      correspondanceNom: parsed.correspondanceNom ?? null,
      correspondanceDateNaissance: parsed.correspondanceDateNaissance ?? null,
      pieceAuthentique: parsed.pieceAuthentique ?? null,
      correspondanceSelfie: parsed.correspondanceSelfie ?? null,
      selfieAuthentique: parsed.selfieAuthentique ?? null,
      niveauRisque: parsed.niveauRisque ?? "moyen",
      explication: parsed.explication ?? "",
    });
  } catch (e) {
    await enregistrerSouscription(
      souscriptionId,
      analyseSouscriptionErreur(`Erreur inattendue : ${(e as Error).message}`)
    ).catch(() => {});
  }
}
