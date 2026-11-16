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
// Phones and tablets always go through the relay first. A phone's upload
// is the slowest, least steady link there is, and the store only takes a
// song whole (or in 8 MB parts): one stall near the end and the lot is sent
// again. The relay takes slices of any size, each one saved the moment it's
// answered — so the slices are cut to what the line really carries (about
// five seconds' worth, measured from the answers), a drop costs one slice,
// and an upload that's interrupted (a reload, the line going away) carries
// on from what was saved (`resume`).
//
// "Bytes sent" isn't bytes arrived: the browser reports what it has handed
// to the phone, and a megabyte or more can still be waiting in the phone's
// buffers when it says 100%. On a slow line that tail takes longer than the
// stall timer — which used to stop requests that were about to succeed, and
// send them again, for ever. So once the whole body is handed over, the
// answer is waited for as long as that tail can honestly take (tailWait).
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
/**
 * …but only this many times per request. A line that gets some of a request
 * out and then dies, every time, never finishes it: without a limit that
 * was an upload going round for ever (and never trying the relay).
 */
const HEADWAY_RESTARTS = 3;
/** The most that can be waiting in the device's buffers after the browser says it's all sent. */
const TAIL_BUFFER_BYTES = 2 * 1024 * 1024;
/** A line slower than this (bytes a millisecond: about 4 KB/s) isn't waited on any longer than one this slow. */
const SLOWEST_RATE = 4;
/** The longest an answer is waited for once everything's handed over. */
const TAIL_MAX_MS = 4 * 60_000;
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
  /** The server may take this long to answer once it has everything (joining a big file, say). */
  answerMs?: number;
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

/**
 * One request on the wire, with nothing watching it: `done` settles with
 * the answer, or rejects with a NetworkError when the line drops or it's
 * stopped (`abort`). `sent` reports bytes handed over, `answering` that the
 * answer has started to arrive. The browser's is XHR; tests play a phone's
 * line (tests/support/line.ts).
 */
export type Wire = (
  request: SendRequest,
  events: { sent: (loaded: number) => void; answering: () => void }
) => { done: Promise<SendResponse>; abort: () => void };

function bodyBytes(body: SendRequest["body"]): number {
  if (!body) return 0;
  return typeof body === "string" ? body.length : body.size;
}

/**
 * How long to wait for the answer once the whole body (`bytes`, handed
 * over in `tookMs`) is with the device. What's left is in its buffers, out
 * of sight: up to TAIL_BUFFER_BYTES, leaving at the speed the rest went —
 * and a body that fit in the buffers at once says nothing about the line,
 * so it's given the time a slow one would need.
 */
export function tailWait(bytes: number, tookMs: number): number {
  const waiting = Math.min(bytes, TAIL_BUFFER_BYTES);
  const carried = bytes - waiting;
  const rate = carried > 0 && tookMs > 0 ? Math.max(SLOWEST_RATE, carried / tookMs) : SLOWEST_RATE;
  return Math.min(TAIL_MAX_MS, Math.max(STALL_MS, (2 * waiting) / rate));
}

/**
 * Decides when a request is stuck, and calls `stop`: nothing handed over
 * for STALL_MS while there's more to hand over — or, once it's all handed
 * over, no answer in the time its tail can take (tailWait; `answerMs` if
 * the server needs longer).
 */
export function stallWatch(bytes: number, stop: () => void, answerMs = 0) {
  const startedAt = Date.now();
  let lastActive = startedAt;
  let timer: ReturnType<typeof setTimeout>;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(stop, ms);
  };
  const allSent = () => arm(Math.max(answerMs, tailWait(bytes, Date.now() - startedAt)));
  if (bytes === 0) allSent();
  else arm(STALL_MS);
  return {
    sent(loaded: number) {
      lastActive = Date.now();
      if (loaded >= bytes) allSent();
      else arm(STALL_MS);
    },
    answering() {
      lastActive = Date.now();
      arm(STALL_MS);
    },
    lastActive: () => lastActive,
    done: () => clearTimeout(timer),
  };
}

/** `request` over `wire`, stopped when it's stuck, cancelled, or lost to a screen that was off. */
function watched(wire: Wire, request: SendRequest, onProgress: (loaded: number) => void): Promise<SendResponse> {
  watchVisibility();
  let line: ReturnType<Wire> | null = null;
  const stop = () => line?.abort();
  const watch = stallWatch(bodyBytes(request.body), stop, request.answerMs);
  // Back from a screen that was off: a request that hasn't moved since
  // is dead (the phone dropped it), so it's retried now rather than
  // after the stall timer runs out.
  const resumed = () => {
    if (hiddenAt !== null && watch.lastActive() < hiddenAt && Date.now() - hiddenAt > 3000) stop();
  };
  onVisible.add(resumed);
  request.signal?.addEventListener("abort", stop, { once: true });
  line = wire(request, {
    sent: (loaded) => {
      watch.sent(loaded);
      onProgress(loaded);
    },
    answering: watch.answering,
  });
  return line.done.finally(() => {
    watch.done();
    onVisible.delete(resumed);
    request.signal?.removeEventListener("abort", stop);
  });
}

/** A `Send` over `wire`: requests take turns (takeTurn) and each is watched for a stall. */
export function sender(wire: Wire): Send {
  return async (request, onProgress) => {
    const release = await takeTurn();
    try {
      if (request.signal?.aborted) throw new UploadCancelled();
      request.onStart?.();
      return await watched(wire, request, onProgress);
    } finally {
      release();
    }
  };
}

const xhrWire: Wire = (request, events) => {
  const xhr = new XMLHttpRequest();
  xhr.open(request.method, request.url);
  for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
  const bytes = bodyBytes(request.body);
  const done = new Promise<SendResponse>((resolve, reject) => {
    xhr.upload.onprogress = (e) => events.sent(e.loaded);
    // The last progress event can come short of the end: this one says it's all handed over.
    xhr.upload.onload = () => events.sent(bytes);
    xhr.onprogress = () => events.answering();
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new NetworkError("Upload failed — check your connection"));
    xhr.onabort = () => reject(new NetworkError("The upload stalled — check your connection"));
  });
  xhr.send(request.body);
  return { done, abort: () => xhr.abort() };
};

const xhrSend = sender(xhrWire);

/** A 4xx won't get better by asking again — except a timeout or rate limit. */
function isFinalStatus(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// --- Trying again ------------------------------------------------------------

/**
 * Runs `once` (one request; it's told which try this is, from 0) until it
 * answers. A try lost to the screen turning off doesn't count; nor does one
 * that made headway (HEADWAY_BYTES), a few times (HEADWAY_RESTARTS) — a slow
 * line gets its chance, a line that never finishes a request doesn't go
 * round for ever. A FinalUploadError ends it at once.
 */
async function retrying<T>(
  once: (onProgress: (loaded: number) => void, attempt: number) => Promise<T>,
  onProgress: (loaded: number) => void,
  attempts: number
): Promise<T> {
  const meter = tryMeter(onProgress);
  let restarts = 0;
  for (let attempt = 0, tries = 1; ; attempt++, tries++) {
    const mark = hides;
    try {
      return await once(meter.onProgress, attempt);
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
      if (meter.madeHeadway() && restarts < HEADWAY_RESTARTS) {
        restarts++;
        tries = 0;
      } else if (tries >= attempts) throw err;
      onProgress(0);
      await retryWait(Math.max(1, tries));
    }
  }
}

/** The error a response that isn't a 2xx stands for: final if asking again won't change it. */
function statusError(res: SendResponse): Error {
  let message = `Upload failed (HTTP ${res.status})`;
  try {
    const error = JSON.parse(res.text)?.error;
    if (typeof error === "string") message = error;
  } catch {
    // Not JSON.
  }
  return isFinalStatus(res.status) ? new FinalUploadError(message) : new Error(message);
}

// --- PUT targets -------------------------------------------------------------

function putWhole(
  target: Extract<UploadTarget, { type: "put" }>,
  body: Blob,
  onProgress: (loaded: number) => void,
  send: Send
) {
  return retrying(
    async (progress) => {
      const res = await send({ method: "PUT", url: target.url, headers: target.headers, body }, progress);
      if (res.status >= 200 && res.status < 300) return;
      throw statusError(res);
    },
    onProgress,
    ATTEMPTS
  );
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
function blobRequest<T>(
  target: BlobTarget,
  request: { path: string; headers?: Record<string, string>; body: Blob | string | null },
  onProgress: (loaded: number) => void,
  { send, attempts }: { send: Send; attempts: number }
): Promise<T> {
  // A client token reads vercel_blob_client_<store id>_<payload>.
  const storeId = target.token.split("_")[3] ?? "";
  // The same id on every try, so the store can tell a retry from a new request.
  const requestId = `${storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  return retrying(
    async (progress, attempt) => {
      const res = await send(
        {
          method: request.path === "/" ? "PUT" : "POST",
          url: blobApi(request.path, target.pathname),
          headers: {
            authorization: `Bearer ${target.token}`,
            "x-api-version": BLOB_API_VERSION,
            "x-api-blob-request-id": requestId,
            "x-api-blob-request-attempt": String(attempt),
            "x-vercel-blob-store-id": storeId,
            "x-vercel-blob-access": target.access,
            "x-content-type": target.contentType,
            ...(request.body instanceof Blob ? { "x-content-length": String(request.body.size) } : {}),
            ...request.headers,
          },
          body: request.body,
        },
        progress
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
    },
    onProgress,
    attempts
  );
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
/** …and at least: smaller and the round trips cost more than the bytes. */
const RELAY_MIN_BYTES = 64 * 1024;
/** The first slices, before anything is known about the line. */
const RELAY_FIRST_BYTES = 256 * 1024;
/** How long a slice should take: short enough that a drop costs little and the line's speed is known early. */
const SLICE_MS = 5000;
/** Most slices a file is cut into (lib/uploadRelay.ts allows twice this, for slices sent again smaller). */
const RELAY_SLICES = 512;
/** Slices that fail one after another, with none answered in between, before the upload stops for now. */
const RELAY_FAILS = 6;
/** Slices that get through before a size that failed is tried again. */
const RELAY_PROBE_AFTER = 16;
const relayAtOnce = () => (isConstrainedDevice() ? 2 : 3);

/** A slice the relay holds: where it starts in the file, and how long it is. */
export type RelaySlice = [at: number, bytes: number];
/**
 * What it takes to carry an upload on where it stopped — after a reload,
 * or the next try once the line is back: the relay's name for it, the
 * file's size (it must be the same file), and the slices already saved.
 */
export type RelayResume = { session: string; size: number; sent: RelaySlice[] };

/** The relay answered, but not with a yes, again and again: it's the relay that's failing, not the line. */
class RelayFailing extends Error {}

function sessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * How big the next slice should be: about SLICE_MS' worth at `rate` (bytes
 * a millisecond, measured from answers — what really arrived, not what the
 * browser says it sent), never under `floor`.
 */
export function sliceBytes(rate: number | null, floor = RELAY_MIN_BYTES): number {
  const wanted = rate === null ? RELAY_FIRST_BYTES : Math.round((rate * SLICE_MS) / RELAY_MIN_BYTES) * RELAY_MIN_BYTES;
  return Math.min(RELAY_PART_BYTES, Math.max(floor, RELAY_MIN_BYTES, wanted));
}

/** The stretches of a `size`-byte file that `sent` doesn't cover, in order; null if `sent` makes no sense. */
export function unsent(sent: RelaySlice[], size: number): [from: number, to: number][] | null {
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [at, bytes] of [...sent].sort((a, b) => a[0] - b[0])) {
    if (!Number.isInteger(at) || !Number.isInteger(bytes) || bytes <= 0 || at < cursor || at + bytes > size) return null;
    if (at > cursor) gaps.push([cursor, at]);
    cursor = at + bytes;
  }
  if (cursor < size) gaps.push([cursor, size]);
  return gaps;
}

/**
 * Sends `body` to this app's relay in slices (a few at once), then has
 * them joined. Every slice answered is saved there, so nothing answered is
 * ever sent twice — not after a failed slice, not after `resume`.
 */
async function relayUpload(
  relay: string,
  body: Blob,
  onProgress: (loaded: number) => void,
  send: Send,
  { resume, onResume }: Pick<UploadOptions, "resume" | "onResume"> = {}
) {
  const size = body.size;
  const and = relay.includes("?") ? "&" : "?";
  // Never so small that a big file needs more slices than the relay joins.
  const floor = Math.max(RELAY_MIN_BYTES, Math.ceil(size / RELAY_SLICES / RELAY_MIN_BYTES) * RELAY_MIN_BYTES);
  const kept = resume && resume.size === size && unsent(resume.sent, size) ? resume : null;
  const session = kept?.session ?? sessionId();
  /** What the relay holds: each slice's length by where it starts. */
  const sent = new Map<number, number>(kept?.sent ?? []);
  let saved = [...sent.values()].reduce((a, b) => a + b, 0);
  /** Bytes handed over for the slices on their way, by where each starts. */
  const flying = new Map<number, number>();
  const report = () => {
    let total = saved;
    for (const loaded of flying.values()) total += loaded;
    onProgress(Math.min(size, total));
  };
  const keep = () => onResume?.({ session, size, sent: [...sent] });
  /** Bytes a millisecond through one request, from the answers so far. */
  let rate: number | null = null;
  /**
   * The biggest slice worth trying. A slice that fails halves it (some
   * lines cut off any request past a certain size or time, however fast
   * the small ones go); it's let back up once enough have got through.
   */
  let ceiling = RELAY_PART_BYTES;
  let sinceFailure = 0;
  let failsInARow = 0;
  let refusals = 0;
  let stopped: unknown = null;

  /** Sends every stretch in `todo`, a slice at a time. */
  const sendAll = async (todo: [number, number][]) => {
    const take = (): [number, number] | null => {
      const first = todo[0];
      if (!first) return null;
      const [from, to] = first;
      let end = Math.min(to, from + Math.min(ceiling, sliceBytes(rate, floor)));
      // Not worth a request of its own: the last bit goes with this slice.
      if (to - end < floor && to - from <= RELAY_PART_BYTES) end = to;
      if (end === to) todo.shift();
      else first[0] = end;
      return [from, end];
    };
    const worker = async (): Promise<void> => {
      for (;;) {
        if (stopped) return;
        const range = take();
        if (!range) return;
        const [from, end] = range;
        const slice = body.slice(from, end);
        const mark = hides;
        let startedAt = Date.now();
        try {
          const res = await send(
            {
              method: "PUT",
              url: `${relay}${and}relay=${session}&at=${from}`,
              headers: { "Content-Type": "application/octet-stream" },
              body: slice,
              onStart: () => (startedAt = Date.now()),
            },
            (loaded) => {
              flying.set(from, Math.min(loaded, slice.size));
              report();
            }
          );
          if (res.status < 200 || res.status >= 300) {
            refusals++;
            throw statusError(res);
          }
          const measured = slice.size / Math.max(1, Date.now() - startedAt);
          rate = rate === null ? measured : (rate + measured) / 2;
          failsInARow = 0;
          refusals = 0;
          if (++sinceFailure >= RELAY_PROBE_AFTER) {
            ceiling = Math.min(RELAY_PART_BYTES, ceiling * 2);
            sinceFailure = 0;
          }
          flying.delete(from);
          sent.set(from, slice.size);
          saved += slice.size;
          report();
          keep();
        } catch (err) {
          flying.delete(from);
          todo.unshift([from, end]);
          report();
          if (err instanceof FinalUploadError) {
            stopped ??= err;
            throw err;
          }
          if (err instanceof NetworkError) {
            refusals = 0;
            if (pausedSince(mark)) {
              // Lost to the screen turning off: not the line's fault.
              await untilVisible();
              continue;
            }
          }
          // Whatever went wrong, less is at stake in a smaller slice.
          rate = (rate ?? RELAY_FIRST_BYTES / SLICE_MS) / 2;
          const half = RELAY_MIN_BYTES * Math.max(1, Math.floor(slice.size / 2 / RELAY_MIN_BYTES));
          ceiling = Math.max(floor, Math.min(ceiling, half));
          sinceFailure = 0;
          if (++failsInARow >= RELAY_FAILS) {
            stopped ??= refusals >= RELAY_FAILS ? new RelayFailing(err instanceof Error ? err.message : "Upload failed") : err;
            throw stopped;
          }
          await retryWait(failsInARow);
        }
      }
    };
    await Promise.all(Array.from({ length: relayAtOnce() }, worker));
    if (stopped) throw stopped;
  };

  report();
  for (let round = 1; ; round++) {
    await sendAll(unsent([...sent], size) ?? [[0, size]]);
    const parts = [...sent].sort((a, b) => a[0] - b[0]);
    // The join reads and writes the whole file on the server: a big one takes a while.
    const answerMs = 60_000 + size / 500;
    const res = await retrying(
      async (progress) => {
        const res = await send(
          {
            method: "POST",
            url: `${relay}${and}relay=${session}&size=${size}`,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parts }),
            answerMs,
          },
          progress
        );
        if ((res.status >= 200 && res.status < 300) || res.status === 409) return res;
        throw statusError(res);
      },
      () => {},
      ATTEMPTS
    );
    if (res.status !== 409) return;
    // Slices the relay no longer has (swept, or never landed): those go again, once.
    let missing: unknown = null;
    try {
      missing = JSON.parse(res.text)?.missing;
    } catch {
      // Not JSON.
    }
    if (round >= 2 || !Array.isArray(missing) || missing.length === 0) throw statusError(res);
    for (const at of missing) {
      const bytes = sent.get(Number(at));
      if (bytes === undefined) continue;
      sent.delete(Number(at));
      saved -= bytes;
    }
    keep();
  }
}

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

export type UploadOptions = {
  /** Where an earlier try at this same file got to through the relay: it carries on from there. */
  resume?: RelayResume | null;
  /** Called each time the relay saves a slice, with what to keep for `resume`. */
  onResume?: (state: RelayResume) => void;
  /**
   * Go through the relay before trying the store. Left out: on phones and
   * tablets, when carrying an upload on, and once the store has proved
   * unreachable from here.
   */
  relayFirst?: boolean;
};

/**
 * Uploads `body` to `target`. `onProgress` gets the bytes sent so far
 * (it can go back down when a request is tried again), and the whole size
 * at the end. Pass a File or Blob where there is one: it's read from disk
 * as it's sent, never held in memory whole.
 *
 * With a `relay`, a store that can't be reached (or that refuses, or that
 * a request never gets all the way to) is given up on and the file goes
 * through this app instead — first of all on a phone (see the top of this
 * file). What the relay saved is never sent again.
 */
export async function upload(
  target: UploadTarget,
  body: Blob | Uint8Array,
  onProgress: (loaded: number) => void = () => {},
  send: Send = xhrSend,
  signal?: AbortSignal,
  options: UploadOptions = {}
) {
  if (signal) {
    signal.throwIfAborted();
    send = cancellable(send, signal);
  }
  const blob = body instanceof Blob ? body : new Blob([body as BlobPart]);
  const relay = target.relay;
  const viaRelay = () => relayUpload(relay!, blob, onProgress, send, options);
  const first = options.relayFirst ?? (relayFirst || isConstrainedDevice() || !!options.resume?.sent.length);
  let relayFailed = false;
  if (relay && first) {
    try {
      await viaRelay();
      onProgress(blob.size);
      return;
    } catch (err) {
      // The line's fault (it's kept, and carried on next try), a cancel, or
      // an answer that won't change: the upload's own failure. Only a relay
      // that keeps answering with errors is gone round — the store may work.
      if (!(err instanceof RelayFailing)) throw err;
      relayFailed = true;
      if (relayFirst) rememberRelayFirst(false);
      onProgress(0);
    }
  }
  // With a relay to fall back on, a store that never answers isn't waited
  // on through every retry: its first silence — no answer and not a byte
  // taken in FIRST_CONTACT_MS — sends the file the other way. (A filtered
  // connection often hangs rather than failing, which looked like the
  // upload freezing after the split.)
  let reached = false;
  const direct: Send =
    relay && !relayFailed
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
              // after this is the line's fault, not a block.
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
    if (!relay || relayFailed || err instanceof UploadCancelled) throw err;
    if (err instanceof StoreUnreachable) rememberRelayFirst(true);
    onProgress(0);
    await viaRelay();
  }
  onProgress(blob.size);
}

/** For tests: forget that the store proved unreachable. */
export function resetRelayPreference() {
  rememberRelayFirst(false);
}
