// End-to-end test of the admin's Storage tab (/api/admin/files,
// lib/storageReport.ts): every stored file is counted, a file nothing
// points at is a leftover once it's over an hour old, and deleting
// leftovers never takes a file a song still uses — even when asked by name.
//
//   npm test           (starts a dev server against a throwaway database and storage folder)
//   BASE_URL=… DATABASE_URL=… STORAGE_DIR=… node --test tests/admin-files.test.ts

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import postgres from "postgres";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";
const DATABASE_URL = process.env.DATABASE_URL;
const STORAGE_DIR = process.env.STORAGE_DIR;
if (!DATABASE_URL || !STORAGE_DIR) throw new Error("Set DATABASE_URL and STORAGE_DIR to what the app under test uses");
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

async function signInAdmin() {
  const body = JSON.stringify({ email: "test-admin@test.local", password: "password123", artistName: "testAdmin" });
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body };
  let res = await fetch(`${BASE_URL}/api/auth/signup`, init);
  if (!res.ok) res = await fetch(`${BASE_URL}/api/auth/login`, init);
  assert.equal(res.status, 200, `admin sign-in failed: ${await res.clone().text()}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/** A file in the test's storage folder, `hoursOld` old. */
function store(key: string, bytes: number, hoursOld: number) {
  const full = path.join(STORAGE_DIR!, key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes, 1));
  const when = new Date(Date.now() - hoursOld * 3600_000);
  fs.utimesSync(full, when, when);
  return full;
}

type Report = {
  total: number;
  leftovers: { key: string }[];
  groups: { id: string; files: number; bytes: number }[];
  songs: { id: string; bytes: number }[];
};

describe("admin storage", () => {
  let owner: { id: string; cookie: string };
  let admin: string;
  const trackId = randomUUID();
  const stemKey = `stems/${trackId}/vocals.mp3`;
  const oldLeftover = `stems/${randomUUID()}/beat.mp3`;
  const newLeftover = `covers/${randomUUID()}/fresh.jpg`;
  const marker = ".remixt/access-check.txt";

  before(async () => {
    [owner, admin] = await Promise.all([signUp("storageOwner"), signInAdmin()]);
    await sql`INSERT INTO tracks (id, owner_id, title, original_filename, status, original_url) VALUES (${trackId}, ${owner.id}, 'Kept', 'x.mp3', 'ready', '')`;
    await sql`INSERT INTO stems (id, track_id, kind, file_url) VALUES (${randomUUID()}, ${trackId}, 'vocals', ${stemKey})`;
    store(stemKey, 5000, 48); // in use, however old
    store(oldLeftover, 3000, 48); // nothing points at it
    store(newLeftover, 100, 0); // nothing yet, but it may be mid-upload
    store(marker, 2, 48); // the app's own
  });
  after(async () => {
    await sql`DELETE FROM tracks WHERE id = ${trackId}`;
    await sql.end();
  });

  const report = async (cookie = admin) => {
    const res = await fetch(`${BASE_URL}/api/admin/files`, { headers: { cookie } });
    return { status: res.status, body: (await res.json()) as Report };
  };
  const remove = (body: object, cookie = admin) =>
    fetch(`${BASE_URL}/api/admin/files`, { method: "DELETE", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  test("only admins see it", async () => {
    assert.equal((await report(owner.cookie)).status, 404);
    assert.equal((await remove({ leftovers: true }, owner.cookie)).status, 404);
  });

  test("counts every file; a leftover is an old file nothing points at", async () => {
    const { status, body } = await report();
    assert.equal(status, 200);
    const keys = body.leftovers.map((f) => f.key);
    assert.ok(keys.includes(oldLeftover));
    assert.ok(!keys.includes(stemKey), "a song's stem isn't a leftover");
    assert.ok(!keys.includes(newLeftover), "a new file may be mid-upload");
    assert.ok(!keys.includes(marker), "the app's own files stay");
    assert.ok(body.total >= 8102);
    assert.equal(body.songs.find((s) => s.id === trackId)?.bytes, 5000);
  });

  test("a file in use isn't deleted, even asked for by name", async () => {
    const res = await remove({ keys: [stemKey] });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).deleted, 0);
    assert.ok(fs.existsSync(path.join(STORAGE_DIR!, stemKey)));
  });

  test("deleting leftovers frees them and keeps the rest", async () => {
    const res = await remove({ leftovers: true });
    assert.equal(res.status, 200);
    const done = await res.json();
    assert.ok(done.deleted >= 1 && done.bytes >= 3000);
    assert.ok(!fs.existsSync(path.join(STORAGE_DIR!, oldLeftover)));
    for (const key of [stemKey, newLeftover, marker]) assert.ok(fs.existsSync(path.join(STORAGE_DIR!, key)), `${key} kept`);
    assert.ok(!(await report()).body.leftovers.some((f) => f.key === oldLeftover));
  });

  test("nonsense is turned away", async () => {
    assert.equal((await remove({})).status, 400);
    assert.equal((await remove({ keys: [] })).status, 400);
  });
});
