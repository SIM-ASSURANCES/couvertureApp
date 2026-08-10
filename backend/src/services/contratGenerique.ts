import { prisma } from "../db.js";
import type { Souscription } from "@prisma/client";

/**
 * Aplatit une souscription du modèle générique (RelaxMoto/Auto, RelaxAccidents
 * Frais Médicaux/générale, RelaxVoyage, SecurHome+, SecurPro Dommages) vers un
 * jeu de champs plat couvrant tous les produits — même liste de champs que
 * `GET /public/souscriptions/:produit/:id/contrat` (routes/public.ts), pour
 * que l'admin (page Contrats) puisse générer le même PDF/carte que le client
 * a reçu après paiement, sans dupliquer la logique de désérialisation de
 * `donneesSpecifiques`.
 */
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
  raisonSociale: string | null;
  profession: string | null;
  classe: number | null;
  typeCouverture: string | null;
  effectif: number | null;
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

export async function mapperSouscriptionGenerique(
  s: SouscriptionAvecRelations
): Promise<DonneesContratGenerique> {
  const d = (s.donneesSpecifiques ?? null) as Record<string, unknown> | null;

  let fraisSante: number | null = null;
  let bagages: string | null = null;
  if (s.produit.code === "relaxvoyage") {
    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: s.produitId, prime: s.montantPrime },
    });
    const infos = tarif?.donneesSpecifiques as { fraisSante?: number; bagages?: string } | null;
    fraisSante = infos?.fraisSante ?? null;
    bagages = infos?.bagages ?? null;
  }

  const str = (k: string) => (typeof d?.[k] === "string" ? (d[k] as string) : null);
  const num = (k: string) => (typeof d?.[k] === "number" ? (d[k] as number) : null);
  const bool = (k: string) => (typeof d?.[k] === "boolean" ? (d[k] as boolean) : null);

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
    raisonSociale: str("raisonSociale"),
    profession: str("profession"),
    classe: num("classe"),
    typeCouverture: str("typeCouverture"),
    effectif: num("effectif"),
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
