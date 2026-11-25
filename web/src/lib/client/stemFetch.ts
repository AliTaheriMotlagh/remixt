"use client";

// Downloads a whole stem for the Studio. Stems can be served in slices —
// a private Blob store's stems pass through a Vercel function, whose
// responses are capped at 4.5 MB (see serveBlobRange) — so ask in ranges
// and stitch them together. With any other storage the first request
// usually returns the whole file (a 200) and this is a single fetch.

import { pause } from "./connection";
import { cacheGet, cachePut } from "./localCache";

const SLICE = 4 * 1024 * 1024;
/** Slices in flight at once: plenty to fill the connection, without flooding the server. */
const PARALLEL = 6;
const ATTEMPTS = 3;

/**
 * For a download nobody is waiting on (a stem kept for later): how hard it
 * may pull on the connection. Left out, a download takes all it can get.
 */
export type Pace = {
  /** Slices in flight at once (default PARALLEL). */
  parallel?: number;
  /** Bytes a slice (default 4 MB): smaller ones give way sooner. */
  slice?: number;
  /** Awaited before each slice: resolves when it's fine to go on (nothing more urgent wants the line). */
  before?: () => Promise<void>;
};

/**
 * How long the store's CDN gets to start answering before it's taken to be
 * unreachable from here — blocked in some countries, where a connection
 * can hang rather than fail — and the file comes through this app instead.
 */
export const CDN_ANSWER_MS = 8000;

class Unreachable extends Error {
  final = true;
}

/**
 * How long a line may go quiet. A connection through a poor VPN or a
 * filtered network often hangs rather than fails — no answer, or a body
 * that stops half-way and never ends — and a download waiting on it would
 * wait for ever (the radio, which readies one song at a time, with it).
 * Changeable for tests.
 */
export const LINE = {
  /** No answer at all to a request for this long: asked again. */
  answerMs: 30_000,
  /** No bytes of an answer's body for this long: dropped, and the rest asked for again. */
  stallMs: 20_000,
};

/**
 * A signal that gives up on a request after `ms` — so a request a hanging
 * line never answers can't stall what waits on it (the radio's feed
 * polling, which only asks again once the last ask is over).
 */
export function within(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Waits before asking again: 1 s, 2 s, 4 s… (a line that's down often comes
 * back within seconds) — and no longer than that: the moment the device is
 * back online or its network changes (Wi-Fi ↔ mobile, a VPN reconnecting),
 * it asks again at once.
 */
function backoff(attempt: number) {
  return pause(Math.min(8000, 1000 * 2 ** (attempt - 1)));
}

async function fetchRange(url: string, start: number, end: number, answerWithin?: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      // Only the answer's start is timed here: a slow line may take long over the body (readBody watches that).
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), answerWithin ?? LINE.answerMs);
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: controller.signal })
        .catch((err) => {
          if (!controller.signal.aborted) throw err;
          // A CDN being tried out that doesn't answer is given up on (the app serves the file instead);
          // any other request is asked again.
          throw answerWithin ? new Unreachable("no answer") : new Error("no answer");
        })
        .finally(() => clearTimeout(timer));
      // A 4xx won't get better by asking again.
      if (res.status >= 400 && res.status < 500) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= ATTEMPTS || (err as { final?: boolean }).final) {
        throw Object.assign(new Error(`Couldn't download the file (${err instanceof Error ? err.message : "network error"})`), {
          final: (err as { final?: boolean }).final,
        });
      }
      await backoff(attempt);
    }
  }
}

/**
 * An answer's body, chunk by chunk as it arrives, given to `take` (which
 * returns false once it has all it wants). A body that goes quiet for
 * LINE.stallMs is dropped with an error — after `take` has had everything
 * that did arrive, so the caller can carry on from there.
 */
export async function readBody(res: Response, take: (chunk: Uint8Array) => boolean | void): Promise<void> {
  if (!res.body) {
    take(new Uint8Array(await res.arrayBuffer()));
    return;
  }
  const reader = res.body.getReader();
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const quiet = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("the line went quiet")), LINE.stallMs);
    });
    try {
      const { done, value } = await Promise.race([reader.read(), quiet]);
      if (done) return;
      if (value?.length && take(value) === false) {
        void reader.cancel().catch(() => {});
        return;
      }
    } catch (err) {
      void reader.cancel().catch(() => {});
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The whole file in one request (no Range), a few tries. */
async function fetchWhole(url: string, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LINE.answerMs);
      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { final: res.status >= 400 && res.status < 500 });
      const announced = Number(res.headers.get("content-length"));
      const chunks: Uint8Array[] = [];
      let size = 0;
      await readBody(res, (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        if (announced) onProgress?.(size, announced);
      });
      if (announced && size < announced) throw new Error("the download was cut short");
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) bytes.set(chunk, (at += chunk.length) - chunk.length);
      onProgress?.(size, size);
      return bytes.buffer;
    } catch (err) {
      if (attempt >= ATTEMPTS || (err as { final?: boolean }).final) {
        throw new Error(`Couldn't download the file (${err instanceof Error ? err.message : "network error"})`);
      }
      await backoff(attempt);
    }
  }
}

/**
 * A stem's MP3. Kept on disk (localCache.ts) once downloaded — a stem's
 * file never changes under its id — so a song opened again, a draft
 * reopened, or a vocal's original beat listened to again costs no download.
 */
export async function fetchStem(
  stemId: string,
  onProgress?: (loaded: number, total: number) => void,
  pace?: Pace
): Promise<ArrayBuffer> {
  const kept = await cacheGet<Blob>("stem", stemId);
  if (kept) {
    try {
      return await kept.arrayBuffer();
    } catch {
      // The browser lost the file behind it: download it again.
    }
  }
  const bytes = await fetchInSlices(`/api/audio/stem/${stemId}`, onProgress, pace);
  // Copied as it's put, so the caller can decode (and detach) `bytes` at once.
  void cachePut("stem", stemId, bytes, bytes.byteLength);
  return bytes;
}

/**
 * Set once the store's CDN has proved unreachable from here: files come
 * through this app from then on — remembered for a day, so the next visit
 * doesn't wait on the CDN again first.
 */
const VIA_APP_KEY = "remixt:via-app";
const VIA_APP_MS = 24 * 60 * 60 * 1000;
let viaApp = (() => {
  try {
    return Date.now() - Number(globalThis.localStorage?.getItem(VIA_APP_KEY) ?? 0) < VIA_APP_MS;
  } catch {
    return false;
  }
})();

function rememberViaApp() {
  viaApp = true;
  try {
    globalThis.localStorage?.setItem(VIA_APP_KEY, String(Date.now()));
  } catch {
    // Private mode: this page remembers it, the next doesn't.
  }
}

/** The same file, served through this app rather than by a redirect to the store's CDN. */
function throughApp(url: string): string | null {
  // This app's own routes (as a path, or a full URL to one), not some other site.
  const pathname = /^https?:\/\//.test(url) ? new URL(url).pathname : url;
  if (!pathname.startsWith("/api/") || /[?&]via=app/.test(url)) return null;
  return `${url}${url.includes("?") ? "&" : "?"}via=app`;
}

/**
 * Any file served like a stem (e.g. a song imported from a link), a slice
 * at a time, several at once. A slice that fails is asked for again
 * rather than failing the whole download. A file the app redirects to the
 * store's CDN, where that CDN can't be reached (it's blocked in some
 * countries), comes through the app instead.
 */
export async function fetchInSlices(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  pace: Pace = {}
): Promise<ArrayBuffer> {
  const fallback = throughApp(url);
  if (fallback && viaApp) return fetchSlices(fallback, onProgress, pace);
  try {
    return await fetchSlices(url, onProgress, pace, fallback ? CDN_ANSWER_MS : undefined);
  } catch (err) {
    if (!fallback) throw err;
    const bytes = await fetchSlices(fallback, onProgress, pace).catch(() => {
      throw err;
    });
    rememberViaApp();
    return bytes;
  }
}

async function fetchSlices(
  url: string,
  onProgress: ((loaded: number, total: number) => void) | undefined,
  { parallel = PARALLEL, slice = SLICE, before }: Pace,
  answerWithin?: number
): Promise<ArrayBuffer> {
  await before?.();
  const first = await fetchRange(url, 0, slice - 1, answerWithin);
  // Redirected to a CDN (R2, a public Blob store): ask it directly for the
  // rest, rather than going through the redirect again for every slice.
  const source = first.redirected && first.url ? first.url : url;
  if (first.status !== 206) {
    // The whole file in this answer. Should it break off, it's asked for again whole.
    const announced = Number(first.headers.get("content-length"));
    const chunks: Uint8Array[] = [];
    let size = 0;
    const whole = await readBody(first, (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (announced) onProgress?.(size, announced);
    }).then(
      () => !announced || size >= announced,
      () => false
    );
    if (!whole) return fetchWhole(source, onProgress);
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) bytes.set(chunk, (at += chunk.length) - chunk.length);
    onProgress?.(size, size);
    return bytes.buffer;
  }
  const total = Number(first.headers.get("content-range")?.split("/")[1]);
  if (!total) {
    // Only part of the file came back, and how big the whole is can't be
    // read — a CDN that doesn't expose Content-Range to other origins. It
    // used to be taken as the whole file, handing on just its first slice
    // (a song cut off, or one that won't decode at all). Get it in one go.
    void first.body?.cancel().catch(() => {});
    return fetchWhole(source, onProgress);
  }

  const out = new Uint8Array(total);
  let loaded = 0;
  /** Writes what arrived for the part starting at `at`, up to `end`; false once it's full. */
  const writer = (at: number, end: number) => (chunk: Uint8Array) => {
    const room = end - at + 1;
    const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
    out.set(piece, at);
    at += piece.length;
    loaded += piece.length;
    onProgress?.(loaded, total);
    return at <= end;
  };

  // The first answer's body: what arrives is kept even if it breaks off.
  const firstEnd = Math.min(total - 1, Number(/bytes \d+-(\d+)\//.exec(first.headers.get("content-range") ?? "")?.[1] ?? slice - 1));
  let headGot = 0;
  const firstWrite = writer(0, firstEnd);
  await readBody(first, (chunk) => {
    headGot += Math.min(chunk.length, firstEnd + 1 - headGot);
    return firstWrite(chunk);
  }).catch(() => {});
  if (headGot >= total) return out.buffer;

  const starts: number[] = [];
  for (let start = headGot; start < total; start += slice) starts.push(start);

  const next = async (): Promise<void> => {
    const start = starts.shift();
    if (start === undefined) return;
    const end = Math.min(total, start + slice) - 1;
    // Each try carries on from the last byte that arrived: a line that drops
    // every minute still gets the file, a piece at a time. Only tries in a
    // row that bring nothing at all count towards giving up. A server may
    // also answer with less than was asked for (a proxy that caps its
    // responses): the rest is asked for again.
    for (let from = start, attempt = 1; from <= end; ) {
      await before?.();
      let got = 0;
      try {
        const res = await fetchRange(source, from, end);
        const sent = /bytes (\d+)-(\d+)\//.exec(res.headers.get("content-range") ?? "");
        // Not the part asked for (a 200 with the whole file, or another range): nothing of it is used.
        if (res.status !== 206 || (sent && Number(sent[1]) !== from)) {
          void res.body?.cancel().catch(() => {});
        } else {
          const until = sent ? Math.min(end, Number(sent[2])) : end;
          const write = writer(from, until);
          await readBody(res, (chunk) => {
            got += Math.min(chunk.length, until + 1 - from - got);
            return write(chunk);
          }).catch(() => {});
        }
      } catch (err) {
        if ((err as { final?: boolean }).final) throw err;
      }
      if (got > 0) {
        from += got;
        attempt = 1;
      } else if (++attempt > ATTEMPTS) {
        throw new Error("The download was cut short");
      } else {
        await backoff(attempt - 1);
      }
    }
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(parallel, starts.length) }, next));
  return out.buffer;
}
