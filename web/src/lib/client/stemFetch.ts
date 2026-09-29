"use client";

// Downloads a whole stem for the Studio. Stems can be served in slices —
// a private Blob store's stems pass through a Vercel function, whose
// responses are capped at 4.5 MB (see serveBlobRange) — so ask in ranges
// and stitch them together. With any other storage the first request
// usually returns the whole file (a 200) and this is a single fetch.

const SLICE = 4 * 1024 * 1024;

async function fetchRange(url: string, start: number, end: number) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok) throw new Error(`Couldn't load the stem (HTTP ${res.status})`);
  return res;
}

export function fetchStem(stemId: string): Promise<ArrayBuffer> {
  return fetchInSlices(`/api/audio/stem/${stemId}`);
}

/** Any file served like a stem (e.g. a song imported from a link), a slice at a time. */
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

  const out = new Uint8Array(total);
  out.set(head, 0);
  let loaded = head.length;
  onProgress?.(loaded, total);
  const slices: Promise<void>[] = [];
  for (let start = head.length; start < total; start += SLICE) {
    const end = Math.min(total, start + SLICE) - 1;
    slices.push(
      fetchRange(url, start, end).then(async (res) => {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length !== end - start + 1) throw new Error("The download was cut short");
        out.set(bytes, start);
        loaded += bytes.length;
        onProgress?.(loaded, total);
      })
    );
  }
  await Promise.all(slices);
  return out.buffer;
}
