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
      where: { souscriptionId, type: { in: ["CNI", "Permis"] } },
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
