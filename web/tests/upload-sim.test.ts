// How a song leaves a phone (lib/client/directUpload.ts), on the lines phones
// really have — played in made-up time by tests/support/line.ts, so each of
// these takes milliseconds and comes out the same every run. Whatever the
// line does, the song must arrive byte for byte, in about the time the line
// allows, without sending what was already saved again — and when it can't
// arrive, the upload must stop (never go round for ever) and carry on later
// from where it was.
//
//   node --import ./tests/support/register.mjs --test tests/upload-sim.test.ts

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import {
  NetworkError,
  RELAY_PART_BYTES,
  resetRelayPreference,
  sender,
  sliceBytes,
  stallWatch,
  tailWait,
  unsent,
  upload,
  UploadCancelled,
  type RelayResume,
  type UploadOptions,
  type UploadTarget,
} from "../src/lib/client/directUpload.ts";
import { clock, drive, fakeRelay, phoneLine, type Arrived, type Line } from "./support/line.ts";

const KB = 1024;
const MB = 1024 * KB;

/** The page: on screen unless a test turns the screen off. */
const listeners = new Set<() => void>();
const page = { hidden: false, addEventListener: (_type: string, listener: () => void) => listeners.add(listener) };
(globalThis as { document?: unknown }).document = page;
function screen(on: boolean) {
  page.hidden = !on;
  for (const listener of listeners) listener();
}

function device(kind: "phone" | "computer") {
  const userAgent =
    kind === "phone" ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent, maxTouchPoints: 0, onLine: true } });
}

const RELAY = "/api/split-jobs/job-1/source";
const STORE = "https://store.test/queue/song.mp3";
const target: UploadTarget = { type: "put", url: STORE, headers: {}, relay: RELAY };

/** The store, this app's relay, and a line to them. */
function world(line: { rate?: number; buffer?: number } = {}) {
  const relay = fakeRelay();
  const store = new Map<string, Buffer>();
  /** Lets a test answer for the server: return a status to refuse with. */
  const refuse: { with: (request: Arrived) => number | null } = { with: () => null };
  const seen: Arrived[] = [];
  const phone = phoneLine({
    ...line,
    server: (request) => {
      seen.push(request);
      const status = refuse.with(request);
      if (status) return { status, body: { error: `HTTP ${status}` } };
      if (request.url.hostname === "store.test") {
        store.set(request.url.pathname, request.body);
        return { status: 200 };
      }
      return relay.handle(request);
    },
  });
  return { relay, store, refuse, seen, line: phone, arrived: () => relay.files.get(RELAY) ?? store.get("/queue/song.mp3") };
}

function send(line: Line, bytes: Buffer, options: UploadOptions = {}, signal?: AbortSignal) {
  const progress: number[] = [];
  const kept: { resume: RelayResume | null } = { resume: null };
  const work = upload(target, new Blob([bytes as BlobPart]), (n) => progress.push(n), sender(line.wire), signal, {
    onResume: (state) => (kept.resume = state),
    ...options,
  });
  return { work, progress, kept };
}

const sum = (slices: [number, number][]) => slices.reduce((total, [, bytes]) => total + bytes, 0);
const seconds = (ms: number) => Math.round(ms / 1000);

beforeEach(() => {
  clock();
  screen(true);
  device("phone");
  resetRelayPreference();
});
afterEach(() => mock.timers.reset());

describe("waiting for an answer", () => {
  test("a body the phone took at once is given the time a slow line needs, not the stall timer's", () => {
    // 256 KB "sent" in 50 ms says nothing about the line: at 4 KB/s it's over a minute away.
    assert.ok(tailWait(256 * KB, 50) >= 60_000);
    // A fast line has nothing to wait for beyond the usual.
    assert.equal(tailWait(8 * MB, 4000), 45_000);
    // A slow one is waited on for as long as its buffers can take to empty — but not for ever.
    assert.ok(tailWait(8 * MB, 400_000) >= 100_000);
    assert.ok(tailWait(100 * MB, 10) <= 4 * 60_000);
  });

  test("a request still handing bytes over is stopped after 45 s of nothing; one that's all handed over isn't", () => {
    let stopped = 0;
    const moving = stallWatch(MB, () => stopped++);
    moving.sent(100 * KB);
    mock.timers.tick(44_000);
    assert.equal(stopped, 0);
    mock.timers.tick(2_000);
    assert.equal(stopped, 1, "nothing handed over for 45 s: stuck");

    const tail = stallWatch(256 * KB, () => stopped++);
    tail.sent(256 * KB);
    mock.timers.tick(60_000);
    assert.equal(stopped, 1, "all handed over: the answer is still on its way");
    tail.done();
  });
});

describe("slices cut to the line", () => {
  test("about five seconds' worth, between 64 KB and 3 MB", () => {
    assert.equal(sliceBytes(null), 256 * KB);
    assert.equal(sliceBytes(4), 64 * KB, "a crawl still gets the smallest slice");
    assert.equal(sliceBytes(26), 128 * KB);
    assert.equal(sliceBytes(10_000), RELAY_PART_BYTES);
    assert.equal(sliceBytes(4, 256 * KB), 256 * KB, "a big file's slices are never too many to join");
  });

  test("what's left to send is whatever the saved slices don't cover", () => {
    assert.deepEqual(unsent([], 100), [[0, 100]]);
    assert.deepEqual(unsent([[0, 40], [60, 40]], 100), [[40, 60]]);
    assert.deepEqual(unsent([[60, 20], [0, 30]], 100), [[30, 60], [80, 100]]);
    assert.deepEqual(unsent([[0, 100]], 100), []);
    assert.equal(unsent([[0, 60], [40, 60]], 100), null, "slices that overlap aren't trusted");
    assert.equal(unsent([[0, 120]], 100), null);
  });
});

describe("a phone sending a song to the queue", () => {
  test("a slow line (20 KB/s, a megabyte of it buffered in the phone): the song arrives about as fast as the line allows, nothing sent twice", async () => {
    const { line, relay, arrived, seen } = world({ rate: 20_000, buffer: MB });
    const bytes = randomBytes(3 * MB);
    const { work, progress } = send(line, bytes);
    const { error, ms } = await drive(work);
    assert.equal(error, undefined);
    assert.ok(arrived()?.equals(bytes), "byte for byte");
    const ideal = (bytes.length / 20_000) * 1000;
    assert.ok(ms < ideal * 1.3, `took ${seconds(ms)} s; the line alone needs ${seconds(ideal)} s`);
    assert.equal(sum(relay.taken), bytes.length, "every byte sent exactly once");
    assert.ok(!seen.some((r) => r.url.hostname === "store.test"), "a phone doesn't try the store first");
    assert.equal(progress.at(-1), bytes.length);
  });

  test("a fast line isn't held back: slices grow to the biggest allowed", async () => {
    const { line, relay, arrived } = world({ rate: 2_000_000 });
    const bytes = randomBytes(12 * MB);
    const { work } = send(line, bytes);
    const { error, ms } = await drive(work);
    assert.equal(error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(ms < 12_000, `took ${seconds(ms)} s for 6 s of line`);
    assert.ok(relay.taken.some(([, n]) => n === RELAY_PART_BYTES));
    assert.ok(relay.taken.length <= 12);
  });

  test("a line that drops any request past 200 KB: slices shrink under it and the song still arrives", async () => {
    const { line, relay, arrived } = world({ rate: 100_000 });
    line.fate = (request) => (request.method === "PUT" ? { dieAfterBytes: 200 * KB } : undefined);
    const bytes = randomBytes(4 * MB);
    const { work } = send(line, bytes);
    const { error, ms } = await drive(work);
    assert.equal(error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(relay.taken.every(([, n]) => n < 200 * KB));
    const ideal = (bytes.length / 100_000) * 1000;
    assert.ok(ms < ideal * 2, `took ${seconds(ms)} s; the line alone needs ${seconds(ideal)} s`);
  });

  test("a line that stops carrying each request after 300 KB, without failing it: found out, and gone round", async () => {
    const { line, arrived } = world({ rate: 200_000, buffer: 64 * KB });
    line.fate = (request) => (request.method === "PUT" ? { stuckAfterBytes: 300 * KB } : undefined);
    const bytes = randomBytes(3 * MB);
    const { work } = send(line, bytes);
    const { error, ms } = await drive(work);
    assert.equal(error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(ms < 10 * 60_000, `took ${seconds(ms)} s`);
  });

  test("one request in three dies half-way: it still arrives, with little sent twice", async () => {
    const { line, arrived } = world({ rate: 150_000 });
    let n = 0;
    line.fate = (request) => (request.method === "PUT" && n++ % 3 === 1 ? { dieAfterBytes: (request.body as Blob).size / 2 } : undefined);
    const bytes = randomBytes(5 * MB);
    const { work } = send(line, bytes);
    const { error } = await drive(work);
    assert.equal(error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(line.carried < bytes.length * 1.35, `carried ${Math.round(line.carried / KB)} KB for a ${bytes.length / KB} KB song`);
  });

  test("the line goes dead for a minute in the middle: it carries on when it's back", async () => {
    const { line, relay, arrived } = world({ rate: 100_000 });
    const bytes = randomBytes(4 * MB);
    let cut = false;
    const { work, progress } = send(line, bytes);
    const watch = setInterval(() => {
      if (cut || (progress.at(-1) ?? 0) < bytes.length * 0.4) return;
      cut = true;
      line.rate = 0;
      setTimeout(() => (line.rate = 100_000), 60_000);
    }, 500);
    const { error, ms } = await drive(work);
    clearInterval(watch);
    assert.equal(error, undefined);
    assert.ok(cut);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(ms < 40_000 + 60_000 + 60_000, `took ${seconds(ms)} s for 40 s of line and a minute's cut`);
    assert.ok(sum(relay.taken) <= bytes.length + 2 * 256 * KB, "only what was in flight goes again");
  });

  test("a line that stays dead stops the upload (it doesn't go round for ever) — and the next try carries on from what was saved", async () => {
    const { line, relay, arrived } = world({ rate: 100_000 });
    const bytes = randomBytes(4 * MB);
    const first = send(line, bytes);
    const watch = setInterval(() => {
      if ((first.progress.at(-1) ?? 0) >= bytes.length * 0.5) line.rate = 0;
    }, 500);
    const stopped = await drive(first.work);
    clearInterval(watch);
    assert.ok(stopped.error instanceof NetworkError, "the line's fault, said so");
    assert.ok(stopped.ms < 15 * 60_000, `gave up after ${seconds(stopped.ms)} s`);
    const saved = sum(first.kept.resume!.sent);
    assert.ok(saved >= bytes.length * 0.3, "what got there was kept");
    assert.equal(arrived(), undefined);

    // Later, with the line back: only the rest is sent.
    line.rate = 100_000;
    const before = relay.taken.length;
    const second = send(line, bytes, { resume: first.kept.resume });
    assert.ok((await drive(second.work)).error === undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.equal(sum(relay.taken.slice(before)), bytes.length - saved, "nothing saved was sent again");
    assert.ok(second.progress[0] >= saved, "and its progress starts where it left off");
  });

  test("the page reloads half-way: the song carries on, it doesn't start again", async () => {
    const { line, relay, arrived } = world({ rate: 100_000 });
    const bytes = randomBytes(4 * MB);
    const reload = new AbortController();
    const first = send(line, bytes, {}, reload.signal);
    const watch = setInterval(() => {
      if ((first.progress.at(-1) ?? 0) >= bytes.length * 0.5) reload.abort();
    }, 500);
    const stopped = await drive(first.work);
    clearInterval(watch);
    assert.ok(stopped.error instanceof UploadCancelled);
    // What a reload leaves behind is what was written down: it goes through JSON and back.
    const resume = JSON.parse(JSON.stringify(first.kept.resume)) as RelayResume;
    const saved = sum(resume.sent);
    assert.ok(saved > 0);
    const before = relay.taken.length;
    const second = send(line, bytes, { resume });
    assert.equal((await drive(second.work)).error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.equal(sum(relay.taken.slice(before)), bytes.length - saved);
  });

  test("a different file isn't carried on from another's slices", async () => {
    const { line, arrived } = world();
    const bytes = randomBytes(MB);
    const stale: RelayResume = { session: "0123456789abcdef", size: 2 * MB, sent: [[0, 256 * KB]] };
    const { work } = send(line, bytes, { resume: stale });
    assert.equal((await drive(work)).error, undefined);
    assert.ok(arrived()?.equals(bytes));
  });

  test("the screen going off again and again — more often than a slice may fail — costs time, not the upload", async () => {
    const { line, arrived } = world({ rate: 60_000 });
    const bytes = randomBytes(3 * MB);
    const { work } = send(line, bytes);
    let offs = 0;
    const lock = setInterval(() => {
      if (offs >= 12) return;
      offs++;
      screen(false);
      line.dropAll();
      setTimeout(() => screen(true), 4000);
    }, 9000);
    const { error } = await drive(work);
    clearInterval(lock);
    assert.equal(error, undefined);
    assert.ok(offs >= 5);
    assert.ok(arrived()?.equals(bytes));
  });

  test("the join's answer is lost on the way back: asked again, the relay says yes — nothing is sent twice", async () => {
    const { line, relay, arrived } = world();
    let joins = 0;
    line.fate = (request) => (request.method === "POST" && joins++ === 0 ? { answerLost: true } : undefined);
    const bytes = randomBytes(2 * MB);
    const { work } = send(line, bytes);
    assert.equal((await drive(work)).error, undefined);
    assert.equal(joins, 2);
    assert.ok(arrived()?.equals(bytes));
    assert.equal(sum(relay.taken), bytes.length);
  });

  test("slices the relay lost are sent again — only those", async () => {
    const { line, relay, arrived } = world();
    const bytes = randomBytes(2 * MB);
    let lost: number[] = [];
    line.fate = (request) => {
      if (request.method !== "POST" || lost.length) return undefined;
      const keys = [...relay.slices.keys()].slice(1, 3);
      lost = keys.map((key) => relay.slices.get(key)!.length);
      for (const key of keys) relay.slices.delete(key);
      return undefined;
    };
    const { work } = send(line, bytes);
    assert.equal((await drive(work)).error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.equal(sum(relay.taken), bytes.length + lost[0] + lost[1]);
  });

  test("a relay that only answers with errors is gone round: the store gets the song", async () => {
    const { line, refuse, store } = world();
    refuse.with = (request) => (request.url.pathname === RELAY ? 500 : null);
    const bytes = randomBytes(MB);
    const { work } = send(line, bytes);
    assert.equal((await drive(work)).error, undefined);
    assert.ok(store.get("/queue/song.mp3")?.equals(bytes));
  });

  test("an answer that won't change (the job is gone: 404) fails at once", async () => {
    const { line, refuse, seen } = world();
    refuse.with = () => 404;
    const { work } = send(line, randomBytes(MB));
    const { error, ms } = await drive(work);
    assert.ok(error instanceof Error && !(error instanceof NetworkError));
    assert.ok(ms < 5000);
    assert.ok(seen.length <= 2);
  });
});

describe("a computer sending straight to the store", () => {
  beforeEach(() => device("computer"));

  test("a slow line with 2 MB still in the buffers when the browser says 100%: the request is left to finish, not sent again", async () => {
    const { line, store, seen } = world({ rate: 20_000, buffer: 2 * MB });
    const bytes = randomBytes(3 * MB);
    const { work } = send(line, bytes, { relayFirst: false });
    const { error, ms } = await drive(work);
    assert.equal(error, undefined);
    assert.ok(store.get("/queue/song.mp3")?.equals(bytes));
    assert.equal(line.started, 1, "one request, never cut off");
    assert.equal(seen.length, 1);
    assert.ok(ms < 160_000);
  });

  test("a store that swallows everything (filtered): through the relay after 20 s, and straight there next time", async () => {
    const { line, relay, arrived, seen } = world();
    line.fate = (request) => (request.url.startsWith("https://store.test") ? { swallowed: true } : undefined);
    const bytes = randomBytes(2 * MB);
    const first = await drive(send(line, bytes).work);
    assert.equal(first.error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(first.ms < 30_000, `took ${seconds(first.ms)} s`);
    assert.equal(seen.filter((r) => r.url.hostname === "store.test").length, 0);

    const started = line.started;
    relay.files.clear();
    assert.equal((await drive(send(line, bytes).work)).error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(line.started - started <= 6, "no more waiting on the store");
  });

  test("a store request that dies part-way every time goes to the relay, rather than round for ever", async () => {
    const { line, arrived } = world({ rate: 500_000 });
    let toStore = 0;
    line.fate = (request) => {
      if (!request.url.startsWith("https://store.test")) return undefined;
      toStore++;
      return { dieAfterBytes: 600 * KB };
    };
    const bytes = randomBytes(3 * MB);
    const { work } = send(line, bytes);
    const { error, ms } = await drive(work);
    assert.equal(error, undefined);
    assert.ok(arrived()?.equals(bytes));
    assert.ok(toStore <= 6, `${toStore} tries at the store`);
    assert.ok(ms < 3 * 60_000);
  });
});
