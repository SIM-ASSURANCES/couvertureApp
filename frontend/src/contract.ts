// Génération des contrats (Conditions Particulières + Conditions Générales).
// Le rendu HTML → PDF se fait côté serveur (POST /contrats/pdf, voir
// backend/src/services/contractHtml.ts + services/pdf.ts) afin d'obtenir un
// vrai PDF texte (sélectionnable/copiable), pas une image du contrat.
// Ce module ne fait plus que préparer les données et déclencher le
// téléchargement du fichier renvoyé par l'API.

import { API_BASE } from "./api";
import type { SouscriptionImf } from "./types";

export interface LigneGarantie {
  garantie: string;
  capital?: number;
  prime: number;
}

export interface ContratIncendie {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  refFacture?: string | null;
  ville?: string | null;
  commune?: string | null;
  quartier?: string | null;
  numeroMaison?: string | null;
  montant: number;
  capitalGaranti: number;
  signature?: string | null;
}

export interface ContratAccident {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  dateNaissance?: string | null;
  montant: number;
  capitalGaranti: number;
  signature?: string | null;
  // RelaxAccidents Frais Médicaux uniquement — option Décès facultative.
  optionDeces?: { capital: number; prime: number; dureeMois: number } | null;
}

/** RelaxMoto / RelaxAuto — abonnements reconductibles, d'où le cycle en plus. */
export interface ContratRelaxMotoAuto {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  dateNaissance?: string | null;
  montant: number;
  capitalGaranti: number;
  produitLibelle: string;
  cycleFacturation?: "mensuel" | "annuel" | null;
  signature?: string | null;
}

export interface ContratRelaxVoyage {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  dateNaissance?: string | null;
  compagnie?: string | null;
  lieuDepart?: string | null;
  lieuArrivee?: string | null;
  numeroTicket?: string | null;
  dateDepart?: string | null;
  numeroPersonneContact?: string | null;
  montant: number;
  capitalGaranti: number;
  fraisSante?: number | null;
  bagages?: string | null;
  signature?: string | null;
}

export interface ContratRelaxAccidentsGenerale {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  dateNaissance?: string | null;
  montant: number;
  primeHT?: number | null;
  accessoires?: number | null;
  taxes?: number | null;
  classe: 1 | 2 | 3 | 4;
  cnpsDeclare: boolean;
  cycle?: "annuel" | "mensuel" | null;
  signature?: string | null;
}

export interface ContratSecurhome {
  numeroPolice: string;
  partenaire: string;
  dateDebut: string;
  dateFin: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  ville?: string | null;
  communeQuartier?: string | null;
  referenceCIE?: string | null;
  nombrePieces?: number | null;
  statutOccupation: "proprietaire" | "locataire";
  valeurBatimentOuLoyer: number;
  contenu: number;
  lignes: LigneGarantie[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  signature?: string | null;
}

export interface ContratSecurpro {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  nomCommercial?: string | null;
  referenceCIE?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  classeLabel: string;
  statutOccupation: "proprietaire" | "locataire";
  valeurBatimentOuLoyer: number;
  contenu: number;
  dansMarche: boolean;
  lignes: LigneGarantie[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  signature?: string | null;
}

export interface ContratSecurstock {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  classeLabel: string;
  localisationLabel: string;
  montantStock: number;
  capitalRetenu: number;
  lignes: LigneGarantie[];
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
  signature?: string | null;
}

export interface ContratSecurecolte {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  montantPack: number;
  valeurPackage?: number | null;
  superficieHa?: number | null;
  capitaux?: { label: string; montant: number }[];
  signature?: string | null;
}

export interface SanteCoupsdurs {
  taille?: number;
  poids?: number;
  fumeur?: boolean;
  cigarettesParJour?: number;
  sportif?: boolean;
  sportifNiveau?: "amateur" | "professionnel";
  infirmite?: boolean;
  infirmiteTaux?: string;
  infirmiteNature?: string;
  maladieRecente?: boolean;
  maladieRecentePrecisions?: string;
  touxFievre?: boolean;
  diarrheeFrequente?: boolean;
  transfusion?: boolean;
  enceinte?: boolean;
  affections?: string[];
  affectionsPrecisions?: string;
}

export interface BeneficiaireCoupsdurs {
  nom: string;
  contact: string;
  lien: string;
  pourcentage: number;
}

export interface LigneCoupsdurs {
  cle: string;
  garantieLabel: string;
  capital: number;
  prime: number;
}

export interface ContratCoupsdurs {
  numeroPolice: string;
  intermediaire: string;
  dateDebut: string;
  dateFin: string;
  dateSouscription: string;
  nom?: string | null;
  prenom?: string | null;
  telephone: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  // Une police COUPS DURS peut combiner plusieurs garanties (Maladie
  // toujours incluse, Décès et/ou Incapacité en options) — chaque garantie
  // retenue a sa propre ligne (capital + prime). Les polices émises avant la
  // fusion des produits n'ont qu'une seule ligne.
  lignes: LigneCoupsdurs[];
  primeTTC: number;
  sante?: SanteCoupsdurs | null;
  beneficiaires?: BeneficiaireCoupsdurs[] | null;
  signature?: string | null;
}

const SECURPRO_CLASSE_LABELS: Record<number, string> = {
  1: "Classe 1 — Bureau",
  2: "Classe 2 — Supérette / boutique de quartier, épicerie, salon de coiffure-beauté / couture, commerce de produits alimentaires",
  3: "Classe 3 — Pressing, pharmacie / dépôt, commerce d'électronique, petite fabrique alimentaire, buvette / restaurant, artisan métal, pâtisserie / boulangerie",
  4: "Classe 4 — Tissus / habillement, meubles, mèches & accessoires de coiffure, quincaillerie, jouets / plastique, librairie / papeterie, tapisserie / bois, cordonnier, réparation d'électroménager",
};

// Tous les produits Assurances Accidents/Dommages disposent désormais d'un
// contrat PDF (conditions particulières + conditions générales), y compris
// RelaxMoto/RelaxAuto qui n'avaient qu'une carte. Conservé (vide) parce que
// la liste reste le point d'extension naturel si un produit devait à nouveau
// n'être servi que par une carte.
export const TYPES_SANS_CONTRAT_TELECHARGEABLE = [] as const;

/**
 * Champs aplatis d'un contrat (Assurances Accidents/Dommages), quel que soit
 * le produit — même format renvoyé par `GET /souscriptions/contrats` (admin,
 * backend/src/routes/souscriptions.ts) et `GET /client/contrat` (espace
 * client, backend/src/routes/client.ts), pour que les deux réutilisent
 * exactement le même transformateur ci-dessous.
 */
export interface DonneesContrat {
  id: string;
  type: string;
  numeroPolice: string;
  nom: string;
  prenom: string;
  telephone: string;
  montant: number;
  capitalGaranti: number;
  partenaire: string;
  partenaireResponsable?: string | null;
  partenaireLocalisation?: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  date: string;
  refFacture?: string | null;
  commune?: string | null;
  quartier?: string | null;
  numeroMaison?: string | null;
  dateNaissance?: string | null;
  signature?: string | null;
  produitLibelle?: string;
  /** RelaxMoto/RelaxAuto uniquement (abonnements reconductibles). */
  cycleFacturation?: "mensuel" | "annuel" | null;
  compagnie?: string | null;
  lieuDepart?: string | null;
  lieuArrivee?: string | null;
  numeroTicket?: string | null;
  dateDepart?: string | null;
  numeroPersonneContact?: string | null;
  fraisSante?: number | null;
  bagages?: string | null;
  optionDeces?: { capital: number; prime: number; dureeMois: number } | null;
  classe?: number | null;
  cnpsDeclare?: boolean | null;
  cycle?: "annuel" | "mensuel" | null;
  // RelaxAccidents générale uniquement — détail de la prime affiché sur le contrat PDF.
  primeHT?: number | null;
  fg?: number | null;
  taxes?: number | null;
  nomCommercial?: string | null;
  ville?: string | null;
  communeQuartier?: string | null;
  statutOccupation?: "proprietaire" | "locataire" | null;
  valeurBatiment?: number | null;
  loyerMensuel?: number | null;
  contenu?: number | null;
  dansMarche?: boolean | null;
  nombrePieces?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultat?: any;
}

/** Génère (et télécharge) le contrat PDF adapté au produit — ou la carte pour RelaxMoto/Auto, qui n'ont pas de contrat séparé. */
export function genererContratDepuisDonnees(c: DonneesContrat): void {
  const debut = c.dateDebut ?? c.date;
  const fin =
    c.dateFin ??
    new Date(
      new Date(c.date).setMonth(new Date(c.date).getMonth() + (c.type === "accident" ? 3 : 12))
    ).toISOString();

  if (c.type === "relaxmoto" || c.type === "relaxauto") {
    genererContratRelaxMotoAuto({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      produitLibelle: c.produitLibelle ?? (c.type === "relaxmoto" ? "RelaxMoto" : "RelaxAuto"),
      cycleFacturation: c.cycleFacturation ?? null,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "accident") {
    genererContratAccident({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "incendie") {
    genererContratIncendie({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      refFacture: c.refFacture ?? null,
      commune: c.commune ?? null,
      quartier: c.quartier ?? null,
      numeroMaison: c.numeroMaison ?? null,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "relaxaccidents_fraismedicaux") {
    genererContratRelaxAccidentsFraisMedicaux({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      signature: c.signature ?? null,
      optionDeces: c.optionDeces ?? null,
    });
    return;
  }
  if (c.type === "relaxvoyage") {
    genererContratRelaxVoyage({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      compagnie: c.compagnie ?? null,
      lieuDepart: c.lieuDepart ?? null,
      lieuArrivee: c.lieuArrivee ?? null,
      numeroTicket: c.numeroTicket ?? null,
      dateDepart: c.dateDepart ?? null,
      numeroPersonneContact: c.numeroPersonneContact ?? null,
      montant: c.montant,
      capitalGaranti: c.capitalGaranti,
      fraisSante: c.fraisSante ?? null,
      bagages: c.bagages ?? null,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "relaxaccidents") {
    genererContratRelaxAccidentsGenerale({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateNaissance: c.dateNaissance ?? null,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      montant: c.montant,
      primeHT: c.primeHT ?? null,
      accessoires: c.fg ?? null,
      taxes: c.taxes ?? null,
      classe: (c.classe ?? 1) as 1 | 2 | 3 | 4,
      cnpsDeclare: c.cnpsDeclare ?? false,
      cycle: c.cycle ?? null,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "securhome_dommages") {
    const r = c.resultat ?? {};
    const statutFinal = c.statutOccupation ?? "proprietaire";
    genererContratSecurhome({
      numeroPolice: c.numeroPolice,
      partenaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      ville: c.ville ?? null,
      communeQuartier: c.communeQuartier ?? null,
      referenceCIE: c.refFacture ?? null,
      nombrePieces: c.nombrePieces ?? null,
      statutOccupation: statutFinal,
      valeurBatimentOuLoyer: statutFinal === "locataire" ? c.loyerMensuel ?? 0 : c.valeurBatiment ?? 0,
      contenu: c.contenu ?? 0,
      lignes: r.lignes ?? [],
      primeNetteHT: r.primeNetteHT ?? 0,
      accessoires: r.accessoires ?? 0,
      taxes: r.taxes ?? 0,
      primeTTC: r.primeTTC ?? c.montant,
      signature: c.signature ?? null,
    });
    return;
  }
  if (c.type === "securpro_dommages") {
    const r = c.resultat ?? {};
    const statutFinal = c.statutOccupation ?? "proprietaire";
    genererContratSecurproDommages({
      numeroPolice: c.numeroPolice,
      intermediaire: c.partenaire,
      dateDebut: debut,
      dateFin: fin,
      dateSouscription: c.date,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone,
      nomCommercial: c.nomCommercial ?? null,
      referenceCIE: c.refFacture ?? null,
      ville: c.ville ?? null,
      communeQuartier: c.communeQuartier ?? null,
      classeLabel: c.classe ? SECURPRO_CLASSE_LABELS[c.classe] ?? `Classe ${c.classe}` : "—",
      statutOccupation: statutFinal,
      valeurBatimentOuLoyer: statutFinal === "locataire" ? c.loyerMensuel ?? 0 : c.valeurBatiment ?? 0,
      contenu: c.contenu ?? 0,
      dansMarche: !!c.dansMarche,
      lignes: r.lignes ?? [],
      primeNetteHT: r.primeNetteHT ?? 0,
      accessoires: r.accessoires ?? 0,
      taxes: r.taxes ?? 0,
      primeTTC: r.primeTTC ?? c.montant,
      signature: c.signature ?? null,
    });
  }
}

/** true si un contrat PDF est disponible pour ce produit IMF. */
export function contratImfDisponible(produitCode: string): boolean {
  return [
    "securpro", "securstock", "securecolte", "coupsdurs", "coupsdurs_classique", "coupsdurs_incapacite",
  ].includes(produitCode);
}

/** Génère et télécharge le contrat PDF adapté au produit d'une souscription IMF. */
export function genererContratImf(s: SouscriptionImf): void {
  if (s.produitCode === "securpro") genererContratSecurpro(souscriptionImfToContratSecurpro(s));
  else if (s.produitCode === "securstock") genererContratSecurstock(souscriptionImfToContratSecurstock(s));
  else if (s.produitCode === "securecolte") genererContratSecurecolte(souscriptionImfToContratSecurecolte(s));
  else if (s.produitCode === "coupsdurs" || s.produitCode === "coupsdurs_classique" || s.produitCode === "coupsdurs_incapacite")
    genererContratCoupsdurs(souscriptionImfToContratCoupsdurs(s));
}

const SECURSTOCK_CLASSE_LABELS: Record<number, string> = {
  1: "Classe 1 — Produits très peu inflammables (métaux, verre, céramique, électroménager, plastiques rigides)",
  2: "Classe 2 — Produits à combustion lente (bois, papier, cartons, vêtements, chaussures, alimentaire sec)",
  3: "Classe 3 — Produits inflammables usuels (produits de beauté, ménagers, plastiques souples, électronique à batterie)",
  4: "Classe 4 — Produits fortement inflammables (parfums en gros, peintures, solvants, tissus denses, mousse)",
};

const SECURSTOCK_LOCALISATION_LABELS: Record<string, string> = {
  hors_marche: "Hors d'un marché",
  abords_marche: "Abords d'un marché",
  marche_zone_industrielle: "Dans un marché / zone industrielle",
};

const COUPSDURS_VARIANTE_LABELS: Record<string, string> = {
  maladie: "Maladie Coups Durs",
  deces: "Décès suite à Coups Durs",
  plafond_500000: "Incapacité temporaire de l'emprunteur — plafond 500 000",
  plafond_1000000: "Incapacité temporaire de l'emprunteur — plafond 1 000 000",
};

// Les libellés de classe de risque (Simulateur) détaillent des exemples entre
// parenthèses, utiles à la saisie mais superflus sur le contrat imprimé.
const sansParentheses = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();

/** Reconstitue les champs du contrat COUPS DURS à partir d'une souscription IMF (produit catalogue). */
export function souscriptionImfToContratCoupsdurs(s: SouscriptionImf): ContratCoupsdurs {
  const entrees = s.entrees as {
    libelleVariante?: string;
    deces?: boolean;
    incapacite?: string | null;
    sante?: SanteCoupsdurs;
    beneficiaires?: BeneficiaireCoupsdurs[];
  };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);

  let lignes: LigneCoupsdurs[];
  if (s.produitCode === "coupsdurs") {
    // Produit fusionné : une ou plusieurs garanties combinées (Maladie
    // toujours incluse), reconstituées dans le même ordre que le serveur.
    const resultat = s.resultat as { lignes?: { capital: number; prime: number }[] };
    const cles = ["maladie", ...(entrees.deces ? ["deces"] : []), ...(entrees.incapacite ? [entrees.incapacite] : [])];
    lignes = cles.map((cle, i) => ({
      cle,
      garantieLabel: COUPSDURS_VARIANTE_LABELS[cle] ?? cle,
      capital: resultat.lignes?.[i]?.capital ?? 0,
      prime: resultat.lignes?.[i]?.prime ?? 0,
    }));
  } else {
    // Polices émises avant la fusion des produits : une seule garantie.
    const resultat = s.resultat as { capitalGaranti?: number; prime?: number };
    const variante = entrees.libelleVariante ?? "—";
    lignes = [{
      cle: variante,
      garantieLabel: COUPSDURS_VARIANTE_LABELS[variante] ?? variante,
      capital: resultat.capitalGaranti ?? 0,
      prime: resultat.prime ?? s.primeTTC,
    }];
  }

  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    lignes,
    primeTTC: s.primeTTC,
    sante: entrees.sante ?? null,
    beneficiaires: entrees.beneficiaires ?? null,
    signature: s.signature ?? null,
  };
}

/** Reconstitue les champs du contrat SECURECOLTE à partir d'une souscription IMF (produit catalogue). */
export function souscriptionImfToContratSecurecolte(s: SouscriptionImf): ContratSecurecolte {
  const entrees = s.entrees as { valeurPackage?: number; superficieHa?: number };
  const resultat = s.resultat as {
    capitalFaible?: number;
    capitalMoyenne?: number;
    capitalForte?: number;
    capitalDeces?: number;
  };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);
  const capitaux =
    resultat.capitalFaible !== undefined
      ? [
          { label: "Faible sécheresse (20%)", montant: resultat.capitalFaible },
          { label: "Moyenne sécheresse (50%)", montant: resultat.capitalMoyenne ?? 0 },
          { label: "Forte sécheresse (100%)", montant: resultat.capitalForte ?? 0 },
          { label: "Décès de l'agriculteur (100%)", montant: resultat.capitalDeces ?? 0 },
        ]
      : undefined;
  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    montantPack: s.primeTTC,
    valeurPackage: entrees.valeurPackage ?? null,
    superficieHa: entrees.superficieHa ?? null,
    capitaux,
    signature: s.signature ?? null,
  };
}

/** Reconstitue les champs du contrat SECURSTOCK à partir d'une souscription IMF. */
export function souscriptionImfToContratSecurstock(s: SouscriptionImf): ContratSecurstock {
  const entrees = s.entrees as { classe?: number; capitalDeclare?: number; localisation?: string };
  const resultat = s.resultat as { capitauxTotaux?: number; lignes?: LigneGarantie[]; primeNetteHT?: number; accessoires?: number; taxes?: number };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);
  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    classeLabel: entrees.classe ? sansParentheses(SECURSTOCK_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
    localisationLabel: entrees.localisation ? (SECURSTOCK_LOCALISATION_LABELS[entrees.localisation] ?? entrees.localisation) : "—",
    montantStock: entrees.capitalDeclare ?? 0,
    capitalRetenu: resultat.capitauxTotaux ?? 0,
    lignes: resultat.lignes ?? [],
    primeNetteHT: resultat.primeNetteHT ?? 0,
    accessoires: resultat.accessoires ?? 0,
    taxes: resultat.taxes ?? 0,
    primeTTC: s.primeTTC,
    signature: s.signature ?? null,
  };
}

/** Reconstitue les champs du contrat SECURPRO à partir d'une souscription IMF (entrees/resultat en JSON libre). */
export function souscriptionImfToContratSecurpro(s: SouscriptionImf): ContratSecurpro {
  const entrees = s.entrees as {
    classe?: number;
    statutOccupation?: "proprietaire" | "locataire";
    valeurBatiment?: number;
    loyerMensuel?: number;
    contenu?: number;
    dansMarche?: boolean;
  };
  const resultat = s.resultat as {
    lignes?: LigneGarantie[];
    primeNetteHT?: number;
    accessoires?: number;
    taxes?: number;
  };
  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);
  const statutOccupation = entrees.statutOccupation ?? "proprietaire";
  return {
    numeroPolice: s.numeroPolice,
    intermediaire: [s.agentNom, s.agenceNom ?? s.zoneNom].filter(Boolean).join(" — "),
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt,
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    classeLabel: entrees.classe ? sansParentheses(SECURPRO_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
    statutOccupation,
    valeurBatimentOuLoyer: statutOccupation === "locataire" ? (entrees.loyerMensuel ?? 0) : (entrees.valeurBatiment ?? 0),
    contenu: entrees.contenu ?? 0,
    dansMarche: !!entrees.dansMarche,
    lignes: resultat.lignes ?? [],
    primeNetteHT: resultat.primeNetteHT ?? 0,
    accessoires: resultat.accessoires ?? 0,
    taxes: resultat.taxes ?? 0,
    primeTTC: s.primeTTC,
    signature: s.signature ?? null,
  };
}

type ContratType =
  | "incendie"
  | "accident"
  | "relaxaccidents_fraismedicaux"
  | "relaxmoto_relaxauto"
  | "relaxvoyage"
  | "relaxaccidents_generale"
  | "securpro"
  | "securpro_dommages"
  | "securhome_dommages"
  | "securstock"
  | "securecolte"
  | "coupsdurs";

const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

/** Demande le PDF au serveur (texte réel) et déclenche son téléchargement — pas d'ouverture de fenêtre, pas d'impression. */
async function telechargerContratPdf(type: ContratType, numeroPolice: string, data: unknown) {
  const res = await fetch(`${API_BASE}/contrats/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, data }),
  });
  if (!res.ok) {
    let message = "Erreur lors de la génération du contrat.";
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* réponse non-JSON (ex: erreur serveur brute) */
    }
    alert(message);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contrat-${sanitizeFilename(numeroPolice)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function genererContratIncendie(c: ContratIncendie) {
  await telechargerContratPdf("incendie", c.numeroPolice, c);
}

export async function genererContratAccident(c: ContratAccident) {
  await telechargerContratPdf("accident", c.numeroPolice, c);
}

// RelaxAccidents Frais Médicaux reprend exactement le même contrat qu'Accident
// (dont il remplace les souscriptions) — mêmes champs (voir ContratAccident).
export async function genererContratRelaxAccidentsFraisMedicaux(c: ContratAccident) {
  await telechargerContratPdf("relaxaccidents_fraismedicaux", c.numeroPolice, c);
}

export async function genererContratRelaxMotoAuto(c: ContratRelaxMotoAuto) {
  await telechargerContratPdf("relaxmoto_relaxauto", c.numeroPolice, c);
}

export async function genererContratRelaxVoyage(c: ContratRelaxVoyage) {
  await telechargerContratPdf("relaxvoyage", c.numeroPolice, c);
}

export async function genererContratRelaxAccidentsGenerale(c: ContratRelaxAccidentsGenerale) {
  await telechargerContratPdf("relaxaccidents_generale", c.numeroPolice, c);
}

export async function genererContratSecurpro(c: ContratSecurpro) {
  await telechargerContratPdf("securpro", c.numeroPolice, c);
}

// SecurPro (Assurances Dommages, distribué via QR partenaire) réutilise le
// même contrat que le SecurPro IMF (même moteur de calcul), sous un type
// distinct pour ne pas mélanger les deux canaux de distribution.
export async function genererContratSecurproDommages(c: ContratSecurpro) {
  await telechargerContratPdf("securpro_dommages", c.numeroPolice, c);
}

export async function genererContratSecurhome(c: ContratSecurhome) {
  await telechargerContratPdf("securhome_dommages", c.numeroPolice, c);
}

export async function genererContratSecurecolte(c: ContratSecurecolte) {
  await telechargerContratPdf("securecolte", c.numeroPolice, c);
}

export async function genererContratSecurstock(c: ContratSecurstock) {
  await telechargerContratPdf("securstock", c.numeroPolice, c);
}

export async function genererContratCoupsdurs(c: ContratCoupsdurs) {
  await telechargerContratPdf("coupsdurs", c.numeroPolice, c);
}
