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
const server = createServer((req, res) => {
  // ListObjectsV2 of bucket "bkt": every key, one page.
  if (req.url?.startsWith("/bkt?")) {
    lists++;
    res.writeHead(200, { "content-type": "application/xml" });
    return res.end(
      `<?xml version="1.0"?><ListBucketResult>${[...inR2]
        .map((k) => `<Contents><Key>${k}</Key><Size>10</Size><LastModified>2026-11-19T00:00:00.000Z</LastModified></Contents>`)
        .join("")}<IsTruncated>false</IsTruncated></ListBucketResult>`
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

  test("the bucket is listed once for many checks, not once per song", async () => {
    const before = lists;
    await Promise.all([check.playable([song(moved)]), check.playable([song(notMoved)]), check.playable([mix])]);
    assert.ok(lists - before <= 1);
  });
});
