// End-to-end: making music together privately (lib/songPrivacy.ts,
// lib/publishConsent.ts). A producer uploads a beat "only me", shares it
// with a singer, publishes only some parts, and a remix of it goes public
// only once the producer agrees. Run with `npm test`.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { authInit } from "./support/auth.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";

type Client = { id: string; name: string; fetch: (path: string, init?: RequestInit) => Promise<Response> };

async function signUp(prefix: string): Promise<Client> {
  const name = `${prefix}${randomUUID().slice(0, 6)}`;
  const res = await fetch(`${BASE_URL}/api/auth/signup`, await authInit(BASE_URL, { email: `${name}-${randomUUID()}@test.local`, password: "password123", artistName: name }));
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
async function makeTrack(client: Client, { recording = false, sourceHash, keepPrivate = false }: { recording?: boolean; sourceHash?: string; keepPrivate?: boolean } = {}) {
  const res = await client.fetch("/api/tracks", {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      title: recording ? "My take" : "Night beat",
      filename: recording ? "studio-recording.mp3" : "song.mp3",
      duration: 30,
      bpm: 120,
      vocalsPeaks: peaks,
      ...(recording ? { recording: true, tags: ["studio recording"] } : { beatPeaks: peaks, tags: [] }),
      ...(sourceHash ? { sourceHash } : {}),
      ...(keepPrivate ? { private: true } : {}),
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


async function remixWith(client: Client, stemIds: string[], published: boolean) {
  const res = await client.fetch("/api/remixes", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ title: "Together", published, lanes: stemIds.map((stemId) => ({ stemId })), project: {} }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as { id: string; published: boolean; waitingFor?: { status: string; ownerName: string }[]; message?: string };
}

describe("making music together, privately", () => {
  test("a private upload stays out of everyone else's library and playback until shared", async () => {
    const producer = await signUp("prod");
    const singer = await signUp("sing");
    const song = await makeTrack(producer, { keepPrivate: true });
    assert.ok((await libraryIds(producer)).includes(song.vocalId));
    assert.ok(!(await libraryIds(singer)).includes(song.vocalId));
    assert.equal(await canHear(singer, song.vocalId), 404);
    const share = await producer.fetch(`/api/tracks/${song.id}/sharing`, { method: "POST", headers: json, body: JSON.stringify({ userId: singer.id }) });
    assert.equal(share.status, 200);
    assert.ok((await libraryIds(singer)).includes(song.vocalId));
    assert.equal(await canHear(singer, song.vocalId), 200);
  });

  test("publishing only the beat: the beat is everyone's, the vocal stays with the people it's shared with", async () => {
    const producer = await signUp("prod");
    const stranger = await signUp("str");
    const song = await makeTrack(producer, { keepPrivate: true });
    const res = await producer.fetch(`/api/tracks/${song.id}/sharing`, { method: "PATCH", headers: json, body: JSON.stringify({ parts: ["beat"] }) });
    assert.equal(res.status, 200);
    const state = (await res.json()) as { visibility: string; parts: { kind: string; public: boolean }[] };
    assert.equal(state.visibility, "public");
    assert.deepEqual(state.parts, [{ kind: "vocals", public: false }, { kind: "beat", public: true }]);
    const info = await (await producer.fetch(`/api/tracks/${song.id}`)).json();
    const beatId = (info.stems as { id: string; kind: string }[]).find((s) => s.kind === "beat")!.id;
    const lib = await libraryIds(stranger);
    assert.ok(lib.includes(beatId), "the beat is in the public library");
    assert.ok(!lib.includes(song.vocalId), "the vocal is held back");
    assert.equal(await canHear(stranger, song.vocalId), 404);
    // Back to "only me".
    await producer.fetch(`/api/tracks/${song.id}/sharing`, { method: "PATCH", headers: json, body: JSON.stringify({ parts: [] }) });
    assert.ok(!(await libraryIds(stranger)).includes(beatId));
  });

  test("a remix of someone else's private song waits for its owner; a no keeps it private; a yes publishes it", async () => {
    const producer = await signUp("prod");
    const singer = await signUp("sing");
    const stranger = await signUp("str");
    const song = await makeTrack(producer, { keepPrivate: true });
    await producer.fetch(`/api/tracks/${song.id}/sharing`, { method: "POST", headers: json, body: JSON.stringify({ userId: singer.id }) });

    const remix = await remixWith(singer, [song.vocalId], true);
    assert.equal(remix.published, false, "saved private while it waits");
    assert.equal(remix.waitingFor?.[0].ownerName, producer.name);
    assert.match(remix.message ?? "", /goes public as soon as/);
    assert.equal((await stranger.fetch(`/api/remixes/${remix.id}`)).status, 404, "nobody else sees it yet");
    assert.equal(await canHear(stranger, song.vocalId), 404, "nor hears the private song through it");

    // The producer was asked, can open the private remix to listen, and says no.
    const asked = (await (await producer.fetch("/api/consents")).json()).requests as { remix_id: string; track_id: string; status: string; parts: string[] }[];
    const mine = asked.find((r) => r.remix_id === remix.id)!;
    assert.equal(mine.status, "asked");
    assert.deepEqual(mine.parts, ["vocals"]);
    assert.equal((await producer.fetch(`/api/remixes/${remix.id}`)).status, 200);
    const no = await producer.fetch("/api/consents", { method: "POST", headers: json, body: JSON.stringify({ remixId: remix.id, trackId: song.id, agree: false, note: "Not yet" }) });
    assert.deepEqual(await no.json(), { status: "declined", published: false });
    const again = await singer.fetch(`/api/remixes/${remix.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ published: true }) });
    assert.equal(again.status, 409, "a no is a no until asked again");

    // Asked again; this time yes: it goes public by itself.
    const ask = await singer.fetch(`/api/remixes/${remix.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ published: true, askAgain: true }) });
    assert.equal(ask.status, 200);
    const yes = await producer.fetch("/api/consents", { method: "POST", headers: json, body: JSON.stringify({ remixId: remix.id, trackId: song.id, agree: true }) });
    assert.deepEqual(await yes.json(), { status: "agreed", published: true });
    assert.equal((await stranger.fetch(`/api/remixes/${remix.id}`)).status, 200, "public now");
    assert.equal(await canHear(stranger, song.vocalId), 200, "the song plays inside the published remix");
    assert.ok(!(await libraryIds(stranger)).includes(song.vocalId), "but the song itself stays out of the library");
    // Only the song's owner answers.
    const forged = await stranger.fetch("/api/consents", { method: "POST", headers: json, body: JSON.stringify({ remixId: remix.id, trackId: song.id, agree: false }) });
    assert.equal(forged.status, 404);
  });

  test("the owner's own private song publishes at once; a private draft remix doesn't expose a song", async () => {
    const producer = await signUp("prod");
    const stranger = await signUp("str");
    const song = await makeTrack(producer, { keepPrivate: true });
    const draft = await remixWith(producer, [song.vocalId], false);
    assert.equal(draft.published, false);
    assert.equal(await canHear(stranger, song.vocalId), 404, "a private remix lets no one else hear its songs");
    const mine = await remixWith(producer, [song.vocalId], true);
    assert.equal(mine.published, true);
    assert.equal(mine.waitingFor, undefined);
  });

  test("roles in a shared session: a listener can't change the mix until the owner lets them", async () => {
    const owner = await signUp("own");
    const guest = await signUp("lis");
    const made = await (await owner.fetch("/api/projects", { method: "POST", headers: json, body: JSON.stringify({ title: "Jam", state: { lanes: [], project: {} } }) })).json();
    assert.ok(made.id, JSON.stringify(made));
    assert.equal((await guest.fetch("/api/projects/join", { method: "POST", headers: json, body: JSON.stringify({ code: made.inviteCode }) })).status, 200);
    const setRole = (who: Client, body: object) => who.fetch(`/api/projects/${made.id}/members`, { method: "PATCH", headers: json, body: JSON.stringify(body) });
    assert.equal((await setRole(guest, { userId: guest.id, role: "listener" })).status, 200, "a member picks their own role");
    assert.equal((await setRole(guest, { userId: owner.id, role: "vocalist" })).status, 403, "but not someone else's");
    assert.equal((await setRole(guest, { userId: guest.id, canEdit: true })).status, 403, "nor who can edit");
    const save = (who: Client, v: number) => who.fetch(`/api/projects/${made.id}`, { method: "PUT", headers: json, body: JSON.stringify({ baseVersion: v, state: { lanes: [], project: { projectBpm: 100 } } }) });
    assert.equal((await save(guest, 1)).status, 403, "a listener can't change the mix");
    assert.equal((await setRole(owner, { userId: guest.id, canEdit: true })).status, 200);
    assert.equal((await save(guest, 1)).status, 200);
    const members = (await (await guest.fetch(`/api/projects/${made.id}`)).json()).members as { id: string; role: string; can_edit: boolean }[];
    assert.deepEqual(members.find((m) => m.id === guest.id), { ...members.find((m) => m.id === guest.id), role: "listener", can_edit: true });
  });
});
