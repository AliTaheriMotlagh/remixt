// fetchInSlices (lib/client/stemFetch.ts): how the split helper downloads
// a queued song and the Studio downloads stems. It must always hand back
// the whole file, byte for byte — whatever the server does with Range.
//
//   node --test tests/stem-fetch.test.ts

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { fetchInSlices } from "../src/lib/client/stemFetch.ts";

const FILE = randomBytes(10 * 1024 * 1024 + 777);

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let handler: Handler = () => {};
let base = "";
const server = createServer((req, res) => handler(req, res));

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

function range(req: IncomingMessage) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  return { start, end: Math.min(match[2] ? Number(match[2]) : FILE.length - 1, FILE.length - 1) };
}

/** A normal server: 206 slices with Content-Range. `cap` limits each answer, like a private Blob store. */
function ranged({ cap = Infinity, exposeRange = true } = {}): Handler {
  return (req, res) => {
    const r = range(req);
    if (!r) {
      res.writeHead(200, { "Content-Length": FILE.length });
      return res.end(FILE);
    }
    const end = Math.min(r.end, r.start + cap - 1);
    res.writeHead(206, {
      "Content-Length": end - r.start + 1,
      // A cross-origin CDN that doesn't list Content-Range in
      // Access-Control-Expose-Headers looks to the page like it's missing.
      ...(exposeRange ? { "Content-Range": `bytes ${r.start}-${end}/${FILE.length}` } : {}),
    });
    res.end(FILE.subarray(r.start, end + 1));
  };
}

async function download(path = "/song") {
  const progress: [number, number][] = [];
  const bytes = new Uint8Array(await fetchInSlices(`${base}${path}`, (loaded, total) => progress.push([loaded, total])));
  return { bytes, progress };
}

describe("fetchInSlices", () => {
  test("a server that ignores Range: one request, the whole file", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Length": FILE.length });
      res.end(FILE);
    };
    const { bytes, progress } = await download();
    assert.ok(Buffer.from(bytes).equals(FILE));
    assert.deepEqual(progress.at(-1), [FILE.length, FILE.length]);
  });

  test("a server that serves ranges: stitched from slices", async () => {
    let requests = 0;
    const serve = ranged();
    handler = (req, res) => (requests++, serve(req, res));
    const { bytes, progress } = await download();
    assert.ok(Buffer.from(bytes).equals(FILE));
    assert.ok(requests > 1);
    assert.deepEqual(progress.at(-1), [FILE.length, FILE.length]);
  });

  test("a server that caps every answer (a private Blob store) still gives the whole file", async () => {
    handler = ranged({ cap: 1024 * 1024 });
    const { bytes } = await download();
    assert.ok(Buffer.from(bytes).equals(FILE));
  });

  test("a CDN that hides Content-Range: the whole file, not just the first slice", async () => {
    handler = ranged({ exposeRange: false });
    const { bytes, progress } = await download();
    assert.equal(bytes.length, FILE.length);
    assert.ok(Buffer.from(bytes).equals(FILE));
    assert.deepEqual(progress.at(-1), [FILE.length, FILE.length]);
  });

  test("a redirect to a CDN: the rest is asked of the CDN directly", async () => {
    const seen: string[] = [];
    const serve = ranged();
    handler = (req, res) => {
      seen.push(req.url!);
      if (req.url === "/song") {
        res.writeHead(302, { Location: "/cdn/song" });
        return res.end();
      }
      serve(req, res);
    };
    const { bytes } = await download();
    assert.ok(Buffer.from(bytes).equals(FILE));
    assert.equal(seen.filter((u) => u === "/song").length, 1, "the redirect is followed once, not per slice");
  });

  test("a slice that fails once is asked for again", async () => {
    const serve = ranged();
    let failed = false;
    handler = (req, res) => {
      if (!failed && range(req)?.start) {
        failed = true;
        res.writeHead(503);
        return res.end();
      }
      serve(req, res);
    };
    const { bytes } = await download();
    assert.ok(failed);
    assert.ok(Buffer.from(bytes).equals(FILE));
  });

  test("a slice that comes back short is asked for again", async () => {
    const serve = ranged();
    let cut = false;
    handler = (req, res) => {
      const r = range(req);
      if (!cut && r?.start) {
        cut = true;
        res.writeHead(206, { "Content-Range": `bytes ${r.start}-${r.end}/${FILE.length}` });
        return res.end(FILE.subarray(r.start, r.start + 10));
      }
      serve(req, res);
    };
    const { bytes } = await download();
    assert.ok(cut);
    assert.ok(Buffer.from(bytes).equals(FILE));
  });

  test("a refusal (404) fails at once rather than retrying", async () => {
    let requests = 0;
    handler = (_req, res) => {
      requests++;
      res.writeHead(404);
      res.end();
    };
    await assert.rejects(download(), /HTTP 404/);
    assert.equal(requests, 1);
  });
});
