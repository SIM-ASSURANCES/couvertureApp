import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../util.js";
import { htmlToPdf } from "../services/pdf.js";
import { prisma } from "../db.js";
import { mapperSouscriptionGenerique } from "../services/contratGenerique.js";
import { numeroPoliceIncendieSynthetique } from "../services/notify.js";
import {
  renderContratIncendie,
  renderContratAccident,
  renderContratRelaxVoyage,
  renderContratRelaxMotoAuto,
  renderContratRelaxAccidentsGenerale,
  renderContratSecurpro,
  renderContratSecurhome,
  renderContratSecurhomeIncendie,
  renderContratSecurecolte,
  renderContratSecurstock,
  renderContratCoupsdurs,
} from "../services/contractHtml.js";

export const contratsRouter = Router();

// Champ optionnel, ajouté (2026-09-11, audit sécurité) aux types de contrat
// dont la souscription vit dans un modèle simple à relire intégralement
// (SouscriptionIncendie, SouscriptionAccident, ou le modèle générique via
// mapperSouscriptionGenerique) : quand il est fourni, TOUTES les données
// affichées sur le contrat sont relues en base et remplacent entièrement
// celles envoyées par l'appelant (voir chargerDonneesVerifieesServeur
// ci-dessous) — sans ce champ (routes non encore migrées, ou produits IMF à
// devis dont la relecture n'est pas encore implémentée : securpro,
// securpro_dommages, securhome_dommages, securstock, securecolte,
// coupsdurs), le comportement historique (confiance dans `data`) est
// inchangé. Objectif : empêcher la génération d'un PDF de contrat "officiel"
// avec des montants/identités arbitraires quand l'id réel est connu.
const souscriptionIdSchema = z.string().max(60).optional();

// Champs texte libres : bornés pour éviter qu'un payload abusif ne fasse
// gonfler le temps de rendu Chromium (endpoint accessible sans authentification,
// utilisé juste après une souscription publique).
const texte = (max = 200) => z.string().max(max);
const texteOpt = (max = 200) => texte(max).nullish();
const montant = z.number().finite().min(0).max(1_000_000_000);
// Regex stricte (et non startsWith, qui ne borne que le début de la chaîne) :
// tout le reste de la valeur doit être du base64 valide, aucun caractère
// permettant de sortir de l'attribut src="" (guillemet, chevron) ne peut s'y glisser.
const dataUrlSignature = z
  .string()
  .max(500_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/, "Signature invalide")
  .nullish();

const ligneGarantieSchema = z.object({
  garantie: texte(200),
  capital: montant.optional(),
  prime: montant,
});

const incendieSchema = z.object({
  type: z.literal("incendie"),
  souscriptionId: souscriptionIdSchema,
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    refFacture: texteOpt(120),
    ville: texteOpt(120),
    commune: texteOpt(120),
    quartier: texteOpt(120),
    numeroMaison: texteOpt(60),
    montant,
    capitalGaranti: montant,
    signature: dataUrlSignature,
  }),
});

const accidentSchema = z.object({
  type: z.literal("accident"),
  souscriptionId: souscriptionIdSchema,
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    dateNaissance: texteOpt(40),
    montant,
    capitalGaranti: montant,
    signature: dataUrlSignature,
  }),
});

// RelaxAccidents Frais Médicaux — mêmes champs qu'Accident (dont il reprend
// les données lors de la refonte Assurances Accidents/Dommages), le contrat
// affiche déjà "RELAXACCIDENTS" : on réutilise renderContratAccident tel quel.
const relaxaccidentsFraisMedicauxSchema = z.object({
  type: z.literal("relaxaccidents_fraismedicaux"),
  souscriptionId: souscriptionIdSchema,
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    dateNaissance: texteOpt(40),
    montant,
    capitalGaranti: montant,
    signature: dataUrlSignature,
    // Option Décès facultative (voir formuleSchema, routes/public.ts) —
    // durée propre (2 mois), distincte de la durée du contrat principal.
    optionDeces: z
      .object({ capital: montant, prime: montant, dureeMois: z.number().int().positive().max(24) })
      .nullish(),
  }),
});

// RelaxMoto / RelaxAuto — abonnements reconductibles, d'où le cycle en plus
// des champs communs aux produits Accidents (voir renderContratRelaxMotoAuto).
const relaxMotoAutoSchema = z.object({
  type: z.literal("relaxmoto_relaxauto"),
  souscriptionId: souscriptionIdSchema,
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    dateNaissance: texteOpt(40),
    montant,
    capitalGaranti: montant,
    produitLibelle: texte(120),
    cycleFacturation: z.enum(["mensuel", "annuel"]).nullish(),
    signature: dataUrlSignature,
  }),
});

const relaxvoyageSchema = z.object({
  type: z.literal("relaxvoyage"),
  souscriptionId: souscriptionIdSchema,
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    dateNaissance: texteOpt(40),
    compagnie: texteOpt(120),
    lieuDepart: texteOpt(120),
    lieuArrivee: texteOpt(120),
    numeroTicket: texteOpt(60),
    dateDepart: texteOpt(40),
    numeroPersonneContact: texteOpt(40),
    montant,
    capitalGaranti: montant,
    fraisSante: montant.nullish(),
    bagages: texteOpt(120),
    signature: dataUrlSignature,
  }),
});

const relaxaccidentsGeneraleSchema = z.object({
  type: z.literal("relaxaccidents_generale"),
  souscriptionId: souscriptionIdSchema,
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    dateNaissance: texteOpt(40),
    montant,
    primeHT: montant.nullish(),
    accessoires: montant.nullish(),
    taxes: montant.nullish(),
    classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    cnpsDeclare: z.boolean(),
    cycle: z.enum(["annuel", "mensuel"]).nullish(),
    signature: dataUrlSignature,
  }),
});

const securproSchema = z.object({
  type: z.literal("securpro"),
  data: z.object({
    numeroPolice: texte(60),
    intermediaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    dateSouscription: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    typePiece: texteOpt(40),
    numeroPiece: texteOpt(60),
    ville: texteOpt(120),
    communeQuartier: texteOpt(120),
    classeLabel: texte(300),
    statutOccupation: z.enum(["proprietaire", "locataire"]),
    valeurBatimentOuLoyer: montant,
    contenu: montant,
    dansMarche: z.boolean(),
    lignes: z.array(ligneGarantieSchema).max(30),
    primeNetteHT: montant,
    accessoires: montant,
    taxes: montant,
    primeTTC: montant,
    signature: dataUrlSignature,
  }),
});

// SecurPro (Assurances Dommages) réutilise exactement le même contrat que le
// SecurPro IMF (même moteur de calcul, voir routes/public.ts), avec deux
// champs en plus propres à la distribution QR partenaire.
const securproDommagesSchema = z.object({
  type: z.literal("securpro_dommages"),
  data: z.object({
    numeroPolice: texte(60),
    intermediaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    dateSouscription: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    nomCommercial: texteOpt(200),
    referenceCIE: texteOpt(120),
    telephone: texte(40),
    typePiece: texteOpt(40),
    numeroPiece: texteOpt(60),
    ville: texteOpt(120),
    communeQuartier: texteOpt(120),
    classeLabel: texte(300),
    statutOccupation: z.enum(["proprietaire", "locataire"]),
    valeurBatimentOuLoyer: montant,
    contenu: montant,
    dansMarche: z.boolean(),
    lignes: z.array(ligneGarantieSchema).max(30),
    primeNetteHT: montant,
    accessoires: montant,
    taxes: montant,
    primeTTC: montant,
    signature: dataUrlSignature,
  }),
});

const securhomeDommagesSchema = z.object({
  type: z.literal("securhome_dommages"),
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    ville: texteOpt(120),
    communeQuartier: texteOpt(120),
    referenceCIE: texteOpt(120),
    nombrePieces: z.number().int().min(0).nullish(),
    statutOccupation: z.enum(["proprietaire", "locataire"]),
    valeurBatimentOuLoyer: montant,
    contenu: montant,
    lignes: z.array(ligneGarantieSchema).max(30),
    primeNetteHT: montant,
    accessoires: montant,
    taxes: montant,
    primeTTC: montant,
    signature: dataUrlSignature,
  }),
});

// SecurHome (2026-09-03) — distinct de securhomeDommagesSchema ci-dessus :
// tarif fixe selon le nombre de pièces, pas de devis calculé.
const securhomeIncendieSchema = z.object({
  type: z.literal("securhome_incendie"),
  souscriptionId: souscriptionIdSchema,
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    nombrePieces: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    statutOccupation: z.enum(["proprietaire", "locataire"]),
    montant,
    capitalGaranti: montant,
    signature: dataUrlSignature,
  }),
});

const securstockSchema = z.object({
  type: z.literal("securstock"),
  data: z.object({
    numeroPolice: texte(60),
    intermediaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    dateSouscription: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    typePiece: texteOpt(40),
    numeroPiece: texteOpt(60),
    ville: texteOpt(120),
    communeQuartier: texteOpt(120),
    classeLabel: texte(300),
    localisationLabel: texte(200),
    montantStock: montant,
    capitalRetenu: montant,
    lignes: z.array(ligneGarantieSchema).max(30),
    primeNetteHT: montant,
    accessoires: montant,
    taxes: montant,
    primeTTC: montant,
    signature: dataUrlSignature,
  }),
});

const securecolteSchema = z.object({
  type: z.literal("securecolte"),
  data: z.object({
    numeroPolice: texte(60),
    intermediaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    dateSouscription: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    typePiece: texteOpt(40),
    numeroPiece: texteOpt(60),
    ville: texteOpt(120),
    communeQuartier: texteOpt(120),
    montantPack: montant,
    valeurPackage: montant.nullish(),
    superficieHa: z.number().finite().min(0).max(1_000_000).nullish(),
    capitaux: z.array(z.object({ label: texte(120), montant })).max(10).optional(),
    signature: dataUrlSignature,
  }),
});

const santeCoupsdursSchema = z.object({
  taille: z.number().finite().min(0).max(300).optional(),
  poids: z.number().finite().min(0).max(500).optional(),
  fumeur: z.boolean().optional(),
  cigarettesParJour: z.number().finite().min(0).max(200).optional(),
  sportif: z.boolean().optional(),
  sportifNiveau: z.enum(["amateur", "professionnel"]).optional(),
  infirmite: z.boolean().optional(),
  infirmiteTaux: texte(60).optional(),
  infirmiteNature: texte(200).optional(),
  maladieRecente: z.boolean().optional(),
  maladieRecentePrecisions: texte(500).optional(),
  touxFievre: z.boolean().optional(),
  diarrheeFrequente: z.boolean().optional(),
  transfusion: z.boolean().optional(),
  enceinte: z.boolean().optional(),
  affections: z.array(texte(60)).max(30).optional(),
  affectionsPrecisions: texte(500).optional(),
});

const coupsdursSchema = z.object({
  type: z.literal("coupsdurs"),
  data: z.object({
    numeroPolice: texte(60),
    intermediaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    dateSouscription: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    typePiece: texteOpt(40),
    numeroPiece: texteOpt(60),
    ville: texteOpt(120),
    communeQuartier: texteOpt(120),
    lignes: z
      .array(
        z.object({
          cle: texte(60),
          garantieLabel: texte(200),
          capital: montant,
          prime: montant,
        })
      )
      .max(10),
    primeTTC: montant,
    sante: santeCoupsdursSchema.nullish(),
    beneficiaires: z
      .array(
        z.object({
          nom: texte(120),
          contact: texte(60),
          lien: texte(60),
          pourcentage: z.number().finite().min(0).max(100),
        })
      )
      .max(20)
      .nullish(),
    signature: dataUrlSignature,
  }),
});

const bodySchema = z.discriminatedUnion("type", [
  incendieSchema,
  accidentSchema,
  relaxaccidentsFraisMedicauxSchema,
  relaxMotoAutoSchema,
  relaxvoyageSchema,
  relaxaccidentsGeneraleSchema,
  securproSchema,
  securproDommagesSchema,
  securhomeDommagesSchema,
  securhomeIncendieSchema,
  securstockSchema,
  securecolteSchema,
  coupsdursSchema,
]);

type TypeAvecVerification =
  | "incendie"
  | "accident"
  | "relaxaccidents_fraismedicaux"
  | "relaxmoto_relaxauto"
  | "relaxvoyage"
  | "relaxaccidents_generale"
  | "securhome_incendie";

// Codes Produit (modèle générique) acceptés pour chaque type de contrat
// vérifiable — rejette un id qui existe mais correspond à un AUTRE produit
// que celui annoncé (ex. id RelaxVoyage envoyé avec type "relaxmoto_relaxauto").
const CODES_PRODUIT_PAR_TYPE: Partial<Record<TypeAvecVerification, string[]>> = {
  relaxaccidents_fraismedicaux: ["relaxaccidents_fraismedicaux", "relaxaccidents_fraismedicaux_livreurs"],
  relaxmoto_relaxauto: ["relaxmoto", "relaxauto"],
  relaxvoyage: ["relaxvoyage"],
  relaxaccidents_generale: ["relaxaccidents"],
  securhome_incendie: ["securhome"],
};

/**
 * Relit en base la vérité serveur pour un type de contrat dont le modèle est
 * simple à relire intégralement (direct ou générique, voir commentaire sur
 * souscriptionIdSchema plus haut) — retourne `null` si la souscription
 * n'existe pas, n'est pas confirmée, ou ne correspond pas au produit annoncé
 * par `type`. Le résultat REMPLACE entièrement les champs correspondants de
 * `data` (voir appelant) : rien de ce qu'envoie le client n'est conservé
 * pour ces champs quand un `souscriptionId` est fourni.
 */
async function chargerDonneesVerifieesServeur(
  type: TypeAvecVerification,
  souscriptionId: string
): Promise<Record<string, unknown> | null> {
  if (type === "incendie") {
    const s = await prisma.souscriptionIncendie.findUnique({
      where: { id: souscriptionId },
      include: { partenaire: { select: { nomCommerce: true } } },
    });
    if (!s || s.statut !== "complet") return null;
    const debut = s.dateDebut ?? s.createdAt;
    const fin =
      s.dateFin ??
      (() => {
        const d = new Date(debut);
        d.setMonth(d.getMonth() + 3);
        return d;
      })();
    return {
      numeroPolice: numeroPoliceIncendieSynthetique(s.id, debut),
      partenaire: s.partenaire.nomCommerce,
      dateDebut: debut.toISOString(),
      dateFin: fin.toISOString(),
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      refFacture: s.refFacture,
      ville: s.ville,
      commune: s.commune,
      quartier: s.quartier,
      numeroMaison: s.numeroMaison,
      montant: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      signature: s.signature,
    };
  }

  if (type === "accident") {
    const s = await prisma.souscriptionAccident.findUnique({
      where: { id: souscriptionId },
      include: { partenaire: { select: { nomCommerce: true } } },
    });
    if (!s || s.waveStatut !== "confirme") return null;
    return {
      numeroPolice: s.numeroPolice ?? "",
      partenaire: s.partenaire.nomCommerce,
      dateDebut: (s.dateDebut ?? s.createdAt).toISOString(),
      dateFin: (s.dateFin ?? s.createdAt).toISOString(),
      nom: s.nom,
      prenom: s.prenom,
      telephone: s.telephone,
      dateNaissance: s.dateNaissance ? s.dateNaissance.toISOString() : null,
      montant: s.montantPrime,
      capitalGaranti: s.capitalGaranti,
      signature: s.signature,
      optionDeces: null,
    };
  }

  // Modèle générique (Souscription) — RelaxAccidents FM/générale, RelaxMoto/Auto, RelaxVoyage, SecurHome (incendie).
  const s = await prisma.souscription.findUnique({
    where: { id: souscriptionId },
    include: {
      partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
      produit: { select: { code: true, libelle: true } },
    },
  });
  if (!s || s.waveStatut !== "confirme") return null;
  if (!CODES_PRODUIT_PAR_TYPE[type]?.includes(s.produit.code)) return null;
  const d = await mapperSouscriptionGenerique(s);
  const dateDebut = d.dateDebut ? d.dateDebut.toISOString() : "";
  const dateFin = d.dateFin ? d.dateFin.toISOString() : "";
  const dateNaissance = d.dateNaissance ? d.dateNaissance.toISOString() : null;

  if (type === "relaxaccidents_fraismedicaux") {
    return {
      numeroPolice: d.numeroPolice ?? "",
      partenaire: d.partenaire,
      dateDebut,
      dateFin,
      nom: d.nom,
      prenom: d.prenom,
      telephone: d.telephone,
      dateNaissance,
      montant: d.montant,
      capitalGaranti: d.capitalGaranti,
      signature: d.signature,
      optionDeces: d.optionDeces,
    };
  }
  if (type === "relaxmoto_relaxauto") {
    return {
      numeroPolice: d.numeroPolice ?? "",
      partenaire: d.partenaire,
      dateDebut,
      dateFin,
      nom: d.nom,
      prenom: d.prenom,
      telephone: d.telephone,
      dateNaissance,
      montant: d.montant,
      capitalGaranti: d.capitalGaranti,
      produitLibelle: d.produitLibelle,
      cycleFacturation: s.cycleFacturation,
      signature: d.signature,
    };
  }
  if (type === "relaxvoyage") {
    return {
      numeroPolice: d.numeroPolice ?? "",
      partenaire: d.partenaire,
      dateDebut,
      dateFin,
      nom: d.nom,
      prenom: d.prenom,
      telephone: d.telephone,
      dateNaissance,
      compagnie: d.compagnie,
      lieuDepart: d.lieuDepart,
      lieuArrivee: d.lieuArrivee,
      numeroTicket: d.numeroTicket,
      dateDepart: d.dateDepart,
      numeroPersonneContact: d.numeroPersonneContact,
      montant: d.montant,
      capitalGaranti: d.capitalGaranti,
      fraisSante: d.fraisSante,
      bagages: d.bagages,
      signature: d.signature,
    };
  }
  if (type === "relaxaccidents_generale") {
    return {
      numeroPolice: d.numeroPolice ?? "",
      partenaire: d.partenaire,
      dateDebut,
      dateFin,
      nom: d.nom,
      prenom: d.prenom,
      telephone: d.telephone,
      dateNaissance,
      montant: d.montant,
      primeHT: d.primeHT,
      accessoires: d.fg,
      taxes: d.taxes,
      classe: d.classe,
      cnpsDeclare: d.cnpsDeclare,
      cycle: d.cycle,
      signature: d.signature,
    };
  }
  // securhome_incendie
  return {
    numeroPolice: d.numeroPolice ?? "",
    partenaire: d.partenaire,
    dateDebut,
    dateFin,
    nom: d.nom,
    prenom: d.prenom,
    telephone: d.telephone,
    nombrePieces: d.nombrePieces,
    statutOccupation: d.statutOccupation,
    montant: d.montant,
    capitalGaranti: d.capitalGaranti,
    signature: d.signature,
  };
}

/** Génération PDF des contrats — rendu serveur (texte réel, pas une image). */
contratsRouter.post(
  "/pdf",
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);

    // Audit sécurité 2026-09-11 : quand l'appelant fournit l'id réel de la
    // souscription (cas normal — le frontend le connaît toujours), toutes
    // les données affichées sont relues en base et remplacent celles
    // envoyées, empêchant la génération d'un contrat avec des montants/une
    // identité arbitraires. Types non couverts (produits IMF à devis
    // calculé — voir commentaire sur souscriptionIdSchema) : comportement
    // historique inchangé, `data` reste celle fournie par l'appelant.
    if ("souscriptionId" in body && body.souscriptionId) {
      const verite = await chargerDonneesVerifieesServeur(body.type, body.souscriptionId);
      if (!verite) return res.status(404).json({ error: "Souscription introuvable ou non confirmée." });
      Object.assign(body.data, verite);
    }

    let html: string;
    switch (body.type) {
      case "incendie":
        html = await renderContratIncendie(body.data);
        break;
      case "accident":
        html = await renderContratAccident(body.data);
        break;
      case "relaxaccidents_fraismedicaux":
        html = await renderContratAccident(body.data);
        break;
      case "relaxmoto_relaxauto":
        html = await renderContratRelaxMotoAuto(body.data);
        break;
      case "relaxvoyage":
        html = await renderContratRelaxVoyage(body.data);
        break;
      case "relaxaccidents_generale":
        html = await renderContratRelaxAccidentsGenerale(body.data);
        break;
      case "securpro":
        html = await renderContratSecurpro(body.data);
        break;
      case "securpro_dommages":
        html = await renderContratSecurpro(body.data);
        break;
      case "securhome_dommages":
        html = await renderContratSecurhome(body.data);
        break;
      case "securhome_incendie":
        html = await renderContratSecurhomeIncendie(body.data);
        break;
      case "securstock":
        html = await renderContratSecurstock(body.data);
        break;
      case "securecolte":
        html = await renderContratSecurecolte(body.data);
        break;
      case "coupsdurs":
        html = await renderContratCoupsdurs(body.data);
        break;
    }

    const pdf = await htmlToPdf(html);
    const numeroPolice = body.data.numeroPolice.replace(/[^a-zA-Z0-9-_]+/g, "-") || "contrat";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="contrat-${numeroPolice}.pdf"`);
    res.send(pdf);
  })
);
