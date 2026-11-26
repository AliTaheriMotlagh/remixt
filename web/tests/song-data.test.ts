// What's kept about songs: their measurements (lib/trackAnalysis.ts,
// lib/client/trackMeasure.ts) and what people listen to (lib/listens.ts).
// A measurement a browser makes must be one the server keeps.
//
//   node --import ./tests/support/register.mjs --test tests/song-data.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ANALYSIS_VERSION, CURVE_POINTS, energyScore, needsAnalysis, parseTrackAnalysis, type TrackAnalysis } from "../src/lib/trackAnalysis.ts";
import { measureBeatMono } from "../src/lib/client/trackMeasure.ts";
import { cleanListen, MIN_LISTEN_SECONDS, outcome } from "../src/lib/listens.ts";
import { FOLLOW_ON_CHOICES, followOn, pickNext } from "../src/lib/radioPick.ts";

const RATE = 11025;

/** `seconds` of a beat at `bpm`: a kick and a low A-minor chord on every beat, after `silence` seconds of nothing. */
function beat(bpm: number, seconds: number, silence = 0, level = 0.5): Float32Array {
  const out = new Float32Array(Math.round((silence + seconds) * RATE));
  const period = 60 / bpm;
  const notes = [110, 130.81, 164.81]; // A2, C3, E3
  for (let t = silence; t < silence + seconds; t += period) {
    const start = Math.round(t * RATE);
    for (let i = 0; i < Math.round(0.25 * RATE) && start + i < out.length; i++) {
      const env = Math.exp(-i / (0.06 * RATE));
      const kick = Math.sin((2 * Math.PI * 55 * i) / RATE) * env;
      const chord = notes.reduce((sum, f) => sum + Math.sin((2 * Math.PI * f * (start + i)) / RATE), 0) / notes.length;
      out[start + i] += level * (0.7 * kick + 0.5 * chord * Math.exp(-i / (0.2 * RATE)));
    }
  }
  return out;
}

const valid: TrackAnalysis = {
  v: ANALYSIS_VERSION,
  bpm: 124,
  key: "9:minor",
  keyConfidence: 0.4,
  firstBeat: 0.12,
  duration: 200,
  loudnessDb: -12,
  onsetsPerSecond: 4,
  energy: 7,
  introSeconds: 8,
  outroSeconds: 10,
  curve: Array.from({ length: CURVE_POINTS }, (_, i) => Math.round((i / CURVE_POINTS) * 1000) / 1000),
  by: "split",
};

describe("a song's measurements", () => {
  test("a well-formed one is kept as it is", () => {
    assert.deepEqual(parseTrackAnalysis(valid), valid);
  });

  test("anything malformed is refused", () => {
    for (const bad of [
      { ...valid, key: "12:minor" },
      { ...valid, key: "C minor" },
      { ...valid, bpm: 900 },
      { ...valid, firstBeat: 300 },
      { ...valid, energy: 11 },
      { ...valid, curve: Array(CURVE_POINTS + 1).fill(0.5) },
      { ...valid, curve: [2] },
      { ...valid, by: "someone" },
      { ...valid, v: 0 },
      { ...valid, duration: Number.NaN },
      null,
      "x",
    ]) {
      assert.equal(parseTrackAnalysis(bad), null, JSON.stringify(bad));
    }
  });

  test("tempo and key may be unknown", () => {
    assert.ok(parseTrackAnalysis({ ...valid, bpm: null, key: null, firstBeat: null }));
  });

  test("energy: loud, busy and quick is high; quiet, sparse and slow is low", () => {
    const high = energyScore({ loudnessDb: -8, onsetsPerSecond: 8, bpm: 128 });
    const low = energyScore({ loudnessDb: -28, onsetsPerSecond: 1, bpm: 70 });
    assert.ok(high >= 8, `high ${high}`);
    assert.ok(low <= 3, `low ${low}`);
    for (const e of [high, low, energyScore({ loudnessDb: -200, onsetsPerSecond: -1, bpm: null })]) assert.ok(e >= 1 && e <= 10);
  });

  test("a song is measured again only when it has none, or one measured the old way", () => {
    assert.equal(needsAnalysis(null), true);
    assert.equal(needsAnalysis({}), true);
    assert.equal(needsAnalysis(valid), false);
    assert.equal(needsAnalysis({ v: ANALYSIS_VERSION - 1 }), true);
  });
});

describe("measuring a beat", () => {
  test("a 120 BPM beat after 6 s of silence: tempo, grid, intro, energy — and the server keeps it", async () => {
    const measured = await measureBeatMono(beat(120, 60, 6), null, "split");
    assert.ok(measured);
    assert.ok(measured.bpm && Math.abs(measured.bpm - 120) < 1.5, `bpm ${measured.bpm}`);
    assert.match(measured.key ?? "", /^\d{1,2}:(major|minor)$/);
    assert.ok(measured.firstBeat !== null && measured.firstBeat >= 0 && measured.firstBeat < 0.5 + 1e-9);
    assert.ok(Math.abs(measured.duration - 66) < 0.01);
    assert.ok(measured.introSeconds > 4 && measured.introSeconds < 7.5, `intro ${measured.introSeconds}`);
    assert.ok(measured.outroSeconds < 2, `outro ${measured.outroSeconds}`);
    assert.equal(measured.curve.length, CURVE_POINTS);
    assert.equal(Math.max(...measured.curve), 1);
    assert.ok(measured.curve[0] < 0.1, "the silent start shows as quiet");
    assert.deepEqual(parseTrackAnalysis(measured), parseTrackAnalysis(parseTrackAnalysis(measured)));
    assert.ok(parseTrackAnalysis(measured), "what a browser measures is what the server keeps");
  });

  test("a busier, louder beat measures as more energetic", async () => {
    const calm = await measureBeatMono(beat(84, 40, 0, 0.08), null, "split");
    const hot = await measureBeatMono(beat(140, 40, 0, 0.9), null, "split");
    assert.ok(calm && hot);
    assert.ok(hot.energy > calm.energy, `hot ${hot.energy} calm ${calm.energy}`);
  });

  test("too short to measure", async () => {
    assert.equal(await measureBeatMono(new Float32Array(RATE * 2), null, "split"), null);
  });
});

describe("listens", () => {
  const ok = { kind: "track", id: "abc-123", source: "radio", seconds: 95.04, duration: 200, completed: false, skipped: false, station: "remixt-radio" };

  test("a listen is kept, rounded", () => {
    assert.deepEqual(cleanListen(ok), { ...ok, seconds: 95, duration: 200 });
  });

  test("too short, or not one of ours, isn't a listen", () => {
    assert.equal(cleanListen({ ...ok, seconds: MIN_LISTEN_SECONDS - 1 }), null);
    assert.equal(cleanListen({ ...ok, source: "spotify" }), null);
    assert.equal(cleanListen({ ...ok, kind: "video" }), null);
    assert.equal(cleanListen({ ...ok, id: "../etc" }), null);
    assert.equal(cleanListen({ ...ok, station: "<script>" })?.station, null);
  });

  test("heard to the end, or skipped", () => {
    assert.deepEqual(outcome(195, 200, true), { completed: true, skipped: false });
    assert.deepEqual(outcome(12, 200, true), { completed: false, skipped: true });
    // Stopped (the page closed, tuned out): not a skip.
    assert.deepEqual(outcome(12, 200, false), { completed: false, skipped: false });
    assert.deepEqual(outcome(120, null, true), { completed: false, skipped: false });
  });
});

describe("the radio's next song from the library follows the one on air", () => {
  const item = (id: string, bpm: number | null, key: string | null) => ({ kind: "track" as const, id, title: id, artist: "", duration: 200, cover: null, bpm, key });
  const empty = { djQueue: [], votes: [], voting: false, requests: [], playlist: [], recent: [] };

  test("a neighbouring key at a reachable tempo beats a clash", () => {
    const now = item("now", 124, "9:minor"); // 8A
    assert.ok(followOn(now, item("x", 126, "4:minor")) > followOn(now, item("y", 126, "3:major")));
    assert.ok(followOn(now, item("x", 124, "9:minor")) > followOn(now, item("z", 90, "9:minor")), "tempo counts");
    assert.ok(followOn(now, item("u", null, null)) > 0, "an unmeasured song can still play");
  });

  test("chosen among the next few in rotation only, so no song waits for ever", () => {
    const now = item("now", 124, "9:minor");
    const library = [item("a", 90, "1:major"), item("b", 125, "4:minor"), ...Array.from({ length: 8 }, (_, i) => item(`c${i}`, 124, "9:minor"))];
    const pick = pickNext({ ...empty, library, current: "track:now", currentItem: now });
    assert.notEqual(pick?.item.id, "a", "a clash at a far tempo is passed over");
    assert.ok(library.slice(0, FOLLOW_ON_CHOICES).some((i) => i.id === pick?.item.id));
    // Without the song on air known, plain rotation.
    assert.equal(pickNext({ ...empty, library })?.item.id, "a");
  });
});
