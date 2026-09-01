import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../util.js";
import { htmlToPdf } from "../services/pdf.js";
import {
  renderContratIncendie,
  renderContratAccident,
  renderContratRelaxVoyage,
  renderContratRelaxMotoAuto,
  renderContratRelaxAccidentsGenerale,
  renderContratSecurpro,
  renderContratSecurhome,
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
