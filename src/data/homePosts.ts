export type LocalHomePostKind = "status" | "photo" | "video";
export type LocalHomePost = {
  id: string;
  scope: string;
  kind: LocalHomePostKind;
  text: string;
  createdAt: string;
  media?: Blob;
  mediaName?: string;
  mimeType?: string;
};

const databaseName = "beatvault-local-home";
const storeName = "posts";
const postsChangedEvent = "beatvault:home-posts-changed";
const postsChannelName = "beatvault-home-posts";

export function subscribeToLocalHomePosts(scope: string, onChange: () => void): () => void {
  const handleEvent = (event: Event) => {
    if ((event as CustomEvent<string>).detail === scope) onChange();
  };
  window.addEventListener(postsChangedEvent, handleEvent);
  const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(postsChannelName);
  if (channel) channel.onmessage = event => { if (event.data === scope) onChange(); };
  return () => {
    window.removeEventListener(postsChangedEvent, handleEvent);
    channel?.close();
  };
}

function announceLocalHomePostsChanged(scope: string): void {
  window.dispatchEvent(new CustomEvent(postsChangedEvent, { detail: scope }));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(postsChannelName);
    channel.postMessage(scope);
    channel.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("LOCAL_POST_STORAGE_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("LOCAL_POST_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("LOCAL_POST_STORAGE_BLOCKED"));
  });
}

export async function readLocalHomePosts(scope: string): Promise<LocalHomePost[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result as LocalHomePost[]).filter(post => post.scope === scope).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error || new Error("LOCAL_POST_READ_FAILED"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("LOCAL_POST_READ_FAILED")); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error("LOCAL_POST_READ_FAILED")); };
  });
}

export async function saveLocalHomePost(input: Omit<LocalHomePost, "id" | "createdAt">): Promise<LocalHomePost> {
  const post: LocalHomePost = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).add(post);
    transaction.oncomplete = () => { db.close(); announceLocalHomePostsChanged(post.scope); resolve(post); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("LOCAL_POST_WRITE_FAILED")); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error("LOCAL_POST_WRITE_FAILED")); };
  });
}
