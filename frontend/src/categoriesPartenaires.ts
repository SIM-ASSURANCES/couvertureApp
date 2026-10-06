// Catégories d'intermédiaires (liste fournie par SIM Assurances, 1° à 16°).
// Le NUMÉRO entre dans l'identifiant du partenaire ("<catégorie>.<n° d'ordre>",
// ex. 1.0001) : il ne doit jamais être renuméroté. Miroir de
// backend/src/services/identifiantsPartenaires.ts — à garder synchronisés.
// Libellés 3, 4, 7, 15 et 16 reconstitués d'après une photo coupée : à
// confirmer ; les corriger ne change aucun identifiant.

export const CATEGORIES_PARTENAIRES = [
  { numero: 1, libelle: "Courtiers agréés" },
  { numero: 2, libelle: "Agents généraux" },
  { numero: 3, libelle: "Personnes physiques mandataires" },
  { numero: 4, libelle: "Banques, La Poste et établissements financiers" },
  { numero: 5, libelle: "Institutions de microfinance" },
  { numero: 6, libelle: "Mutuelles de santé" },
  { numero: 7, libelle: "Coopératives et groupements" },
  { numero: 8, libelle: "Organisations non gouvernementales" },
  { numero: 9, libelle: "Agences de développement" },
  { numero: 10, libelle: "Associations et tontines" },
  { numero: 11, libelle: "Fonds funéraires" },
  { numero: 12, libelle: "Syndicats" },
  { numero: 13, libelle: "Sociétés et distributeurs de téléphonie mobile" },
  { numero: 14, libelle: "Responsables sanitaires" },
  { numero: 15, libelle: "Chaînes de distribution alimentaire" },
  { numero: 16, libelle: "Sociétés à forts potentiels d'affaires" },
] as const;

export function libelleCategorie(numero: number | null | undefined): string | null {
  return CATEGORIES_PARTENAIRES.find((c) => c.numero === numero)?.libelle ?? null;
}
