// upload (lib/client/directUpload.ts): how every file leaves the browser —
// a phone's song for the split queue, and every stem. Against a fake Vercel
// Blob API: the store must end up with the file byte for byte, a dropped
// part must cost only that part, and a refusal must fail at once.
//
//   node --test tests/direct-upload.test.ts

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  FinalUploadError,
  NetworkError,
  untilVisible,
  upload,
  type Send,
  type UploadTarget,
} from "../src/lib/client/directUpload.ts";

const TOKEN = "vercel_blob_client_store123_payload";
const MB = 1024 * 1024;

type Seen = { method: string; path: string; headers: IncomingMessage["headers"]; size: number };
let seen: Seen[] = [];
/** What the fake store holds: pathname → bytes, and multipart uploads in progress. */
let stored = new Map<string, Buffer>();
let multipart = new Map<string, Map<number, Buffer>>();
/** Lets a test make the store fail a request: return a status to answer with instead. */
let sabotage: (request: Seen) => number | null = () => null;

let base = "";
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url!, "http://x");
  const request = { method: req.method!, path: url.pathname, headers: req.headers, size: body.length };
  seen.push(request);
  const answer = (status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const failWith = sabotage(request);
  if (failWith) return answer(failWith, { error: { code: failWith === 403 ? "forbidden" : "unknown_error" } });
  // Blob's own auth, or a signed URL's (played by a header here).
  const signed = req.headers["x-signed"] === "yes";
  if (!signed && req.headers.authorization !== `Bearer ${TOKEN}`) return answer(403, { error: { code: "forbidden" } });

  const pathname = url.searchParams.get("pathname")!;
  if (url.pathname === "/api/blob/" && req.method === "PUT") {
    stored.set(pathname, body);
    return answer(200, { url: `https://blob.example/${pathname}`, pathname });
  }
  if (url.pathname === "/api/blob/mpu" && req.method === "POST") {
    const action = req.headers["x-mpu-action"];
    if (action === "create") {
      const uploadId = `up-${multipart.size + 1}`;
      multipart.set(uploadId, new Map());
      return answer(200, { key: `key/${pathname}`, uploadId });
    }
    const parts = multipart.get(String(req.headers["x-mpu-upload-id"]));
    if (!parts || decodeURIComponent(String(req.headers["x-mpu-key"])) !== `key/${pathname}`) {
      return answer(400, { error: { code: "bad_request" } });
    }
    if (action === "upload") {
      const partNumber = Number(req.headers["x-mpu-part-number"]);
      parts.set(partNumber, body);
      return answer(200, { etag: `etag-${partNumber}` });
    }
    if (action === "complete") {
      const list = JSON.parse(body.toString()) as { partNumber: number; etag: string }[];
      assert.deepEqual(
        list.map((p) => p.partNumber),
        [...parts.keys()].sort((a, b) => a - b),
        "every part, in order"
      );
      for (const p of list) assert.equal(p.etag, `etag-${p.partNumber}`);
      stored.set(pathname, Buffer.concat(list.map((p) => parts.get(p.partNumber)!)));
      return answer(200, { url: `https://blob.example/${pathname}`, pathname });
    }
  }
  answer(404, { error: { code: "not_found" } });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL = `${base}/api/blob`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  drop = () => false;
  screen(true);
  seen = [];
  stored = new Map();
  multipart = new Map();
  sabotage = () => null;
});

/** A page that can be hidden and shown again, like a phone's when its screen turns off and on. */
const visibility = new Set<() => void>();
const page = {
  hidden: false,
  addEventListener: (_type: string, listener: () => void) => visibility.add(listener),
};
(globalThis as { document?: unknown }).document = page;
function screen(on: boolean) {
  page.hidden = !on;
  for (const listener of visibility) listener();
}
/** Lets a test cut a request off before it reaches the store: return true to drop it. */
let drop: (request: Parameters<Send>[0]) => boolean = () => false;

/** The browser's XHR, played by fetch: progress arrives all at once, when the body's sent. */
const send: Send = async (request, onProgress) => {
  if (drop(request)) throw new NetworkError("Upload failed — check your connection");
  const res = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
  const text = await res.text();
  if (request.body instanceof Blob) onProgress(request.body.size);
  return { status: res.status, text };
};

const blobTarget = (pathname: string): UploadTarget => ({
  type: "blob",
  pathname,
  token: TOKEN,
  contentType: "audio/mpeg",
  access: "public",
});

async function run(target: UploadTarget, bytes: Buffer) {
  const progress: number[] = [];
  await upload(target, new Blob([bytes as BlobPart]), (n) => progress.push(n), send);
  return progress;
}

describe("upload to Vercel Blob", () => {
  test("a stem-sized file goes up in one request, with the headers Blob needs", async () => {
    const bytes = randomBytes(3 * MB + 17);
    const progress = await run(blobTarget("stems/t1/vocals.mp3"), bytes);
    assert.ok(stored.get("stems/t1/vocals.mp3")?.equals(bytes));
    assert.equal(seen.length, 1);
    const { headers } = seen[0];
    assert.equal(headers["x-api-version"], "12");
    assert.equal(headers["x-vercel-blob-store-id"], "store123");
    assert.equal(headers["x-vercel-blob-access"], "public");
    assert.equal(headers["x-content-type"], "audio/mpeg");
    assert.equal(headers["x-content-length"], String(bytes.length));
    assert.equal(progress.at(-1), bytes.length);
  });

  test("a big song goes up in parts, and arrives whole", async () => {
    const bytes = randomBytes(37 * MB + 5);
    const progress = await run(blobTarget("queue/u/song.wav"), bytes);
    assert.ok(stored.get("queue/u/song.wav")?.equals(bytes));
    const parts = seen.filter((r) => r.headers["x-mpu-action"] === "upload");
    assert.equal(parts.length, 5);
    assert.ok(parts.every((p) => p.size <= 8 * MB));
    assert.equal(progress.at(-1), bytes.length);
  });

  test("a part that fails is sent again on its own — not the whole song", async () => {
    const bytes = randomBytes(20 * MB);
    let failed = false;
    sabotage = (r) => {
      if (r.headers["x-mpu-part-number"] === "2" && !failed) {
        failed = true;
        return 503;
      }
      return null;
    };
    await run(blobTarget("queue/u/flaky.wav"), bytes);
    assert.ok(stored.get("queue/u/flaky.wav")?.equals(bytes));
    const sends = seen.filter((r) => r.headers["x-mpu-action"] === "upload").map((r) => r.headers["x-mpu-part-number"]);
    assert.deepEqual(sends.sort(), ["1", "2", "2", "3"]);
    // The retry is the same request as far as the store can tell.
    const two = seen.filter((r) => r.headers["x-mpu-part-number"] === "2");
    assert.equal(two[0].headers["x-api-blob-request-id"], two[1].headers["x-api-blob-request-id"]);
    assert.deepEqual(
      two.map((r) => r.headers["x-api-blob-request-attempt"]),
      ["0", "1"]
    );
  });

  test("a screen turning off mid-upload doesn't use up its tries: it carries on once it's back", async () => {
    await untilVisible(); // starts watching the page
    const bytes = randomBytes(20 * MB);
    // Part 2 is cut off by the screen turning off — more times than a part
    // may fail for any other reason — and the screen comes back each time.
    let offs = 0;
    drop = (request) => {
      if (request.headers["x-mpu-part-number"] !== "2" || offs >= 7) return false;
      offs++;
      screen(false);
      setTimeout(() => screen(true), 20);
      return true;
    };
    await run(blobTarget("queue/u/screen-off.wav"), bytes);
    assert.equal(offs, 7);
    assert.ok(stored.get("queue/u/screen-off.wav")?.equals(bytes));
    // Parts 1 and 3 weren't sent again.
    const sends = seen.filter((r) => r.headers["x-mpu-action"] === "upload").map((r) => r.headers["x-mpu-part-number"]);
    assert.deepEqual(sends.sort(), ["1", "2", "3"]);
  });

  test("a dropped connection with the screen on still gives up after its tries", async () => {
    drop = (request) => request.headers["x-mpu-part-number"] === "2";
    await assert.rejects(run(blobTarget("queue/u/offline.wav"), randomBytes(20 * MB)), NetworkError);
  });

  test("a refusal (403) fails at once rather than retrying", async () => {
    sabotage = () => 403;
    await assert.rejects(run(blobTarget("stems/t2/beat.mp3"), randomBytes(1000)), FinalUploadError);
    assert.equal(seen.length, 1);
  });
});

describe("upload to a signed PUT URL", () => {
  test("a server hiccup is tried again, and the file arrives whole", async () => {
    const bytes = randomBytes(2 * MB);
    let calls = 0;
    sabotage = () => (++calls === 1 ? 500 : null);
    const target: UploadTarget = {
      type: "put",
      url: `${base}/api/blob/?pathname=local%2Fstem.mp3`,
      headers: { "x-signed": "yes" },
    };
    await run(target, bytes);
    assert.ok(stored.get("local/stem.mp3")?.equals(bytes));
    assert.equal(seen.length, 2);
  });
});
