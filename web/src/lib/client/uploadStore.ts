"use client";

// The songs being added from this browser, kept on disk (IndexedDB) until
// they're in the library — the file itself included — so a reload, a
// crash or closing the tab doesn't lose them: the next visit picks them up
// again (see uploads.ts). Each is kept under the account that added it.
// Where IndexedDB isn't there (some private windows), nothing is kept and
// uploads simply work as before.

export type StoredUpload = {
  id: string;
  userId: string;
  name: string;
  mode: "split" | "queue";
  tags: string[];
  source: { kind: "file"; file: Blob; fileName: string; lastModified: number } | { kind: "link"; url: string };
  status: "waiting" | "failed";
  error: string | null;
  addedAt: number;
};

const DB_NAME = "remixt-uploads";
const STORE = "uploads";

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Keeps (or updates) an upload. A full disk just means it isn't kept. */
export async function keepUpload(upload: StoredUpload): Promise<void> {
  await run("readwrite", (store) => store.put(upload));
}

/** Changes a kept upload's status, if it's kept. */
export async function markUpload(id: string, patch: Pick<StoredUpload, "status" | "error"> & { name?: string }) {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const read = store.get(id);
      read.onsuccess = () => {
        if (read.result) store.put({ ...read.result, ...patch });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function forgetUpload(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}

/** Everything kept for `userId`, oldest first. */
export async function keptUploads(userId: string): Promise<StoredUpload[]> {
  const all = (await run("readonly", (store) => store.getAll() as IDBRequest<StoredUpload[]>)) ?? [];
  return all.filter((u) => u.userId === userId).sort((a, b) => a.addedAt - b.addedAt);
}
