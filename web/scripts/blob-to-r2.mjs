// Copies every file from a Vercel Blob store into an R2 (or other
// S3-compatible) bucket, under the same keys — the database keeps
// pointing at the same names, so nothing else changes. Files already in
// the bucket at the same size are skipped, so it can be run again after a
// failure, or to catch files uploaded since.
//
//   node --env-file=.env.migrate scripts/blob-to-r2.mjs            (copy)
//   node --env-file=.env.migrate scripts/blob-to-r2.mjs --dry-run  (list what it would copy)
//
// .env.migrate holds BLOB_READ_WRITE_TOKEN (the old store) and R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (and R2_ENDPOINT for a
// bucket that isn't R2). Costs on the Blob side: one list per 1,000 files,
// one read per file; deleting nothing.
import { head, list } from "@vercel/blob";
import { AwsClient } from "aws4fetch";

const dryRun = process.argv.includes("--dry-run");
const AT_ONCE = 4;
const TRIES = 3;

const token = process.env.BLOB_READ_WRITE_TOKEN;
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
if (!token || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !(R2_ACCOUNT_ID || R2_ENDPOINT)) {
  console.error("Set BLOB_READ_WRITE_TOKEN, R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
  process.exit(1);
}
const endpoint = (R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/$/, "");
const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
const objectUrl = (key) => `${endpoint}/${R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

async function retry(what, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= TRIES) throw new Error(`${what}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** A blob's bytes: private stores need the token, public ones don't. */
async function read(blob) {
  for (const auth of [true, false]) {
    const res = await fetch(blob.url, { headers: auth ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if (!auth) throw new Error(`Blob answered HTTP ${res.status}`);
  }
}

async function main() {
  console.log("Listing the Blob store…");
  const blobs = [];
  let cursor;
  do {
    const page = await retry("list", () => list({ token, cursor, limit: 1000 }));
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const total = blobs.reduce((n, b) => n + b.size, 0);
  console.log(`${blobs.length} files, ${mb(total)}${dryRun ? " (dry run: nothing is copied)" : ""}`);

  let done = 0;
  let copied = 0;
  let copiedBytes = 0;
  let skipped = 0;
  const failed = [];
  const queue = [...blobs];

  async function worker() {
    for (let blob = queue.shift(); blob; blob = queue.shift()) {
      const key = blob.pathname;
      try {
        const there = await retry(`check ${key}`, () => r2.fetch(objectUrl(key), { method: "HEAD" }));
        if (there.ok && Number(there.headers.get("content-length")) === blob.size) {
          skipped++;
        } else if (dryRun) {
          copied++;
          copiedBytes += blob.size;
        } else {
          const bytes = await retry(`read ${key}`, () => read(blob));
          const contentType = blob.contentType || (await head(key, { token }).catch(() => null))?.contentType || "application/octet-stream";
          await retry(`write ${key}`, async () => {
            const res = await r2.fetch(objectUrl(key), { method: "PUT", body: bytes, headers: { "Content-Type": contentType } });
            if (!res.ok) throw new Error(`R2 answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
          });
          copied++;
          copiedBytes += blob.size;
        }
      } catch (err) {
        failed.push(`${key}: ${err.message}`);
      }
      done++;
      if (done % 25 === 0 || done === blobs.length) {
        process.stdout.write(`\r${done}/${blobs.length} · ${dryRun ? "to copy" : "copied"} ${copied} (${mb(copiedBytes)}) · already there ${skipped} · failed ${failed.length}   `);
      }
    }
  }
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  console.log();
  if (failed.length) {
    console.error(`\n${failed.length} file(s) failed (run again to retry them):`);
    for (const line of failed.slice(0, 50)) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(dryRun ? "Dry run done." : "All files are in R2.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
