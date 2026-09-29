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
  surchargeMoyenDeplacementRelaxAccidentsGenerale,
  type Classe,
  type CycleRelaxAccidentsGenerale,
} from "./relaxAccidentsGenerale.js";
import { calculerSecurhome, type SecurhomeInput } from "./securhomeDommages.js";
import { calculerSecurMoto, type SecurMotoInput, type AgeMoto } from "./securMoto.js";
import { calculerSecurpro, type SecurproInput } from "./tarificationImf.js";
import { DDE_CAPITAUX, DE_CAPITAUX, BDG_CAPITAUX, VOL_CAISSE_CAPITAUX, capitalDansListe } from "./capitauxDommages.js";

export const PRODUITS_COTATION = ["relaxaccidents", "securhome", "securhome_dommages", "securpro_dommages", "securmoto"] as const;
export type ProduitCotation = (typeof PRODUITS_COTATION)[number];
export function estProduitCotation(p: string): p is ProduitCotation {
  return (PRODUITS_COTATION as readonly string[]).includes(p);
}

/** Erreur métier (message affichable tel quel au partenaire/agent) — distincte d'une erreur de validation zod. */
export class ErreurCotation extends Error {}

const entreesRelaxAccidentsSchema = z.object({
  classe: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cnpsDeclare: z.boolean(),
  cycle: z.enum(["annuel", "mensuel"]),
  moyenDeplacement: z.enum(["voiture", "moto_tricycle", "autres"]),
});

const entreesSecurhomeSchema = z.object({
  nombrePieces: z.number().int().min(1).max(5),
  statutOccupation: z.enum(["proprietaire", "locataire"]),
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
});

const entreesSecurMotoSchema = z.object({
  valeurMoto: z.number().finite().min(1).max(700_000),
  ageMoto: z.enum(["NEUVE", "1 AN", "2 ANS"]),
});

/** Schéma zod des "entrées" (paramètres de tarification) pour un produit couvert par les devis. */
export function schemaEntreesCotation(produitCode: ProduitCotation) {
  switch (produitCode) {
    case "relaxaccidents":
      return entreesRelaxAccidentsSchema;
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
    return {
      entrees: e,
      resultat: { nombrePieces: e.nombrePieces, statutOccupation: e.statutOccupation, tarifBase: tarif.prime },
      primeTTC: tarif.prime,
      capitalGaranti: tarif.capitalGaranti,
      libelleFormule: `${e.nombrePieces} pièce${e.nombrePieces > 1 ? "s" : ""} · ${e.statutOccupation === "proprietaire" ? "propriétaire" : "locataire"}`,
    };
  }

  if (produitCode === "securhome_dommages") {
    const e = entrees as z.infer<typeof entreesSecurhomeDommagesSchema>;
    try {
      const resultat = calculerSecurhome(e as SecurhomeInput);
      return {
        entrees: e,
        resultat,
        primeTTC: resultat.primeTTC,
        capitalGaranti: Math.round(resultat.capitauxTotaux),
        libelleFormule: `SecurHome+ · ${e.statutOccupation === "proprietaire" ? "propriétaire" : "locataire"}`,
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
    const resultat = calculerSecurpro(e as SecurproInput, {
      classe: e.classe,
      limiteCapital: baremeRow.limiteCapital,
      tauxIncendie: baremeRow.tauxIncendie,
    });
    if (resultat.depassementPlafond) {
      throw new ErreurCotation(
        "Les capitaux totaux dépassent le plafond assurable automatiquement pour cette classe de risque."
      );
    }
    return {
      entrees: e,
      resultat,
      primeTTC: resultat.primeTTC,
      capitalGaranti: Math.round(resultat.capitauxTotaux),
      libelleFormule: `SecurPro · classe ${e.classe}`,
    };
  }

  // securmoto
  const e = entrees as z.infer<typeof entreesSecurMotoSchema>;
  try {
    const resultat = calculerSecurMoto(e as SecurMotoInput);
    return {
      entrees: e,
      resultat,
      primeTTC: resultat.primeTTC,
      capitalGaranti: resultat.capitalGaranti,
      libelleFormule: `SecurMoto · ${e.ageMoto as AgeMoto}`,
    };
  } catch (err) {
    throw new ErreurCotation(err instanceof Error ? err.message : "Entrées invalides pour SecurMoto.");
  }
}

export const LIBELLES_PRODUIT_COTATION: Record<ProduitCotation, string> = {
  relaxaccidents: "RelaxAccidents",
  securhome: "SecurHome",
  securhome_dommages: "SecurHome+",
  securpro_dommages: "SecurPro",
  securmoto: "SecurMoto",
};

export const DUREE_VALIDITE_JOURS = 7;
