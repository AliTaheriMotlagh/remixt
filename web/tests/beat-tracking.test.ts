// The beat tracker (analysis.ts trackBeats) on synthetic onsets: hits that
// wobble like a real recording, off-beat hats and stray loud hits.
//
//   node --import ./tests/support/register.mjs --test tests/beat-tracking.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { trackBeats, type StemAnalysis } from "../src/lib/client/analysis.ts";

const RATE = 11025 / 128;
const BPM = 78.5;
const SECONDS = 120;

/** Onsets for beats at `truth`, each hit ±15 ms off, with off-beat hats and some stray hits. */
function onsets(truth: number[], seed: number) {
  const n = Math.round(SECONDS * RATE);
  const out = new Float32Array(n);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  truth.forEach((t, i) => {
    const period = (truth[i + 1] ?? t + 60 / BPM) - t;
    const hit = Math.round((t + (rnd() - 0.5) * 0.03) * RATE);
    if (hit < n) out[hit] += 1 + rnd();
    const hat = Math.round((t + period / 2) * RATE);
    if (hat < n && rnd() < 0.6) out[hat] += 0.9 * rnd();
    if (rnd() < 0.08) {
      const stray = Math.round((t + period * rnd()) * RATE);
      if (stray < n) out[stray] += 2.5;
    }
  });
  return { onsets: out, onsetRate: RATE } as unknown as StemAnalysis;
}

/** How far each true beat is from the nearest tracked one, in ms: [p90, max]. */
function error(truth: number[], tracked: Float64Array) {
  const err = truth.map((t) => Math.min(...Array.from(tracked, (b) => Math.abs(b - t))) * 1000).sort((a, b) => a - b);
  return [err[Math.floor(err.length * 0.9)], err[err.length - 1]];
}

describe("beat tracking", () => {
  test("a beat made at one tempo comes out as a perfectly steady grid", () => {
    const truth = Array.from({ length: Math.floor((SECONDS - 1) / (60 / BPM)) }, (_, i) => 0.3 + (i * 60) / BPM);
    const [p90, max] = error(truth, trackBeats(onsets(truth, 1), BPM, 100));
    assert.ok(max < 5, `steady beat off by up to ${max.toFixed(1)} ms (p90 ${p90.toFixed(1)})`);
  });

  test("a live band's drifting tempo is followed, not flattened", () => {
    const truth: number[] = [];
    for (let t = 0.3; t < SECONDS - 1; t += (60 / BPM) * (1 + 0.04 * Math.sin((t / SECONDS) * Math.PI * 3))) truth.push(t);
    const [p90, max] = error(truth, trackBeats(onsets(truth, 7), BPM, 100));
    assert.ok(p90 < 15 && max < 25, `drifting beat off by p90 ${p90.toFixed(1)} ms, max ${max.toFixed(1)} ms`);
  });
});
