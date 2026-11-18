// A private R2 bucket (no R2_PUBLIC_URL): the browser is sent a signed
// link straight to the bucket (lib/storage.ts, directUrl) — the store's
// speed, no public bucket. The link works 12 hours, is the same for an
// hour (so the browser's cache can keep the file), and carries no secret.
//
//   node --import ./tests/support/register.mjs --test tests/storage-r2-signed.test.ts

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

let storage: typeof import("../src/lib/storage.ts");

before(async () => {
  Object.assign(process.env, {
    R2_BUCKET: "bkt",
    R2_ACCOUNT_ID: "acct123",
    R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
    R2_SECRET_ACCESS_KEY: "very-secret-key",
    R2_PUBLIC_URL: "",
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  storage = await import("../src/lib/storage.ts");
});

describe("a private R2 bucket", () => {
  test("a stem gets a signed link to the bucket, valid 12 hours", async () => {
    const link = new URL((await storage.directUrl("stems/a b/vocals.mp3"))!);
    assert.equal(link.origin, "https://acct123.r2.cloudflarestorage.com");
    assert.equal(link.pathname, "/bkt/stems/a%20b/vocals.mp3");
    assert.equal(link.searchParams.get("X-Amz-Expires"), String(12 * 60 * 60));
    assert.equal(link.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.match(link.searchParams.get("X-Amz-Credential") ?? "", /^AKIDEXAMPLE\//);
    assert.match(link.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
    assert.ok(!link.toString().includes("very-secret-key"), "the secret never leaves the server");
    // Signed as of the start of this hour.
    const at = link.searchParams.get("X-Amz-Date")!;
    assert.match(at, /^\d{8}T\d{2}0000Z$/);
  });

  test("the same link for an hour; another file, another link", async () => {
    const [a, b, c] = await Promise.all([
      storage.directUrl("stems/x/vocals.mp3"),
      storage.directUrl("stems/x/vocals.mp3"),
      storage.directUrl("stems/x/beat.mp3"),
    ]);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  test("not served through the app, and no public address", () => {
    assert.equal(storage.publicUrl("stems/x/vocals.mp3"), null);
    assert.equal(storage.servesThroughApp("stems/x/vocals.mp3"), false);
  });
});
