// The "new version is ready" check (lib/client/versionCheck.ts) against the
// things a phone does to it: suspending the page with the request in the
// air, and coming back before the network has.
//
//   node --import ./tests/support/register.mjs --test tests/version-check.test.ts

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { CHECK_LIMIT_MS, MIN_GAP_MS, RETRY_AFTER_MS, versionWatch } from "../src/lib/client/versionCheck.ts";

/** What the server does with each request, in order: an id to answer, "fail", or "hang". */
function server(script: (string | null | "fail" | "hang")[]) {
  const calls: number[] = [];
  const live = (signal: AbortSignal) =>
    new Promise<string | null>((resolve, reject) => {
      const step = script[calls.length] ?? script.at(-1)!;
      calls.push(Date.now());
      signal.addEventListener("abort", () => reject(new Error("aborted")));
      if (step === "fail") reject(new TypeError("Load failed"));
      else if (step !== "hang") resolve(step);
    });
  return { live, calls };
}

/** Lets promise chains run, then time pass. */
async function pass(ms: number) {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  mock.timers.tick(ms);
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 }));
afterEach(() => mock.timers.reset());

describe("checking for a newer build", () => {
  test("says so when the live build isn't this one — and not when it is", async () => {
    const newer: string[] = [];
    const same = server(["b1"]);
    await versionWatch({ mine: "b1", live: same.live, onNewer: (id) => newer.push(id), visible: () => true }).check(true);
    assert.equal(newer.length, 0);
    const other = server(["b2"]);
    await versionWatch({ mine: "b1", live: other.live, onNewer: (id) => newer.push(id), visible: () => true }).check(true);
    assert.deepEqual(newer, ["b2"]);
  });

  test("asked again and again (the app shown, focused, restored), it asks the server once a minute at most", async () => {
    const { live, calls } = server(["b1"]);
    const watch = versionWatch({ mine: "b1", live, onNewer: () => {}, visible: () => true });
    await watch.check(true);
    await watch.check();
    await watch.check();
    assert.equal(calls.length, 1);
    await pass(MIN_GAP_MS + 1);
    await watch.check();
    assert.equal(calls.length, 2);
  });

  test("doesn't ask while the app is in the background, unless it must", async () => {
    const { live, calls } = server(["b1"]);
    const watch = versionWatch({ mine: "b1", live, onNewer: () => {}, visible: () => false });
    await watch.check();
    assert.equal(calls.length, 0);
    await watch.check(true);
    assert.equal(calls.length, 1);
  });

  test("a request the phone froze, that never comes back, doesn't stop the checking for good", async () => {
    const newer: string[] = [];
    const { live, calls } = server(["hang", "b2"]);
    const watch = versionWatch({ mine: "b1", live, onNewer: (id) => newer.push(id), visible: () => true });
    void watch.check(true);
    await pass(1000);
    await watch.check(true);
    assert.equal(calls.length, 1, "one at a time while it may still answer");
    // Its time is up: given up on, and asked again shortly.
    await pass(CHECK_LIMIT_MS);
    await pass(RETRY_AFTER_MS[0]);
    assert.equal(calls.length, 2);
    assert.deepEqual(newer, ["b2"]);
  });

  test("the app comes back before the network does: the check that failed is tried again within seconds", async () => {
    const newer: string[] = [];
    const { live, calls } = server(["fail", "fail", "b2"]);
    const watch = versionWatch({ mine: "b1", live, onNewer: (id) => newer.push(id), visible: () => true });
    await watch.check();
    assert.deepEqual(newer, []);
    await pass(RETRY_AFTER_MS[0]);
    await pass(RETRY_AFTER_MS[1]);
    assert.equal(calls.length, 3);
    assert.deepEqual(newer, ["b2"]);
    assert.ok(calls[2] - calls[0] < 20_000, "not ten minutes later");
  });

  test("a server that stays down is left alone after a few tries, until the next time it's asked", async () => {
    const { live, calls } = server(["fail"]);
    const watch = versionWatch({ mine: "b1", live, onNewer: () => {}, visible: () => true });
    await watch.check(true);
    for (const wait of RETRY_AFTER_MS) await pass(wait);
    await pass(10 * 60_000);
    assert.equal(calls.length, 1 + RETRY_AFTER_MS.length);
    await watch.check();
    assert.equal(calls.length, 2 + RETRY_AFTER_MS.length, "a failed check doesn't count as having checked");
    // …and that one, asked afresh, gets its own tries.
    await pass(RETRY_AFTER_MS[0]);
    assert.equal(calls.length, 3 + RETRY_AFTER_MS.length);
  });

  test("stopped, it asks nothing more", async () => {
    const newer: string[] = [];
    const { live, calls } = server(["fail", "b2"]);
    const watch = versionWatch({ mine: "b1", live, onNewer: (id) => newer.push(id), visible: () => true });
    await watch.check(true);
    watch.stop();
    await pass(60_000);
    await watch.check(true);
    assert.equal(calls.length, 1);
    assert.deepEqual(newer, []);
  });
});
