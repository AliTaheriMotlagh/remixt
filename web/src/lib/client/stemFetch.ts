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

/** The whole file in one request (no Range), a few tries. */
async function fetchWhole(url: string, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { final: res.status >= 400 && res.status < 500 });
      const bytes = await res.arrayBuffer();
      const announced = Number(res.headers.get("content-length"));
      if (announced && bytes.byteLength < announced) throw new Error("the download was cut short");
      onProgress?.(bytes.byteLength, bytes.byteLength);
      return bytes;
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
  // Redirected to a CDN (R2, a public Blob store): ask it directly for the
  // rest, rather than going through the redirect again for every slice.
  const source = first.redirected && first.url ? first.url : url;
  if (first.status !== 206) {
    onProgress?.(head.length, head.length);
    return head.buffer;
  }
  const total = Number(first.headers.get("content-range")?.split("/")[1]);
  if (!total) {
    // Only part of the file came back, and how big the whole is can't be
    // read — a CDN that doesn't expose Content-Range to other origins. It
    // used to be taken as the whole file, handing on just its first slice
    // (a song cut off, or one that won't decode at all). Get it in one go.
    return fetchWhole(source, onProgress);
  }
  if (head.length >= total) {
    onProgress?.(head.length, head.length);
    return head.buffer;
  }

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
    // A server may answer with less than was asked for (a proxy that caps
    // its responses): whatever part it says it sent is kept, and the rest
    // asked for again. A body shorter than it claims was cut off: retried.
    for (let from = start, attempt = 1; from <= end; ) {
      const res = await fetchRange(source, from, end);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const sent = /bytes (\d+)-(\d+)\//.exec(res.headers.get("content-range") ?? "");
      const whole = sent
        ? Number(sent[1]) === from && Number(sent[2]) <= end && bytes.length === Number(sent[2]) - from + 1
        : bytes.length === end - from + 1;
      if (whole && bytes.length > 0) {
        out.set(bytes, from);
        from += bytes.length;
        loaded += bytes.length;
        onProgress?.(loaded, total);
        attempt = 1;
      } else if (++attempt > ATTEMPTS) {
        throw new Error("The download was cut short");
      }
    }
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, starts.length) }, next));
  return out.buffer;
}
