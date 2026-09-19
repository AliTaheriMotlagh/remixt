import { createReadStream } from "fs";
import { stat, mkdir, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";

// Everything this app stores — original uploads and separated stems — lives
// on local disk under STORAGE_DIR (repo-root `storage/` by default) and is
// served back through /api/files/<key>. Nothing leaves the machine.
export const STORAGE_DIR = path.resolve(
  process.env.STORAGE_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "..", "storage")
);

// Absolute base URL of this app. The separation service downloads the
// original track over HTTP, so it needs a URL rather than a path.
export const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");

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

export async function writeStorageFile(key: string, data: Buffer): Promise<string> {
  const full = resolveKey(key);
  if (!full) throw new Error(`invalid storage key: ${key}`);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ full, data);
  return key;
}

// Streams a request body straight to disk, so a 60MB upload never has to sit
// in memory. Returns the number of bytes written.
export async function writeStorageStream(
  key: string,
  body: ReadableStream<Uint8Array>
): Promise<number> {
  const full = resolveKey(key);
  if (!full) throw new Error(`invalid storage key: ${key}`);
  await mkdir(path.dirname(full), { recursive: true });

  const { createWriteStream } = await import("fs");
  const { pipeline } = await import("stream/promises");
  const out = createWriteStream(/* turbopackIgnore: true */ full);
  await pipeline(Readable.fromWeb(body as never), out);
  return (await stat(/* turbopackIgnore: true */ full)).size;
}

export function storageUrl(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// Serves a stored file with Range support, which the browser needs to seek
// and scrub within a stem (Vercel Blob's CDN used to do this for us).
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
