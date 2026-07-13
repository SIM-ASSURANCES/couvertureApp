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
  createdAt: string;
}

// --- Branche IMF : hiérarchie Zone -> Agence -> Agent ---

export type RoleImf = "AGENT" | "RESPONSABLE_ZONE";

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
