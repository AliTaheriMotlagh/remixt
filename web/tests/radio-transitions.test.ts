// lib/radioTransitions.ts and the planner's handover (lib/radioPlan.ts): the
// styles a station chooses, how long each change is (on the outgoing song's
// bars), what "auto" picks, AutoMix's tempo glide, and that no style's
// loudness ever jumps.
//
//   node --import ./tests/support/register.mjs --test tests/radio-transitions.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  barOf, glideRatio, isRendered, resolveStyle, styleGains, tempoMatch, transitionSeconds, TRANSITIONS, type TransitionStyle,
} from "../src/lib/radioTransitions.ts";
import { HANDOVER_SECONDS, planDecks } from "../src/lib/radioPlan.ts";

const STYLES = TRANSITIONS.filter((t) => t !== "auto") as TransitionStyle[];
const song = (bpm: number | null, duration = 200) => ({ bpm, duration });

describe("auto", () => {
  test("tempos within reach get AutoMix; far apart take turns among echo, filter and riser; unknown tempo blends", () => {
    assert.equal(resolveStyle("auto", 120, 124), "automix");
    assert.equal(resolveStyle("auto", 120, 61), "automix", "half time counts");
    const far = [0, 1, 2].map((turn) => resolveStyle("auto", 90, 140, turn));
    assert.deepEqual(new Set(far), new Set(["echo", "filter", "rise"]));
    assert.equal(resolveStyle("auto", null, 120), "blend");
    assert.equal(resolveStyle("tapeStop", 90, 140), "tapeStop", "a chosen style is kept");
  });
  test("AutoMix's glide: incoming ÷ outgoing tempo, half/double time when closer, none beyond 8%", () => {
    assert.equal(glideRatio(120, 126), 1.05);
    assert.equal(glideRatio(120, 63), 1.05);
    assert.equal(glideRatio(120, 140), null);
    assert.equal(glideRatio(null, 120), null);
    assert.ok(tempoMatch(120, 125));
    assert.ok(!tempoMatch(120, 130));
  });
});

describe("how long", () => {
  test("whole bars of the outgoing song, each style its own length", () => {
    const bar = barOf(120);
    assert.equal(bar, 2);
    assert.equal(transitionSeconds("automix", song(120), song(122)), 8 * bar, "16 bars would be 32 s: 8");
    assert.equal(transitionSeconds("automix", song(200), song(200)), 16 * barOf(200), "fast songs get the whole phrase");
    assert.equal(transitionSeconds("filter", song(120), song(100)), 4 * bar);
    assert.equal(transitionSeconds("echo", song(120), song(100)), 2 * bar);
    assert.equal(transitionSeconds("tapeStop", song(120), song(100)), bar);
  });
  test("never more than a third of either song", () => {
    for (const s of STYLES) assert.ok(transitionSeconds(s, song(120, 15), song(120, 200)) <= 5 + 1e-9, s);
  });
  test("only blend is a crossfade of two files; the rest are rendered into the new song", () => {
    assert.equal(isRendered("blend"), false);
    for (const s of STYLES.filter((x) => x !== "blend")) assert.equal(isRendered(s), true, s);
    assert.equal(isRendered(null), false);
  });
});

describe("loudness", () => {
  test("the smooth styles never jump and never dip below equal power", () => {
    for (const s of ["blend", "bassSwap", "automix"] as const) {
      let last = styleGains(s, 0);
      for (let i = 1; i <= 200; i++) {
        const g = styleGains(s, i / 200);
        assert.ok(Math.abs(g.out - last.out) < 0.05 && Math.abs(g.in - last.in) < 0.05, `${s} jumps at ${i / 200}`);
        assert.ok(g.out ** 2 + g.in ** 2 > 0.95, `${s} dips at ${i / 200}`);
        last = g;
      }
    }
  });
  test("every style starts on the old song and ends on the new one", () => {
    for (const s of STYLES) {
      assert.ok(styleGains(s, 0).out > 0.99, `${s} start`);
      assert.ok(styleGains(s, 1).in > 0.99, `${s} end`);
      assert.ok(styleGains(s, 1).out < 0.01, `${s} old song gone`);
    }
  });
});

describe("the player's handover", () => {
  const a = { rowId: 1, startsAt: 0, endsAt: 100_000, offset: 0 };
  const b = { rowId: 2, startsAt: 92_000, endsAt: 300_000, offset: 0 };
  test("a rendered change: two players hand over in a blink at its start, not over the overlap", () => {
    const at = (t: number) => planDecks([a, { ...b, cut: true }], t, 2).sound;
    assert.deepEqual(at(91_000).map((v) => v.rowId), [1]);
    const after = at(92_000 + HANDOVER_SECONDS * 1000 + 1);
    assert.ok(after.find((v) => v.rowId === 1)!.gain < 0.01, "the old file is silent (its tail is in the new one)");
    assert.ok(after.find((v) => v.rowId === 2)!.gain > 0.99);
  });
  test("a rendered change: one player switches at its start; a plain crossfade halfway, as before", () => {
    assert.equal(planDecks([a, { ...b, cut: true }], 92_100, 1).sound[0].rowId, 2);
    assert.equal(planDecks([a, b], 92_100, 1).sound[0].rowId, 1);
    assert.equal(planDecks([a, b], 96_100, 1).sound[0].rowId, 2);
  });
});
