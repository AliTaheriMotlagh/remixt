// End-to-end test of DELETE /api/tracks/[id]: an upload whose stems never
// all arrived is dropped at once by its browser, rather than sitting in the
// library as "Uploading…" until the 20-minute sweep. Run with `npm test`.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";

type Client = { fetch: (path: string, init?: RequestInit) => Promise<Response> };

async function signUp(name: string): Promise<Client> {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}-${randomUUID()}@test.local`, password: "password123", artistName: name }),
  });
  assert.equal(res.status, 200, `signup failed: ${await res.clone().text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return {
    fetch: (path, init = {}) =>
      fetch(`${BASE_URL}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } }),
  };
}

const peaks = Array.from({ length: 600 }, () => 0.5);

async function createTrack(client: Client) {
  const res = await client.fetch("/api/tracks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Half-made",
      filename: "half-made.mp3",
      duration: 30,
      bpm: 120,
      vocalsPeaks: peaks,
      beatPeaks: peaks,
      tags: [],
      rightsConfirmed: true,
    }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as { id: string; uploads: Record<string, { type: string; url: string; headers: Record<string, string> }> };
}

async function myTracks(client: Client): Promise<{ id: string; status: string }[]> {
  return (await (await client.fetch("/api/tracks")).json()).tracks;
}

describe("dropping an unfinished upload", () => {
  test("the uploader's browser can drop a track whose stems didn't all arrive", async () => {
    const owner = await signUp("dropper");
    const track = await createTrack(owner);
    // One stem made it, the other didn't.
    const vocals = track.uploads.vocals;
    assert.equal(vocals.type, "put");
    const put = await owner.fetch(vocals.url, { method: "PUT", headers: vocals.headers, body: new Uint8Array(1000) });
    assert.ok(put.ok, `stem upload: ${put.status}`);
    assert.equal((await owner.fetch(`/api/tracks/${track.id}/complete`, { method: "POST" })).status, 409);
    assert.deepEqual((await myTracks(owner)).map((t) => [t.id, t.status]), [[track.id, "processing"]]);

    const dropped = await owner.fetch(`/api/tracks/${track.id}`, { method: "DELETE" });
    assert.equal(dropped.status, 200);
    assert.deepEqual(await myTracks(owner), []);
    assert.equal((await owner.fetch(`/api/tracks/${track.id}`)).status, 404);
  });

  test("nobody else can drop it, and a finished track can't be dropped this way", async () => {
    const owner = await signUp("owner");
    const stranger = await signUp("stranger");
    const track = await createTrack(owner);
    assert.equal((await stranger.fetch(`/api/tracks/${track.id}`, { method: "DELETE" })).status, 404);

    for (const target of Object.values(track.uploads)) {
      const put = await owner.fetch(target.url, { method: "PUT", headers: target.headers, body: new Uint8Array(1000) });
      assert.ok(put.ok, `stem upload: ${put.status}`);
    }
    assert.equal((await owner.fetch(`/api/tracks/${track.id}/complete`, { method: "POST" })).status, 200);
    assert.equal((await owner.fetch(`/api/tracks/${track.id}`, { method: "DELETE" })).status, 409);
    assert.deepEqual((await myTracks(owner)).map((t) => [t.id, t.status]), [[track.id, "ready"]]);
  });
});
