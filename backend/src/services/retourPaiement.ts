// Fenêtre de validité des liens de RETOUR DE PAIEMENT (audit sécurité
// 2026-10-05). Après un paiement, l'URL de retour contient l'identifiant de la
// souscription (ou de l'échéance) : c'est la seule "clé" qui donne accès, SANS
// compte, à la fiche du contrat, aux photos d'identité et à la carte de prise
// en charge (voir routes/public.ts : /souscriptions/*/contrat, carte-photos ;
// routes/cartes.ts). Cet identifiant finit dans l'historique du navigateur, les
// journaux de Wave et les captures d'écran — il ne doit donc pas rester valable
// indéfiniment.
//
// Le client n'en a besoin que juste après avoir payé. Au-delà, il retrouve son
// contrat et sa carte dans son espace client (identifiants envoyés par SMS à la
// première activation), qui exige une vraie authentification.

export const FENETRE_RETOUR_PAIEMENT_MS = 48 * 60 * 60 * 1000;

/** Vrai si `date` (confirmation du paiement, ou dernière mise à jour de la souscription) est dans la fenêtre. */
export function retourPaiementRecent(date: Date | null | undefined, maintenant: number = Date.now()): boolean {
  return !!date && maintenant - date.getTime() <= FENETRE_RETOUR_PAIEMENT_MS;
}

export const MESSAGE_LIEN_RETOUR_EXPIRE =
  "Ce lien de retour de paiement a expiré. Connectez-vous à votre espace client pour retrouver votre contrat et votre carte.";
