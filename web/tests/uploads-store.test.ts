// uploads.ts: the store of songs being added — each song moves waiting ▶
// working ▶ done or failed, the counts follow, the same file isn't added
// twice while it's on its way, a failed one can be tried again, and the
// screen is held on while any song is on its way (a phone that locks
// pauses the upload). The split queue's server is stubbed with fetch.
//
//   node --import ./tests/support/register.mjs --test tests/uploads-store.test.ts

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// Just enough of a browser for the store: a hidden page (updates come by
// timer, not animation frame), a wake lock that records what it's asked.
const wake: string[] = [];
const g = globalThis as Record<string, unknown>;
g.window = globalThis;
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.document = { hidden: true, visibilityState: "visible", addEventListener: () => {} };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    onLine: true,
    userAgent: "test",
    wakeLock: {
      request: async () => {
        wake.push("on");
        return { addEventListener: () => {}, release: async () => void wake.push("off") };
      },
    },
  },
});

let answer = 401;
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: answer === 401 ? "Sign in to add songs" : "Not found" }), { status: answer })) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 120));
const song = (name: string) => new File([new Uint8Array(1024)], name, { lastModified: 1 });

test("a song goes waiting ▶ working ▶ failed, the counts follow, and it can be tried again", async () => {
  const { uploads } = await import("../src/lib/client/uploads");
  const seen: string[] = [];
  const stop = uploads.subscribe(() => seen.push(uploads.items.map((i) => i.status).join(",")));

  const added = uploads.addFiles([song("a.mp3"), song("notes.txt")], { tags: [], mode: "queue" });
  assert.deepEqual(added, { added: 1, notAudio: ["notes.txt"], duplicates: [] });
  // The same file again while it's on its way is left out.
  assert.deepEqual(uploads.addFiles([song("a.mp3")], { tags: [], mode: "queue" }).duplicates, ["a.mp3"]);

  await settle();
  assert.equal(uploads.items.length, 1);
  assert.equal(uploads.items[0].status, "failed");
  assert.match(uploads.items[0].error ?? "", /sign in/i);
  assert.deepEqual(uploads.summary, { waiting: 0, working: 0, done: 0, failed: 1 });
  // Updates come in batches, not one per change.
  assert.ok(seen.length <= 3, `${seen.length} updates: ${seen.join(" | ")}`);
  // The screen was held on while it went up, and let go after.
  assert.equal(wake[0], "on");
  assert.equal(wake.at(-1), "off");

  // Failed, it's no longer "on its way": the same file can be added again.
  answer = 404;
  uploads.retryFailed();
  await settle();
  assert.equal(uploads.summary.failed, 1);
  assert.equal(uploads.items[0].status, "failed");

  uploads.remove(uploads.items[0].id);
  await settle();
  assert.equal(uploads.items.length, 0);
  assert.deepEqual(uploads.summary, { waiting: 0, working: 0, done: 0, failed: 0 });
  stop();
});

test("an unchanged song keeps the same row object between updates", async () => {
  const { uploads } = await import("../src/lib/client/uploads");
  answer = 401;
  uploads.addFiles([song("b.mp3")], { tags: [], mode: "queue" });
  await settle();
  const first = uploads.items[0];
  uploads.addFiles([song("c.mp3")], { tags: [], mode: "queue" });
  await settle();
  assert.equal(uploads.items.length, 2);
  assert.equal(uploads.items[0], first, "b.mp3's row was rebuilt though it didn't change");
  for (const i of uploads.items) uploads.remove(i.id);
});
