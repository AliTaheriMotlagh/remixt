// End-to-end: takes recorded in the booth are private to whoever sang them
// until they share them (lib/trackAccess.ts, /api/tracks/[id]/sharing);
// the same song file is never split twice (/api/tracks/lookup); a stem
// can go up through the app a slice at a time (lib/uploadRelay.ts); and
// visits are counted (lib/presence.ts). Run with `npm test`.

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, test } from "node:test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";

type Client = { id: string; name: string; fetch: (path: string, init?: RequestInit) => Promise<Response> };

async function signUp(prefix: string): Promise<Client> {
  const name = `${prefix}${randomUUID().slice(0, 6)}`;
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
  const client: Client = {
    id: "",
    name,
    fetch: (path, init = {}) =>
      fetch(`${BASE_URL}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } }),
  };
  client.id = (await (await client.fetch("/api/auth/me")).json()).user.id;
  return client;
}

const peaks = Array.from({ length: 600 }, () => 0.5);
const json = { "Content-Type": "application/json" };

type Target = { type: string; url: string; headers: Record<string, string> };

/** A finished track: a take (`recording`) or a split song, its stems uploaded. */
async function makeTrack(client: Client, { recording = false, sourceHash }: { recording?: boolean; sourceHash?: string } = {}) {
  const res = await client.fetch("/api/tracks", {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      title: recording ? "My take" : "My song",
      filename: recording ? "studio-recording.mp3" : "song.mp3",
      duration: 30,
      bpm: 120,
      vocalsPeaks: peaks,
      ...(recording ? { recording: true, tags: ["studio recording"] } : { beatPeaks: peaks, tags: [] }),
      ...(sourceHash ? { sourceHash } : {}),
      rightsConfirmed: true,
    }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const track = (await res.json()) as { id: string; uploads: Record<string, Target> };
  for (const target of Object.values(track.uploads)) {
    const put = await client.fetch(target.url, { method: "PUT", headers: target.headers, body: new Uint8Array(2000) });
    assert.ok(put.ok, `stem upload: ${put.status}`);
  }
  assert.equal((await client.fetch(`/api/tracks/${track.id}/complete`, { method: "POST" })).status, 200);
  const info = await (await client.fetch(`/api/tracks/${track.id}`)).json();
  return { id: track.id, vocalId: (info.stems as { id: string; kind: string }[]).find((s) => s.kind === "vocals")!.id };
}

async function libraryIds(client: Client): Promise<string[]> {
  const res = await client.fetch("/api/stems");
  assert.equal(res.status, 200);
  return ((await res.json()).stems as { id: string }[]).map((s) => s.id);
}

const canHear = async (client: Client, stemId: string) => (await client.fetch(`/api/audio/stem/${stemId}`)).status;

describe("takes are private until shared", () => {
  test("only the singer sees and hears a new take; sharing lets chosen people in; Everyone puts it in the library", async () => {
    const singer = await signUp("singer");
    const friend = await signUp("friend");
    const stranger = await signUp("stranger");
    const take = await makeTrack(singer, { recording: true });

    // The singer: in their library, marked private and theirs; it plays.
    const mine = (await (await singer.fetch("/api/stems")).json()).stems.find((s: { id: string }) => s.id === take.vocalId);
    assert.ok(mine, "the singer sees their take");
    assert.equal(mine.track_private, true);
    assert.equal(mine.track_mine, true);
    assert.equal(await canHear(singer, take.vocalId), 200);

    // Anyone else: not in the library, can't play it, can't read it, can't share it.
    assert.ok(!(await libraryIds(stranger)).includes(take.vocalId));
    assert.equal(await canHear(stranger, take.vocalId), 404);
    assert.equal((await fetch(`${BASE_URL}/api/audio/stem/${take.vocalId}`)).status, 404, "signed out");
    assert.equal((await stranger.fetch(`/api/tracks/${take.id}`)).status, 404);
    assert.equal((await stranger.fetch(`/api/tracks/${take.id}/sharing`)).status, 404);

    // Shared with the friend, found by name.
    const found = await (await singer.fetch(`/api/users/search?q=${encodeURIComponent(friend.name)}`)).json();
    assert.deepEqual(found.users.map((u: { id: string }) => u.id), [friend.id]);
    const shared = await singer.fetch(`/api/tracks/${take.id}/sharing`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userId: friend.id }),
    });
    assert.equal(shared.status, 200);
    assert.deepEqual((await shared.json()).people.map((p: { id: string }) => p.id), [friend.id]);
    assert.ok((await libraryIds(friend)).includes(take.vocalId), "the friend sees it");
    assert.equal(await canHear(friend, take.vocalId), 200);
    assert.ok(!(await libraryIds(stranger)).includes(take.vocalId), "still not the stranger");
    const notes = await (await friend.fetch("/api/notifications")).json().catch(() => null);
    if (notes?.notifications) assert.ok(notes.notifications.some((n: { type: string }) => n.type === "share"), "the friend is told");

    // Unshared.
    await singer.fetch(`/api/tracks/${take.id}/sharing?user=${friend.id}`, { method: "DELETE" });
    assert.equal(await canHear(friend, take.vocalId), 404);

    // Everyone.
    const open = await singer.fetch(`/api/tracks/${take.id}/sharing`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ visibility: "public" }),
    });
    assert.equal((await open.json()).visibility, "public");
    assert.ok((await libraryIds(stranger)).includes(take.vocalId));
    assert.equal(await canHear(stranger, take.vocalId), 200);
  });

  test("a song split from an upload is public, as before", async () => {
    const uploader = await signUp("uploader");
    const listener = await signUp("listener");
    const song = await makeTrack(uploader);
    assert.ok((await libraryIds(listener)).includes(song.vocalId));
    assert.equal(await canHear(listener, song.vocalId), 200);
  });
});

describe("the same song isn't split twice", () => {
  test("a file already in the library is found by its fingerprint — by its uploader and by anyone else", async () => {
    const first = await signUp("first");
    const second = await signUp("second");
    const hash = randomBytes(32).toString("hex");
    const lookup = (client: Client) =>
      client.fetch("/api/tracks/lookup", { method: "POST", headers: json, body: JSON.stringify({ hash }) }).then((r) => r.json());

    assert.equal((await lookup(first)).track, null);
    const song = await makeTrack(first, { sourceHash: hash });
    assert.deepEqual(await lookup(first).then((r) => [r.track.id, r.track.mine]), [song.id, true]);
    assert.deepEqual(await lookup(second).then((r) => [r.track.id, r.track.mine]), [song.id, false]);
  });

  test("an unfinished earlier try of the same song is replaced, not left behind", async () => {
    const user = await signUp("retrier");
    const hash = randomBytes(32).toString("hex");
    const body = JSON.stringify({
      title: "Again",
      filename: "again.mp3",
      duration: 30,
      bpm: null,
      vocalsPeaks: peaks,
      beatPeaks: peaks,
      sourceHash: hash,
      rightsConfirmed: true,
    });
    const a = await (await user.fetch("/api/tracks", { method: "POST", headers: json, body })).json();
    const b = await (await user.fetch("/api/tracks", { method: "POST", headers: json, body })).json();
    const tracks = (await (await user.fetch("/api/tracks")).json()).tracks as { id: string }[];
    assert.deepEqual(tracks.map((t) => t.id), [b.id]);
    assert.notEqual(a.id, b.id);
  });
});

describe("uploading through the app", () => {
  test("a stem sent a slice at a time arrives whole", async () => {
    const user = await signUp("relayer");
    const res = await user.fetch("/api/tracks", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        title: "Relayed",
        filename: "relayed.mp3",
        duration: 30,
        bpm: null,
        vocalsPeaks: peaks,
        recording: true,
        rightsConfirmed: true,
      }),
    });
    const track = (await res.json()) as { id: string; uploads: Record<string, Target & { relay?: string }> };
    const route = track.uploads.vocals.relay ?? track.uploads.vocals.url;
    const bytes = randomBytes(3 * 1024 * 1024 + 12345);
    const session = randomUUID();
    const PART = 3 * 1024 * 1024;
    for (let part = 0; part * PART < bytes.length; part++) {
      const put = await user.fetch(`${route}?relay=${session}&part=${part}`, {
        method: "PUT",
        body: bytes.subarray(part * PART, (part + 1) * PART),
      });
      assert.equal(put.status, 200, await put.clone().text());
    }
    // Not finished: /complete refuses.
    assert.equal((await user.fetch(`/api/tracks/${track.id}/complete`, { method: "POST" })).status, 409);
    const joined = await user.fetch(`${route}?relay=${session}&parts=2`, { method: "POST" });
    assert.equal(joined.status, 200, await joined.clone().text());
    assert.equal((await user.fetch(`/api/tracks/${track.id}/complete`, { method: "POST" })).status, 200);

    const info = await (await user.fetch(`/api/tracks/${track.id}`)).json();
    const stemId = info.stems[0].id;
    const audio = Buffer.from(await (await user.fetch(`/api/audio/stem/${stemId}`)).arrayBuffer());
    assert.equal(audio.length, bytes.length);
    assert.ok(audio.equals(bytes), "byte for byte");

    // Someone else can't write into it.
    const other = await signUp("intruder");
    assert.equal((await other.fetch(`${route}?relay=${randomUUID()}&part=0`, { method: "PUT", body: "x" })).status, 404);
  });

  test("a slice that's too big, or a bad session, is refused", async () => {
    const user = await signUp("bigslice");
    const res = await user.fetch("/api/tracks", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ title: "Big", filename: "big.mp3", duration: 30, bpm: null, vocalsPeaks: peaks, recording: true, rightsConfirmed: true }),
    });
    const track = (await res.json()) as { uploads: Record<string, Target> };
    const route = track.uploads.vocals.url;
    const big = await user.fetch(`${route}?relay=${randomUUID()}&part=0`, { method: "PUT", body: new Uint8Array(3 * 1024 * 1024 + 1) });
    assert.equal(big.status, 413);
    const missing = await user.fetch(`${route}?relay=${randomUUID()}&parts=2`, { method: "POST" });
    assert.equal(missing.status, 409);
  });
});

describe("visits", () => {
  test("a page view counts, and the day's first from a browser is a visit", async () => {
    const sid = randomUUID();
    const beat = (view: boolean) =>
      fetch(`${BASE_URL}/api/presence`, { method: "POST", headers: json, body: JSON.stringify({ sid, path: "/", view }) });
    const before = (await (await beat(true)).json()).visits;
    assert.ok(before.today >= 1 && before.total >= before.today);
    await beat(true);
    await beat(false);
    // Visits are cached for half a minute; the same browser again is still one visit either way.
    const after = (await (await fetch(`${BASE_URL}/api/presence`)).json()).visits;
    assert.ok(after.total >= before.total);
  });
});
