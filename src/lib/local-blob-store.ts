/**
 * Tiny IndexedDB key → Blob store for per-browser files too big for
 * localStorage (e.g. an uploaded background image). Every call is
 * best-effort: it resolves to null/void instead of throwing when IndexedDB
 * is unavailable (private mode, blocked storage...).
 */

const DB_NAME = "sunbee-local";
const STORE = "blobs";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

export async function saveLocalBlob(key: string, blob: Blob): Promise<void> {
  await run("readwrite", (store) => store.put(blob, key));
}

export async function loadLocalBlob(key: string): Promise<Blob | null> {
  const value = await run<unknown>("readonly", (store) => store.get(key));
  return value instanceof Blob ? value : null;
}

export async function deleteLocalBlob(key: string): Promise<void> {
  await run("readwrite", (store) => store.delete(key));
}
