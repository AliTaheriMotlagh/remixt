import { createReadStream } from "fs";
import { mkdir, readdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { AwsClient } from "aws4fetch";
import { del, head, list, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

// Where stems live. Three backends, picked by environment:
//
// - "blob": Vercel Blob. Used when BLOB_READ_WRITE_TOKEN is set, which
//   Vercel does by itself once a Blob store is connected to the project.
// - "r2": Cloudflare R2 (any S3-compatible bucket works). Used when
//   R2_BUCKET is set.
// - "local": files on disk under STORAGE_DIR (repo-root `storage/` by
//   default), uploaded and streamed through this app. For development and
//   the single-server Docker image.
//
// With Blob and R2, browsers upload straight to the store with a
// short-lived credential and play stems from its public URL, so audio
// never passes through the web server — which is what lets the app run on
// free serverless hosting with its small request-size limits.

// Vercel names the variable BLOB_READ_WRITE_TOKEN, unless the store was
// connected with a custom prefix (e.g. STEMS_READ_WRITE_TOKEN) — so accept
// any variable that holds a Blob read-write token.
function findBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  return Object.entries(process.env).find(
    ([name, value]) => name.endsWith("READ_WRITE_TOKEN") && value?.startsWith("vercel_blob_rw_")
  )?.[1];
}

const blobToken = process.env.R2_BUCKET ? undefined : findBlobToken();

/**
 * Why uploads can't work in this environment, if they can't. Serverless
 * hosts like Vercel have no writable disk, so the local backend is only
 * usable on a real server; say so plainly instead of failing mid-upload.
 */
export function storageProblem(): string | null {
  if (blobToken || r2 || !process.env.VERCEL) return null;
  return "File storage isn't set up: connect a Vercel Blob store to this project (Storage tab), then redeploy.";
}

type BlobAccess = "public" | "private";
let blobAccessCheck: Promise<BlobAccess> | null = null;

/**
 * Whether the connected Blob store is public or private. It's fixed when
 * the store is created, the two need different handling, and uploading
 * with the wrong one is rejected — so find out by writing a tiny marker
 * file once per server instance rather than trusting a setting.
 */
function blobAccess(): Promise<BlobAccess> {
  blobAccessCheck ??= (async () => {
    const probe = (access: BlobAccess) =>
      put(".remixt/access-check.txt", "ok", {
        access,
        token: blobToken,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/plain",
      });
    try {
      await probe("private");
      return "private";
    } catch {
      await probe("public");
      return "public";
    }
  })();
  blobAccessCheck.catch(() => (blobAccessCheck = null));
  return blobAccessCheck;
}

/** Largest stem accepted: 20 minutes of 192 kbps MP3 is ~29 MB. */
export const MAX_STEM_BYTES = 40 * 1024 * 1024;

const r2 = process.env.R2_BUCKET
  ? {
      bucket: process.env.R2_BUCKET,
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      publicUrl: (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, ""),
      client: new AwsClient({
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
        service: "s3",
        region: "auto",
      }),
    }
  : null;

export const STORAGE_DIR = path.resolve(
  process.env.STORAGE_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "..", "storage")
);

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".webm": "audio/webm",
  ".opus": "audio/ogg",
  ".mp4": "audio/mp4",
};

export function contentTypeFor(key: string): string {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

// Maps a storage key ("stems/<id>/vocals.mp3") to an absolute path, refusing
// anything that escapes STORAGE_DIR — keys reach here straight from URLs.
export function resolveKey(key: string): string | null {
  const full = path.resolve(STORAGE_DIR, key);
  const rel = path.relative(STORAGE_DIR, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

function objectUrl(key: string) {
  return `${r2!.endpoint}/${r2!.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export type UploadTarget =
  | { type: "put"; url: string; headers: Record<string, string> }
  | { type: "blob"; pathname: string; token: string; contentType: string; access: BlobAccess };

/**
 * How the browser should upload the file for `key`. With Blob that's a
 * client token that can only write that one path (as often as it takes),
 * with that type and up to MAX_STEM_BYTES, for an hour. With R2 it's a signed bucket URL valid for
 * an hour; locally it's `localPath`, a route on this app that checks
 * ownership and streams the body to disk.
 */
export async function createUploadTarget(
  key: string,
  localPath: string,
  maxBytes = MAX_STEM_BYTES
): Promise<UploadTarget> {
  const contentType = contentTypeFor(key);
  if (blobToken) {
    const token = await generateClientTokenFromReadWriteToken({
      token: blobToken,
      pathname: key,
      allowedContentTypes: [contentType],
      maximumSizeInBytes: maxBytes,
      validUntil: Date.now() + 60 * 60 * 1000,
      addRandomSuffix: false,
      // Uploads are retried — by the browser after a timeout, and by the
      // Blob library itself after a dropped connection — and a first try
      // may have landed even though its answer never arrived. Without
      // this, every retry after that fails with "this blob already
      // exists", and the stem (or queued song) can never be uploaded.
      allowOverwrite: true,
    });
    return { type: "blob", pathname: key, token, contentType, access: await blobAccess() };
  }
  const headers = { "Content-Type": contentType };
  if (!r2) return { type: "put", url: localPath, headers };
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", "3600");
  const signed = await r2.client.sign(new Request(url, { method: "PUT" }), {
    aws: { signQuery: true },
  });
  return { type: "put", url: signed.url, headers };
}

/**
 * A stored object's size, and its public URL when it has one (a public
 * Blob store); null if it isn't there.
 */
export async function storedObject(key: string): Promise<{ size: number; url: string | null } | null> {
  if (blobToken) {
    try {
      const blob = await head(key, { token: blobToken });
      // A private store's URLs need the secret token, so they're useless
      // to a browser — those stems are served by serveBlobRange instead.
      const isPublic = (await blobAccess()) === "public";
      return { size: blob.size, url: isPublic ? blob.url : null };
    } catch {
      return null;
    }
  }
  const size = await storedSize(key);
  return size === null ? null : { size, url: null };
}

async function storedSize(key: string): Promise<number | null> {
  if (r2) {
    const res = await r2.client.fetch(objectUrl(key), { method: "HEAD" });
    if (!res.ok) return null;
    return Number(res.headers.get("content-length") ?? 0);
  }
  const full = resolveKey(key);
  if (!full) return null;
  try {
    const info = await stat(/* turbopackIgnore: true */ full);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/** True when stems live in Blob and have to be served through this app. */
export function servesThroughApp(key: string): boolean {
  return !!blobToken && !/^https?:\/\//.test(key);
}

/**
 * Vercel caps a function's response at 4.5 MB, and a stem is bigger, so a
 * private Blob stem is served a slice at a time: every response is a 206
 * of at most this much, and players (and lib/client/stemFetch.ts) ask for
 * the next slice themselves.
 */
const MAX_SLICE = 4 * 1024 * 1024;

export async function serveBlobRange(key: string, rangeHeader: string | null): Promise<Response> {
  let blob;
  try {
    blob = await head(key, { token: blobToken });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const size = blob.size;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "bytes=0-");
  const start = match?.[1] ? parseInt(match[1], 10) : 0;
  const wanted = match?.[2] ? parseInt(match[2], 10) : size - 1;
  if (!match || start >= size || start > wanted) {
    return new Response("Range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const end = Math.min(wanted, size - 1, start + MAX_SLICE - 1);

  const upstream = await fetch(blob.url, {
    headers: { Authorization: `Bearer ${blobToken}`, Range: `bytes=${start}-${end}` },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("Couldn't read the stem", { status: 502 });
  }
  return new Response(upstream.body, {
    status: 206,
    headers: {
      "Content-Type": blob.contentType || contentTypeFor(key),
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

/** Public URL for a stored object when the backend has one (R2). */
export function publicUrl(key: string): string | null {
  if (!r2) return null;
  return `${r2.publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// Streams a request body straight to disk (local backend only), so an
// upload never has to sit in memory. Stops at `maxBytes` and reports the
// total, so the caller can reject oversized files.
export async function writeStorageStream(
  key: string,
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<number> {
  const full = resolveKey(key);
  if (!full) throw new Error(`invalid storage key: ${key}`);
  await mkdir(path.dirname(full), { recursive: true });

  const { createWriteStream } = await import("fs");
  const { pipeline } = await import("stream/promises");
  const { Transform } = await import("stream");
  let written = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      if (written > maxBytes) callback(new Error("too large"));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as never),
      limit,
      createWriteStream(/* turbopackIgnore: true */ full)
    );
  } catch (err) {
    if (written > maxBytes) return written;
    throw err;
  }
  return (await stat(/* turbopackIgnore: true */ full)).size;
}

// Serves a stored file with Range support, which the browser needs to seek
// and scrub within a stem. Local backend only; R2 serves its own ranges.
export async function serveStorageFile(
  key: string,
  rangeHeader: string | null
): Promise<Response> {
  const full = resolveKey(key);
  if (!full) return new Response("Not found", { status: 404 });

  let size: number;
  try {
    const info = await stat(/* turbopackIgnore: true */ full);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = contentTypeFor(key);
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");
  if (match) {
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
    if (Number.isNaN(start) || start > end || start >= size) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const stream = Readable.toWeb(
      createReadStream(/* turbopackIgnore: true */ full, { start, end })
    ) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ full)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// --- Files the server writes itself ------------------------------------------------
//
// A song fetched from a link (see lib/linkImport.ts) is parked under
// imports/ just long enough for the browser to download it, split it and
// throw it away, the same way it would a file from the device.

/** Stores `body` at `key`, in whichever backend is in use. */
export async function putObject(key: string, body: Buffer): Promise<void> {
  const contentType = contentTypeFor(key);
  if (blobToken) {
    await put(key, body, {
      access: await blobAccess(),
      token: blobToken,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      multipart: body.length > 8 * 1024 * 1024,
    });
    return;
  }
  if (r2) {
    const res = await r2.client.fetch(objectUrl(key), {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "Content-Type": contentType },
    });
    if (!res.ok) throw new Error(`storage PUT failed (HTTP ${res.status})`);
    return;
  }
  const full = resolveKey(key);
  if (!full) throw new Error(`invalid storage key: ${key}`);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ full, body);
}

export async function deleteObject(key: string): Promise<void> {
  if (blobToken) return del(key, { token: blobToken });
  if (r2) {
    await r2.client.fetch(objectUrl(key), { method: "DELETE" });
    return;
  }
  const full = resolveKey(key);
  if (full) await rm(/* turbopackIgnore: true */ full, { force: true });
}

/**
 * Serves a stored object to the browser, with Range support: from the
 * CDN for R2 and a public Blob store (straight there, at full speed), in
 * slices through this app for a private Blob store, or from disk.
 */
export async function serveObject(key: string, rangeHeader: string | null): Promise<Response> {
  if (blobToken) {
    if ((await blobAccess()) === "public") {
      const stored = await storedObject(key);
      if (!stored?.url) return new Response("Not found", { status: 404 });
      return Response.redirect(stored.url, 302);
    }
    return serveBlobRange(key, rangeHeader);
  }
  const remote = publicUrl(key);
  if (remote) return Response.redirect(remote, 302);
  return serveStorageFile(key, rangeHeader);
}

/**
 * Deletes whatever's under `prefix` and older than `maxAgeMs` — imports
 * whose browser never came back for them. R2 can't be listed cheaply
 * from here; give its bucket a lifecycle rule for imports/ instead.
 */
export async function sweepOld(prefix: string, maxAgeMs: number): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  if (blobToken) {
    const { blobs } = await list({ prefix, token: blobToken, limit: 1000 });
    const stale = blobs.filter((b) => b.uploadedAt.getTime() < cutoff).map((b) => b.url);
    if (stale.length) await del(stale, { token: blobToken });
    return;
  }
  if (r2) return;
  const dir = resolveKey(prefix);
  if (!dir) return;
  const entries = await readdir(/* turbopackIgnore: true */ dir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const info = await stat(/* turbopackIgnore: true */ full).catch(() => null);
    if (info && info.mtimeMs < cutoff) await rm(/* turbopackIgnore: true */ full, { force: true });
  }
}

/**
 * Deletes a stem's file given what's stored in stems.file_url: a storage
 * key, a Blob URL, or (from older builds) an R2 public URL. Anything
 * else — a URL outside our storage — is left alone.
 */
export async function deleteStemFile(fileUrl: string): Promise<void> {
  if (!/^https?:\/\//.test(fileUrl)) return deleteObject(fileUrl);
  if (blobToken) {
    await del(fileUrl, { token: blobToken });
    return;
  }
  const base = r2?.publicUrl;
  if (base && fileUrl.startsWith(`${base}/`)) {
    const key = fileUrl.slice(base.length + 1).split("/").map(decodeURIComponent).join("/");
    await deleteObject(key);
  }
}
