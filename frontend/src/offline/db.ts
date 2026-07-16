/**
 * Stockage local (IndexedDB) pour le mode hors-ligne du simulateur agent IMF :
 * - `baremes` : cache des barèmes SECURPRO/SECURSTOCK, rafraîchi à chaque
 *   consultation en ligne, utilisé pour calculer un devis sans réseau.
 * - `queue` : file des souscriptions créées hors-ligne, en attente de
 *   synchronisation avec le serveur dès la reconnexion.
 * Wrapper maison plutôt qu'une dépendance : l'API IndexedDB native suffit
 * pour deux tables simples, cohérent avec le reste du projet (aucune
 * librairie ajoutée pour PDF, signature, etc.).
 */

const DB_NAME = "sim-imf-offline";
const DB_VERSION = 1;
const STORE_BAREMES = "baremes";
const STORE_QUEUE = "queue";

export interface SouscriptionEnAttente {
  offlineId: string; // uuid généré côté client, sert de clé d'idempotence à la synchronisation
  apiBase: string; // "/agent-imf" — le mode hors-ligne ne concerne que l'espace agent
  produitCode: string;
  entrees: Record<string, unknown>;
  resultat: unknown;
  primeTTC: number;
  client: {
    nom: string;
    prenom: string;
    telephone: string;
    email?: string;
    typePiece: "cni" | "passeport" | "permis_conduire";
    numeroPiece: string;
    signature?: string | null;
  };
  tempNumero: string; // "TMP-…" affiché à l'agent avant synchronisation
  createdAt: string;
  statut: "en_attente" | "synchronisation" | "erreur" | "synchronise";
  erreur?: string;
  numeroPoliceReel?: string; // renseigné une fois synchronisé
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BAREMES)) db.createObjectStore(STORE_BAREMES, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: "offlineId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function putBareme(key: string, data: unknown): Promise<void> {
  await withStore(STORE_BAREMES, "readwrite", (s) => s.put({ key, data, cachedAt: new Date().toISOString() }));
}

export async function getBareme<T>(key: string): Promise<T | null> {
  const row = await withStore<{ key: string; data: T } | undefined>(STORE_BAREMES, "readonly", (s) => s.get(key));
  return row?.data ?? null;
}

export async function putQueueItem(item: SouscriptionEnAttente): Promise<void> {
  await withStore(STORE_QUEUE, "readwrite", (s) => s.put(item));
}

export async function updateQueueItem(offlineId: string, patch: Partial<SouscriptionEnAttente>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_QUEUE);
    const getReq = store.get(offlineId);
    getReq.onsuccess = () => {
      const current = getReq.result as SouscriptionEnAttente | undefined;
      if (!current) return resolve();
      const putReq = store.put({ ...current, ...patch });
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function removeQueueItem(offlineId: string): Promise<void> {
  await withStore(STORE_QUEUE, "readwrite", (s) => s.delete(offlineId));
}

export async function getAllQueueItems(): Promise<SouscriptionEnAttente[]> {
  return withStore<SouscriptionEnAttente[]>(STORE_QUEUE, "readonly", (s) => s.getAll());
}
