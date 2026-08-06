import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../util.js";
import { htmlToPdf } from "../services/pdf.js";
import {
  renderContratIncendie,
  renderContratAccident,
  renderContratRelaxVoyage,
  renderContratSecurpro,
  renderContratSecurecolte,
  renderContratSecurstock,
  renderContratCoupsdurs,
} from "../services/contractHtml.js";

export const contratsRouter = Router();

// Champs texte libres : bornés pour éviter qu'un payload abusif ne fasse
// gonfler le temps de rendu Chromium (endpoint accessible sans authentification,
// utilisé juste après une souscription publique).
const texte = (max = 200) => z.string().max(max);
const texteOpt = (max = 200) => texte(max).nullish();
const montant = z.number().finite().min(0).max(1_000_000_000);
const dataUrlSignature = z.string().max(500_000).startsWith("data:image/").nullish();

const ligneGarantieSchema = z.object({
  garantie: texte(200),
  capital: montant.optional(),
  prime: montant,
});

const incendieSchema = z.object({
  type: z.literal("incendie"),
  data: z.object({
    numeroPolice: texte(60),
    partenaire: texte(200),
    dateDebut: texte(40),
    dateFin: texte(40),
    nom: texteOpt(120),
    prenom: texteOpt(120),
    telephone: texte(40),
    refFacture: texteOpt(120),
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

const relaxvoyageSchema = z.object({
  type: z.literal("relaxvoyage"),
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
  relaxvoyageSchema,
  securproSchema,
  securstockSchema,
  securecolteSchema,
  coupsdursSchema,
]);

/** Génération PDF des contrats — rendu serveur (texte réel, pas une image). */
contratsRouter.post(
  "/pdf",
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);

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
      case "relaxvoyage":
        html = await renderContratRelaxVoyage(body.data);
        break;
      case "securpro":
        html = await renderContratSecurpro(body.data);
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
