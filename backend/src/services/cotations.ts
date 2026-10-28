// Devis (Assurances Accidents/Dommages) — voir Cotation dans schema.prisma
// pour le contexte général. Ce module centralise, pour chacun des 5 produits
// couverts, le schéma zod des "entrées" (paramètres qui influent sur le
// prix, saisis par le partenaire/agent) et le calcul de la prime — réutilise
// TEL QUEL les moteurs déjà existants et déjà vérifiés par
// routes/public.ts, pour ne jamais dupliquer une formule tarifaire :
//   - relaxaccidents (RelaxAccidents générale) : tarif fixe (TarifProduit),
//     voir services/relaxAccidentsGenerale.ts.
//   - securhome : tarif fixe par nombre de pièces (TarifProduit).
//   - securhome_dommages (SecurHome+) : services/securhomeDommages.ts.
//   - securpro_dommages (SecurPro) : services/tarificationImf.ts (barème en
//     base, comme côté IMF).
//   - securmoto (SecurMoto) : services/securMoto.ts.
//
// Volontairement PAS d'identité client ni de photos/signature ici — ces
// champs sont saisis par le client lui-même au moment de payer (voir
// POST /public/cotations/:token/souscrire), jamais par l'auteur du devis.

import { z } from "zod";
import { prisma } from "../db.js";
import {
  formuleRelaxAccidentsGenerale,
  garantiesRelaxAccidentsGenerale,
  INDEMNITE_JOURNALIERE_RELAXACCIDENTS_GENERALE,
  surchargeMoyenDeplacementRelaxAccidentsGenerale,
  type Classe,
  type CycleRelaxAccidentsGenerale,
} from "./relaxAccidentsGenerale.js";
import { calculerSecurhome, type SecurhomeInput } from "./securhomeDommages.js";
import { calculerSecurMoto, type SecurMotoInput, type AgeMoto } from "./securMoto.js";
import { calculerSecurpro, messageCapitalRefuse, type SecurproInput } from "./tarificationImf.js";
import { DDE_CAPITAUX, DE_CAPITAUX, BDG_CAPITAUX, VOL_CAISSE_CAPITAUX, capitalDansListe } from "./capitauxDommages.js";
import { appliquerPeriodicite, cycleDommagesSchema, detailMensuelTarifFixe, libellePeriodicite } from "./periodiciteDommages.js";
import { OPTIONS_DECES_FRAIS_MEDICAUX, dureeOptionDecesMois } from "./optionDecesFraisMedicaux.js";
import { GARANTIES_RELAX_MOTO_AUTO } from "./contractHtml.js";
import { COMPOSITION_SANTE, GARANTIES_SANTE, PRODUITS_SANTE, tauxPriseEnChargeDuTarif } from "./assurancesSante.js";

// Depuis le 2026-10-28, TOUS les produits ont un devis, y compris ceux dont la prime et
// les garanties sont déjà connues (tarif fixe). Les trois produits Santé font exception à
// la conversion en paiement : leur souscription passe par une demande validée par un admin
// (voir ensuite « lienSouscription » de GET /public/cotations/:token).
export const PRODUITS_COTATION = [
  "relaxaccidents",
  "relaxmoto",
  "relaxauto",
  "relaxaccidents_fraismedicaux",
  "relaxaccidents_fraismedicaux_livreurs",
  "relaxvoyage",
  ...PRODUITS_SANTE,
  "securhome",
  "securhome_dommages",
  "securpro_dommages",
  "securmoto",
] as const;
export type ProduitCotation = (typeof PRODUITS_COTATION)[number];
export function estProduitCotation(p: string): p is ProduitCotation {
  return (PRODUITS_COTATION as readonly string[]).includes(p);
}

/** Produits dont le devis ne se paie pas directement : la demande doit d'abord être validée (Assurances Santé). */
export function estCotationSansPaiementDirect(p: string): boolean {
  return (PRODUITS_SANTE as readonly string[]).includes(p);
}

/** Erreur métier (message affichable tel quel au partenaire/agent) — distincte d'une erreur de validation zod. */
export class ErreurCotation extends Error {}

const entreesRelaxAccidentsSchema = z.object({
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cnpsDeclare: z.boolean(),
  cycle: z.enum(["annuel", "mensuel"]),
  moyenDeplacement: z.enum(["voiture", "moto_tricycle", "autres"]),
});

// RelaxMoto / RelaxAuto : un cycle (annuel ou mensuel) et le nombre de périodes payées d'avance
// (même plafond que la souscription directe, MAX_PERIODES_RELAX dans routes/public.ts).
const entreesRelaxCycleSchema = z.object({
  cycle: z.enum(["annuel", "mensuel"]),
  nombrePeriodes: z.number().int().min(1).max(12).default(1),
});

// RelaxAccidents Frais Médicaux (grand public et Livreurs/MotoTaxis) : la formule est la
// ligne de barème (TarifProduit.libelleVariante), l'option Décès est facultative.
const entreesRafSchema = z.object({
  formule: z.string().min(1),
  optionDeces: z.enum(["200000", "100000"]).optional(),
});

// RelaxVoyage et Assurances Santé : une formule du barème, rien d'autre à saisir.
const entreesFormuleSchema = z.object({
  formule: z.string().min(1),
});

const entreesSecurhomeSchema = z.object({
  nombrePieces: z.number().int().min(1).max(5),
  statutOccupation: z.enum(["proprietaire", "locataire"]),
  cycle: cycleDommagesSchema,
});

const entreesSecurhomeDommagesSchema = z.object({
  statutOccupation: z.enum(["proprietaire", "locataire"]),
  valeurBatiment: z.number().finite().min(0).optional(),
  loyerMensuel: z.number().finite().min(0).optional(),
  contenu: z.number().finite().min(0),
  gardien: z.boolean(),
  extincteur: z.boolean(),
  camera: z.boolean(),
  volContenu: z.boolean(),
  ddeCapital: z.number().finite().optional(),
  deCapital: z.number().finite().optional(),
  bdgCapital: z.number().finite().optional(),
  cycle: cycleDommagesSchema,
});

const entreesSecurproDommagesSchema = z.object({
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  statutOccupation: z.enum(["proprietaire", "locataire"]),
  valeurBatiment: z.number().finite().min(0).optional(),
  loyerMensuel: z.number().finite().min(0).optional(),
  contenu: z.number().finite().min(0),
  dansMarche: z.boolean(),
  gardien: z.boolean(),
  extincteur: z.boolean(),
  volContenu: z.boolean(),
  majorationVolContenu: z.boolean().optional(),
  volCaisseCapital: z.number().finite().optional(),
  majorationVolCaisse: z.boolean().optional(),
  ddeCapital: z.number().finite().optional(),
  deCapital: z.number().finite().optional(),
  bdgCapital: z.number().finite().optional(),
  cycle: cycleDommagesSchema,
});

const entreesSecurMotoSchema = z.object({
  valeurMoto: z.number().finite().min(1).max(700_000),
  ageMoto: z.enum(["NEUVE", "1 AN", "2 ANS"]),
  cycle: cycleDommagesSchema,
});

/** Schéma zod des "entrées" (paramètres de tarification) pour un produit couvert par les devis. */
export function schemaEntreesCotation(produitCode: ProduitCotation) {
  switch (produitCode) {
    case "relaxaccidents":
      return entreesRelaxAccidentsSchema;
    case "relaxmoto":
    case "relaxauto":
      return entreesRelaxCycleSchema;
    case "relaxaccidents_fraismedicaux":
    case "relaxaccidents_fraismedicaux_livreurs":
      return entreesRafSchema;
    case "relaxvoyage":
    case "sante_solo":
    case "sante_duo":
    case "sante_famille":
      return entreesFormuleSchema;
    case "securhome":
      return entreesSecurhomeSchema;
    case "securhome_dommages":
      return entreesSecurhomeDommagesSchema;
    case "securpro_dommages":
      return entreesSecurproDommagesSchema;
    case "securmoto":
      return entreesSecurMotoSchema;
  }
}

export interface ResultatCotation {
  entrees: Record<string, unknown>;
  resultat: unknown;
  primeTTC: number;
  capitalGaranti: number;
  libelleFormule: string;
}

/**
 * Calcule (ou recalcule) le devis d'un produit à partir de ses paramètres de
 * tarification bruts (non typés — validés ici par le schéma zod du
 * produit). Lève une ErreurCotation avec un message utilisateur en cas
 * d'entrée invalide ou de barème indisponible — jamais un crash silencieux.
 */
export async function calculerCotation(produitCode: ProduitCotation, entreesBrutes: unknown): Promise<ResultatCotation> {
  const schema = schemaEntreesCotation(produitCode);
  const entrees = schema.parse(entreesBrutes) as Record<string, unknown>;

  // ── Produits à tarif fixe lu en base (prime et garanties connues d'avance) ──
  if (produitCode === "relaxmoto" || produitCode === "relaxauto") {
    const e = entrees as z.infer<typeof entreesRelaxCycleSchema>;
    const produit = await prisma.produit.findUnique({ where: { code: produitCode } });
    if (!produit) throw new ErreurCotation(`Produit ${LIBELLES_PRODUIT_COTATION[produitCode]} indisponible.`);
    const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante: e.cycle } });
    if (!tarif) throw new ErreurCotation("Tarif indisponible pour cette formule.");
    const unite = e.cycle === "annuel" ? (e.nombrePeriodes > 1 ? "ans" : "an") : "mois";
    return {
      entrees: e,
      resultat: { cycle: e.cycle, nombrePeriodes: e.nombrePeriodes, primeUnitaire: tarif.prime },
      primeTTC: tarif.prime * e.nombrePeriodes,
      capitalGaranti: tarif.capitalGaranti,
      libelleFormule: `Formule ${e.cycle === "annuel" ? "annuelle" : "mensuelle"} · ${e.nombrePeriodes} ${unite}`,
    };
  }

  if (produitCode === "relaxaccidents_fraismedicaux" || produitCode === "relaxaccidents_fraismedicaux_livreurs") {
    const e = entrees as z.infer<typeof entreesRafSchema>;
    const produit = await prisma.produit.findUnique({ where: { code: produitCode } });
    if (!produit) throw new ErreurCotation(`Produit ${LIBELLES_PRODUIT_COTATION[produitCode]} indisponible.`);
    const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante: e.formule } });
    if (!tarif) throw new ErreurCotation("Formule indisponible pour ce produit.");
    const option = e.optionDeces
      ? { ...OPTIONS_DECES_FRAIS_MEDICAUX[e.optionDeces], dureeMois: dureeOptionDecesMois(produitCode) }
      : null;
    return {
      entrees: e,
      resultat: { formule: e.formule, tarifBase: tarif.prime, optionDeces: option },
      primeTTC: tarif.prime + (option?.prime ?? 0),
      capitalGaranti: tarif.capitalGaranti,
      libelleFormule: `Formule ${tarif.prime.toLocaleString("fr-FR")} FCFA${option ? ` + option Décès ${option.capital.toLocaleString("fr-FR")} FCFA` : ""}`,
    };
  }

  if (produitCode === "relaxvoyage") {
    const e = entrees as z.infer<typeof entreesFormuleSchema>;
    const produit = await prisma.produit.findUnique({ where: { code: "relaxvoyage" } });
    if (!produit) throw new ErreurCotation("Produit RelaxVoyage indisponible.");
    const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante: e.formule } });
    if (!tarif) throw new ErreurCotation("Formule indisponible pour ce produit.");
    const infos = tarif.donneesSpecifiques as { fraisSante?: number; bagages?: string } | null;
    return {
      entrees: e,
      resultat: { formule: e.formule, deces: tarif.capitalGaranti, fraisSante: infos?.fraisSante ?? null, bagages: infos?.bagages ?? null },
      primeTTC: tarif.prime,
      capitalGaranti: tarif.capitalGaranti,
      libelleFormule: `Formule ${tarif.libelleVariante ?? tarif.prime} · trajet de 24 h`,
    };
  }

  if ((PRODUITS_SANTE as readonly string[]).includes(produitCode)) {
    const e = entrees as z.infer<typeof entreesFormuleSchema>;
    const produit = await prisma.produit.findUnique({ where: { code: produitCode } });
    if (!produit) throw new ErreurCotation("Produit Santé indisponible.");
    const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante: e.formule } });
    if (!tarif) throw new ErreurCotation("Formule indisponible pour ce produit.");
    const taux = tauxPriseEnChargeDuTarif(tarif.donneesSpecifiques);
    if (taux == null) throw new ErreurCotation("Formule indisponible pour ce produit.");
    const composition = COMPOSITION_SANTE[produitCode as (typeof PRODUITS_SANTE)[number]];
    return {
      entrees: e,
      resultat: { formule: e.formule, tauxPriseEnCharge: taux },
      primeTTC: tarif.prime,
      capitalGaranti: tarif.capitalGaranti,
      libelleFormule: `${composition.description} · prise en charge ${taux} %`,
    };
  }

  if (produitCode === "relaxaccidents") {
    const e = entrees as z.infer<typeof entreesRelaxAccidentsSchema>;
    const formule = formuleRelaxAccidentsGenerale(e.classe as Classe, e.cnpsDeclare, e.cycle as CycleRelaxAccidentsGenerale);
    const produit = await prisma.produit.findUnique({ where: { code: "relaxaccidents" } });
    if (!produit) throw new ErreurCotation("Produit RelaxAccidents indisponible.");
    const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante: formule } });
    if (!tarif) throw new ErreurCotation("Formule indisponible pour ce produit.");
    const surcharge = surchargeMoyenDeplacementRelaxAccidentsGenerale(e.moyenDeplacement, e.cycle as CycleRelaxAccidentsGenerale);
    const primeTTC = tarif.prime + surcharge;
    return {
      entrees: e,
      resultat: { formule, surchargeMoyenDeplacement: surcharge, tarifBase: tarif.prime },
      primeTTC,
      capitalGaranti: tarif.capitalGaranti,
      libelleFormule: `Classe ${e.classe} · ${e.cnpsDeclare ? "déclaré CNPS" : "non déclaré CNPS"} · ${e.cycle === "annuel" ? "annuel" : "mensuel"}`,
    };
  }

  if (produitCode === "securhome") {
    const e = entrees as z.infer<typeof entreesSecurhomeSchema>;
    const produit = await prisma.produit.findUnique({ where: { code: "securhome" } });
    if (!produit) throw new ErreurCotation("Produit SecurHome indisponible.");
    const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante: String(e.nombrePieces) } });
    if (!tarif) throw new ErreurCotation("Nombre de pièces indisponible pour ce produit.");
    // Prime mensuelle = prime annuelle ÷ 10 (voir services/periodiciteDommages.ts).
    const mensuel = e.cycle === "mensuel" ? detailMensuelTarifFixe(tarif) : null;
    if (e.cycle === "mensuel" && !mensuel) throw new ErreurCotation("Prime mensuelle indisponible pour cette formule.");
    return {
      entrees: e,
      resultat: mensuel
        ? { ...mensuel, periodicite: "mensuel", primeTTCAnnuelle: tarif.prime, nombrePieces: e.nombrePieces, statutOccupation: e.statutOccupation }
        : { nombrePieces: e.nombrePieces, statutOccupation: e.statutOccupation, tarifBase: tarif.prime },
      primeTTC: mensuel ? mensuel.primeTTC : tarif.prime,
      capitalGaranti: tarif.capitalGaranti,
      libelleFormule: `${e.nombrePieces} pièce${e.nombrePieces > 1 ? "s" : ""} · ${e.statutOccupation === "proprietaire" ? "propriétaire" : "locataire"} · ${libellePeriodicite(e.cycle).toLowerCase()}`,
    };
  }

  if (produitCode === "securhome_dommages") {
    const e = entrees as z.infer<typeof entreesSecurhomeDommagesSchema>;
    try {
      const resultat = appliquerPeriodicite(calculerSecurhome(e as SecurhomeInput), e.cycle);
      return {
        entrees: e,
        resultat,
        primeTTC: resultat.primeTTC,
        capitalGaranti: Math.round(resultat.capitauxTotaux),
        libelleFormule: `SecurHome+ · ${e.statutOccupation === "proprietaire" ? "propriétaire" : "locataire"} · ${libellePeriodicite(e.cycle).toLowerCase()}`,
      };
    } catch (err) {
      throw new ErreurCotation(err instanceof Error ? err.message : "Entrées invalides pour SecurHome+.");
    }
  }

  if (produitCode === "securpro_dommages") {
    const e = entrees as z.infer<typeof entreesSecurproDommagesSchema>;
    if (
      !capitalDansListe(e.volCaisseCapital, VOL_CAISSE_CAPITAUX) ||
      !capitalDansListe(e.ddeCapital, DDE_CAPITAUX) ||
      !capitalDansListe(e.deCapital, DE_CAPITAUX) ||
      !capitalDansListe(e.bdgCapital, BDG_CAPITAUX)
    ) {
      throw new ErreurCotation("Capital choisi invalide pour une garantie.");
    }
    const baremeRow = await prisma.baremeSecurpro.findUnique({ where: { classe: e.classe } });
    if (!baremeRow) throw new ErreurCotation("Barème SECURPRO introuvable pour cette classe.");
    // Mode `plafonner` : voir services/tarificationImf.ts::calculerSecurpro.
    const resultatAnnuel = calculerSecurpro(
      e as SecurproInput,
      {
        classe: e.classe,
        limiteCapital: baremeRow.limiteCapital,
        tauxIncendie: baremeRow.tauxIncendie,
      },
      { plafonner: true }
    );
    if (resultatAnnuel.depassementPlafond) {
      throw new ErreurCotation(messageCapitalRefuse(resultatAnnuel));
    }
    const resultat = appliquerPeriodicite(resultatAnnuel, e.cycle);
    return {
      entrees: e,
      resultat,
      primeTTC: resultat.primeTTC,
      capitalGaranti: Math.round(resultat.capitauxTotaux),
      libelleFormule: `SecurPro · classe ${e.classe} · ${libellePeriodicite(e.cycle).toLowerCase()}`,
    };
  }

  // securmoto
  const e = entrees as z.infer<typeof entreesSecurMotoSchema>;
  try {
    const resultat = appliquerPeriodicite(calculerSecurMoto(e as SecurMotoInput), e.cycle);
    return {
      entrees: e,
      resultat,
      primeTTC: resultat.primeTTC,
      capitalGaranti: resultat.capitalGaranti,
      libelleFormule: `SecurMoto · ${e.ageMoto as AgeMoto} · ${libellePeriodicite(e.cycle).toLowerCase()}`,
    };
  } catch (err) {
    throw new ErreurCotation(err instanceof Error ? err.message : "Entrées invalides pour SecurMoto.");
  }
}

/** Une garantie d'un devis, telle qu'affichée au partenaire/agent et au client. */
export interface GarantieCotation {
  libelle: string;
  /** Capital ou plafond garanti, quand il existe. */
  capital?: number;
  /** Prime de la garantie (par période : annuelle ou mensuelle selon le devis), pour les devis à garanties tarifées une à une. */
  prime?: number;
  /** Précision libre (ex. « 3 500 FCFA / jour, 30 jours max »). */
  detail?: string;
}

/**
 * Garanties couvertes par un devis (2026-10-23), relues À LA DEMANDE depuis
 * ce qui est déjà stocké sur la cotation — jamais enregistrées à part, donc
 * toujours cohérentes avec le prix : SecurPro et SecurHome+ listent les lignes
 * réellement facturées (une garantie non choisie n'y figure pas, comme elle
 * n'est pas facturée) ; les autres produits reprennent leurs garanties fixes
 * (mêmes valeurs que leur contrat).
 */
export function garantiesCotation(
  produitCode: string,
  entrees: unknown,
  resultat: unknown,
  capitalGaranti: number
): GarantieCotation[] {
  const e = (entrees ?? {}) as Record<string, unknown>;
  const r = (resultat ?? {}) as {
    lignes?: { garantie: string; capital?: number; prime: number }[];
    optionDeces?: { prime: number; capital: number; dureeMois: number } | null;
    deces?: number;
    fraisSante?: number | null;
    bagages?: string | null;
    tauxPriseEnCharge?: number;
  };

  if (produitCode === "relaxmoto" || produitCode === "relaxauto") {
    const g = GARANTIES_RELAX_MOTO_AUTO[produitCode];
    return [
      {
        libelle: "Indemnité journalière",
        capital: g.indemniteJournaliere,
        detail: `${g.indemniteJournaliere.toLocaleString("fr-FR")} FCFA / jour, ${g.dureeMaxJours} jours max (${g.carenceJours} jours de franchise)`,
      },
      { libelle: "Frais médicaux et pharmaceutiques", capital: g.fraisMedicaux },
      { libelle: "Invalidité permanente totale", capital: g.invaliditePermanenteTotale },
      { libelle: "Décès", capital: g.deces },
    ];
  }
  if (produitCode === "relaxaccidents_fraismedicaux" || produitCode === "relaxaccidents_fraismedicaux_livreurs") {
    return [
      // Le capital garanti de la formule EST son plafond de frais médicaux (500 → 100 000, 1 000 → 250 000).
      { libelle: "Frais médicaux et pharmaceutiques", capital: capitalGaranti },
      ...(r.optionDeces
        ? [{ libelle: `Option Décès (${r.optionDeces.dureeMois} mois)`, capital: r.optionDeces.capital, prime: r.optionDeces.prime }]
        : []),
    ];
  }
  if (produitCode === "relaxvoyage") {
    return [
      { libelle: "Décès / Invalidité permanente totale", capital: r.deces ?? capitalGaranti },
      ...(r.fraisSante ? [{ libelle: "Frais de santé", capital: r.fraisSante }] : []),
      ...(r.bagages ? [{ libelle: "Bagages", detail: r.bagages }] : []),
    ];
  }
  if ((PRODUITS_SANTE as readonly string[]).includes(produitCode)) {
    return [
      ...(r.tauxPriseEnCharge != null ? [{ libelle: "Taux de prise en charge", detail: `${r.tauxPriseEnCharge} %` }] : []),
      ...GARANTIES_SANTE.map((g) => ({ libelle: g.rubrique, detail: g.actes.join(" · ") })),
    ];
  }

  if (produitCode === "securpro_dommages" || produitCode === "securhome_dommages") {
    return (r.lignes ?? []).map((l) => ({
      libelle: l.garantie,
      ...(l.capital ? { capital: l.capital } : {}),
      prime: l.prime,
    }));
  }
  if (produitCode === "securmoto") {
    return [{ libelle: "Dommages accidentels à la moto", capital: capitalGaranti }];
  }
  if (produitCode === "securhome") {
    return [{ libelle: "Incendie / Explosion de l'habitation (montant forfaitaire)", capital: capitalGaranti }];
  }
  if (produitCode === "relaxaccidents") {
    const classe = Number(e.classe) as Classe;
    if (![1, 2, 3, 4].includes(classe)) return [];
    const g = garantiesRelaxAccidentsGenerale(classe);
    const ij = INDEMNITE_JOURNALIERE_RELAXACCIDENTS_GENERALE;
    return [
      // L'indemnité journalière ne concerne que les travailleurs NON déclarés CNPS.
      ...(e.cnpsDeclare === false
        ? [
            {
              libelle: "Indemnité journalière",
              capital: ij.montant,
              detail: `${ij.montant.toLocaleString("fr-FR")} FCFA / jour, ${ij.dureeMaxJours} jours max (${ij.carenceJours} jours de franchise)`,
            },
          ]
        : []),
      { libelle: "Frais médicaux et pharmaceutiques", capital: g.fraisMedicaux },
      { libelle: "Invalidité permanente partielle/totale", capital: g.invaliditePermanenteTotale },
      { libelle: "Décès non accidentel", capital: g.decesNonAccidentel },
      { libelle: "Décès accidentel", capital: g.decesAccidentel },
    ];
  }
  return [];
}

export const LIBELLES_PRODUIT_COTATION: Record<ProduitCotation, string> = {
  relaxaccidents: "RelaxAccidents",
  relaxmoto: "RelaxMoto",
  relaxauto: "RelaxAuto",
  relaxaccidents_fraismedicaux: "RelaxAccidents Frais Médicaux",
  relaxaccidents_fraismedicaux_livreurs: "RelaxAccidents Frais Médicaux Livreurs/MotoTaxis",
  relaxvoyage: "RelaxVoyage",
  sante_solo: "Assurance Santé Solo",
  sante_duo: "Assurance Santé Duo",
  sante_famille: "Assurance Santé Famille",
  securhome: "SecurHome",
  securhome_dommages: "SecurHome+",
  securpro_dommages: "SecurPro",
  securmoto: "SecurMoto",
};

export const DUREE_VALIDITE_JOURS = 7;
