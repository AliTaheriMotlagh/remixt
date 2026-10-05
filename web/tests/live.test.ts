// End-to-end test of live sessions (lib/live.ts and /api/live/*): a host
// goes live, guests and members chat and react, the host runs the room
// (state, pins, hides, bans, chat modes) and ends it.
//
//   npm test           (starts a dev server against a throwaway database)
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… node --test tests/live.test.ts

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres from "postgres";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL to the database the app under test uses");
const sql = postgres(DATABASE_URL, { onnotice: () => {} });

type Client = { id: string; name: string; sid: string; fetch: (path: string, init?: RequestInit) => Promise<Response> };

function client(id: string, name: string, cookie: string): Client {
  return {
    id,
    name,
    sid: `sid-${randomUUID()}`,
    fetch: (path, init = {}) =>
      fetch(`${BASE_URL}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), ...(cookie ? { cookie } : {}) } }),
  };
}

async function signUp(name: string): Promise<Client> {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${name}-${randomUUID()}@test.local`, password: "password123", artistName: name }),
  });
  assert.equal(res.status, 200, `signup failed: ${await res.clone().text()}`);
  const { id } = await res.json();
  return client(id, name, res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "));
}

const guest = (name: string) => client("", name, "");

function json(c: Client, method: string, path: string, body?: unknown) {
  return c.fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function ok(res: Response, status = 200) {
  const text = await res.text();
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function feed(c: Client, id: string, after = 0, extra = "") {
  return ok(await c.fetch(`/api/live/${id}/feed?sid=${c.sid}&after=${after}&mv=-1&hb=1${extra}`));
}

const chat = (c: Client, id: string, body: string, name?: string) => json(c, "POST", `/api/live/${id}/chat`, { sid: c.sid, body, name });

async function remixOf(owner: Client, published = true) {
  const id = randomUUID();
  await sql`INSERT INTO remixes (id, owner_id, title, published) VALUES (${id}, ${owner.id}, ${"Test remix"}, ${published})`;
  return id;
}

describe("live sessions", () => {
  let host: Client;
  let fan: Client;
  let stranger: Client;
  let remixId: string;

  before(async () => {
    [host, fan, stranger] = await Promise.all([signUp("liveHost"), signUp("liveFan"), signUp("liveStranger")]);
    remixId = await remixOf(host);
  });
  after(() => sql.end());

  test("only signed-in artists can go live, with a remix of their own that's published", async () => {
    await ok(await json(guest("g"), "POST", "/api/live", { title: "Hello" }), 401);
    await ok(await json(host, "POST", "/api/live", { title: "x" }), 400);
    await ok(await json(host, "POST", "/api/live", { title: "Hello", remixId: await remixOf(stranger) }), 400);
    await ok(await json(host, "POST", "/api/live", { title: "Hello", remixId: await remixOf(host, false) }), 400);
    await ok(await json(host, "POST", "/api/live", { title: "Hello", scheduledAt: new Date(Date.now() - 3600_000).toISOString() }), 400);
  });

  test("a full session: chat, reactions, state, moderation, ending", async () => {
    await json(fan, "POST", `/api/users/${host.id}/follow`);
    const created = await ok(await json(host, "POST", "/api/live", { title: "Friday set", remixId, tags: ["House"] }));
    const id = created.id as string;

    // One live session at a time.
    const again = await ok(await json(host, "POST", "/api/live", { title: "Second" }), 409);
    assert.equal(again.id, id);

    // Followers are told.
    const notes = await ok(await fan.fetch("/api/notifications"));
    assert.ok(notes.notifications.some((n: { type: string; live_id: string }) => n.type === "live" && n.live_id === id), "follower notified");

    // The directory shows it.
    const dir = await ok(await fetch(`${BASE_URL}/api/live`));
    assert.ok(dir.live.some((s: { id: string }) => s.id === id));

    // A guest joins, and counts as a viewer.
    const g1 = guest("g1");
    let f = await feed(g1, id);
    assert.equal(f.stream.status, "live");
    assert.equal(f.stream.remixId, remixId);
    assert.equal(f.stream.viewers, 1);
    assert.equal(f.audience.guests, 1, "the crowd comes with a heartbeat");

    // Guests chat under a name; links are stripped; fast repeats are slowed.
    await ok(await chat(g1, id, "hello  there http://spam.example/x", "Ada"));
    const slow = await ok(await chat(g1, id, "again"), 429);
    assert.match(slow.error, /wait/i);
    f = await feed(g1, id);
    const first = f.events.find((e: { body: string }) => e.body.startsWith("hello"));
    assert.equal(first.name, "Ada");
    assert.equal(first.body, "hello there •••");
    assert.equal(first.user_id, null);

    // A member chats; the cursor only returns what's new.
    await ok(await chat(fan, id, "great drop!"));
    const cursor = f.events[f.events.length - 1].id;
    f = await feed(g1, id, cursor);
    assert.deepEqual(f.events.map((e: { body: string }) => e.body), ["great drop!"]);
    assert.equal(f.events[0].name, "liveFan");

    // Reactions: counted, batched, validated, rate limited.
    await ok(await json(g1, "POST", `/api/live/${id}/react`, { sid: g1.sid, emoji: "🔥", count: 3 }));
    await ok(await json(fan, "POST", `/api/live/${id}/react`, { sid: fan.sid, emoji: "🔥" }));
    await ok(await json(fan, "POST", `/api/live/${id}/react`, { sid: fan.sid, emoji: "💩" }), 400);
    await ok(await json(g1, "POST", `/api/live/${id}/react`, { sid: g1.sid, emoji: "❤️", count: 10 }));
    await ok(await json(g1, "POST", `/api/live/${id}/react`, { sid: g1.sid, emoji: "❤️", count: 10 }));
    await ok(await json(g1, "POST", `/api/live/${id}/react`, { sid: g1.sid, emoji: "❤️", count: 10 }));
    await ok(await json(g1, "POST", `/api/live/${id}/react`, { sid: g1.sid, emoji: "❤️", count: 10 }), 429);
    f = await feed(fan, id, cursor);
    assert.equal(f.stream.reactions["🔥"], 4);
    assert.equal(f.stream.reactions["❤️"], 30);
    const mine = f.events.filter((e: { kind: string; mine: boolean }) => e.kind === "reaction" && e.mine);
    assert.ok(mine.length >= 1, "a browser's own reactions are marked");

    // The host's performance.
    await ok(await json(fan, "PUT", `/api/live/${id}/state`, { playing: true, position: 1, lanes: [] }), 403);
    await ok(await json(guest("g"), "PUT", `/api/live/${id}/state`, { playing: true, position: 1, lanes: [] }), 401);
    await ok(await json(host, "PUT", `/api/live/${id}/state`, { playing: true, position: 12.5, lanes: [{ muted: true, solo: false, volume: 0.8 }], note: "Drop incoming" }));
    f = await feed(g1, id);
    assert.equal(f.stream.state.playing, true);
    assert.equal(f.stream.state.position, 12.5);
    assert.equal(f.stream.state.lanes[0].muted, true);
    assert.equal(f.stream.state.note, "Drop incoming");
    assert.ok(Math.abs(f.now - f.stream.stateAt) < 60_000, "state and clock share one clock");
    await ok(await json(host, "PUT", `/api/live/${id}/state`, { playing: true, position: -1, lanes: [] }), 400);

    // The host sees who's here.
    f = await feed(host, id);
    assert.ok(f.audience.signedIn.some((a: { id: string }) => a.id === fan.id) || f.audience.guests >= 1);

    // Moderation: pin, hide, ban — host only.
    const all = await feed(g1, id);
    const adaId = all.events.find((e: { name: string }) => e.name === "Ada").id;
    await ok(await json(fan, "POST", `/api/live/${id}/moderate`, { action: "hide", eventId: adaId }), 403);
    await ok(await json(host, "POST", `/api/live/${id}/moderate`, { action: "pin", eventId: all.events.find((e: { body: string }) => e.body === "great drop!").id }));
    assert.equal((await feed(g1, id)).stream.pinned.body, "great drop!");
    await ok(await json(host, "POST", `/api/live/${id}/moderate`, { action: "ban", eventId: adaId }));
    f = await ok(await g1.fetch(`/api/live/${id}/feed?sid=${g1.sid}&after=0&mv=-1&hb=0`));
    assert.ok(f.hidden.includes(adaId), "listeners are told to drop hidden messages");
    assert.ok(!f.events.some((e: { id: number }) => e.id === adaId));
    assert.equal(f.you.banned, true);
    await ok(await chat(g1, id, "can I still talk?"), 403);
    await ok(await json(g1, "POST", `/api/live/${id}/react`, { sid: g1.sid, emoji: "🔥" }), 403);

    // Chat modes.
    await ok(await json(host, "PATCH", `/api/live/${id}`, { chatMode: "followers" }));
    await ok(await json(guest("g2"), "POST", `/api/live/${id}/chat`, { body: "hi" }), 400); // no browser id
    const g2 = guest("g2");
    await ok(await chat(g2, id, "hi"), 403);
    await ok(await chat(stranger, id, "hi"), 403);
    await ok(await chat(fan, id, "follower here"));
    await ok(await json(host, "PATCH", `/api/live/${id}`, { chatMode: "off" }));
    await ok(await chat(fan, id, "hello?"), 403);
    await ok(await chat(host, id, "host can always talk"));
    await ok(await json(host, "PATCH", `/api/live/${id}`, { chatMode: "open", slowMode: 10 }));
    await ok(await chat(fan, id, "one"), 429); // spoke moments ago: slow mode applies
    await ok(await json(stranger, "PATCH", `/api/live/${id}`, { title: "hijack" }), 403);

    // Ending: everything stops, the recap is there.
    await ok(await json(host, "PATCH", `/api/live/${id}`, { action: "end" }));
    await ok(await chat(fan, id, "too late"), 409);
    await ok(await json(fan, "POST", `/api/live/${id}/react`, { sid: fan.sid, emoji: "🔥" }), 409);
    await ok(await json(host, "PUT", `/api/live/${id}/state`, { playing: true, position: 1, lanes: [] }), 409);
    f = await feed(g1, id);
    assert.equal(f.stream.status, "ended");
    assert.equal(f.stream.state.playing, false);
    const detail = await ok(await fetch(`${BASE_URL}/api/live/${id}`));
    assert.equal(detail.recap.messages >= 3, true);
    assert.equal(detail.recap.reactions >= 34, true);
    assert.equal(detail.recap.topReaction, "❤️");
    assert.ok(detail.recap.unique >= 1);
    const after = await ok(await fetch(`${BASE_URL}/api/live`));
    assert.ok(!after.live.some((s: { id: string }) => s.id === id));
  });

  test("scheduled sessions start on demand and a vanished host's session is ended", async () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const { id } = await ok(await json(host, "POST", "/api/live", { title: "Later", scheduledAt: soon }));
    const dir = await ok(await fetch(`${BASE_URL}/api/live`));
    assert.ok(dir.upcoming.some((s: { id: string }) => s.id === id));
    assert.equal((await feed(guest("x"), id)).stream.status, "scheduled");
    await ok(await chat(fan, id, "early"), 409);
    await ok(await json(stranger, "PATCH", `/api/live/${id}`, { action: "start" }), 403);
    await ok(await json(host, "PATCH", `/api/live/${id}`, { action: "start" }));
    assert.equal((await feed(guest("x"), id)).stream.status, "live");

    // The host's tab dies and nobody ends the session.
    await sql`UPDATE live_streams SET host_seen_at = now() - interval '2 minutes' WHERE id = ${id}`;
    assert.equal((await feed(guest("y"), id)).stream.hostAway, true);
    await sql`UPDATE live_streams SET host_seen_at = now() - interval '30 minutes' WHERE id = ${id}`;
    const dir2 = await ok(await fetch(`${BASE_URL}/api/live`));
    assert.ok(!dir2.live.some((s: { id: string }) => s.id === id));
    assert.equal((await feed(guest("y"), id)).stream.status, "ended");
  });

  test("a studio session carries the host's whole mix to listeners, only when it changes", async () => {
    // A perform session has no mix.
    const perform = await ok(await json(stranger, "POST", "/api/live", { title: "Perform" }));
    await ok(await json(stranger, "PUT", `/api/live/${perform.id}/mix`, { lanes: [], project: {} }), 409);
    await ok(await json(stranger, "PATCH", `/api/live/${perform.id}`, { action: "end" }));

    const { id } = await ok(await json(stranger, "POST", "/api/live", { mode: "studio", title: "Making it live", remixId }));
    const info = await ok(await fetch(`${BASE_URL}/api/live/${id}`));
    assert.equal(info.stream.mode, "studio");
    assert.equal(info.stream.remix_id, null, "a studio session doesn't perform a remix");

    const g = guest("watcher");
    let f = await ok(await g.fetch(`/api/live/${id}/feed?sid=${g.sid}&after=0&mv=-1&hb=1&xv=-1`));
    assert.equal(f.stream.mode, "studio");
    assert.equal(f.mix, null, "nothing sent yet");

    const mix = { lanes: [{ laneId: "l1", stemId: "s1", kind: "vocals", trackTitle: "A", muted: false, volume: 1 }], project: { projectBpm: 124 } };
    await ok(await json(fan, "PUT", `/api/live/${id}/mix`, mix), 403);
    await ok(await json(stranger, "PUT", `/api/live/${id}/mix`, { lanes: "nope", project: {} }), 400);
    const big = { lanes: [{ laneId: "x", stemId: "y", peaks: new Array(200_000).fill(0.5) }], project: {} };
    await ok(await json(stranger, "PUT", `/api/live/${id}/mix`, big), 413);
    const put = await ok(await json(stranger, "PUT", `/api/live/${id}/mix`, mix));

    f = await ok(await g.fetch(`/api/live/${id}/feed?sid=${g.sid}&after=0&mv=-1&hb=0&xv=${f.stream.mixVersion}`));
    assert.equal(f.stream.mixVersion, put.version);
    assert.deepEqual(f.mix, mix);
    // Already has it: not sent again.
    f = await ok(await g.fetch(`/api/live/${id}/feed?sid=${g.sid}&after=0&mv=-1&hb=0&xv=${put.version}`));
    assert.equal(f.mix, undefined);
    // Tabs that don't ask for the mix never get it.
    f = await ok(await g.fetch(`/api/live/${id}/feed?sid=${g.sid}&after=0&mv=-1&hb=0`));
    assert.equal(f.mix, undefined);

    // The selection travels with the stage state.
    await ok(await json(stranger, "PUT", `/api/live/${id}/state`, { playing: false, position: 3, lanes: [], selected: ["l1"] }));
    f = await feed(g, id);
    assert.deepEqual(f.stream.state.selected, ["l1"]);

    // The host's own page sends them to the Studio.
    const page = await stranger.fetch(`/live/${id}`, { redirect: "manual" });
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location") ?? "", /\/studio\?live=/);

    await ok(await json(stranger, "PATCH", `/api/live/${id}`, { action: "end" }));
    await ok(await json(stranger, "PUT", `/api/live/${id}/mix`, mix), 409);
  });

  test("anyone can read the directory and pages render", async () => {
    for (const path of ["/live", "/live/new"]) {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
      assert.ok(res.status === 200 || res.status === 307, `${path}: ${res.status}`);
    }
    assert.equal((await fetch(`${BASE_URL}/live/${randomUUID()}`)).status, 404);
    assert.equal((await fetch(`${BASE_URL}/api/live/${randomUUID()}/feed?sid=abcdefgh1`)).status, 404);
    assert.equal((await fetch(`${BASE_URL}/api/live/x/feed?sid=bad`)).status, 400);
  });
});
