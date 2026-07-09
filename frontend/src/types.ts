export type Produit = "incendie" | "accident";

export type StatutIncendie = "en_cours" | "complet" | "expire";
export type StatutAccident = "paye_formulaire_attente" | "complet";
export type WaveStatut = "en_attente" | "confirme" | "echoue";

export interface Partenaire {
  id: string;
  nomCommerce: string;
  nomResponsable: string;
  telephone: string;
  localisation: string;
  typeCommerce: "Electronique" | "Vulcanisateur" | "MecaniqueGarage" | "AccessoireAuto";
  produitIncendie: boolean;
  produitAccident: boolean;
  statut: "actif" | "inactif";
  email: string | null;
  createdAt: string;
  clientsIncendie: number;
  clientsAccident: number;
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
  telephone: string;
  nom: string;
  prenom: string;
  dateNaissance?: string;
  montantPrime: number;
  capitalGaranti: number;
  waveStatut: WaveStatut;
  numeroPolice?: string;
  statutDossier: StatutAccident;
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
