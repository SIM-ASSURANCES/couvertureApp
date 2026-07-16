import { api } from "../api";
import { getAllQueueItems, updateQueueItem, removeQueueItem } from "./db";

/**
 * Rejoue la file des souscriptions créées hors-ligne : pour chaque élément,
 * crée la simulation puis la souscription côté serveur, avec un `offlineId`
 * comme clé d'idempotence (si la requête a déjà abouti mais que la réponse
 * ne nous est jamais parvenue — coupure juste après succès —, le serveur
 * renvoie l'enregistrement existant au lieu d'en créer un doublon).
 * Traitement séquentiel (pas en parallèle) pour rester simple à raisonner et
 * ne pas saturer une connexion redevenue faible.
 */
export async function syncPendingQueue(): Promise<{ synced: number; failed: number }> {
  const items = await getAllQueueItems();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    await updateQueueItem(item.offlineId, { statut: "synchronisation", erreur: undefined });
    try {
      const simulation = await api.post<{ id: string }>(`${item.apiBase}/simulations`, {
        produitCode: item.produitCode,
        entrees: item.entrees,
        offlineId: `${item.offlineId}-sim`,
      });
      const souscription = await api.post<{ numeroPolice: string }>(`${item.apiBase}/souscriptions`, {
        simulationId: simulation.id,
        nom: item.client.nom,
        prenom: item.client.prenom,
        telephone: item.client.telephone,
        email: item.client.email || undefined,
        typePiece: item.client.typePiece,
        numeroPiece: item.client.numeroPiece,
        signature: item.client.signature || undefined,
        offlineId: `${item.offlineId}-sub`,
      });
      await updateQueueItem(item.offlineId, { statut: "synchronise", numeroPoliceReel: souscription.numeroPolice });
      await removeQueueItem(item.offlineId);
      synced++;
    } catch (err) {
      await updateQueueItem(item.offlineId, { statut: "erreur", erreur: (err as Error).message });
      failed++;
    }
  }

  return { synced, failed };
}
