"use client";

// Downloads a whole stem for the Studio. Stems can be served in slices —
// a private Blob store's stems pass through a Vercel function, whose
// responses are capped at 4.5 MB (see serveBlobRange) — so ask in ranges
// and stitch them together. With any other storage the first request
// usually returns the whole file (a 200) and this is a single fetch.

const SLICE = 4 * 1024 * 1024;
/** Slices in flight at once: plenty to fill the connection, without flooding the server. */
const PARALLEL = 6;
const ATTEMPTS = 3;

async function fetchRange(url: string, start: number, end: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
      // A 4xx won't get better by asking again.
      if (res.status >= 400 && res.status < 500) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= ATTEMPTS || (err as { final?: boolean }).final) {
        throw new Error(`Couldn't download the file (${err instanceof Error ? err.message : "network error"})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

export function fetchStem(stemId: string): Promise<ArrayBuffer> {
  return fetchInSlices(`/api/audio/stem/${stemId}`);
}

/**
 * Any file served like a stem (e.g. a song imported from a link), a slice
 * at a time, several at once. A slice that fails is asked for again
 * rather than failing the whole download.
 */
export async function fetchInSlices(
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const first = await fetchRange(url, 0, SLICE - 1);
  const head = new Uint8Array(await first.arrayBuffer());
  const total = Number(first.headers.get("content-range")?.split("/")[1]);
  if (first.status !== 206 || !total || head.length >= total) {
    onProgress?.(head.length, head.length);
    return head.buffer;
  }

  // Redirected to a CDN (R2, a public Blob store): ask it directly for the
  // rest, rather than going through the redirect again for every slice.
  const source = first.redirected && first.url ? first.url : url;
  const out = new Uint8Array(total);
  out.set(head, 0);
  let loaded = head.length;
  onProgress?.(loaded, total);
  const starts: number[] = [];
  for (let start = head.length; start < total; start += SLICE) starts.push(start);

  const next = async (): Promise<void> => {
    const start = starts.shift();
    if (start === undefined) return;
    const end = Math.min(total, start + SLICE) - 1;
    for (let attempt = 1; ; attempt++) {
      const bytes = new Uint8Array(await (await fetchRange(source, start, end)).arrayBuffer());
      if (bytes.length === end - start + 1) {
        out.set(bytes, start);
        break;
      }
      if (attempt >= ATTEMPTS) throw new Error("The download was cut short");
    }
    loaded += end - start + 1;
    onProgress?.(loaded, total);
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, starts.length) }, next));
  return out.buffer;
}
