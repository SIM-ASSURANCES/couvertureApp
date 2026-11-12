import { prisma } from "../db.js";
import type { ProduitCotation, ResultatCotation } from "./cotations.js";

// =====================================================================
// Construction de `Souscription.donneesSpecifiques` et de `Souscription.resultat` pour les
// produits dont la prime sort du moteur de devis (services/cotations.ts).
//
// Extrait de routes/public.ts (conversion d'un devis, 2026-10) pour que le site public ET l'API
// partenaire (POST /api/partner/v1/souscriptions) écrivent exactement la même forme de données :
// c'est ce que relisent ensuite le contrat PDF, la carte de prise en charge et la facture.
// =====================================================================

/** Champs saisis par le souscripteur qui entrent dans `donneesSpecifiques` selon le produit. */
export interface ChampsSouscripteur {
  nom: string;
  prenom: string;
  signature?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  refFacture?: string | null;
  nomCommercial?: string | null;
  // RelaxVoyage — trajet déclaré.
  typePiece?: string | null;
  compagnie?: string;
  lieuDepart?: string;
  lieuArrivee?: string;
  numeroTicket?: string;
  dateDepart?: Date;
  numeroPersonneContact?: string;
}

/** Garantie Décès chiffrée par un devis RelaxAccidents Frais Médicaux (voir ResultatCotation.resultat). */
export interface ResultatDevisDeces {
  capitalDeces?: number | null;
  // Devis d'avant le 2026-10-30 : option Décès facultative, honorée telle que chiffrée.
  optionDeces?: { prime: number; capital: number; dureeMois: number } | null;
}

/**
 * `donneesSpecifiques` d'une souscription issue d'un devis. `entrees` = paramètres de tarification
 * du devis (jamais saisis par le client) ; `resultat` = résultat du devis. Les produits Santé ne
 * passent pas ici : leur demande a sa propre forme (fiche, questionnaire…), voir routes/public.ts
 * et routes/partnerApi.ts.
 */
export function construireDonneesSpecifiques(
  code: ProduitCotation,
  entrees: Record<string, unknown>,
  resultat: unknown,
  champs: ChampsSouscripteur
): Record<string, unknown> {
  const resultatDevis = (resultat ?? {}) as ResultatDevisDeces;
  const signature = champs.signature ?? null;

  if (code === "relaxmoto" || code === "relaxauto") return { signature };

  if (code === "relaxaccidents_fraismedicaux" || code === "relaxaccidents_fraismedicaux_livreurs") {
    return {
      signature,
      // Garantie Décès incluse dans la formule chiffrée par le devis (2026-10-30), ou, pour un
      // devis plus ancien, l'option Décès facultative qu'il avait chiffrée.
      ...(resultatDevis.capitalDeces ? { garantieDeces: { capital: resultatDevis.capitalDeces } } : {}),
      ...(resultatDevis.optionDeces
        ? { ...(code === "relaxaccidents_fraismedicaux" ? { declarePasLivreur: true } : {}), optionDeces: resultatDevis.optionDeces }
        : {}),
    };
  }

  if (code === "relaxvoyage") {
    return {
      signature,
      typePiece: champs.typePiece ?? null,
      compagnie: champs.compagnie,
      lieuDepart: champs.lieuDepart,
      lieuArrivee: champs.lieuArrivee,
      numeroTicket: champs.numeroTicket,
      dateDepart: champs.dateDepart,
      numeroPersonneContact: champs.numeroPersonneContact,
    };
  }

  if (code === "relaxaccidents") {
    return {
      signature,
      classe: entrees.classe,
      cnpsDeclare: entrees.cnpsDeclare,
      cycle: entrees.cycle,
      moyenDeplacement: entrees.moyenDeplacement,
    };
  }

  if (code === "securhome") {
    return {
      signature,
      nombrePieces: entrees.nombrePieces,
      statutOccupation: entrees.statutOccupation,
      cycle: entrees.cycle ?? "annuel",
    };
  }

  if (code === "securhome_dommages") {
    return {
      signature,
      nom: champs.nom,
      prenom: champs.prenom,
      ville: champs.ville ?? null,
      communeQuartier: champs.communeQuartier ?? null,
      refFacture: champs.refFacture ?? null,
      ...entrees,
    };
  }

  if (code === "securpro_dommages") {
    return {
      signature,
      nom: champs.nom,
      prenom: champs.prenom,
      nomCommercial: champs.nomCommercial ?? null,
      ville: champs.ville ?? null,
      communeQuartier: champs.communeQuartier ?? null,
      refFacture: champs.refFacture ?? null,
      ...entrees,
    };
  }

  // securmoto (les produits Santé n'arrivent jamais ici).
  return {
    signature,
    nom: champs.nom,
    prenom: champs.prenom,
    valeurMoto: entrees.valeurMoto,
    ageMoto: entrees.ageMoto,
    cycle: entrees.cycle ?? "annuel",
  };
}

/**
 * `Souscription.resultat` à enregistrer : le détail du devis pour les produits calculés, rien pour
 * ceux dont la prime se retrouve par la formule (tarif lu en base). SecurHome annuel : détail lu
 * dans le barème ; mensuel : le devis porte le détail de la prime mensuelle, conservé tel quel.
 */
export function resultatAStocker(code: ProduitCotation, entrees: Record<string, unknown>, resultat: unknown): object | undefined {
  const tarifLuEnBase =
    ["relaxaccidents", "relaxmoto", "relaxauto", "relaxaccidents_fraismedicaux", "relaxaccidents_fraismedicaux_livreurs", "relaxvoyage"].includes(code) ||
    (code === "securhome" && entrees.cycle !== "mensuel") ||
    code.startsWith("sante_");
  return tarifLuEnBase ? undefined : JSON.parse(JSON.stringify(resultat));
}

/**
 * Prime NETTE (hors accessoires et taxes) d'un devis calculé — base de la commission « canal API ».
 * Mêmes sources que la commission des autres canaux (services/commission.ts) : le détail du devis
 * (`primeNetteHT2 ?? primeNetteHT`) pour les produits calculés, la ligne de barème (`primeHT`, repli
 * sur le TTC) pour les produits à tarif fixe — majorée du supplément moto/tricycle de RelaxAccidents.
 */
export async function primeNetteDuDevis(code: ProduitCotation, calcul: ResultatCotation): Promise<number> {
  const r = (calcul.resultat ?? {}) as { primeNetteHT2?: number; primeNetteHT?: number; formule?: string; surchargeMoyenDeplacement?: number };
  const nette = r.primeNetteHT2 ?? r.primeNetteHT;
  if (typeof nette === "number" && Number.isFinite(nette)) return Math.round(nette);

  const e = calcul.entrees as { formule?: string; nombrePieces?: number };
  const libelle = code === "relaxaccidents" ? r.formule : code === "securhome" ? String(e.nombrePieces ?? "") : e.formule;
  if (libelle) {
    const produit = await prisma.produit.findUnique({ where: { code }, select: { id: true } });
    const tarif = produit
      ? await prisma.tarifProduit.findFirst({ where: { produitId: produit.id, libelleVariante: libelle }, select: { prime: true, primeHT: true } })
      : null;
    if (tarif) return Math.round((tarif.primeHT ?? tarif.prime) + (r.surchargeMoyenDeplacement ?? 0));
  }
  return calcul.primeTTC;
}
