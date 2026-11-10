// Choix de la formule au renouvellement, depuis l'espace client (refonte du 2026-11-10).
//
// Un produit qui propose deux formules laisse le client choisir celle de sa prochaine période :
//   - RelaxAccidents Frais Médicaux (grand public et Livreurs/MotoTaxis) : 1 000 F ou 500 F ;
//   - RelaxMoto / RelaxAuto : mensuelle ou annuelle.
// Les autres produits se renouvellent à l'identique, comme avant.
//
// La formule choisie est portée par le paiement de renouvellement (`Paiement.formuleRenouvellement`)
// et n'est appliquée à la souscription qu'À LA CONFIRMATION du paiement (paiementWave.ts) : un
// renouvellement abandonné ne change rien au contrat en cours.

import type { Souscription } from "@prisma/client";
import { prisma } from "../db.js";
import { capitalDecesDuTarif, estProduitRaf } from "./garantieDecesFraisMedicaux.js";

type SouscriptionAvecProduit = Souscription & { produit: { code: string } };

export interface OptionRenouvellement {
  /** Clé envoyée au serveur (= `TarifProduit.libelleVariante`). */
  formule: string;
  libelle: string;
  /** Montant à payer pour renouveler avec cette formule. */
  montant: number;
  details: string[];
}

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

function estRelaxMotoAuto(code: string): boolean {
  return code === "relaxmoto" || code === "relaxauto";
}

/** Ce produit propose-t-il le choix de la formule au renouvellement ? */
export function produitAChoixDeFormule(code: string): boolean {
  return estProduitRaf(code) || estRelaxMotoAuto(code);
}

/** Formules proposées au renouvellement, et celle du contrat en cours (`null` si elle n'est plus au barème). */
export async function optionsRenouvellement(
  s: SouscriptionAvecProduit
): Promise<{ options: OptionRenouvellement[]; formuleActuelle: string | null }> {
  if (!produitAChoixDeFormule(s.produit.code)) return { options: [], formuleActuelle: null };

  const tarifs = await prisma.tarifProduit.findMany({ where: { produitId: s.produitId }, orderBy: { prime: "desc" } });

  if (estProduitRaf(s.produit.code)) {
    const options = tarifs
      .filter((t) => t.libelleVariante)
      .map((t) => {
        const deces = capitalDecesDuTarif(t);
        return {
          formule: t.libelleVariante!,
          libelle: fcfa(t.prime),
          montant: t.prime,
          details: [`Frais médicaux : ${fcfa(t.capitalGaranti)}`, ...(deces ? [`Décès : ${fcfa(deces)}`] : [])],
        };
      });
    // Contrat d'avant le 2026-10-30 : sa prime pouvait inclure l'ancienne option Décès — formule = prix de base le plus proche en dessous.
    const actuelle = tarifs.find((t) => t.prime === s.montantPrime) ?? tarifs.find((t) => t.prime < s.montantPrime) ?? null;
    return { options, formuleActuelle: actuelle?.libelleVariante ?? null };
  }

  const options = tarifs
    .filter((t) => t.libelleVariante === "mensuel" || t.libelleVariante === "annuel")
    .sort((a, b) => a.prime - b.prime)
    .map((t) => {
      const cycle = t.libelleVariante as "mensuel" | "annuel";
      // Même cycle que le contrat : on reconduit le nombre de périodes ; un changement de cycle repart sur une période.
      const periodes = cycle === s.cycleFacturation ? s.nombrePeriodes : 1;
      const unite = cycle === "mensuel" ? "mois" : periodes > 1 ? "ans" : "an";
      return {
        formule: cycle,
        libelle: cycle === "mensuel" ? "Mensuelle" : "Annuelle",
        montant: t.prime * periodes,
        details: [`${fcfa(t.prime)} par ${cycle === "mensuel" ? "mois" : "an"}`, `Couverture de ${periodes} ${unite}`],
      };
    });
  return { options, formuleActuelle: s.cycleFacturation };
}

/**
 * Applique la formule choisie à la souscription (à la confirmation du paiement de renouvellement).
 * Renvoie `changee` : la formule diffère de celle du contrat en cours — le renouvellement repart alors
 * sur une police neuve (garanties différentes, code d'offre NOVELIA différent).
 */
export async function appliquerFormuleRenouvellement(
  s: SouscriptionAvecProduit,
  formule: string
): Promise<{ changee: boolean }> {
  const tarif = await prisma.tarifProduit.findFirst({ where: { produitId: s.produitId, libelleVariante: formule } });
  if (!tarif) throw new Error(`Formule de renouvellement « ${formule} » introuvable pour ${s.produit.code}.`);

  if (estProduitRaf(s.produit.code)) {
    const changee = tarif.capitalGaranti !== s.capitalGaranti || tarif.prime !== s.montantPrime;
    // L'ancienne option Décès (contrats d'avant le 2026-10-30) ne se reconduit pas : le Décès est inclus dans la formule.
    const { optionDeces: _ancienneOption, ...reste } = (s.donneesSpecifiques ?? {}) as Record<string, unknown>;
    const capitalDeces = capitalDecesDuTarif(tarif);
    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        capitalGaranti: tarif.capitalGaranti,
        montantPrime: tarif.prime,
        donneesSpecifiques: { ...reste, ...(capitalDeces ? { garantieDeces: { capital: capitalDeces } } : {}) },
      },
    });
    return { changee };
  }

  // RelaxMoto / RelaxAuto : la formule est le cycle de facturation.
  const changee = s.cycleFacturation !== formule;
  const nombrePeriodes = changee ? 1 : s.nombrePeriodes;
  await prisma.souscription.update({
    where: { id: s.id },
    data: {
      cycleFacturation: formule as "mensuel" | "annuel",
      nombrePeriodes,
      montantPrime: tarif.prime * nombrePeriodes,
      capitalGaranti: tarif.capitalGaranti,
    },
  });
  return { changee };
}
