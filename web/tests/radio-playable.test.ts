// The radio only puts on air (and offers for requests) songs and remixes
// whose files are all in storage (lib/radioPlayable.ts): with stems in R2,
// an old song not moved from Blob yet is left out rather than played as
// silence, and joins once its files arrive. R2 is a fake on a local
// server; the database is the test app's (npm test starts it: BASE_URL,
// DATABASE_URL).
//
//   npm test -- tests/radio-playable.test.ts

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL to the database the app under test uses");
const sql = postgres(DATABASE_URL, { onnotice: () => {} });

const inR2 = new Set<string>();
let lists = 0;
const prefixes: string[] = [];
const server = createServer((req, res) => {
  // ListObjectsV2 of bucket "bkt": a thousand keys a page, in key order, under ?prefix — as R2 answers.
  if (req.url?.startsWith("/bkt?")) {
    const q = new URL(req.url, "http://x").searchParams;
    const prefix = q.get("prefix") ?? "";
    if (!q.get("continuation-token")) {
      lists++;
      prefixes.push(prefix);
    }
    const keys = [...inR2].filter((k) => k.startsWith(prefix)).sort();
    const from = Number(q.get("continuation-token") ?? 0);
    const page = keys.slice(from, from + 1000);
    const more = from + 1000 < keys.length;
    res.writeHead(200, { "content-type": "application/xml" });
    return res.end(
      `<?xml version="1.0"?><ListBucketResult>${page
        .map((k) => `<Contents><Key>${k}</Key><Size>10</Size><LastModified>2026-11-19T00:00:00.000Z</LastModified></Contents>`)
        .join("")}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + 1000}</NextContinuationToken>` : ""}</ListBucketResult>`
    );
  }
  res.writeHead(404);
  res.end();
});

const tag = `playable-${randomUUID().slice(0, 8)}`;
const moved = randomUUID();
const notMoved = randomUUID();
const remix = randomUUID();
let ownerId = "";
let check: typeof import("../src/lib/radioPlayable.ts");

const song = (id: string) => ({ kind: "track" as const, id, title: "", artist: "", duration: 200, cover: "", bpm: null });
const mix = { kind: "remix" as const, id: remix, title: "", artist: "", duration: 200, cover: "", bpm: null };

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, {
    R2_BUCKET: "bkt",
    R2_ENDPOINT: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_PUBLIC_URL: "",
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  check = await import("../src/lib/radioPlayable.ts");
  ownerId = randomUUID();
  await sql`INSERT INTO users (id, email, password_hash, artist_name) VALUES (${ownerId}, ${`${tag}@test.local`}, 'x', ${tag})`;
  for (const id of [moved, notMoved]) {
    await sql`INSERT INTO tracks (id, owner_id, title, original_filename, status, original_url) VALUES (${id}, ${ownerId}, ${tag}, 'x.mp3', 'ready', '')`;
    for (const kind of ["vocals", "beat"]) {
      await sql`INSERT INTO stems (id, track_id, kind, file_url) VALUES (${randomUUID()}, ${id}, ${kind}, ${`stems/${id}/${kind}.mp3`})`;
    }
  }
  await sql`INSERT INTO remixes (id, owner_id, title, published) VALUES (${remix}, ${ownerId}, ${tag}, true)`;
  inR2.add(`stems/${moved}/vocals.mp3`).add(`stems/${moved}/beat.mp3`);
  inR2.add(`stems/${notMoved}/vocals.mp3`); // its beat isn't there
});

after(async () => {
  await sql`DELETE FROM users WHERE id = ${ownerId}`;
  await sql.end();
  // The app's own pool, opened by the check: closed, or the test never exits.
  await (await import("../src/lib/db.ts")).default.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const lane = (kind: string, track: string, order: number) => sql`
  INSERT INTO remix_lanes (id, remix_id, stem_id, lane_order)
  SELECT ${randomUUID()}, ${remix}, id, ${order} FROM stems WHERE track_id = ${track} AND kind = ${kind}
`;

describe("the radio and storage", () => {
  test("a song plays only with its vocal and beat both there", async () => {
    const found = await check.playable([song(moved), song(notMoved)]);
    assert.deepEqual(found.map((i) => i.id), [moved]);
  });

  test("a remix needs every lane's file", async () => {
    await lane("vocals", moved, 0);
    await lane("beat", moved, 1);
    await lane("vocals", notMoved, 2);
    assert.equal((await check.playable([mix])).length, 1);
    await lane("beat", notMoved, 3); // not in R2
    assert.equal((await check.playable([mix])).length, 0);
  });

  test("songs stay on air while people upload: only stems/ is listed, and a stale listing answers at once", async () => {
    // 21,000 slices of uploads in progress (and a queued song) sort before stems/: a listing of the whole
    // bucket stopped at 20,000 keys before reaching the songs, and the radio went silent.
    for (let i = 0; i < 21_000; i++) inR2.add(`relay/session-${Math.floor(i / 500)}/at-${i}.part`);
    inR2.add(`queue/${ownerId}/job.mp3`);
    const fresh = randomUUID();
    await sql`INSERT INTO tracks (id, owner_id, title, original_filename, status, original_url) VALUES (${fresh}, ${ownerId}, ${tag}, 'x.mp3', 'ready', '')`;
    for (const kind of ["vocals", "beat"]) {
      await sql`INSERT INTO stems (id, track_id, kind, file_url) VALUES (${randomUUID()}, ${fresh}, ${kind}, ${`stems/${fresh}/${kind}.mp3`})`;
      inR2.add(`stems/${fresh}/${kind}.mp3`);
    }
    const storage = await import("../src/lib/storage.ts");
    storage.forgetStoredKeys();
    const started = Date.now();
    // Answered from the last listing straight away (the new song isn't in it yet)…
    assert.deepEqual((await check.playable([song(moved)])).map((i) => i.id), [moved]);
    assert.ok(Date.now() - started < 1000);
    // …and on air once the new listing is in.
    let found: string[] = [];
    for (let i = 0; i < 50 && !found.length; i++) {
      found = (await check.playable([song(fresh)])).map((i) => i.id);
      if (!found.length) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.deepEqual(found, [fresh]);
    assert.deepEqual((await check.playable([song(moved), song(notMoved)])).map((i) => i.id), [moved]);
    assert.ok(prefixes.length > 0 && prefixes.every((p) => p === "stems/"), `listed under ${prefixes.join(", ")}`);
  });

  test("the bucket is listed once for many checks, not once per song", async () => {
    const before = lists;
    await Promise.all([check.playable([song(moved)]), check.playable([song(notMoved)]), check.playable([mix])]);
    assert.ok(lists - before <= 1);
  });
});
