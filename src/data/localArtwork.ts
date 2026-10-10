const DB_NAME = "beatvault-artwork";
const STORE = "covers";
const objectUrls = new Map<string, string[]>();

export function createLocalArtworkUrl(scope: string, artwork: Blob): string {
  const url = URL.createObjectURL(artwork);
  objectUrls.set(scope, [...(objectUrls.get(scope) || []), url]);
  return url;
}

export function releaseLocalArtworkUrls(scope: string): void {
  objectUrls.get(scope)?.forEach(URL.revokeObjectURL);
  objectUrls.delete(scope);
}

function openArtworkDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalArtwork(scope: string, assetId: string, artwork: Blob): Promise<void> {
  const db = await openArtworkDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(artwork, `${scope}:${assetId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).finally(() => db.close());
}

export async function readLocalArtwork(scope: string, assetId: string): Promise<Blob | undefined> {
  const db = await openArtworkDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(`${scope}:${assetId}`);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
    request.onerror = () => reject(request.error);
    db.onclose = () => undefined;
    request.transaction!.oncomplete = () => db.close();
  });
}
