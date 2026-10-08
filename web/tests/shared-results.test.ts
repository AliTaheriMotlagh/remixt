// End-to-end test of sharing what a browser worked out from a stem
// (/api/stems/[id]/results/[kind], lib/stemResults.ts): a signed-in
// person's result is kept and handed to everyone — a phone that can't
// work it out itself, say — the first one sent stays, and anything
// malformed, out of date or from nobody is turned away.
//
//   npm test           (starts a dev server against a throwaway database)
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… node --test tests/shared-results.test.ts

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres from "postgres";
import { RESULT_VERSIONS, encodeBeats } from "../src/lib/stemResults.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL to the database the app under test uses");
const sql = postgres(DATABASE_URL, { onnotice: () => {} });

async function signUp(name: string) {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}-${randomUUID()}@test.local`, password: "password123", artistName: name }),
  });
  assert.equal(res.status, 200, `signup failed: ${await res.clone().text()}`);
  const { id } = await res.json();
  return { id: id as string, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

const url = (stemId: string, kind: string, v: number = RESULT_VERSIONS.beats) => `${BASE_URL}/api/stems/${stemId}/results/${kind}?v=${v}`;

function put(stemId: string, body: Uint8Array, cookie: string, kind = "beats", v?: number) {
  return fetch(url(stemId, kind, v), { method: "PUT", headers: { cookie, "Content-Type": "application/octet-stream" }, body: new Blob([body as Uint8Array<ArrayBuffer>]) });
}

describe("shared results", () => {
  let maker: { id: string; cookie: string };
  let other: { id: string; cookie: string };
  let stemId: string;
  let trackId: string;
  const first = { seconds: 60, beats: [0.5, 1, 1.5, 2], downbeats: [0.5, 2] };

  before(async () => {
    [maker, other] = await Promise.all([signUp("beatComputer"), signUp("beatComputer2")]);
    trackId = randomUUID();
    stemId = randomUUID();
    await sql`INSERT INTO tracks (id, owner_id, title, original_filename, status, original_url) VALUES (${trackId}, ${maker.id}, 'Shared', 'x.mp3', 'ready', '')`;
    await sql`INSERT INTO stems (id, track_id, kind, file_url) VALUES (${stemId}, ${trackId}, 'beat', ${`stems/${trackId}/beat.mp3`})`;
  });
  after(async () => {
    await sql`DELETE FROM tracks WHERE id = ${trackId}`;
    await sql.end();
  });

  test("nothing until someone works it out", async () => {
    assert.equal((await fetch(url(stemId, "beats"))).status, 404);
    assert.equal((await fetch(url(stemId, "nonsense"))).status, 404);
  });

  test("only a signed-in person's, of the current version, well-formed, is kept", async () => {
    assert.equal((await put(stemId, encodeBeats(first), "")).status, 401);
    assert.equal((await put(stemId, encodeBeats(first), maker.cookie, "beats", RESULT_VERSIONS.beats + 1)).status, 409);
    assert.equal((await put(stemId, new TextEncoder().encode('{"seconds":60,"beats":[2,1],"downbeats":[]}'), maker.cookie)).status, 400);
    assert.equal((await put(stemId, new Uint8Array(1), maker.cookie, "analysis", RESULT_VERSIONS.analysis)).status, 400);
    assert.equal((await put(randomUUID(), encodeBeats(first), maker.cookie)).status, 404);
  });

  test("the first one sent is handed to everyone, signed in or not, and stays", async () => {
    const res = await put(stemId, encodeBeats(first), maker.cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { stored: true });

    const later = await put(stemId, encodeBeats({ ...first, beats: [1, 2, 3, 4] }), other.cookie);
    assert.deepEqual(await later.json(), { stored: false });

    const got = await fetch(url(stemId, "beats"));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), first);
    const [row] = await sql`SELECT created_by FROM stem_results WHERE stem_id = ${stemId}`;
    assert.equal(row.created_by, maker.id);
  });
});
