import { prisma } from "../db.js";
import type { Souscription, TarifProduit } from "@prisma/client";
import { formuleRelaxAccidentsGenerale, surchargeMoyenDeplacementRelaxAccidentsGenerale, type Classe, type CycleRelaxAccidentsGenerale } from "./relaxAccidentsGenerale.js";

/**
 * Aplatit une souscription du modèle générique (RelaxMoto/Auto, RelaxAccidents
 * Frais Médicaux/générale, RelaxVoyage, SecurHome+, SecurPro Dommages) vers un
 * jeu de champs plat couvrant tous les produits — même liste de champs que
 * `GET /public/souscriptions/:produit/:id/contrat` (routes/public.ts), pour
 * que l'admin (page Contrats) puisse générer le même PDF/carte que le client
 * a reçu après paiement, sans dupliquer la logique de désérialisation de
 * `donneesSpecifiques`.
 */
/** Option Décès en supplément de RelaxAccidents Frais Médicaux (voir formuleSchema, routes/public.ts). */
export interface OptionDecesFraisMedicaux {
  capital: number;
  prime: number;
  dureeMois: number;
}

export interface DonneesContratGenerique {
  id: string;
  produit: string;
  produitLibelle: string;
  numeroPolice: string | null;
  montant: number;
  capitalGaranti: number;
  dateDebut: Date | null;
  dateFin: Date | null;
  dateNaissance: Date | null;
  nom: string | null;
  prenom: string | null;
  telephone: string;
  partenaire: string;
  partenaireResponsable: string;
  partenaireLocalisation: string | null;
  waveStatut: string | null;
  createdAt: Date;
  signature: string | null;
  compagnie: string | null;
  lieuDepart: string | null;
  lieuArrivee: string | null;
  numeroTicket: string | null;
  dateDepart: string | null;
  numeroPersonneContact: string | null;
  fraisSante: number | null;
  bagages: string | null;
  optionDeces: OptionDecesFraisMedicaux | null;
  classe: number | null;
  cnpsDeclare: boolean | null;
  cycle: "annuel" | "mensuel" | null;
  moyenDeplacement: string | null;
  // RelaxAccidents générale uniquement — détail de la prime affiché sur le contrat PDF.
  primeHT: number | null;
  fg: number | null;
  taxes: number | null;
  nomCommercial: string | null;
  ville: string | null;
  communeQuartier: string | null;
  refFacture: string | null;
  statutOccupation: "proprietaire" | "locataire" | null;
  valeurBatiment: number | null;
  loyerMensuel: number | null;
  contenu: number | null;
  dansMarche: boolean | null;
  gardien: boolean | null;
  extincteur: boolean | null;
  camera: boolean | null;
  volContenu: boolean | null;
  nombrePieces: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultat: any;
}

type SouscriptionAvecRelations = Souscription & {
  partenaire: { nomCommerce: string; nomResponsable: string; localisation: string | null };
  produit: { code: string; libelle: string };
};

/**
 * `tarifsPreloaded`, quand fourni, évite un aller-retour DB par souscription
 * (findFirst) — indispensable dans une boucle sur toute une liste (page
 * Contrats admin) où ce N+1 devenait la principale cause de lenteur. Absent
 * (cas d'un affichage unitaire, ex. routes/client.ts), la fonction interroge
 * la DB elle-même comme avant.
 */
export async function mapperSouscriptionGenerique(
  s: SouscriptionAvecRelations,
  tarifsPreloaded?: TarifProduit[]
): Promise<DonneesContratGenerique> {
  const d = (s.donneesSpecifiques ?? null) as Record<string, unknown> | null;

  const trouverTarifParPrime = (produitId: string, prime: number) =>
    tarifsPreloaded
      ? tarifsPreloaded.find((t) => t.produitId === produitId && t.prime === prime) ?? null
      : prisma.tarifProduit.findFirst({ where: { produitId, prime } });
  const trouverTarifParVariante = (produitId: string, libelleVariante: string) =>
    tarifsPreloaded
      ? tarifsPreloaded.find((t) => t.produitId === produitId && t.libelleVariante === libelleVariante) ?? null
      : prisma.tarifProduit.findFirst({ where: { produitId, libelleVariante } });

  let fraisSante: number | null = null;
  let bagages: string | null = null;
  if (s.produit.code === "relaxvoyage") {
    const tarif = await trouverTarifParPrime(s.produitId, s.montantPrime);
    const infos = tarif?.donneesSpecifiques as { fraisSante?: number; bagages?: string } | null;
    fraisSante = infos?.fraisSante ?? null;
    bagages = infos?.bagages ?? null;
  }

  // RelaxAccidents générale — tarif fixe (refonte 2026-08-31) : détail de la
  // prime (Prime HT/Accessoires/Taxes) lu depuis TarifProduit, affiché sur le
  // contrat PDF (voir services/contractHtml.ts::renderContratRelaxAccidentsGenerale).
  // Recherché par FORMULE (classe/statut CNPS/périodicité), pas par prime :
  // le montant payé inclut le supplément moto/tricycle éventuel (voir
  // surchargeMoyenDeplacementRelaxAccidentsGenerale), qui ne correspond donc
  // plus au prix d'aucune ligne TarifProduit — le supplément est ajouté ici
  // à l'Accessoires affiché pour que Prime HT + Accessoires + Taxes = Prime TTC.
  let primeHT: number | null = null;
  let fg: number | null = null;
  let taxes: number | null = null;
  const raClasse = typeof d?.classe === "number" ? (d.classe as Classe) : null;
  const raCnpsDeclare = typeof d?.cnpsDeclare === "boolean" ? d.cnpsDeclare : null;
  const raCycle = (d?.cycle as CycleRelaxAccidentsGenerale | undefined) ?? null;
  const raMoyenDeplacement = typeof d?.moyenDeplacement === "string" ? d.moyenDeplacement : null;
  if (s.produit.code === "relaxaccidents" && raClasse && raCnpsDeclare != null && raCycle) {
    const tarif = await trouverTarifParVariante(s.produitId, formuleRelaxAccidentsGenerale(raClasse, raCnpsDeclare, raCycle));
    primeHT = tarif?.primeHT ?? null;
    taxes = tarif?.taxes ?? null;
    fg = tarif != null ? (tarif.fg ?? 0) + surchargeMoyenDeplacementRelaxAccidentsGenerale(raMoyenDeplacement, raCycle) : null;
  }

  const str = (k: string) => (typeof d?.[k] === "string" ? (d[k] as string) : null);
  const num = (k: string) => (typeof d?.[k] === "number" ? (d[k] as number) : null);
  const bool = (k: string) => (typeof d?.[k] === "boolean" ? (d[k] as boolean) : null);

  // Option Décès en supplément de RelaxAccidents Frais Médicaux — voir
  // formuleSchema (routes/public.ts), qui la stocke sous cette même forme.
  const optionDecesRaw = d?.optionDeces as Partial<OptionDecesFraisMedicaux> | null | undefined;
  const optionDeces: OptionDecesFraisMedicaux | null =
    optionDecesRaw && typeof optionDecesRaw.capital === "number"
      ? {
          capital: optionDecesRaw.capital,
          prime: typeof optionDecesRaw.prime === "number" ? optionDecesRaw.prime : 0,
          dureeMois: typeof optionDecesRaw.dureeMois === "number" ? optionDecesRaw.dureeMois : 2,
        }
      : null;

  return {
    id: s.id,
    produit: s.produit.code,
    produitLibelle: s.produit.libelle,
    numeroPolice: s.numeroPolice,
    montant: s.montantPrime,
    capitalGaranti: s.capitalGaranti,
    dateDebut: s.dateDebut,
    dateFin: s.dateFin,
    dateNaissance: s.dateNaissance,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    partenaire: s.partenaire.nomCommerce,
    partenaireResponsable: s.partenaire.nomResponsable,
    partenaireLocalisation: s.partenaire.localisation,
    waveStatut: s.waveStatut,
    createdAt: s.createdAt,
    signature: str("signature"),
    compagnie: str("compagnie"),
    lieuDepart: str("lieuDepart"),
    lieuArrivee: str("lieuArrivee"),
    numeroTicket: str("numeroTicket"),
    dateDepart: str("dateDepart"),
    numeroPersonneContact: str("numeroPersonneContact"),
    fraisSante,
    bagages,
    optionDeces,
    classe: num("classe"),
    cnpsDeclare: bool("cnpsDeclare"),
    cycle: raCycle,
    moyenDeplacement: raMoyenDeplacement,
    primeHT,
    fg,
    taxes,
    nomCommercial: str("nomCommercial"),
    ville: str("ville"),
    communeQuartier: str("communeQuartier"),
    refFacture: str("refFacture"),
    statutOccupation: (d?.statutOccupation as "proprietaire" | "locataire" | undefined) ?? null,
    valeurBatiment: num("valeurBatiment"),
    loyerMensuel: num("loyerMensuel"),
    contenu: num("contenu"),
    dansMarche: bool("dansMarche"),
    gardien: bool("gardien"),
    extincteur: bool("extincteur"),
    camera: bool("camera"),
    volContenu: bool("volContenu"),
    nombrePieces: num("nombrePieces"),
    resultat: s.resultat ?? null,
  };
}
