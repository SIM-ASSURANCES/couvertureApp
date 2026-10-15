import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { type AuthedRequest } from "../auth.js";
import { asyncHandler } from "../util.js";
import { logAction } from "../journal.js";
import { sendSMS, messageDemandeSantePieces, messageDemandeSanteRefusee } from "../services/notify.js";
import { SANS_LOURD_GENERIQUE, avecDonneesAllegees } from "../services/allegement.js";
import { htmlToPdf } from "../services/pdf.js";
import { renderBulletinSanteHtml } from "../services/questionnaireSanteHtml.js";
import {
  COMPOSITION_SANTE,
  LIBELLES_PIECES_SANTE,
  PRODUITS_SANTE,
  QUESTIONNAIRE_SANTE,
  VALIDATION_SANTE,
  estProduitSante,
  libellesPersonnesSante,
  lireFicheSante,
  lirePersonnesAssureesSante,
  lireQuestionnaireSante,
  personnesPiecesSante,
  piecesCompletes,
  tauxPriseEnChargeDuTarif,
} from "../services/assurancesSante.js";

/**
 * Demandes d'Assurances Santé (Solo, Duo, Famille) — le client ne paie pas à
 * la souscription : il dépose une demande (fiches des personnes assurées +
 * questionnaire médical de chacune), qu'un admin valide ou refuse ici.
 *
 * Circuit (2026-10-15) : l'admin valide → SMS avec le lien de la page de dépôt
 * des pièces (CNI recto-verso + photo pour les adultes, extrait de naissance +
 * photo pour les enfants) → quand tout est déposé, le client voit le bouton
 * « Payer » (montant exact) → le contrat s'active au paiement
 * (services/paiementWave.ts), comme pour tout autre produit. Voir
 * routes/santePieces.ts pour la partie publique. Monté sous
 * /api/assurances-sante, réservé aux admins de la branche (voir index.ts).
 */
export const assurancesSanteRouter = Router();

const ETATS = ["a_valider", "pieces", "a_payer", "refusees"] as const;
type Etat = (typeof ETATS)[number];

const PRODUIT_SANTE = { produit: { code: { in: [...PRODUITS_SANTE] } } };

const INCLUDE_LISTE = {
  produit: { select: { code: true, libelle: true } },
  partenaire: { select: { nomCommerce: true, nomResponsable: true } },
  agentDistribution: { select: { nom: true } },
  piecesSante: { select: { personneIndex: true, type: true } },
} as const;

type LigneDemande = Awaited<ReturnType<typeof chargerLignes>>[number];

/** Lignes d'une liste, sans photo ni signature (relues à la demande) — le JSON `donneesSpecifiques` est allégé par la base. */
async function chargerLignes(where: object, orderBy: "asc" | "desc", take = 300) {
  const rows = await prisma.souscription.findMany({
    where: { ...PRODUIT_SANTE, ...where },
    omit: SANS_LOURD_GENERIQUE,
    include: INCLUDE_LISTE,
    orderBy: { createdAt: orderBy },
    take,
  });
  return avecDonneesAllegees(rows);
}

function piecesDe(s: LigneDemande) {
  const personnes = personnesPiecesSante(s.nom ?? "", lirePersonnesAssureesSante(s.donneesSpecifiques));
  const deposees = new Set(s.piecesSante.map((p) => `${p.personneIndex}:${p.type}`));
  return {
    complet: piecesCompletes(personnes, s.piecesSante),
    personnes: personnes.map((p) => ({
      index: p.index,
      intitule: p.intitule,
      nomComplet: p.nomComplet,
      pieces: p.pieces.map((type) => ({ type, libelle: LIBELLES_PIECES_SANTE[type], deposee: deposees.has(`${p.index}:${type}`) })),
    })),
  };
}

function serialiser(s: LigneDemande) {
  const personnes = lirePersonnesAssureesSante(s.donneesSpecifiques);
  return {
    id: s.id,
    createdAt: s.createdAt,
    produitCode: s.produit.code,
    produitLibelle: s.produit.libelle,
    description: estProduitSante(s.produit.code) ? COMPOSITION_SANTE[s.produit.code].description : "",
    tauxPriseEnCharge: tauxPriseEnChargeDuTarif(s.donneesSpecifiques),
    montant: s.montantPrime,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    email: s.email,
    sexe: s.sexe,
    dateNaissance: s.dateNaissance,
    // Fiche de l'assuré principal (dont ses données de santé), personnes
    // couvertes et questionnaire médical : c'est ce que l'admin examine pour
    // valider. Route réservée aux admins — jamais renvoyé au public.
    ficheSante: lireFicheSante(s.donneesSpecifiques),
    personnesAssurees: personnes,
    intitulesPersonnes: libellesPersonnesSante(personnes),
    questionnaire: lireQuestionnaireSante(s.donneesSpecifiques),
    pieces: piecesDe(s),
    partenaire: s.partenaire.nomResponsable || s.partenaire.nomCommerce,
    agent: s.agentDistribution?.nom ?? null,
    validationStatut: s.validationStatut,
    validationAt: s.validationAt,
    validationMotif: s.validationMotif,
  };
}

/**
 * Demandes par état : à valider (défaut), validées en attente de pièces,
 * pièces reçues en attente de paiement, refusées. Les demandes payées sont des
 * contrats (page Contrats). `questionnaireSpec` : les questions telles que
 * posées au souscripteur, pour afficher les réponses sans les dupliquer ici.
 */
assurancesSanteRouter.get(
  "/demandes",
  asyncHandler(async (req, res) => {
    const etat: Etat = (ETATS as readonly string[]).includes(String(req.query.etat)) ? (req.query.etat as Etat) : "a_valider";

    const [aValider, refusees, valideesNonPayees] = await Promise.all([
      chargerLignes({ validationStatut: VALIDATION_SANTE.EN_ATTENTE }, "asc"),
      chargerLignes({ validationStatut: VALIDATION_SANTE.REFUSEE }, "desc"),
      chargerLignes({ validationStatut: VALIDATION_SANTE.VALIDEE, waveStatut: { not: "confirme" } }, "desc"),
    ]);
    const aPayer = valideesNonPayees.filter((s) => piecesDe(s).complet);
    const pieces = valideesNonPayees.filter((s) => !piecesDe(s).complet);
    const parEtat: Record<Etat, LigneDemande[]> = { a_valider: aValider, pieces, a_payer: aPayer, refusees };

    res.json({
      compteurs: Object.fromEntries(ETATS.map((e) => [e, parEtat[e].length])),
      questionnaireSpec: QUESTIONNAIRE_SANTE,
      demandes: parEtat[etat].map(serialiser),
    });
  })
);

/** Demande Santé encore ouverte (ni payée, ni d'un autre produit) — sinon `null`. */
async function chargerDemande(id: string) {
  const s = await prisma.souscription.findUnique({
    where: { id },
    omit: { pieceIdentiteUrl: true },
    include: { produit: { select: { code: true, libelle: true, sousBranche: true } } },
  });
  if (!s || !estProduitSante(s.produit.code) || !s.validationStatut) return null;
  return s;
}

/**
 * Valide une demande : l'envoi du SMS avec le lien de la page de dépôt des
 * pièces, et le montant exact à payer ensuite. Aucun paiement n'est créé ici :
 * le lien Wave naît quand le souscripteur a déposé toutes ses pièces et clique
 * sur « Payer » (routes/santePieces.ts). Rejouable tant que le client n'a pas
 * payé — « renvoyer le lien » renvoie le même lien (le jeton ne change pas).
 */
assurancesSanteRouter.post(
  "/demandes/:id/valider",
  asyncHandler(async (req: AuthedRequest, res) => {
    const s = await chargerDemande(req.params.id);
    if (!s) return res.status(404).json({ error: "Demande introuvable." });
    if (s.waveStatut === "confirme") return res.status(400).json({ error: "Cette demande est déjà payée : le contrat est actif." });
    if (s.validationStatut === VALIDATION_SANTE.REFUSEE) {
      return res.status(400).json({ error: "Cette demande a été refusée. Le client doit en déposer une nouvelle." });
    }
    const renvoi = s.validationStatut === VALIDATION_SANTE.VALIDEE;

    const echeance = await prisma.paiement.findFirst({
      where: { souscriptionId: s.id, statut: { not: "paye" } },
      orderBy: { numeroEcheance: "asc" },
    });
    if (!echeance) return res.status(400).json({ error: "Aucun paiement à régler pour cette demande." });

    const token = s.tokenPiecesSante ?? randomBytes(24).toString("hex");
    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        validationStatut: VALIDATION_SANTE.VALIDEE,
        validationAt: renvoi ? undefined : new Date(),
        validationParAdminId: req.user!.sub,
        validationMotif: null,
        tokenPiecesSante: token,
        relanceCount: renvoi ? { increment: 1 } : undefined,
      },
    });

    const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:5173";
    await sendSMS(
      s.telephone,
      messageDemandeSantePieces(s.prenom || s.nom || "", s.produit.libelle, echeance.montant, `${appUrl}/sante/pieces/${token}`)
    );

    await logAction({
      adminId: req.user!.sub,
      typeAction: renvoi ? "relance" : "modification",
      objetType: "demande_sante",
      objetId: s.id,
      valeurApres: { validationStatut: VALIDATION_SANTE.VALIDEE, montant: echeance.montant },
    });
    res.json({ ok: true, renvoi, montant: echeance.montant });
  })
);

const refusSchema = z.object({ motif: z.string().trim().max(300).optional() });

/** Refuse une demande (motif facultatif, interne) et en informe le client par SMS. */
assurancesSanteRouter.post(
  "/demandes/:id/refuser",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { motif } = refusSchema.parse(req.body ?? {});
    const s = await chargerDemande(req.params.id);
    if (!s) return res.status(404).json({ error: "Demande introuvable." });
    if (s.waveStatut === "confirme") return res.status(400).json({ error: "Cette demande est déjà payée : le contrat est actif." });
    if (s.validationStatut === VALIDATION_SANTE.REFUSEE) return res.json({ ok: true });

    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        validationStatut: VALIDATION_SANTE.REFUSEE,
        validationAt: new Date(),
        validationParAdminId: req.user!.sub,
        validationMotif: motif || null,
        // Le lien de dépôt de pièces déjà envoyé cesse de fonctionner.
        tokenPiecesSante: null,
      },
    });
    await sendSMS(s.telephone, messageDemandeSanteRefusee(s.prenom || s.nom || "", s.produit.libelle));
    await logAction({
      adminId: req.user!.sub,
      typeAction: "modification",
      objetType: "demande_sante",
      objetId: s.id,
      valeurApres: { validationStatut: VALIDATION_SANTE.REFUSEE, motif: motif || null },
    });
    res.json({ ok: true });
  })
);

/**
 * Bulletin d'adhésion + questionnaire médical rempli (PDF), fidèle au bulletin
 * fourni par SIM Assurances : informations du souscripteur, personnes
 * couvertes, réponses de chacune et signature. Lu en base à chaque appel.
 */
assurancesSanteRouter.get(
  "/demandes/:id/questionnaire.pdf",
  asyncHandler(async (req, res) => {
    const s = await prisma.souscription.findUnique({
      where: { id: req.params.id },
      omit: { pieceIdentiteUrl: true },
      include: {
        produit: { select: { code: true, libelle: true } },
        partenaire: { select: { nomCommerce: true, nomResponsable: true } },
      },
    });
    if (!s || !estProduitSante(s.produit.code)) return res.status(404).json({ error: "Demande introuvable." });

    const fiche = lireFicheSante(s.donneesSpecifiques);
    const signature = (s.donneesSpecifiques as { signature?: unknown } | null)?.signature;
    const html = renderBulletinSanteHtml({
      numeroDemande: s.id,
      dateDemande: s.createdAt,
      produit: s.produit.libelle,
      description: COMPOSITION_SANTE[s.produit.code].description,
      tauxPriseEnCharge: tauxPriseEnChargeDuTarif(s.donneesSpecifiques),
      montant: s.montantPrime,
      apporteur: s.partenaire.nomResponsable || s.partenaire.nomCommerce,
      souscripteur: {
        nomComplet: s.nom ?? "",
        telephone: s.telephone,
        email: s.email,
        sexe: s.sexe,
        dateNaissance: s.dateNaissance,
        profession: fiche?.profession ?? null,
        lieuResidence: fiche?.lieuResidence ?? null,
        numeroCmu: fiche?.numeroCmu ?? null,
      },
      personnes: lirePersonnesAssureesSante(s.donneesSpecifiques),
      questionnaire: lireQuestionnaireSante(s.donneesSpecifiques),
      signature: typeof signature === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/.test(signature) ? signature : null,
    });
    const pdf = await htmlToPdf(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="bulletin-sante-${s.id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  })
);

/** Pièces déposées par le souscripteur (images), lues à la demande — jamais dans les listes. */
assurancesSanteRouter.get(
  "/demandes/:id/pieces",
  asyncHandler(async (req, res) => {
    const s = await chargerDemande(req.params.id);
    if (!s) return res.status(404).json({ error: "Demande introuvable." });
    const pieces = await prisma.pieceSante.findMany({
      where: { souscriptionId: s.id },
      orderBy: [{ personneIndex: "asc" }, { createdAt: "asc" }],
    });
    const personnes = personnesPiecesSante(s.nom ?? "", lirePersonnesAssureesSante(s.donneesSpecifiques));
    res.json(
      pieces.map((p) => ({
        personneIndex: p.personneIndex,
        intitule: personnes.find((x) => x.index === p.personneIndex)?.intitule ?? `Personne ${p.personneIndex + 1}`,
        nomComplet: personnes.find((x) => x.index === p.personneIndex)?.nomComplet ?? "",
        type: p.type,
        libelle: LIBELLES_PIECES_SANTE[p.type as keyof typeof LIBELLES_PIECES_SANTE] ?? p.type,
        url: p.url,
      }))
    );
  })
);
