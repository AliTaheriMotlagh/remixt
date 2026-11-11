// bleed.ts: the correlation that says how much of the beat leaks into the
// mic while a take is sung.
//
//   node --import ./tests/support/register.mjs --test tests/bleed.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bleedScore, bleedWithLag, checkTake, correlation, highFrequencyEnergy } from "../src/lib/bleed.ts";

describe("correlation", () => {
  test("a signal with itself is one", () => {
    const x = [0.1, 0.4, 0.2, 0.9, 0.3, 0.7, 0.5, 0.6];
    assert.ok(Math.abs(correlation(x, x) - 1) < 1e-9);
  });

  test("the same rhythm read by two taps is one", () => {
    const mix = [0.9, 0.1, 0.8, 0.2, 0.7, 0.1, 0.9, 0.2];
    const mic = mix.map((v) => v * 0.3 + 0.01); // the mix, leaked and quieter
    assert.ok(Math.abs(correlation(mic, mix) - 1) < 1e-9);
  });

  test("an independent signal is about zero", () => {
    const mix = [0.9, 0.2, 0.1, 0.8, 0.05, 0.7, 0.1, 0.6, 0.2, 0.85, 0.1, 0.75];
    const voice = [0.3, 0.5, 0.55, 0.45, 0.35, 0.25, 0.3, 0.6, 0.65, 0.4, 0.2, 0.15];
    assert.ok(Math.abs(correlation(mix, voice)) < 0.3);
  });

  test("flat windows and short ones have nothing to say", () => {
    assert.equal(correlation([0.2, 0.2, 0.2, 0.2], [0.1, 0.5, 0.3, 0.4]), 0);
    assert.equal(correlation([1, 2], [3, 4]), 0);
    assert.equal(correlation([], []), 0);
  });
});

describe("highFrequencyEnergy", () => {
  test("drum-like transients read louder than a smooth tone", () => {
    const clicks = [1, -1, 1, -1, 1, -1, 1, -1];
    const tone = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    assert.ok(highFrequencyEnergy(clicks) > highFrequencyEnergy(tone) * 10);
  });

  test("silence reads zero", () => {
    assert.equal(highFrequencyEnergy([0, 0, 0, 0]), 0);
    assert.equal(highFrequencyEnergy([]), 0);
  });
});

describe("bleedScore", () => {
  test("clamped into 0..1", () => {
    assert.equal(bleedScore([0.1, 0.2], [0.3]), 0);
    const mix = [0.9, 0.1, 0.8, 0.2, 0.7, 0.1, 0.9, 0.2];
    assert.ok(bleedScore(mix.map((v) => v * 0.5), mix) > 0.99);
  });
});

describe("bleedWithLag", () => {
  test("finds the beat arriving late in the mic", () => {
    const mix = Array.from({ length: 80 }, (_, i) => (i % 8 === 0 ? 1 : i % 4 === 0 ? 0.6 : 0.1 + ((i * 7) % 5) * 0.02));
    const lag = 5;
    const mic = mix.map((_, i) => (i >= lag ? mix[i - lag] * 0.2 : 0.02));
    const found = bleedWithLag(mic, mix, 20);
    assert.equal(found.lag, lag);
    assert.ok(found.score > 0.95);
    // Without the delay search, the same leak reads much weaker.
    assert.ok(bleedScore(mic, mix) < found.score);
  });

  test("a voice that ignores the beat stays low", () => {
    const mix = Array.from({ length: 80 }, (_, i) => (i % 8 === 0 ? 1 : 0.1));
    const voice = Array.from({ length: 80 }, (_, i) => 0.3 + 0.2 * Math.sin(i * 0.37) + 0.1 * Math.sin(i * 1.3));
    assert.ok(bleedWithLag(voice, mix, 20).score < 0.5);
  });
});

describe("checkTake", () => {
  test("flags clipping and quiet takes", () => {
    const loud = new Float32Array(48000).map((_, i) => (i < 2000 ? 1 : 0.3));
    assert.equal(checkTake(loud, 48000).clipped, true);
    const quiet = new Float32Array(48000).fill(0.02);
    assert.equal(checkTake(quiet, 48000).quiet, true);
    const good = new Float32Array(48000).map((_, i) => 0.5 * Math.sin(i / 20));
    const check = checkTake(good, 48000);
    assert.equal(check.clipped, false);
    assert.equal(check.quiet, false);
  });
});
