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
  typeCommerce: "Electronique" | "Alimentation" | "Textile" | "Autre";
  produitIncendie: boolean;
  produitAccident: boolean;
  tarifIncendieId?: number | null;
  tarifIncendie?: { id: number; prime: number; capitalGaranti: number; commission: number } | null;
  statut: "actif" | "inactif";
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
  email?: string;
  numeroFacture?: string;
  montantPrime: number;
  capitalGaranti: number;
  statut: StatutIncendie;
  createdAt: string;
}

export interface ClientAccident {
  id: string;
  partenaireId: string;
  partenaireNom: string;
  telephone: string;
  nom: string;
  prenom: string;
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
