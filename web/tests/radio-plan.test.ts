// The radio player's plan (radioPlan.ts): which prepared songs sound at a
// moment, from where and how loud — two players crossfading, or one
// (iPhone) changing song halfway through the blend.
//
//   node --import ./tests/support/register.mjs --test tests/radio-plan.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { planDecks, type PlanDeck } from "../src/lib/radioPlan.ts";

// Song A: 0–200 s. Song B starts 8 s before A ends (an 8 s crossfade), runs to 400 s.
const A: PlanDeck = { rowId: 1, startsAt: 0, endsAt: 200_000, offset: 0 };
const B: PlanDeck = { rowId: 2, startsAt: 192_000, endsAt: 400_000, offset: 0 };

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("one song on air plays alone, from where the station is, at full level", () => {
  const plan = planDecks([A], 50_000, 2);
  assert.deepEqual(plan.sound, [{ rowId: 1, into: 50, gain: 1 }]);
  assert.equal(plan.preload, null);
});

test("the next song is loaded early into the free player, not played", () => {
  const plan = planDecks([A, B], 100_000, 2);
  assert.deepEqual(plan.sound.map((v) => v.rowId), [1]);
  assert.equal(plan.preload, 2);
});

test("two players blend with equal power over the overlap", () => {
  const mid = planDecks([A, B], 196_000, 2);
  assert.deepEqual(mid.sound.map((v) => v.rowId), [1, 2]);
  close(mid.sound[0].gain, Math.SQRT1_2);
  close(mid.sound[1].gain, Math.SQRT1_2);
  close(mid.sound[1].into, 4);
  // Equal power: the two gains' squares add up to one all the way through.
  for (const t of [192_000, 193_500, 197_000, 199_900]) {
    const { sound } = planDecks([A, B], t, 2);
    close(sound[0].gain ** 2 + sound[1].gain ** 2, 1, 1e-9);
  }
  // After A's end, B alone at full level.
  assert.deepEqual(planDecks([A, B], 200_000, 2).sound, [{ rowId: 2, into: 8, gain: 1 }]);
});

test("the outgoing song holds its level when the next one isn't ready", () => {
  // B isn't prepared yet: A plays on to its own end rather than fading to nothing.
  const plan = planDecks([A], 197_000, 2);
  assert.deepEqual(plan.sound, [{ rowId: 1, into: 197, gain: 1 }]);
});

test("one player changes song halfway through the crossfade", () => {
  assert.deepEqual(planDecks([A, B], 195_000, 1).sound.map((v) => v.rowId), [1]);
  const after = planDecks([A, B], 196_000, 1).sound;
  assert.deepEqual(after.map((v) => v.rowId), [2]);
  close(after[0].into, 4);
  assert.equal(after[0].gain, 1);
  assert.equal(planDecks([A, B], 100_000, 1).preload, null);
});

test("one player: a next song ready late still takes over at once", () => {
  // Tuned in during the blend with only B ready: B, from where the station is.
  assert.deepEqual(planDecks([B], 193_000, 1).sound, [{ rowId: 2, into: 1, gain: 1 }]);
});

test("a song mixed from part way starts at its file's own second", () => {
  // Tuned in at 60 s: the file starts at the song's 60th second.
  const late: PlanDeck = { ...A, offset: 60 };
  assert.deepEqual(planDecks([late], 75_000, 2).sound, [{ rowId: 1, into: 15, gain: 1 }]);
  // The file doesn't reach back before its start.
  assert.deepEqual(planDecks([late], 59_000, 2).sound, []);
});

test("nothing sounds before a song's start or after its end", () => {
  assert.deepEqual(planDecks([B], 100_000, 2).sound, []);
  assert.deepEqual(planDecks([A], 200_000, 2).sound, []);
  assert.deepEqual(planDecks([], 0, 1), { sound: [], preload: null });
});
