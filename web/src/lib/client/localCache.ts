// What this browser keeps on disk between visits, in IndexedDB: stems as
// downloaded (so opening a song again doesn't download it again), the
// Studio's analysis of each stem, and the beat model's beats. Everything
// in it can be made again, so it's only ever a cache: when IndexedDB isn't
// there (private windows, some in-app browsers) or the disk is full, it
// quietly does nothing and the work is just redone.
//
// Each kind has a budget; past it, what was used longest ago goes first.
// The sizes and last-used times sit in a store of their own ("meta"), so
// making room never has to read the (big) entries themselves.

import { isConstrainedDevice } from "./device";

export type CacheKind = "stem" | "analysis" | "beats";
export const CACHE_KINDS: CacheKind[] = ["stem", "analysis", "beats"];

const DB_NAME = "remixt-cache";
const DB_VERSION = 1;

const MB = 1024 * 1024;
/** Budgets: phones get less, and never more than a share of what the browser allows the site. */
function budget(kind: CacheKind, quota: number | null): number {
  const phone = isConstrainedDevice();
  const base = kind === "stem" ? (phone ? 150 : 600) * MB : kind === "analysis" ? (phone ? 40 : 120) * MB : 8 * MB;
  return quota ? Math.min(base, quota * (kind === "stem" ? 0.3 : 0.05)) : base;
}

/** Stems are dropped after a while even with room to spare, so one taken down doesn't live on here. */
const MAX_AGE: Partial<Record<CacheKind, number>> = { stem: 30 * 24 * 3600 * 1000 };
/** A read only moves an entry to the front of the queue this often, not on every read. */
const TOUCH_MS = 60_000;

type Meta = { key: string; kind: CacheKind; bytes: number; savedAt: number; usedAt: number };

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("data")) db.createObjectStore("data");
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" }).createIndex("kind", "kind");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading (a newer build): let it, and open again next time.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("aborted"));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const id = (kind: CacheKind, key: string) => `${kind}:${key}`;

/** What was kept under `key`, or null. */
export async function cacheGet<T>(kind: CacheKind, key: string): Promise<T | null> {
  try {
    const db = await open();
    if (!db) return null;
    const tx = db.transaction(["data", "meta"], "readonly");
    const [data, meta] = await Promise.all([
      result(tx.objectStore("data").get(id(kind, key))),
      result(tx.objectStore("meta").get(id(kind, key)) as IDBRequest<Meta | undefined>),
    ]);
    if (data === undefined || !meta) return null;
    const now = Date.now();
    const maxAge = MAX_AGE[kind];
    if (maxAge && now - meta.savedAt > maxAge) {
      void remove([meta.key]);
      return null;
    }
    if (now - meta.usedAt > TOUCH_MS) void touch(meta, now);
    return data as T;
  } catch {
    return null;
  }
}

async function touch(meta: Meta, now: number) {
  try {
    const db = await open();
    if (!db) return;
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ ...meta, usedAt: now });
    await done(tx);
  } catch {
    // Only the order things are dropped in.
  }
}

/**
 * Keeps `data` (anything IndexedDB can store: a Blob, typed arrays, plain
 * objects) under `key`, `bytes` being about how much room it takes. The
 * value is copied before this returns its promise, so the caller can hand
 * its buffers on (to decodeAudioData, a worker) straight away.
 */
export function cachePut(kind: CacheKind, key: string, data: unknown, bytes: number): Promise<void> {
  // IndexedDB copies the value when it's put, but the database may not be
  // open yet: a Blob is copied now, which keeps an ArrayBuffer safe from
  // being detached in the meantime.
  const value = data instanceof ArrayBuffer ? new Blob([data]) : data;
  return (async () => {
    try {
      const db = await open();
      if (!db) return;
      const now = Date.now();
      const tx = db.transaction(["data", "meta"], "readwrite");
      tx.objectStore("data").put(value, id(kind, key));
      tx.objectStore("meta").put({ key: id(kind, key), kind, bytes, savedAt: now, usedAt: now } satisfies Meta);
      await done(tx);
      await makeRoom(kind);
    } catch {
      // Over quota, or the browser said no: next time it's just worked out again.
      await makeRoom(kind, 0.5).catch(() => {});
    }
  })();
}

async function quota(): Promise<number | null> {
  try {
    return (await navigator.storage?.estimate?.())?.quota ?? null;
  } catch {
    return null;
  }
}

/** Drops what was used longest ago until `kind` is within its budget (times `share`). */
async function makeRoom(kind: CacheKind, share = 1) {
  const db = await open();
  if (!db) return;
  const limit = budget(kind, await quota()) * share;
  const metas = await kindMetas(db, kind);
  let total = metas.reduce((sum, m) => sum + m.bytes, 0);
  if (total <= limit) return;
  const drop: string[] = [];
  for (const m of metas.sort((a, b) => a.usedAt - b.usedAt)) {
    if (total <= limit) break;
    drop.push(m.key);
    total -= m.bytes;
  }
  await remove(drop);
}

async function kindMetas(db: IDBDatabase, kind: CacheKind): Promise<Meta[]> {
  const tx = db.transaction("meta", "readonly");
  return result(tx.objectStore("meta").index("kind").getAll(kind) as IDBRequest<Meta[]>);
}

async function remove(keys: string[]) {
  if (keys.length === 0) return;
  const db = await open();
  if (!db) return;
  const tx = db.transaction(["data", "meta"], "readwrite");
  for (const key of keys) {
    tx.objectStore("data").delete(key);
    tx.objectStore("meta").delete(key);
  }
  await done(tx);
}

export type CacheUsage = Record<CacheKind, { count: number; bytes: number }>;

/** How many entries of each kind are kept, and about how much room they take. */
export async function cacheUsage(): Promise<CacheUsage> {
  const usage = Object.fromEntries(CACHE_KINDS.map((k) => [k, { count: 0, bytes: 0 }])) as CacheUsage;
  try {
    const db = await open();
    if (!db) return usage;
    const tx = db.transaction("meta", "readonly");
    const metas = await result(tx.objectStore("meta").getAll() as IDBRequest<Meta[]>);
    for (const m of metas) {
      usage[m.kind].count++;
      usage[m.kind].bytes += m.bytes;
    }
  } catch {
    // Nothing to show.
  }
  return usage;
}

/** Empties one kind, or everything. */
export async function clearCache(kind?: CacheKind): Promise<void> {
  const db = await open();
  if (!db) return;
  if (!kind) {
    const tx = db.transaction(["data", "meta"], "readwrite");
    tx.objectStore("data").clear();
    tx.objectStore("meta").clear();
    return done(tx);
  }
  await remove((await kindMetas(db, kind)).map((m) => m.key));
}
