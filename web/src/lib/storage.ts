import { createReadStream } from "fs";
import { stat, mkdir } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { AwsClient } from "aws4fetch";
import { head } from "@vercel/blob";
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
  | { type: "blob"; pathname: string; token: string; contentType: string };

/**
 * How the browser should upload the file for `key`. With Blob that's a
 * client token that can only write that one path, with that type and up to
 * MAX_STEM_BYTES, for an hour. With R2 it's a signed bucket URL valid for
 * an hour; locally it's `localPath`, a route on this app that checks
 * ownership and streams the body to disk.
 */
export async function createUploadTarget(key: string, localPath: string): Promise<UploadTarget> {
  const contentType = contentTypeFor(key);
  if (blobToken) {
    const token = await generateClientTokenFromReadWriteToken({
      token: blobToken,
      pathname: key,
      allowedContentTypes: [contentType],
      maximumSizeInBytes: MAX_STEM_BYTES,
      validUntil: Date.now() + 60 * 60 * 1000,
      addRandomSuffix: false,
    });
    return { type: "blob", pathname: key, token, contentType };
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
 * A stored object's size, and its public URL when the store assigns one
 * (Blob); null if it isn't there.
 */
export async function storedObject(key: string): Promise<{ size: number; url: string | null } | null> {
  if (blobToken) {
    try {
      const blob = await head(key, { token: blobToken });
      return { size: blob.size, url: blob.url };
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
