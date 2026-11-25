// End-to-end test of the split queue (lib/splitQueue.ts and
// /api/split-jobs/*): a phone queues a song, a helper's computer takes it,
// downloads it, "splits" it, uploads the stems and finishes — plus every
// way that can go wrong on the way (the helper's tab reloads, goes quiet,
// fails, the owner cancels or retries, a second tab or a stranger butts in).
//
// It talks to a running app over HTTP, with local-disk storage, and to its
// database directly (to wind clocks forward). Run it with:
//
//   npm test
//
// which starts a dev server against a throwaway database for the run. To
// point it at a server you've started yourself instead:
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… node --test tests/split-queue.test.ts

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres from "postgres";
import { upload, UploadCancelled, type RelayResume, type Send } from "../src/lib/client/directUpload.ts";
import { fetchInSlices } from "../src/lib/client/stemFetch.ts";
import { authInit } from "./support/auth.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3999";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL to the database the app under test uses");
const sql = postgres(DATABASE_URL, { onnotice: () => {} });

const STEMS = ["vocals", "beat", "drums", "bass", "other"] as const;
/** The real fetch (downloadSource swaps the global one out for a moment). */
const httpFetch = globalThis.fetch;

/** A signed-in user: fetch with their session cookie. */
type Client = { id: string; name: string; fetch: (path: string, init?: RequestInit) => Promise<Response> };

async function signUp(name: string): Promise<Client> {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, await authInit(BASE_URL, { email: `${name}-${randomUUID()}@test.local`, password: "remix-test-Pass-2026", artistName: name }));
  assert.equal(res.status, 200, `signup failed: ${await res.clone().text()}`);
  const { id } = await res.json();
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return {
    id,
    name,
    fetch: (path, init = {}) =>
      httpFetch(path.startsWith("http") ? path : `${BASE_URL}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), cookie },
      }),
  };
}

async function body(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function expectStatus(res: Response, status: number, what: string) {
  const data = await body(res);
  assert.equal(res.status, status, `${what}: expected ${status}, got ${res.status} ${JSON.stringify(data)}`);
  return data;
}

function post(client: Client, path: string, json?: unknown, headers: Record<string, string> = {}) {
  return client.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

/** What a phone does: create the job, upload the song where it's told, then say it's there. */
async function queueSong(owner: Client, bytes: Uint8Array, filename = "My Song.mp3") {
  const created = await expectStatus(
    await post(owner, "/api/split-jobs", {
      title: filename.replace(/\.[^.]+$/, ""),
      filename,
      size: bytes.length,
      tags: ["test"],
      rightsConfirmed: true,
    }),
    200,
    "create job"
  );
  assert.equal(created.upload.type, "put", "these tests need the local-disk storage backend");
  await expectStatus(
    await owner.fetch(created.upload.url, { method: "PUT", headers: created.upload.headers, body: new Blob([bytes as BlobPart]) }),
    200,
    "upload song"
  );
  await expectStatus(await post(owner, `/api/split-jobs/${created.id}/queued`), 200, "mark queued");
  return created.id as string;
}

/** The browser's upload requests, sent as `client` (progress arrives all at once, when the body's gone). */
function sendAs(client: Client, seen: { method: string; url: string; bytes: number }[] = []): Send {
  return async (request, onProgress) => {
    const res = await client.fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
    const text = await res.text();
    const bytes = request.body instanceof Blob ? request.body.size : 0;
    seen.push({ method: request.method, url: request.url, bytes });
    if (bytes) onProgress(bytes);
    return { status: res.status, text };
  };
}

function createJob(owner: Client, size: number, extra: Record<string, unknown> = {}) {
  return post(owner, "/api/split-jobs", { title: "Phone Song", filename: "Phone Song.mp3", size, tags: [], rightsConfirmed: true, ...extra });
}

async function ownerJobs(owner: Client) {
  return (await expectStatus(await owner.fetch("/api/split-jobs"), 200, "list queue")) as {
    jobs: { id: string; status: string; position: number | null; helper_name: string | null; error: string | null; attempts: number }[];
    stats: { waiting: number; working: number; helped: number; rigs: number };
  };
}

async function claim(helper: Client, session: string) {
  return expectStatus(await post(helper, "/api/split-jobs/claim", { session }), 200, "claim");
}

/** Claims until it gets `jobId` (other tests' songs may be ahead of it) — handing any others straight back. */
async function claimJob(helper: Client, session: string, jobId: string) {
  for (let i = 0; i < 20; i++) {
    const { job } = await claim(helper, session);
    assert.ok(job, `the queue ran dry before ${jobId} came up`);
    if (job.id === jobId) return job;
    await post(helper, `/api/split-jobs/${job.id}/fail`, { error: "not this one" }, { "x-split-session": session });
  }
  throw new Error(`never got ${jobId}`);
}

/** Downloads the queued song the way the helper's browser does (in ranged slices). */
async function downloadSource(helper: Client, sourceUrl: string, session: string) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string, init?: RequestInit) => helper.fetch(input, init)) as typeof fetch;
  try {
    return new Uint8Array(await fetchInSlices(`${BASE_URL}${sourceUrl}?session=${encodeURIComponent(session)}`));
  } finally {
    globalThis.fetch = realFetch;
  }
}

function splitPayload() {
  const peaks = Array.from({ length: 600 }, (_, i) => Math.abs(Math.sin(i / 10)));
  return {
    title: "ignored — the job's title is used",
    filename: "ignored.mp3",
    duration: 180,
    bpm: 120,
    vocalsPeaks: peaks,
    beatPeaks: peaks,
    partPeaks: { drums: peaks, bass: peaks, other: peaks },
    tags: [],
  };
}

/** Everything the helper does after splitting: create the track, upload each stem, finish. */
async function deliverStems(helper: Client, jobId: string, session: string) {
  const headers = { "x-split-session": session };
  const track = await expectStatus(await post(helper, `/api/split-jobs/${jobId}/track`, splitPayload(), headers), 200, "create track");
  assert.deepEqual(Object.keys(track.uploads).sort(), [...STEMS].sort());
  for (const kind of STEMS) {
    const target = track.uploads[kind];
    await expectStatus(
      await helper.fetch(target.url, { method: "PUT", headers: target.headers, body: randomBytes(64 * 1024) }),
      200,
      `upload ${kind}`
    );
  }
  const done = await expectStatus(await post(helper, `/api/split-jobs/${jobId}/complete`, undefined, headers), 200, "complete");
  assert.equal(done.status, "done");
  return track.id as string;
}

async function jobRow(id: string) {
  const [row] = await sql`SELECT * FROM split_jobs WHERE id = ${id}`;
  return row;
}

/** As if the helper had said nothing for `minutes`. */
async function silence(id: string, minutes: number) {
  await sql`UPDATE split_jobs SET heartbeat_at = now() - ${`${minutes} minutes`}::interval WHERE id = ${id}`;
}

let owner: Client;
let helper: Client;
let stranger: Client;

before(async () => {
  const res = await fetch(`${BASE_URL}/api/auth/me`).catch(() => null);
  assert.ok(res, `nothing is listening at ${BASE_URL} — start the app first (npm test does)`);
  [owner, helper, stranger] = await Promise.all([signUp("phone"), signUp("helper"), signUp("stranger")]);
  // Songs other runs left behind would get claimed before this run's.
  await sql`DELETE FROM split_jobs WHERE status IN ('queued', 'working')`;
});

after(async () => {
  await sql.end();
});

describe("split queue", () => {
  test("a queued song goes all the way to the owner's library", async () => {
    // Bigger than one 4 MB download slice, so the ranged download is exercised.
    const song = randomBytes(9 * 1024 * 1024 + 123);
    const id = await queueSong(owner, song);

    const listed = await ownerJobs(owner);
    let jobs = listed.jobs;
    const queued = jobs.find((j) => j.id === id);
    assert.equal(queued?.status, "queued");
    assert.equal(queued?.position, 1);
    assert.ok(listed.stats.waiting >= 1);

    const session = randomUUID();
    const job = await claimJob(helper, session, id);
    assert.equal(job.forSomeoneElse, true);
    assert.equal(job.filename, "My Song.mp3");

    ({ jobs } = await ownerJobs(owner));
    assert.equal(jobs.find((j) => j.id === id)?.status, "working");
    assert.equal(jobs.find((j) => j.id === id)?.helper_name, "helper");

    const downloaded = await downloadSource(helper, job.sourceUrl, session);
    assert.equal(downloaded.length, song.length, "the helper got the whole song");
    assert.ok(Buffer.from(downloaded).equals(song), "the helper got the song byte for byte");

    await expectStatus(
      await post(helper, `/api/split-jobs/${id}/heartbeat`, { progress: 0.5, stage: "splitting" }, { "x-split-session": session }),
      200,
      "heartbeat"
    );
    assert.equal((await jobRow(id)).stage, "splitting");

    const trackId = await deliverStems(helper, id, session);

    // Out of the owner's queue, into their library — owned by them, with every stem.
    ({ jobs } = await ownerJobs(owner));
    assert.equal(jobs.find((j) => j.id === id), undefined);
    const { track, stems } = await expectStatus(await owner.fetch(`/api/tracks/${trackId}`), 200, "get track");
    assert.equal(track.status, "ready");
    assert.equal(track.owner_id, owner.id);
    assert.equal(track.title, "My Song");
    assert.deepEqual(track.tags, ["test"]);
    assert.deepEqual(stems.map((s: { kind: string }) => s.kind).sort(), [...STEMS].sort());

    // The song itself is thrown away; the owner hears who split it; the helper gets the credit.
    assert.equal((await helper.fetch(`${job.sourceUrl}?session=${session}`)).status, 404);
    const [note] = await sql`SELECT * FROM notifications WHERE user_id = ${owner.id} AND type = 'split' AND track_id = ${trackId}`;
    assert.equal(note?.actor_id, helper.id);
    assert.equal((await claim(helper, randomUUID())).stats.helped >= 1, true);
  });

  test("mining pays XP with bonuses, and shows up in the miner's stats", async () => {
    const miner = await signUp("miner");
    const session = randomUUID();

    // Waited over 15 minutes, and the miner's first of the day: (10 + 5) × 2.
    const rushed = await queueSong(owner, randomBytes(1024));
    await sql`UPDATE split_jobs SET created_at = now() - interval '20 minutes' WHERE id = ${rushed}`;
    await claimJob(miner, session, rushed);
    await deliverStems(miner, rushed, session);
    assert.equal((await jobRow(rushed)).reward, 30);

    // Fresh and not the first today: the base 10.
    const plain = await queueSong(owner, randomBytes(1024));
    await claimJob(miner, session, plain);
    await deliverStems(miner, plain, session);
    assert.equal((await jobRow(plain)).reward, 10);

    const { mining, miners, stats } = await expectStatus(await miner.fetch("/api/split-jobs"), 200, "miner's stats");
    assert.equal(mining.songs, 2);
    assert.equal(mining.xp, 40);
    assert.equal(mining.today, 2);
    assert.equal(mining.todayXp, 40);
    assert.equal(mining.streak, 1);
    assert.equal(typeof mining.weekRank, "number");
    assert.ok(stats.rigs >= 1, "the miner's tab counts as a rig online");
    assert.ok(miners.length >= 1);

    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM split_rigs WHERE session = ${session}`;
    assert.equal(count, 1);
    await expectStatus(
      await miner.fetch("/api/split-jobs/claim", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      }),
      200,
      "leave"
    );
    const [{ count: left }] = await sql`SELECT COUNT(*)::int AS count FROM split_rigs WHERE session = ${session}`;
    assert.equal(left, 0, "a miner who stops is no longer online");
  });

  test("only the helper's own tab can work on the song", async () => {
    const id = await queueSong(owner, randomBytes(1024));
    const session = randomUUID();
    const job = await claimJob(helper, session, id);

    // A stranger, or the same helper in another tab, can't read the song or report on it.
    assert.equal((await stranger.fetch(`${job.sourceUrl}?session=${session}`)).status, 404);
    assert.equal((await helper.fetch(`${job.sourceUrl}?session=${randomUUID()}`)).status, 404);
    const other = { "x-split-session": randomUUID() };
    assert.equal((await post(helper, `/api/split-jobs/${id}/heartbeat`, { progress: 0.1, stage: "splitting" }, other)).status, 409);
    assert.equal((await post(helper, `/api/split-jobs/${id}/track`, splitPayload(), other)).status, 409);
    assert.equal((await post(stranger, `/api/split-jobs/${id}/complete`, undefined, { "x-split-session": session })).status, 409);
    // A stranger's "fail" is ignored.
    await post(stranger, `/api/split-jobs/${id}/fail`, { error: "nope" }, { "x-split-session": session });
    assert.equal((await jobRow(id)).status, "working");

    // Nor can anyone but the owner cancel or retry it.
    assert.equal((await stranger.fetch(`/api/split-jobs/${id}`, { method: "DELETE" })).status, 404);
    assert.equal((await post(stranger, `/api/split-jobs/${id}/retry`)).status, 404);

    await deliverStems(helper, id, session);
  });

  test("a helper's tab that reloads mid-song gets the same song back", async () => {
    const id = await queueSong(owner, randomBytes(1024));
    const session = randomUUID();
    await claimJob(helper, session, id);
    const { job } = await claim(helper, session);
    assert.equal(job?.id, id, "the reloaded tab picks its song straight back up");
    assert.equal((await jobRow(id)).attempts, 2);
    await deliverStems(helper, id, session);
  });

  test("a helper that goes quiet has its song handed to another computer", async () => {
    const id = await queueSong(owner, randomBytes(1024));
    const first = randomUUID();
    await claimJob(helper, first, id);

    // Still checking in: nobody else can take it.
    await silence(id, 1);
    const { job: none } = await claim(stranger, randomUUID());
    assert.notEqual(none?.id, id);
    if (none) await post(stranger, `/api/split-jobs/${none.id}/fail`, { error: "not this one" });

    await silence(id, 10);
    const second = randomUUID();
    const job = await claimJob(stranger, second, id);
    assert.equal(job.id, id);

    // The first helper wakes up: the song isn't theirs any more.
    const lost = await post(helper, `/api/split-jobs/${id}/heartbeat`, { progress: 0.9, stage: "splitting" }, { "x-split-session": first });
    assert.equal(lost.status, 409);
    assert.equal((await post(helper, `/api/split-jobs/${id}/complete`, undefined, { "x-split-session": first })).status, 409);

    await deliverStems(stranger, id, second);
  });

  test("a helper whose heartbeats are throttled in a background tab keeps its song", async () => {
    // Chrome runs a hidden tab's timers at most once a minute: the song
    // mustn't be taken away between two such check-ins.
    const id = await queueSong(owner, randomBytes(1024));
    const session = randomUUID();
    await claimJob(helper, session, id);
    await silence(id, 2);
    await ownerJobs(owner); // the owner's phone polling reaps stale jobs
    assert.equal((await jobRow(id)).status, "working");
    await deliverStems(helper, id, session);
  });

  test("a song that keeps failing ends up failed, and its owner can retry it", async () => {
    const id = await queueSong(owner, randomBytes(1024));
    for (let attempt = 1; attempt <= 4; attempt++) {
      const session = randomUUID();
      await claimJob(helper, session, id);
      await expectStatus(
        await post(helper, `/api/split-jobs/${id}/fail`, { error: `broke ${attempt}` }, { "x-split-session": session }),
        200,
        "fail"
      );
      assert.equal((await jobRow(id)).status, attempt < 4 ? "queued" : "failed");
    }
    let { jobs } = await ownerJobs(owner);
    const failed = jobs.find((j) => j.id === id);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.error, "broke 4");

    // A failed song isn't handed out any more…
    const { job } = await claim(helper, randomUUID());
    assert.notEqual(job?.id, id);
    if (job) await post(helper, `/api/split-jobs/${job.id}/fail`, { error: "not this one" });

    // …until its owner tries again, from a clean slate.
    await expectStatus(await post(owner, `/api/split-jobs/${id}/retry`), 200, "retry");
    ({ jobs } = await ownerJobs(owner));
    assert.equal(jobs.find((j) => j.id === id)?.status, "queued");
    assert.equal((await jobRow(id)).attempts, 0);
    assert.equal((await post(owner, `/api/split-jobs/${id}/retry`)).status, 409, "only a failed song can be retried");

    const session = randomUUID();
    await claimJob(helper, session, id);
    await deliverStems(helper, id, session);
  });

  test("a helper that stops mid-upload leaves no half-made track behind", async () => {
    const id = await queueSong(owner, randomBytes(1024));
    const session = randomUUID();
    await claimJob(helper, session, id);
    const headers = { "x-split-session": session };
    const track = await expectStatus(await post(helper, `/api/split-jobs/${id}/track`, splitPayload(), headers), 200, "create track");
    // One stem up, then the helper gives up.
    const vocals = track.uploads.vocals;
    await helper.fetch(vocals.url, { method: "PUT", headers: vocals.headers, body: randomBytes(1024) });
    // Finishing early is refused — not every stem is there.
    assert.equal((await post(helper, `/api/split-jobs/${id}/complete`, undefined, headers)).status, 409);
    await post(helper, `/api/split-jobs/${id}/fail`, { error: "gave up" }, headers);

    const [row] = await sql`SELECT count(*)::int AS n FROM tracks WHERE id = ${track.id}`;
    assert.equal(row.n, 0);
    // The stems can't be written any more either.
    const late = await helper.fetch(track.uploads.beat.url, { method: "PUT", headers: track.uploads.beat.headers, body: randomBytes(10) });
    assert.equal(late.status, 404);

    const next = randomUUID();
    await claimJob(helper, next, id);
    await deliverStems(helper, id, next);
  });

  test("the owner can take a song out of the queue at any stage", async () => {
    // Waiting.
    const waiting = await queueSong(owner, randomBytes(1024));
    assert.equal((await owner.fetch(`/api/split-jobs/${waiting}`, { method: "DELETE" })).status, 204);
    assert.equal(await jobRow(waiting), undefined);

    // Being split: the helper finds out at its next check-in and stops.
    const working = await queueSong(owner, randomBytes(1024));
    const session = randomUUID();
    const job = await claimJob(helper, session, working);
    assert.equal((await owner.fetch(`/api/split-jobs/${working}`, { method: "DELETE" })).status, 204);
    const headers = { "x-split-session": session };
    assert.equal((await post(helper, `/api/split-jobs/${working}/heartbeat`, { progress: 0.3, stage: "splitting" }, headers)).status, 409);
    assert.equal((await post(helper, `/api/split-jobs/${working}/track`, splitPayload(), headers)).status, 409);
    assert.equal((await helper.fetch(`${job.sourceUrl}?session=${session}`)).status, 404);

    // Done: it's in the library, not the queue.
    const done = await queueSong(owner, randomBytes(1024));
    const s = randomUUID();
    await claimJob(helper, s, done);
    await deliverStems(helper, done, s);
    assert.equal((await owner.fetch(`/api/split-jobs/${done}`, { method: "DELETE" })).status, 409);
  });

  test("a song that never finished uploading isn't handed out", async () => {
    const created = await expectStatus(
      await post(owner, "/api/split-jobs", { title: "Half", filename: "half.mp3", size: 1000, tags: [], rightsConfirmed: true }),
      200,
      "create job"
    );
    assert.equal((await post(owner, `/api/split-jobs/${created.id}/queued`)).status, 409);
    const { job } = await claim(helper, randomUUID());
    assert.notEqual(job?.id, created.id);
    if (job) await post(helper, `/api/split-jobs/${job.id}/fail`, { error: "not this one" });
    await owner.fetch(`/api/split-jobs/${created.id}`, { method: "DELETE" });
  });

  test("two helpers asking at once never get the same song", async () => {
    const ids = await Promise.all([queueSong(owner, randomBytes(1024)), queueSong(owner, randomBytes(1024))]);
    const helpers = [
      { client: helper, session: randomUUID() },
      { client: stranger, session: randomUUID() },
    ];
    const claims = await Promise.all(helpers.map((h) => claim(h.client, h.session)));
    const got = claims.map((c) => c.job?.id);
    assert.ok(got[0] && got[1], "both helpers got a song");
    assert.notEqual(got[0], got[1]);
    assert.deepEqual([...got].sort(), [...ids].sort());
    await Promise.all(helpers.map((h, i) => deliverStems(h.client, got[i], h.session)));
  });
});

// A phone doesn't send its song whole: it goes through this app's relay a
// slice at a time (lib/uploadRelay.ts), each slice saved as it's answered —
// here with the browser's own upload code against the real routes.
describe("a phone's song, through the relay", () => {
  test("slices, joined: the helper downloads the very bytes the phone had", async () => {
    const song = randomBytes(5 * 1024 * 1024 + 321);
    const created = await expectStatus(await createJob(owner, song.length), 200, "create job");
    assert.equal(created.upload.relay, `/api/split-jobs/${created.id}/source`, "the local store has a relay too");
    const seen: { method: string; url: string; bytes: number }[] = [];
    await upload(created.upload, new Blob([song as BlobPart]), () => {}, sendAs(owner, seen), undefined, { relayFirst: true });
    assert.ok(seen.filter((r) => r.method === "PUT").length >= 2, "in slices");
    assert.ok(seen.every((r) => r.url.includes("relay=")));
    await expectStatus(await post(owner, `/api/split-jobs/${created.id}/queued`), 200, "mark queued");

    const session = randomUUID();
    const job = await claimJob(helper, session, created.id);
    assert.ok(Buffer.from(await downloadSource(helper, job.sourceUrl, session)).equals(song));
    await post(helper, `/api/split-jobs/${created.id}/fail`, { error: "only checking" }, { "x-split-session": session });
    await owner.fetch(`/api/split-jobs/${created.id}`, { method: "DELETE" });
  });

  test("an upload cut off half-way carries on into the same job, and only the rest is sent", async () => {
    const song = randomBytes(3 * 1024 * 1024 + 7);
    const created = await expectStatus(await createJob(owner, song.length), 200, "create job");
    // The page goes away after the third slice.
    const gone = new AbortController();
    let resume: RelayResume | null = null;
    const first: { method: string; url: string; bytes: number }[] = [];
    await assert.rejects(
      upload(created.upload, new Blob([song as BlobPart]), () => {}, sendAs(owner, first), gone.signal, {
        relayFirst: true,
        onResume: (state) => {
          resume = state;
          if (state.sent.length >= 3) gone.abort();
        },
      }),
      UploadCancelled
    );
    const saved = resume!.sent.reduce((sum, [, bytes]) => sum + bytes, 0);
    assert.ok(saved > 0 && saved < song.length);

    // Next visit: the same job, and what the relay kept.
    const again = await expectStatus(await createJob(owner, song.length, { resume: created.id }), 200, "resume job");
    assert.equal(again.id, created.id);
    assert.equal(again.resumed, true);
    const second: { method: string; url: string; bytes: number }[] = [];
    await upload(again.upload, new Blob([song as BlobPart]), () => {}, sendAs(owner, second), undefined, { resume });
    const sentAgain = second.filter((r) => r.method === "PUT").reduce((sum, r) => sum + r.bytes, 0);
    assert.equal(sentAgain, song.length - saved, "nothing saved was sent again");
    await expectStatus(await post(owner, `/api/split-jobs/${created.id}/queued`), 200, "mark queued");

    const session = randomUUID();
    const job = await claimJob(helper, session, created.id);
    assert.ok(Buffer.from(await downloadSource(helper, job.sourceUrl, session)).equals(song), "whole, in order");
    await post(helper, `/api/split-jobs/${created.id}/fail`, { error: "only checking" }, { "x-split-session": session });
    await owner.fetch(`/api/split-jobs/${created.id}`, { method: "DELETE" });
  });

  test("a job that's gone (or someone else's) isn't carried on: a new one is made", async () => {
    const mine = await expectStatus(await createJob(owner, 1000), 200, "create job");
    const theirs = await expectStatus(await createJob(stranger, 1000, { resume: mine.id }), 200, "create job");
    assert.notEqual(theirs.id, mine.id);
    assert.equal(theirs.resumed, false);
    const fresh = await expectStatus(await createJob(owner, 1000, { resume: randomUUID() }), 200, "create job");
    assert.equal(fresh.resumed, false);
    for (const [who, id] of [[owner, mine.id], [stranger, theirs.id], [owner, fresh.id]] as const) {
      await who.fetch(`/api/split-jobs/${id}`, { method: "DELETE" });
    }
  });

  test("the join goes by the list it's given: a gap is refused, a missing slice is named, a late longer copy is cut to length", async () => {
    const created = await expectStatus(await createJob(owner, 3000), 200, "create job");
    const relay = `/api/split-jobs/${created.id}/source?relay=${randomUUID()}`;
    const slice = (at: number, bytes: Buffer) => owner.fetch(`${relay}&at=${at}`, { method: "PUT", body: new Blob([bytes as BlobPart]) });
    const join = (size: number, parts: [number, number][]) => post(owner, `${relay}&size=${size}`, { parts });
    const song = randomBytes(3000);
    await expectStatus(await slice(0, song.subarray(0, 1000)), 200, "slice");
    await expectStatus(await slice(2000, song.subarray(2000)), 200, "slice");
    await expectStatus(await join(3000, [[0, 1000], [2000, 1000]]), 400, "a list with a gap");
    const missing = await expectStatus(await join(3000, [[0, 1000], [1000, 1000], [2000, 1000]]), 409, "a slice that never arrived");
    assert.deepEqual(missing.missing, [1000]);
    // The slice at 1000 arrives twice: first a longer try, cut off on the phone's side, then the shorter one it was sent again as.
    await expectStatus(await slice(1000, song.subarray(1000, 1500)), 200, "slice");
    await expectStatus(await slice(1500, song.subarray(1500, 2000)), 200, "slice");
    await expectStatus(await slice(1000, song.subarray(1000, 2000)), 200, "the longer copy, late");
    await expectStatus(await join(3000, [[0, 1000], [1000, 500], [1500, 500], [2000, 1000]]), 200, "join");
    // Its answer was lost, so the phone asks again: still yes.
    await expectStatus(await join(3000, [[0, 1000], [1000, 500], [1500, 500], [2000, 1000]]), 200, "join again");
    await expectStatus(await post(owner, `/api/split-jobs/${created.id}/queued`), 200, "mark queued");

    const session = randomUUID();
    const job = await claimJob(helper, session, created.id);
    assert.ok(Buffer.from(await downloadSource(helper, job.sourceUrl, session)).equals(song));
    await post(helper, `/api/split-jobs/${created.id}/fail`, { error: "only checking" }, { "x-split-session": session });
    await owner.fetch(`/api/split-jobs/${created.id}`, { method: "DELETE" });

    // A stranger can't put slices into someone else's song.
    const other = await expectStatus(await createJob(owner, 1000), 200, "create job");
    const res = await stranger.fetch(`/api/split-jobs/${other.id}/source?relay=${randomUUID()}&at=0`, { method: "PUT", body: "x" });
    assert.equal(res.status, 404);
    await owner.fetch(`/api/split-jobs/${other.id}`, { method: "DELETE" });
  });
});
