// Downloading the big files the in-browser models need (the splitter's
// ~172 MB htdemucs, the beat tracker's ~10 MB, ONNX Runtime's WebAssembly)
// once, and keeping them in Cache Storage, so every visit after the first
// loads them from disk. Shared by the workers that run the models.

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

  const bytes = await resumableDownload(url, (loaded, total) => onBytes(loaded, total, false));
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
  onBytes: (loaded: number, total: number | null) => void
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
      if (attempt >= MAX_ATTEMPTS) {
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

