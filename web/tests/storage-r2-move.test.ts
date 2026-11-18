// Moving from Vercel Blob to R2 without losing a song (lib/storage.ts,
// ensureStored): with R2 in use and the old Blob store still connected, a
// file R2 lacks is copied over from Blob the first time it's asked for —
// once, however many ask at the same moment — and a store that refuses
// (suspended) just means "not there", never a crash. Both stores are fakes
// on a local server.
//
//   node --import ./tests/support/register.mjs --test tests/storage-r2-move.test.ts

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

const blobFiles = new Map<string, Buffer>();
const r2Files = new Map<string, Buffer>();
let blobSuspended = false;
const calls: string[] = [];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const body = await new Promise<Buffer>((resolve) => {
    const parts: Buffer[] = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => resolve(Buffer.concat(parts)));
  });
  // The Blob API: head(key) is GET /?url=<key>.
  if (url.pathname === "/" && url.searchParams.has("url")) {
    calls.push(`blob head ${url.searchParams.get("url")}`);
    if (blobSuspended) {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "store_suspended", message: "This store has been suspended." } }));
    }
    const key = url.searchParams.get("url")!;
    const file = blobFiles.get(key);
    if (!file) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "not_found", message: "nf" } }));
    }
    const fileUrl = `${base}/blobfile/${key}`;
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        url: fileUrl,
        downloadUrl: `${fileUrl}?download=1`,
        pathname: key,
        size: file.length,
        contentType: "audio/mpeg",
        contentDisposition: "inline",
        cacheControl: "public, max-age=0",
        uploadedAt: new Date().toISOString(),
        etag: "x",
      })
    );
  }
  // A private Blob store's file: only with the token.
  if (url.pathname.startsWith("/blobfile/")) {
    const key = decodeURIComponent(url.pathname.slice("/blobfile/".length));
    calls.push(`blob get ${key}`);
    if (!req.headers.authorization?.startsWith("Bearer vercel_blob_rw_")) {
      res.writeHead(403);
      return res.end();
    }
    res.writeHead(200, { "content-type": "audio/mpeg" });
    return res.end(blobFiles.get(key));
  }
  // The S3 API of the R2 bucket "bkt" (path-style).
  if (url.pathname.startsWith("/bkt/")) {
    const key = url.pathname.slice("/bkt/".length).split("/").map(decodeURIComponent).join("/");
    calls.push(`r2 ${req.method} ${key}`);
    if (req.method === "PUT") {
      r2Files.set(key, body);
      res.writeHead(200);
      return res.end();
    }
    const file = r2Files.get(key);
    if (!file) {
      res.writeHead(404);
      return res.end();
    }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : file.length - 1, file.length - 1);
      res.writeHead(206, { "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${file.length}`, "content-type": "audio/mpeg" });
      return res.end(req.method === "HEAD" ? undefined : file.subarray(start, end + 1));
    }
    res.writeHead(200, { "content-length": file.length, "content-type": "audio/mpeg" });
    return res.end(req.method === "HEAD" ? undefined : file);
  }
  res.writeHead(404);
  res.end();
});

let base = "";
let storage: typeof import("../src/lib/storage.ts");

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    R2_BUCKET: "bkt",
    R2_ENDPOINT: base,
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_PUBLIC_URL: "https://cdn.example",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_store_secret",
    VERCEL_BLOB_API_URL: base,
  });
  storage = await import("../src/lib/storage.ts");
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("moving from Blob to R2", () => {
  test("a file only in Blob is copied into R2 the first time it's asked for, byte for byte", async () => {
    const song = randomBytes(300_000);
    blobFiles.set("stems/a/vocals.mp3", song);
    assert.equal(await storage.ensureStored("stems/a/vocals.mp3"), true);
    assert.ok(r2Files.get("stems/a/vocals.mp3")?.equals(song));

    calls.length = 0;
    assert.equal(await storage.ensureStored("stems/a/vocals.mp3"), true);
    assert.deepEqual(calls, [], "known to be in R2: not looked up again");
  });

  test("a file already in R2 never touches Blob", async () => {
    r2Files.set("stems/b/beat.mp3", randomBytes(1000));
    calls.length = 0;
    assert.equal(await storage.ensureStored("stems/b/beat.mp3"), true);
    assert.ok(calls.every((c) => c.startsWith("r2 ")), calls.join(", "));
  });

  test("many asking at once: copied once", async () => {
    blobFiles.set("stems/c/vocals.mp3", randomBytes(50_000));
    calls.length = 0;
    const answers = await Promise.all(Array.from({ length: 6 }, () => storage.ensureStored("stems/c/vocals.mp3")));
    assert.ok(answers.every(Boolean));
    assert.equal(calls.filter((c) => c === "r2 PUT stems/c/vocals.mp3").length, 1);
    assert.equal(calls.filter((c) => c === "blob get stems/c/vocals.mp3").length, 1);
  });

  test("reading and serving a Blob-only file go through the copy", async () => {
    const song = randomBytes(9_000_000);
    blobFiles.set("stems/d/vocals.mp3", song);
    const res = await storage.serveThroughApp("stems/d/vocals.mp3", "bytes=0-99");
    assert.equal(res.status, 206);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(song.subarray(0, 100)));

    blobFiles.set("results/e/beats.bin", Buffer.from("beats"));
    assert.equal((await storage.readObject("results/e/beats.bin"))?.toString(), "beats");
  });

  test("a suspended Blob store means 'not there', not a crash", async () => {
    blobSuspended = true;
    try {
      assert.equal(await storage.ensureStored("stems/gone/vocals.mp3"), false);
      assert.equal(await storage.readObject("stems/gone/vocals.mp3"), null);
      assert.equal((await storage.serveThroughApp("stems/gone/vocals.mp3", "bytes=0-9")).status, 404);
      // Files already moved still play.
      assert.equal(await storage.ensureStored("stems/a/vocals.mp3"), true);
    } finally {
      blobSuspended = false;
    }
  });

  test("with a public URL, stems redirect to it", () => {
    assert.equal(storage.publicUrl("stems/a/vocals.mp3"), "https://cdn.example/stems/a/vocals.mp3");
    assert.equal(storage.servesThroughApp("stems/a/vocals.mp3"), false);
    assert.equal(storage.storageBackend(), "r2");
    assert.equal(storage.storageLimitBytes(), 10e9);
  });
});
