// Downloading the big files the in-browser models need (the splitter's
// ~172 MB htdemucs, the beat tracker's ~10 MB, ONNX Runtime's WebAssembly)
// once, and keeping them in Cache Storage, so every visit after the first
// loads them from disk. Shared by the workers that run the models.
//
// A model normally comes straight from where it's published (Hugging Face,
// GitHub). Where that's out of reach — Hugging Face refuses visitors from
// Iran, say — it comes from this app's own copy instead (see
// lib/modelMirror.ts), and the browser remembers to go there first.

import { MIRROR_SLICE_BYTES, MODEL_SIZE_HEADER, mirrorFor } from "../modelMirror";

/** On each cached file: its size in bytes. */
export const SIZE_HEADER = "X-Remixt-Bytes";

/** Cache Storage caches the models are kept in (see the workers), for the storage page. */
export const MODEL_CACHES = {
  splitter: "remixt-splitter-v1",
  beats: "remixt-beats-v1",
} as const;

/**
 * Fetches a large file once and keeps it in Cache Storage (`cacheName` —
 * bump it when the model changes, so browsers drop the old copy), so every
 * visit after the first loads it from disk. Reports bytes as they arrive.
 * If caching isn't available (private windows, full disk) it still works —
 * it just downloads again next time.
 */
export async function cachedDownload(
  cacheName: string,
  url: string,
  onBytes: (loaded: number, total: number | null, fromCache: boolean) => void
): Promise<ArrayBuffer> {
  // `caches` doesn't exist at all outside secure contexts (e.g. a phone
  // opening the dev server by its LAN address over plain http).
  const cache =
    typeof caches === "undefined" ? null : await caches.open(cacheName).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) {
    const buffer = await hit.arrayBuffer();
    onBytes(buffer.byteLength, buffer.byteLength, true);
    return buffer;
  }

  const report = (loaded: number, total: number | null) => onBytes(loaded, total, false);
  const origin = typeof self !== "undefined" && self.location ? self.location.origin : "";
  const mirror = origin ? mirrorFor(url, origin) : null;
  let bytes: Uint8Array<ArrayBuffer>;
  if (!mirror) {
    bytes = await resumableDownload(url, report);
  } else if (await prefersMirror(cache)) {
    bytes = await slicedDownload(mirror, report).catch(() => resumableDownload(url, report));
  } else {
    try {
      // A few quick tries: a blocked host fails the same way every time.
      bytes = await resumableDownload(url, report, { attempts: 3 });
    } catch {
      report(0, null);
      bytes = await slicedDownload(mirror, report);
      await rememberMirror(cache);
    }
  }
  try {
    // The size alongside, so the storage page can say how big it is without reading it.
    await cache?.put(
      url,
      new Response(bytes, { headers: { "Content-Type": "application/octet-stream", [SIZE_HEADER]: String(bytes.byteLength) } })
    );
  } catch {
    // Over quota — fine, it's only a cache.
  }
  return bytes.buffer;
}

const STALL_MS = 20_000;
const MAX_ATTEMPTS = 8;

/** Marks (in the models' cache) that this browser can't reach where models come from. */
const PREFER_MIRROR = "/__remixt-prefer-model-mirror";

async function prefersMirror(cache: Cache | null): Promise<boolean> {
  return !!(await cache?.match(PREFER_MIRROR).catch(() => undefined));
}

async function rememberMirror(cache: Cache | null) {
  await cache?.put(PREFER_MIRROR, new Response("1")).catch(() => {});
}

/** Slices fetched at once from this app's mirror. */
const SLICES_AT_ONCE = 3;

/**
 * Downloads a model from this app's mirror, a slice (?part=N) at a time,
 * several at once, each retried on its own — so a dropped connection costs
 * one 4 MB slice.
 */
export async function slicedDownload(
  url: string,
  onBytes: (loaded: number, total: number | null) => void,
  fetchSlice: (url: string) => Promise<Response> = (u) => fetch(u)
): Promise<Uint8Array<ArrayBuffer>> {
  const getSlice = async (part: number): Promise<{ bytes: Uint8Array; total: number }> => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetchSlice(`${url}?part=${part}`);
        if (!res.ok) throw new Error(`Couldn't download the model (HTTP ${res.status})`);
        const total = Number(res.headers.get(MODEL_SIZE_HEADER));
        if (!total) throw new Error("Couldn't download the model");
        return { bytes: new Uint8Array(await res.arrayBuffer()), total };
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) {
          throw err instanceof Error ? err : new Error("The download keeps failing — check your connection and try again");
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 1000 * attempt)));
      }
    }
  };

  const first = await getSlice(0);
  const total = first.total;
  const whole = new Uint8Array(total);
  whole.set(first.bytes, 0);
  let loaded = first.bytes.length;
  onBytes(loaded, total);

  const parts = Math.ceil(total / MIRROR_SLICE_BYTES);
  const waiting = Array.from({ length: parts - 1 }, (_, i) => i + 1);
  const next = async (): Promise<void> => {
    const part = waiting.shift();
    if (part === undefined) return;
    const { bytes } = await getSlice(part);
    const offset = part * MIRROR_SLICE_BYTES;
    if (offset + bytes.length > total) throw new Error("the download is bigger than announced");
    whole.set(bytes, offset);
    loaded += bytes.length;
    onBytes(loaded, total);
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(SLICES_AT_ONCE, waiting.length) }, next));
  if (loaded !== total) throw new Error("The download came out the wrong size — try again");
  return whole;
}

/**
 * Downloads a large file, surviving flaky connections: if no bytes arrive
 * for STALL_MS the request is dropped and picked up again from where it
 * stopped with a Range request, rather than starting 200 MB over. The
 * final size is checked against what the server announced, so a truncated
 * file never gets cached.
 *
 * When the size is announced, bytes go straight into one buffer of that
 * size. Collecting chunks and joining them at the end would briefly need
 * twice the model's size in memory, which is enough to get the tab killed
 * on a phone.
 */
export async function resumableDownload(
  url: string,
  onBytes: (loaded: number, total: number | null) => void,
  { attempts = MAX_ATTEMPTS }: { attempts?: number } = {}
): Promise<Uint8Array<ArrayBuffer>> {
  let chunks: Uint8Array[] = [];
  let whole: Uint8Array<ArrayBuffer> | null = null;
  let loaded = 0;
  let total: number | null = null;

  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    let stall = setTimeout(() => controller.abort(), STALL_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: loaded > 0 ? { Range: `bytes=${loaded}-` } : undefined,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Couldn't download ${url.split("/").pop()} (HTTP ${response.status})`);
      }
      if (loaded > 0 && response.status !== 206) {
        // The server ignored the Range header; start again from zero.
        chunks = [];
        loaded = 0;
      }
      if (total === null) {
        const range = response.headers.get("content-range")?.match(/\/(\d+)$/);
        total = range ? Number(range[1]) : Number(response.headers.get("content-length")) || null;
        if (total && loaded === 0) whole = new Uint8Array(total);
      }

      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(stall);
        stall = setTimeout(() => controller.abort(), STALL_MS);
        if (whole) {
          if (loaded + value.length > whole.length) throw new Error("the download is bigger than announced");
          whole.set(value, loaded);
        } else {
          chunks.push(value);
        }
        loaded += value.length;
        onBytes(loaded, total);
      }
      clearTimeout(stall);
      if (total !== null && loaded < total) throw new Error("connection closed early");
      break;
    } catch (err) {
      clearTimeout(stall);
      if (attempt >= attempts) {
        throw err instanceof Error && err.name !== "AbortError"
          ? err
          : new Error("The download keeps stalling — check your connection and try again");
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 1000 * attempt)));
    }
  }

  if (whole) return whole;
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

