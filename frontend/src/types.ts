export type Produit = "incendie" | "accident";

export type StatutIncendie = "en_cours" | "complet" | "expire";
export type StatutAccident = "paye_formulaire_attente" | "complet";
export type WaveStatut = "en_attente" | "confirme" | "echoue";

export interface Partenaire {
  id: string;
  nomCommerce: string;
  nomResponsable: string;
  telephone: string;
  localisation: string | null;
  typeCommerce: "Electronique" | "Vulcanisateur" | "MecaniqueGarage" | "AccessoireAuto" | null;
  produitIncendie: boolean;
  produitAccident: boolean;
  branche?: "INCENDIE_ACCIDENT" | "RELAX" | null;
  statut: "actif" | "inactif";
  email: string | null;
  createdAt: string;
  clientsIncendie: number;
  clientsAccident: number;
  clientsRelax?: number;
}

// --- Branche RelaxMoto / RelaxAuto (abonnement à paiement échelonné) ---

export type ProduitRelax = "relaxmoto" | "relaxauto";
export type CycleFacturation = "hebdo5semaines" | "mensuel" | "annuel";
export type StatutAbonnement = "actif" | "suspendu" | "expire" | "resilie";
export type StatutEcheance = "en_attente" | "paye" | "echoue";
export type StatutCarte = "generee" | "envoyee" | "activee";

export interface SouscriptionRelax {
  id: string;
  partenaireId: string;
  partenaireNom: string;
  produit: { code: ProduitRelax; libelle: string };
  telephone: string;
  nom?: string | null;
  prenom?: string | null;
  montantPrime: number;
  capitalGaranti: number;
  commissionCalculee?: number | null;
  waveStatut: WaveStatut | null;
  numeroPolice?: string | null;
  cycleFacturation?: CycleFacturation | null;
  statutAbonnement?: StatutAbonnement | null;
  nombreEcheances?: number | null;
  createdAt: string;
}

export interface Echeance {
  id: string;
  souscriptionId: string;
  numeroEcheance: number;
  montant: number;
  statut: StatutEcheance;
  dateEcheance: string;
  datePaiement?: string | null;
}

export interface CarteRelax {
  id: string;
  souscriptionId: string;
  numero: string;
  statut: StatutCarte;
  dateGeneration: string;
  dateEnvoi?: string | null;
  dateActivation?: string | null;
  dateRenouvellement?: string | null;
  souscription?: {
    nom?: string | null;
    prenom?: string | null;
    telephone: string;
    produit: { code: string; libelle: string };
  };
}

export interface ClientIncendie {
  id: string;
  partenaireId: string;
  partenaireNom: string;
  partenaireResponsable?: string | null;
  partenaireLocalisation?: string | null;
  telephone: string;
  nom?: string;
  prenom?: string;
  email?: string | null;
  refFacture?: string;
  commune?: string;
  quartier?: string;
  numeroMaison?: string;
  montantPrime: number;
  capitalGaranti: number;
  statut: StatutIncendie;
  relanceCount?: number;
  signature?: string | null;
  createdAt: string;
}

export interface ClientAccident {
  id: string;
  partenaireId: string;
  partenaireNom: string;
  partenaireResponsable?: string | null;
  partenaireLocalisation?: string | null;
  telephone: string;
  nom: string;
  prenom: string;
  dateNaissance?: string;
  montantPrime: number;
  capitalGaranti: number;
  waveStatut: WaveStatut;
  numeroPolice?: string;
  statutDossier: StatutAccident;
  relanceCount?: number;
  signature?: string | null;
  createdAt: string;
}

// --- Branche IMF : hiérarchie Zone -> Agence -> Agent ---

export type RoleImf = "AGENT" | "RESPONSABLE_AGENCE" | "RESPONSABLE_ZONE";

export interface ZoneImf {
  id: string;
  nom: string;
  createdAt: string;
  nbAgences?: number;
  nbAgents?: number;
}

export interface AgenceImf {
  id: string;
  nom: string;
  zoneId: string;
  zoneNom?: string;
  telephone?: string | null;
  localisation?: string | null;
  createdAt: string;
  nbAgents?: number;
}

export interface AgentImf {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  roleImf: RoleImf;
  agenceId: string | null;
  zoneId: string | null;
  agenceNom?: string | null;
  zoneNom?: string | null;
  statut: "actif" | "inactif";
  createdAt: string;
}

export interface BaremeSecurpro {
  id: string;
  classe: number;
  limiteCapital: number;
  tauxIncendie: number;
  updatedAt: string;
}

export interface BaremeSecurstock {
  id: string;
  classe: number;
  limiteCapital: number;
  tauxDommageElectrique: number;
  tauxAutreCause: number;
  updatedAt: string;
}

export interface IndiceArcImf {
  id: string;
  region: string;
  annee: number;
  valeur: number;
  reference: number;
  palier: "forte" | "moyenne" | "faible" | "aucune";
  createdAt: string;
  updatedAt: string;
}

export interface TarifProduitImf {
  id: number;
  produitId: string;
  libelleVariante: string | null;
  prime: number;
  primeHT: number | null;
  fg: number | null;
  taxes: number | null;
  capitalGaranti: number;
  commission: number;
}

export interface PieceSinistre {
  label: string;
  fournie: boolean;
}

export interface SinistreImf {
  id: string;
  numeroSinistre: string;
  souscriptionId: string;
  agentId: string | null;
  adminId?: string | null;
  agentNom?: string | null;
  adminNom?: string | null;
  numeroPolice: string;
  clientNom: string;
  clientPrenom: string;
  clientTelephone: string;
  produitCode: string;
  typeEvenement: string;
  dateSurvenance: string;
  dateDeclaration: string;
  pieces: PieceSinistre[];
  montantEstime?: number | null;
  montantRegle?: number | null;
  montantIMF?: number | null;
  montantSouscripteur?: number | null;
  motifRejet?: string | null;
  statut: "declare" | "pieces_attente" | "complet" | "instruction" | "accepte" | "rejete" | "regle";
  createdAt: string;
}

export interface SouscriptionImf {
  id: string;
  numeroPolice: string;
  agentId: string | null;
  adminId?: string | null;
  simulationId: string | null;
  produitCode: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string | null;
  typePiece?: "cni" | "passeport" | "permis_conduire" | null;
  numeroPiece?: string | null;
  signature?: string | null;
  entrees: Record<string, unknown>;
  resultat: Record<string, unknown>;
  primeTTC: number;
  statut: "en_cours" | "active" | "annulee";
  createdAt: string;
  agentNom?: string | null;
  agenceNom?: string | null;
  zoneNom?: string | null;
  adminNom?: string | null;
  // true pour une souscription directe de l'admin (sans agent/zone/agence).
  directe?: boolean;
}

export interface StatsImf {
  global: { ca: number; taxes: number; accessoires: number; nombre: number };
  parProduit: { famille: string; ca: number; taxes: number; accessoires: number; nombre: number }[];
  evolution: ({ mois: string } & Record<string, number>)[];
}

export interface StatsSinistresImf {
  global: { primes: number; sinistres: number; ratio: number };
  parProduit: { famille: string; primes: number; sinistres: number; ratio: number }[];
}

export interface VirementBordereau {
  montant: number;
  date: string;
  reference: string;
}

export interface BordereauImf {
  id: string;
  numero: string;
  agenceId: string;
  agenceNom: string;
  zoneNom: string;
  periodeDebut: string;
  periodeFin: string;
  nombreSouscriptions: number;
  primeTotal: number;
  virements: VirementBordereau[];
  montantRecu: number;
  statut: "emis" | "partiellement_regle" | "regle";
  genereParNom?: string | null;
  createdAt: string;
}

export interface BordereauImfDetail extends BordereauImf {
  souscriptions: {
    numeroPolice: string;
    nom: string;
    prenom: string;
    produitCode: string;
    primeTTC: number;
    agentNom: string | null;
    createdAt: string;
  }[];
}

export interface SimulationImf {
  id: string;
  agentId: string;
  produitCode: string;
  entrees: Record<string, unknown>;
  resultat: Record<string, unknown>;
  primeTTC: number;
  createdAt: string;
  agent?: { nom: string; prenom: string };
}

export interface JournalEntry {
  id: string;
  date: string;
  admin: string;
  typeAction:
    | "creation"
    | "modification"
    | "suppression"
    | "export"
    | "connexion"
    | "relance";
  objet: string;
  identifiant: string;
}
