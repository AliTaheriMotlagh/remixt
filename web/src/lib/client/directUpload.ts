"use client";

// Uploads a file from the browser straight to storage, wherever the server
// said to put it (see createUploadTarget in lib/storage.ts): a signed PUT
// URL (R2, or this app on the local-disk backend), or Vercel Blob with a
// client token scoped to that one file.
//
// Blob is spoken to directly over XHR rather than through @vercel/blob's
// `put`, for three reasons that all showed up as uploads "frozen" on phones:
//
//   - progress: the library can only report it by sending the body as a
//     streamed fetch in Chrome, which needs HTTP/2 and fails behind many
//     proxies — so it was switched off, and a phone showed nothing at all
//     for minutes. XHR reports progress everywhere.
//   - retries: the library retries up to 10 times with ever-longer waits
//     that can't be interrupted; here a stalled request is dropped after
//     STALL_MS and tried again at once.
//   - big files go up in parts (several at once, each retried on its own),
//     so a dropped connection costs one 8 MB part, not the whole song.
//
// These are the same requests the library itself sends from Safari (XHR,
// same headers, same API version).
//
// Where the store can't be reached at all — Vercel's and Cloudflare's hosts
// are blocked in some countries (Iran among them) while this site isn't —
// or it refuses outright, the file goes through this app instead, a slice
// at a time, when the server offered a `relay` (see lib/uploadRelay.ts).
// Once the store has proved unreachable, later files go that way first.
//
// The uploads store keeps the screen on while a song goes up (see
// uploads.ts), but it can still turn off — a browser without the Wake Lock
// API, low-power mode, the user locking it. A phone pauses the page when it
// does, and whatever was in flight is lost — so a request that failed
// because of that isn't held against the upload: it waits for the page to
// be back, then carries on from the part it had reached.

import { isConstrainedDevice } from "./device";

export type UploadTarget = (
  | { type: "put"; url: string; headers: Record<string, string> }
  | {
      type: "blob";
      pathname: string;
      token: string;
      contentType: string;
      access: "public" | "private";
    }
) & {
  /** A route on this app that takes the file a slice at a time instead. */
  relay?: string;
};

type BlobTarget = Extract<UploadTarget, { type: "blob" }>;

/** An answer that won't change by asking again (not signed in, too big, bad token). */
export class FinalUploadError extends Error {}

/** No bytes sent for this long and a request is taken to be stuck. */
const STALL_MS = 45_000;
/**
 * The library's `put` (no progress to watch) is given this long: a minute,
 * plus the time it'd take at a slow 30 KB/s. Requests sent here have no
 * overall limit — only the stall timer: a slow phone line shared by several
 * requests made every big part "take too long" and start again from 0.
 */
const timeLimit = (bytes: number) => 60_000 + (bytes / 30_000) * 1000;
/** A try that sent at least this much made headway: it isn't counted against the request's tries. */
const HEADWAY_BYTES = 256 * 1024;
/** Tries for a whole file (PUT targets, and small files to Blob). */
const ATTEMPTS = 3;
/** Tries per part of a multipart upload — cheap, so more of them. */
const PART_ATTEMPTS = 5;
/** Blob's own part size; parts (all but the last) must be at least 5 MB. */
const PART_BYTES = 8 * 1024 * 1024;
/** Smaller than this, one request beats the two extra round trips parts need. */
const MULTIPART_ABOVE = 2 * PART_BYTES;
const PARTS_AT_ONCE = 4;
const BLOB_API_VERSION = "12";

// --- The screen turning off ---------------------------------------------------

/** How many times the page has been hidden, and since when (null while it's visible). */
let hides = 0;
let hiddenAt: number | null = null;
const onVisible = new Set<() => void>();
let watching = false;

function watchVisibility() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  if (document.hidden) hiddenAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hides++;
      hiddenAt = Date.now();
      return;
    }
    for (const resume of [...onVisible]) resume();
    hiddenAt = null;
  });
}

const isHidden = () => typeof document !== "undefined" && document.hidden;

/** Resolves once the page is on screen (at once if it is). */
export function untilVisible(): Promise<void> {
  watchVisibility();
  if (!isHidden()) return Promise.resolve();
  return new Promise((resolve) => {
    const resume = () => {
      onVisible.delete(resume);
      resolve();
    };
    onVisible.add(resume);
  });
}

/** Whether the page has been hidden since `mark` (a value of `hides`), or is now. */
const pausedSince = (mark: number) => hides !== mark || isHidden();

/** A pause before trying again, longer each time; while the device says it's offline, until it's back. */
const retryWait = (attempt: number) =>
  new Promise<void>((resolve) => {
    setTimeout(() => {
      if (typeof navigator === "undefined" || navigator.onLine !== false || typeof window === "undefined") return resolve();
      window.addEventListener("online", () => resolve(), { once: true });
    }, Math.min(8000, 1000 * attempt));
  });

/**
 * Counts what one try sent, so a try that made headway — on a slow line
 * that's most of them — isn't held against the request.
 */
function tryMeter(onProgress: (loaded: number) => void) {
  let best = 0;
  return {
    onProgress: (loaded: number) => {
      if (loaded > best) best = loaded;
      onProgress(loaded);
    },
    /** Whether this try got anywhere; resets for the next one. */
    madeHeadway() {
      const moved = best >= HEADWAY_BYTES;
      best = 0;
      return moved;
    },
  };
}

// --- How many requests at once ------------------------------------------------

/**
 * Every upload request on the page shares one connection: several songs,
 * each in several parts, each part its own request. Too many at once and
 * each gets so little of a phone's upload that none finishes — so they
 * take turns, a few at a time, whatever's sending them.
 */
let running = 0;
const turns: (() => void)[] = [];
const maxAtOnce = () => (isConstrainedDevice() ? 3 : 6);

async function takeTurn(): Promise<() => void> {
  if (running >= maxAtOnce()) await new Promise<void>((resolve) => turns.push(resolve));
  running++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    running--;
    turns.shift()?.();
  };
}

// --- Transport ---------------------------------------------------------------

export type SendRequest = {
  method: "PUT" | "POST";
  url: string;
  headers: Record<string, string>;
  body: Blob | string | null;
  /** Stops the request (the upload was cancelled). */
  signal?: AbortSignal;
  /** Called as the request actually goes out (it can wait its turn first, see takeTurn). */
  onStart?: () => void;
};
export type SendResponse = { status: number; text: string };
/**
 * Sends one request; `onProgress` gets the bytes sent so far. Rejects with
 * a NetworkError when there's no answer (offline, dropped, stalled).
 */
export type Send = (request: SendRequest, onProgress: (loaded: number) => void) => Promise<SendResponse>;

/** A request that never got an answer (offline, dropped, stalled). */
export class NetworkError extends Error {}

/** The user cancelled the upload. Final, so no loop tries it again. */
export class UploadCancelled extends FinalUploadError {
  constructor() {
    super("Cancelled");
    this.name = "AbortError";
  }
}

const xhrSend: Send = async (request, onProgress) => {
  const release = await takeTurn();
  try {
    if (request.signal?.aborted) throw new UploadCancelled();
    request.onStart?.();
    return await sendNow(request, onProgress);
  } finally {
    release();
  }
};

const sendNow: Send = (request, onProgress) =>
  new Promise((resolve, reject) => {
    watchVisibility();
    const xhr = new XMLHttpRequest();
    xhr.open(request.method, request.url);
    for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
    let stall = setTimeout(() => xhr.abort(), STALL_MS);
    let lastActive = Date.now();
    const alive = () => {
      lastActive = Date.now();
      clearTimeout(stall);
      stall = setTimeout(() => xhr.abort(), STALL_MS);
    };
    // Back from a screen that was off: a request that hasn't moved since
    // is dead (the phone dropped it), so it's retried now rather than
    // after the stall timer runs out.
    const resumed = () => {
      if (hiddenAt !== null && lastActive < hiddenAt && Date.now() - hiddenAt > 3000) xhr.abort();
    };
    onVisible.add(resumed);
    const settle = () => {
      clearTimeout(stall);
      onVisible.delete(resumed);
    };
    xhr.upload.onprogress = (e) => {
      alive();
      onProgress(e.loaded);
    };
    xhr.onprogress = alive;
    xhr.onload = () => {
      settle();
      resolve({ status: xhr.status, text: xhr.responseText });
    };
    const fail = (message: string) => () => {
      settle();
      reject(new NetworkError(message));
    };
    xhr.onerror = fail("Upload failed — check your connection");
    xhr.onabort = fail("The upload stalled — check your connection");
    request.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(request.body);
  });

/** A 4xx won't get better by asking again — except a timeout or rate limit. */
function isFinalStatus(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// --- PUT targets -------------------------------------------------------------

async function putWhole(
  target: Extract<UploadTarget, { type: "put" }>,
  body: Blob,
  onProgress: (loaded: number) => void,
  send: Send
) {
  const meter = tryMeter(onProgress);
  for (let attempt = 1; ; attempt++) {
    const mark = hides;
    try {
      const res = await send({ method: "PUT", url: target.url, headers: target.headers, body }, meter.onProgress);
      if (res.status >= 200 && res.status < 300) return;
      const message = `Upload failed (HTTP ${res.status})`;
      throw isFinalStatus(res.status) ? new FinalUploadError(message) : new Error(message);
    } catch (err) {
      if (err instanceof NetworkError && pausedSince(mark)) {
        // Lost to the screen turning off: doesn't count as a try.
        attempt--;
        meter.madeHeadway();
        onProgress(0);
        await untilVisible();
        continue;
      }
      if (err instanceof FinalUploadError) throw err;
      if (meter.madeHeadway()) attempt = 0;
      else if (attempt >= ATTEMPTS) throw err;
      onProgress(0);
      await retryWait(attempt);
    }
  }
}

// --- Vercel Blob -------------------------------------------------------------

function blobApi(path: string, pathname: string) {
  const base = process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL || "https://vercel.com/api/blob";
  return `${base}${path}?${new URLSearchParams({ pathname })}`;
}

/**
 * Progress over parts sent side by side: each part's bytes, and their
 * running total — so a progress event costs the same however many parts
 * the file has (adding them all up on every event grew with the file).
 */
export function partProgress(parts: number, onProgress: (loaded: number) => void) {
  const sent = new Array<number>(parts).fill(0);
  let total = 0;
  return (part: number, bytes: number) => {
    total += bytes - sent[part];
    sent[part] = bytes;
    onProgress(total);
  };
}

/** One request to the Blob API, tried again after a dropped connection or a server hiccup. */
async function blobRequest<T>(
  target: BlobTarget,
  request: { path: string; headers?: Record<string, string>; body: Blob | string | null },
  onProgress: (loaded: number) => void,
  { send, attempts }: { send: Send; attempts: number }
): Promise<T> {
  // A client token reads vercel_blob_client_<store id>_<payload>.
  const storeId = target.token.split("_")[3] ?? "";
  // The same id on every try, so the store can tell a retry from a new request.
  const requestId = `${storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const meter = tryMeter(onProgress);
  for (let attempt = 1, tries = 1; ; attempt++, tries++) {
    const mark = hides;
    try {
      const res = await send(
        {
          method: request.path === "/" ? "PUT" : "POST",
          url: blobApi(request.path, target.pathname),
          headers: {
            authorization: `Bearer ${target.token}`,
            "x-api-version": BLOB_API_VERSION,
            "x-api-blob-request-id": requestId,
            "x-api-blob-request-attempt": String(attempt - 1),
            "x-vercel-blob-store-id": storeId,
            "x-vercel-blob-access": target.access,
            "x-content-type": target.contentType,
            ...(request.body instanceof Blob ? { "x-content-length": String(request.body.size) } : {}),
            ...request.headers,
          },
          body: request.body,
        },
        meter.onProgress
      );
      if (res.status >= 200 && res.status < 300) return JSON.parse(res.text) as T;
      let code = "unknown_error";
      let message: string | undefined;
      try {
        const data = JSON.parse(res.text);
        code = data?.error?.code ?? code;
        message = data?.error?.message;
      } catch {
        // Not JSON — a proxy's error page, say.
      }
      const text = `Upload failed (${message ?? `HTTP ${res.status}`})`;
      const retryable =
        !isFinalStatus(res.status) || ["unknown_error", "service_unavailable", "internal_server_error"].includes(code);
      throw retryable ? new Error(text) : new FinalUploadError(text);
    } catch (err) {
      if (err instanceof NetworkError && pausedSince(mark)) {
        // Lost to the screen turning off: doesn't count as a try.
        tries--;
        meter.madeHeadway();
        onProgress(0);
        await untilVisible();
        continue;
      }
      if (err instanceof FinalUploadError) throw err;
      if (meter.madeHeadway()) tries = 0;
      else if (tries >= attempts) throw err;
      onProgress(0);
      await retryWait(Math.max(1, tries));
    }
  }
}

async function blobMultipart(target: BlobTarget, body: Blob, onProgress: (loaded: number) => void, send: Send) {
  const once = { send, attempts: ATTEMPTS };
  const { key, uploadId } = await blobRequest<{ key: string; uploadId: string }>(
    target,
    { path: "/mpu", headers: { "x-mpu-action": "create" }, body: null },
    () => {},
    once
  );
  const ids = { "x-mpu-key": encodeURIComponent(key), "x-mpu-upload-id": uploadId };

  const count = Math.ceil(body.size / PART_BYTES);
  const progress = partProgress(count + 1, onProgress);
  const done: { partNumber: number; etag: string }[] = [];

  let nextPart = 1;
  let failed: unknown = null;
  const next = async (): Promise<void> => {
    const partNumber = nextPart++;
    if (partNumber > count || failed) return;
    const part = body.slice((partNumber - 1) * PART_BYTES, Math.min(body.size, partNumber * PART_BYTES));
    try {
      const { etag } = await blobRequest<{ etag: string }>(
        target,
        { path: "/mpu", headers: { ...ids, "x-mpu-action": "upload", "x-mpu-part-number": String(partNumber) }, body: part },
        (loaded) => progress(partNumber, loaded),
        { send, attempts: PART_ATTEMPTS }
      );
      progress(partNumber, part.size);
      done.push({ partNumber, etag });
    } catch (err) {
      // The others stop taking new parts; the upload fails as a whole.
      failed ??= err;
      throw err;
    }
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(PARTS_AT_ONCE, count) }, next));

  done.sort((a, b) => a.partNumber - b.partNumber);
  await blobRequest(
    target,
    {
      path: "/mpu",
      headers: { ...ids, "x-mpu-action": "complete", "content-type": "application/json" },
      body: JSON.stringify(done),
    },
    () => {},
    once
  );
}

/**
 * Set once the direct route has failed without ever reaching Blob while the
 * library's got through: from then on this page uses the library.
 */
let useLibrary = false;

/**
 * The library's own `put`, as a last resort (without progress — see the
 * top of this file — and raced against a time limit, since its retries
 * can't be interrupted mid-wait).
 */
async function libraryPut(target: BlobTarget, body: Blob) {
  const { put } = await import("@vercel/blob/client");
  const controller = new AbortController();
  const request = put(target.pathname, body, {
    access: target.access,
    token: target.token,
    contentType: target.contentType,
    multipart: body.size > MULTIPART_ABOVE,
    abortSignal: controller.signal,
  });
  // Settled either way below; this only stops a late failure after a
  // timeout being reported as unhandled.
  request.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The upload took too long — check your connection"));
    }, timeLimit(body.size));
  });
  try {
    await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function putToBlob(target: BlobTarget, body: Blob, onProgress: (loaded: number) => void, send: Send) {
  if (useLibrary && send === xhrSend) return libraryPut(target, body);
  try {
    if (body.size > MULTIPART_ABOVE) await blobMultipart(target, body, onProgress, send);
    else await blobRequest(target, { path: "/", body }, onProgress, { send, attempts: ATTEMPTS });
  } catch (err) {
    // Never got an answer from Blob, while the device says it's online:
    // something between here and Blob may be refusing these requests. Try
    // the library's way once before giving up.
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (!(err instanceof NetworkError) || !online || send !== xhrSend) throw err;
    onProgress(0);
    await libraryPut(target, body);
    useLibrary = true;
  }
}

// --- Through this app ---------------------------------------------------------

/** The store never answered at all: no use trying it again. */
class StoreUnreachable extends FinalUploadError {}

/** No answer from the store, and nothing sent, for this long on the first request: it's unreachable. */
const FIRST_CONTACT_MS = 20_000;

/**
 * Set once the store has proved unreachable: later files go through the
 * relay first. Remembered in this browser for a while, so the next page
 * (or visit) doesn't wait FIRST_CONTACT_MS on a store that's blocked from
 * here before every upload — on a phone that wait came before every song.
 */
const RELAY_FIRST_KEY = "remixt.upload.relayFirst";
const RELAY_FIRST_MS = 12 * 60 * 60 * 1000;
let relayFirst = readRelayFirst();

function readRelayFirst(): boolean {
  try {
    const until = Number(globalThis.localStorage?.getItem(RELAY_FIRST_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function rememberRelayFirst(on: boolean) {
  relayFirst = on;
  try {
    if (on) globalThis.localStorage?.setItem(RELAY_FIRST_KEY, String(Date.now() + RELAY_FIRST_MS));
    else globalThis.localStorage?.removeItem(RELAY_FIRST_KEY);
  } catch {
    // Storage blocked: remembered for this page only.
  }
}

/** Relayed slices, at most (under Vercel's 4.5 MB request cap; lib/uploadRelay.ts RELAY_PART_BYTES). */
export const RELAY_PART_BYTES = 3 * 1024 * 1024;
const RELAY_AT_ONCE = 3;

function sessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** One request, tried again after a dropped connection or a server hiccup; resolves on a 2xx. */
async function sendRetrying(
  request: SendRequest,
  onProgress: (loaded: number) => void,
  send: Send,
  attempts: number
): Promise<SendResponse> {
  const meter = tryMeter(onProgress);
  for (let attempt = 1; ; attempt++) {
    const mark = hides;
    try {
      const res = await send(request, meter.onProgress);
      if (res.status >= 200 && res.status < 300) return res;
      let message = `Upload failed (HTTP ${res.status})`;
      try {
        const error = JSON.parse(res.text)?.error;
        if (typeof error === "string") message = error;
      } catch {
        // Not JSON.
      }
      throw isFinalStatus(res.status) ? new FinalUploadError(message) : new Error(message);
    } catch (err) {
      if (err instanceof NetworkError && pausedSince(mark)) {
        attempt--;
        meter.madeHeadway();
        onProgress(0);
        await untilVisible();
        continue;
      }
      if (err instanceof FinalUploadError) throw err;
      if (meter.madeHeadway()) attempt = 0;
      else if (attempt >= attempts) throw err;
      onProgress(0);
      await retryWait(Math.max(1, attempt));
    }
  }
}

/** Sends `body` to this app's relay a slice at a time (several at once), then has it joined. */
async function relayUpload(relay: string, body: Blob, onProgress: (loaded: number) => void, send: Send) {
  const session = sessionId();
  const join = relay.includes("?") ? "&" : "?";
  const count = Math.max(1, Math.ceil(body.size / RELAY_PART_BYTES));
  const setSent = partProgress(count, onProgress);
  let nextPart = 0;
  let failed = false;
  const next = async (): Promise<void> => {
    const part = nextPart++;
    if (part >= count || failed) return;
    const slice = body.slice(part * RELAY_PART_BYTES, Math.min(body.size, (part + 1) * RELAY_PART_BYTES));
    try {
      await sendRetrying(
        {
          method: "PUT",
          url: `${relay}${join}relay=${session}&part=${part}`,
          headers: { "Content-Type": "application/octet-stream" },
          body: slice,
        },
        (loaded) => setSent(part, Math.min(loaded, slice.size)),
        send,
        PART_ATTEMPTS
      );
    } catch (err) {
      failed = true;
      throw err;
    }
    setSent(part, slice.size);
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(RELAY_AT_ONCE, count) }, next));
  await sendRetrying(
    { method: "POST", url: `${relay}${join}relay=${session}&parts=${count}`, headers: {}, body: null },
    () => {},
    send,
    ATTEMPTS
  );
}

/**
 * Uploads `body` to `target`. `onProgress` gets the bytes sent so far
 * (it can go back down when a request is tried again), and the whole size
 * at the end. Pass a File or Blob where there is one: it's read from disk
 * as it's sent, never held in memory whole.
 *
 * With a `relay`, a store that can't be reached (or that refuses) is
 * given up on at once and the file goes through this app instead.
 */
/** `send`, stopped by `signal`: a cancelled request rejects at once with UploadCancelled. */
function cancellable(send: Send, signal: AbortSignal): Send {
  return (request, onProgress) => {
    if (signal.aborted) return Promise.reject(new UploadCancelled());
    return new Promise<SendResponse>((resolve, reject) => {
      // Either stops the request: the upload being cancelled, or the
      // request's own signal (the store's first-contact timer, see upload).
      const both = new AbortController();
      const own = request.signal;
      const stopOwn = () => both.abort();
      const stop = () => {
        both.abort();
        reject(new UploadCancelled());
      };
      signal.addEventListener("abort", stop, { once: true });
      if (own?.aborted) both.abort();
      else own?.addEventListener("abort", stopOwn, { once: true });
      send({ ...request, signal: both.signal }, onProgress)
        .then(resolve, reject)
        .finally(() => {
          signal.removeEventListener("abort", stop);
          own?.removeEventListener("abort", stopOwn);
        });
    });
  };
}

export async function upload(
  target: UploadTarget,
  body: Blob | Uint8Array,
  onProgress: (loaded: number) => void = () => {},
  send: Send = xhrSend,
  signal?: AbortSignal
) {
  if (signal) {
    signal.throwIfAborted();
    send = cancellable(send, signal);
  }
  const blob = body instanceof Blob ? body : new Blob([body as BlobPart]);
  const relay = target.relay;
  if (relay && relayFirst) {
    try {
      await relayUpload(relay, blob, onProgress, send);
      onProgress(blob.size);
      return;
    } catch (err) {
      if (err instanceof UploadCancelled) throw err;
      // The relay that worked before doesn't now: the store may be back — try it, and stop preferring the relay.
      rememberRelayFirst(false);
      onProgress(0);
    }
  }
  // With a relay to fall back on, a store that never answers isn't waited
  // on through every retry: its first silence — no answer and not a byte
  // taken in FIRST_CONTACT_MS — sends the file the other way. (A filtered
  // connection often hangs rather than failing, which looked like the
  // upload freezing after the split.)
  let reached = false;
  const direct: Send = relay
    ? async (request, progress) => {
        const mark = hides;
        const contact = new AbortController();
        // Timed from when the request goes out, not while it waits its turn.
        let timer: ReturnType<typeof setTimeout> | null = null;
        const arm = () => {
          if (!reached && !timer) timer = setTimeout(() => contact.abort(), FIRST_CONTACT_MS);
        };
        const outer = request.signal;
        const stop = () => contact.abort();
        outer?.addEventListener("abort", stop, { once: true });
        try {
          const res = await send({ ...request, signal: contact.signal, onStart: arm }, (loaded) => {
            // Bytes going out means the store took the connection: a drop
            // after this is the line's fault, not a block — it's retried
            // here rather than sent through the (slower) relay from 0.
            if (loaded > 0) {
              reached = true;
              if (timer) clearTimeout(timer);
            }
            progress(loaded);
          });
          reached = true;
          return res;
        } catch (err) {
          outer?.throwIfAborted();
          if (err instanceof NetworkError && !reached && !pausedSince(mark)) throw new StoreUnreachable(err.message);
          throw err;
        } finally {
          if (timer) clearTimeout(timer);
          outer?.removeEventListener("abort", stop);
        }
      }
    : send;
  try {
    if (target.type === "blob") await putToBlob(target, blob, onProgress, direct);
    else await putWhole(target, blob, onProgress, direct);
  } catch (err) {
    if (!relay || err instanceof UploadCancelled) throw err;
    if (err instanceof StoreUnreachable) rememberRelayFirst(true);
    onProgress(0);
    await relayUpload(relay, blob, onProgress, send);
  }
  onProgress(blob.size);
}

/** For tests: forget that the store proved unreachable. */
export function resetRelayPreference() {
  rememberRelayFirst(false);
}
