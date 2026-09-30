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
// The screen is allowed to turn off meanwhile. A phone pauses the page when
// it does, and whatever was in flight is lost — so a request that failed
// because of that isn't held against the upload: it waits for the page to
// be back, then carries on from the part it had reached.

export type UploadTarget =
  | { type: "put"; url: string; headers: Record<string, string> }
  | {
      type: "blob";
      pathname: string;
      token: string;
      contentType: string;
      access: "public" | "private";
    };

type BlobTarget = Extract<UploadTarget, { type: "blob" }>;

/** An answer that won't change by asking again (not signed in, too big, bad token). */
export class FinalUploadError extends Error {}

/** No bytes sent for this long and a request is taken to be stuck. */
const STALL_MS = 45_000;
/** A request's overall limit: a minute, plus the time it'd take at a slow 30 KB/s. */
const timeLimit = (bytes: number) => 60_000 + (bytes / 30_000) * 1000;
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

const retryWait = (attempt: number) => new Promise((resolve) => setTimeout(resolve, Math.min(8000, 1000 * attempt)));

// --- Transport ---------------------------------------------------------------

export type SendRequest = {
  method: "PUT" | "POST";
  url: string;
  headers: Record<string, string>;
  body: Blob | string | null;
};
export type SendResponse = { status: number; text: string };
/**
 * Sends one request; `onProgress` gets the bytes sent so far. Rejects with
 * a NetworkError when there's no answer (offline, dropped, stalled).
 */
export type Send = (request: SendRequest, onProgress: (loaded: number) => void) => Promise<SendResponse>;

/** A request that never got an answer (offline, dropped, stalled). */
export class NetworkError extends Error {}

const xhrSend: Send = (request, onProgress) =>
  new Promise((resolve, reject) => {
    watchVisibility();
    const xhr = new XMLHttpRequest();
    xhr.open(request.method, request.url);
    for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
    const size = request.body instanceof Blob ? request.body.size : (request.body?.length ?? 0);
    xhr.timeout = timeLimit(size);
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
    xhr.ontimeout = fail("The upload took too long — check your connection");
    xhr.onabort = fail("The upload stalled — check your connection");
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
  for (let attempt = 1; ; attempt++) {
    const mark = hides;
    try {
      const res = await send({ method: "PUT", url: target.url, headers: target.headers, body }, onProgress);
      if (res.status >= 200 && res.status < 300) return;
      const message = `Upload failed (HTTP ${res.status})`;
      throw isFinalStatus(res.status) ? new FinalUploadError(message) : new Error(message);
    } catch (err) {
      if (err instanceof NetworkError && pausedSince(mark)) {
        // Lost to the screen turning off: doesn't count as a try.
        attempt--;
        onProgress(0);
        await untilVisible();
        continue;
      }
      if (attempt >= ATTEMPTS || err instanceof FinalUploadError) throw err;
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
        onProgress
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
        onProgress(0);
        await untilVisible();
        continue;
      }
      if (tries >= attempts || err instanceof FinalUploadError) throw err;
      onProgress(0);
      await retryWait(tries);
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
  const waiting = Array.from({ length: count }, (_, i) => i + 1);
  const sent = new Array<number>(count + 1).fill(0);
  const report = () => onProgress(sent.reduce((a, b) => a + b, 0));
  const done: { partNumber: number; etag: string }[] = [];

  let failed: unknown = null;
  const next = async (): Promise<void> => {
    const partNumber = waiting.shift();
    if (partNumber === undefined || failed) return;
    const part = body.slice((partNumber - 1) * PART_BYTES, Math.min(body.size, partNumber * PART_BYTES));
    try {
      const { etag } = await blobRequest<{ etag: string }>(
        target,
        { path: "/mpu", headers: { ...ids, "x-mpu-action": "upload", "x-mpu-part-number": String(partNumber) }, body: part },
        (loaded) => ((sent[partNumber] = loaded), report()),
        { send, attempts: PART_ATTEMPTS }
      );
      sent[partNumber] = part.size;
      report();
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

/**
 * Uploads `body` to `target`. `onProgress` gets the bytes sent so far
 * (it can go back down when a request is tried again), and the whole size
 * at the end. Pass a File or Blob where there is one: it's read from disk
 * as it's sent, never held in memory whole.
 */
export async function upload(
  target: UploadTarget,
  body: Blob | Uint8Array,
  onProgress: (loaded: number) => void = () => {},
  send: Send = xhrSend
) {
  const blob = body instanceof Blob ? body : new Blob([body as BlobPart]);
  if (target.type === "blob") await putToBlob(target, blob, onProgress, send);
  else await putWhole(target, blob, onProgress, send);
  onProgress(blob.size);
}
