// The DJ simulator's "real gear" logic and the library/mission plumbing:
// quantize, hot cues, loops, tempo fader, auto gain, key lock drift
// correction, meters, track compatibility and browsing, beat grids from
// tracked beats, mission track picking, waveform bands, MIDI parsing, the
// curriculum, and the engine features that use them (against a fake
// AudioContext, as in dj-engine.test.ts).
//
//   node --import ./tests/support/register.mjs --test tests/dj-realism.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DETENT,
  autoGainDb,
  barBeat,
  faderGain,
  faderToTempo,
  hotCueAction,
  keyLockTrim,
  loopAwareDiff,
  meterHeight,
  nearEnd,
  nearestBeat,
  newMeter,
  quantizePos,
  quantizedJump,
  resizeLoop,
  stepMeter,
  tempoToFader,
  withHotCue,
} from "../src/lib/client/dj/djControls.ts";
import { browse, downbeatOffset, fitWith, gridPhase, keyCompatible, sectionsFromEnergy, signedTempoGap, tempoCompatible, tempoGap, type BrowserEntry } from "../src/lib/client/dj/djLibrary.ts";
import { djTrackInfo } from "../src/lib/client/dj/djTrackInfo.ts";
import { effectiveKey, phaseOffset } from "../src/lib/client/dj/djMath.ts";
import { emptyDeck, type TrackInfo } from "../src/lib/client/dj/djTypes.ts";
import { MISSION_NEEDS, adaptSetup, pickFits, rankMissionPicks, type PickCandidate } from "../src/lib/client/dj/missionTracks.ts";
import { MISSIONS } from "../src/lib/client/dj/scenarios.ts";
import { computeBands, loudnessDb } from "../src/lib/client/dj/djWaveform.ts";
import { controlKey, learn, parseMidi, relativeStep } from "../src/lib/client/dj/djMidi.ts";
import { ALL_SCENARIOS, CHECKRIDES, LEVELS, levelItems, levelUnlocked, quizFor } from "../src/lib/client/dj/curriculum.ts";
import { camelotQuestions } from "../src/lib/client/dj/quiz.ts";
import { ScenarioRunner } from "../src/lib/client/dj/scenarioRunner.ts";
import { emptySnapshot } from "../src/lib/client/dj/djTypes.ts";
import { GEAR, gearById } from "../src/lib/client/dj/gear.ts";
import { camelotCode, type MusicalKey } from "../src/lib/client/musicKey.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

/** A library-like track: 125 BPM, the grid starting 0.37 s in. */
function libTrack(patch: Partial<TrackInfo> = {}): TrackInfo {
  return {
    id: "lib:x",
    title: "X",
    artist: "Y",
    genre: "Your library",
    bpm: 125,
    key: { tonic: 9, mode: "minor" },
    camelot: "8A",
    duration: 200,
    firstBeat: 0.37,
    bars: 100,
    sections: [],
    source: "library",
    layout: "two",
    ...patch,
  };
}

describe("quantize and hot cues", () => {
  const t = libTrack();
  const beat = 60 / 125;

  test("snaps to the nearest beat of an offset grid", () => {
    assert.ok(near(nearestBeat(t, 0.37 + 10 * beat + 0.1), 0.37 + 10 * beat));
    assert.ok(near(nearestBeat(t, 0.37 + 10 * beat + 0.3), 0.37 + 11 * beat));
    assert.equal(quantizePos(t, 5.123, false), 5.123);
  });

  test("a quantized jump keeps the beat phase", () => {
    const from = 0.37 + 20 * beat + 0.25 * beat;
    const to = quantizedJump(t, from, 0.37 + 4 * beat + 0.02, true);
    assert.ok(near(to, 0.37 + 4.25 * beat));
    assert.equal(quantizedJump(t, from, 3, false), 3);
  });

  test("bar.beat counts from the grid", () => {
    assert.deepEqual(barBeat(t, 0.37 + 9 * beat + 0.01), { bar: 3, beat: 2 });
  });

  test("pads set when empty, jump when set; clearing works", () => {
    let cues = withHotCue([], 2, 12.5);
    assert.equal(cues.length, 8);
    assert.equal(hotCueAction(cues, 2), "jump");
    assert.equal(hotCueAction(cues, 0), "set");
    cues = withHotCue(cues, 2, null);
    assert.equal(hotCueAction(cues, 2), "set");
    assert.equal(hotCueAction(cues, 9), "none");
  });
});

describe("loops, faders, gain, key lock, meters", () => {
  const t = libTrack();
  const beat = 60 / 125;

  test("loop halve and double keep the start", () => {
    const loop = { active: true, start: 10, end: 10 + 4 * beat, beats: 4 };
    const half = resizeLoop(t, loop, 0.5)!;
    assert.equal(half.beats, 2);
    assert.ok(near(half.end, 10 + 2 * beat));
    const dbl = resizeLoop(t, loop, 2)!;
    assert.equal(dbl.beats, 8);
    assert.equal(resizeLoop(t, { ...loop, beats: 1 / 32, end: 10 + beat / 32 }, 0.5), null);
  });

  test("tempo fader: centre detent and full range at the ends", () => {
    assert.equal(faderToTempo(DETENT * 0.9, 10), 0);
    assert.equal(faderToTempo(1, 10), 10);
    assert.equal(faderToTempo(-1, 16), -16);
    for (const pct of [-7.5, -0.4, 0.4, 3, 10]) assert.ok(near(faderToTempo(tempoToFader(pct, 10), 10), pct, 1e-9));
  });

  test("fader curves", () => {
    assert.equal(faderGain(0, "smooth"), 0);
    assert.equal(faderGain(1, "steep"), 1);
    assert.ok(faderGain(0.3, "steep") > faderGain(0.3, "linear"));
    assert.ok(faderGain(0.3, "smooth") < faderGain(0.3, "linear"));
  });

  test("auto gain levels to the target, within ±12 dB", () => {
    assert.equal(autoGainDb(-16), 0);
    assert.equal(autoGainDb(-22), 6);
    assert.equal(autoGainDb(-40), 12);
    assert.equal(autoGainDb(undefined), 0);
  });

  test("key-lock drift: a small gap trims the tempo, a big one restarts", () => {
    assert.equal(keyLockTrim(0), 1);
    assert.ok(keyLockTrim(0.005)! > 1);
    assert.ok(keyLockTrim(-0.005)! < 1);
    assert.ok(keyLockTrim(0.039)! <= 1.02 + 1e-12);
    assert.equal(keyLockTrim(0.08), null);
    // Across a loop wrap, the short way round.
    assert.ok(near(loopAwareDiff(10.01, 11.99, { active: true, start: 10, end: 12 }), 0.02));
  });

  test("key lock keeps the key whatever the tempo", () => {
    const track = djTrackInfo("warehouse-lights")!;
    const fast = { ...emptyDeck(), track, rate: 1.08 };
    assert.notEqual(camelotCode(effectiveKey(fast)!.key), track.camelot);
    assert.equal(camelotCode(effectiveKey({ ...fast, keyLock: true })!.key), track.camelot);
  });

  test("VU meter: holds the peak, then falls; clip latches", () => {
    let m = stepMeter(newMeter(), 0.99, 0.016);
    assert.equal(m.clipAge, 0);
    assert.ok(near(m.hold, 0.99));
    for (let i = 0; i < 30; i++) m = stepMeter(m, 0.1, 0.016);
    assert.ok(near(m.hold, 0.99), "held");
    assert.ok(m.level < 0.99);
    for (let i = 0; i < 200; i++) m = stepMeter(m, 0.1, 0.016);
    assert.ok(m.hold < 0.99, "falls after the hold time");
    assert.ok(m.clipAge > 1);
    assert.equal(meterHeight(1), 1);
    assert.equal(meterHeight(0), 0);
  });

  test("end warning in the last 30 s, not while looping", () => {
    assert.equal(nearEnd(t, 175, false), true);
    assert.equal(nearEnd(t, 175, true), false);
    assert.equal(nearEnd(t, 100, false), false);
  });
});

describe("compatibility and the browser", () => {
  const Am: MusicalKey = { tonic: 9, mode: "minor" }; // 8A
  const C: MusicalKey = { tonic: 0, mode: "major" }; // 8B
  const Em: MusicalKey = { tonic: 4, mode: "minor" }; // 9A
  const Fs: MusicalKey = { tonic: 6, mode: "major" }; // 2B

  test("tempo within 6 %, half and double time count", () => {
    assert.ok(near(tempoGap(124, 128), 128 / 124 - 1));
    assert.equal(tempoCompatible(70, 140), true);
    assert.equal(tempoCompatible(128, 124), true);
    assert.equal(tempoCompatible(100, 128), false);
    assert.equal(tempoCompatible(null, 128), null);
    assert.ok(near(signedTempoGap(64, 124), 128 / 124 - 1));
  });

  test("keys: same, twin, ±1 fit; far ones don't", () => {
    assert.equal(keyCompatible(Am, C), true);
    assert.equal(keyCompatible(Am, Em), true);
    assert.equal(keyCompatible(Am, Fs), false);
    assert.equal(keyCompatible(null, Am), null);
  });

  const rows: BrowserEntry[] = [
    { id: "1", source: "library", title: "Zed", artist: "B", genre: "", bpm: 128, key: Em, duration: 200, layout: "four", analyzed: true },
    { id: "2", source: "library", title: "Alpha", artist: "A", genre: "", bpm: 100, key: Fs, duration: 180, layout: "two", analyzed: true },
    { id: "3", source: "library", title: "Mid", artist: "C", genre: "", bpm: null, key: null, duration: null, layout: "two", analyzed: false },
    { id: "4", source: "library", title: "Bee", artist: "D", genre: "", bpm: 63, key: C, duration: 240, layout: "four", analyzed: true },
  ];
  const q = { text: "", sort: "title" as const, descending: false, compatibleOnly: false, other: null };

  test("sorts with unknowns last, searches every word", () => {
    assert.deepEqual(browse(rows, { ...q, sort: "bpm" }).map((r) => r.id), ["4", "2", "1", "3"]);
    assert.deepEqual(browse(rows, { ...q, sort: "bpm", descending: true }).map((r) => r.id), ["1", "2", "4", "3"]);
    assert.deepEqual(browse(rows, { ...q, sort: "title" }).map((r) => r.title), ["Alpha", "Bee", "Mid", "Zed"]);
    assert.deepEqual(browse(rows, { ...q, sort: "key" }).map((r) => r.id).slice(0, 3), ["2", "4", "1"]);
    assert.deepEqual(browse(rows, { ...q, text: "zed 128" }).map((r) => r.id), ["1"]);
  });

  test("'fits the other deck' keeps fits and unknowns", () => {
    const other = { bpm: 126, key: Am };
    assert.deepEqual(browse(rows, { ...q, compatibleOnly: true, other }).map((r) => r.id).sort(), ["1", "3", "4"]);
    assert.equal(fitWith(rows[0], other)!.compatible, true);
    assert.equal(fitWith(rows[2], other)!.possible, true);
    assert.equal(fitWith(rows[1], other)!.possible, false);
  });
});

describe("beat grids and sections from real analysis", () => {
  test("grid phase from tracked beats ignores a few wrong ones", () => {
    const bpm = 120;
    const beats: number[] = [];
    for (let i = 0; i < 200; i++) beats.push(0.21 + i * 0.5 + (i % 17 === 0 ? 0.13 : 0) + (i % 5) * 0.002);
    assert.ok(Math.abs(gridPhase(beats, bpm, 0) - 0.214) < 0.01);
    assert.equal(gridPhase([1, 2], bpm, 0.33), 0.33);
  });

  test("downbeat: the beat with the strongest low end", () => {
    const lowAt = (t: number) => (Math.round((t - 0.2) / 0.5) % 4 === 2 ? 5 : 1);
    assert.equal(downbeatOffset(0.2, 120, 60, lowAt), 2);
  });

  test("sections: intro, outro, loud blocks are choruses", () => {
    const energy = Float32Array.from({ length: 64 }, (_, b) => (b >= 24 && b < 40 ? 1 : 0.4));
    const s = sectionsFromEnergy(energy);
    assert.equal(s[0].name, "intro");
    assert.equal(s[s.length - 1].name, "outro");
    assert.ok(s.some((x) => x.name === "chorus" && x.startBar === 24));
    assert.equal(s.reduce((n, x) => n + x.bars, 0), 64);
  });
});

describe("missions with library songs", () => {
  const pool: PickCandidate[] = [
    { id: "a", title: "A", bpm: 124, key: { tonic: 9, mode: "minor" }, duration: 240 }, // 8A
    { id: "b", title: "B", bpm: 128, key: { tonic: 0, mode: "major" }, duration: 220 }, // 8B
    { id: "c", title: "C", bpm: 92, key: { tonic: 6, mode: "major" }, duration: 200 }, // 2B
    { id: "d", title: "D", bpm: 140, key: null, duration: 210 },
    { id: "e", title: "Short", bpm: 125, key: { tonic: 9, mode: "minor" }, duration: 50 },
  ];

  test("every mission has needs", () => {
    for (const m of MISSIONS) assert.ok(MISSION_NEEDS[m.id], m.id);
  });

  test("acapella needs known compatible keys and close tempos", () => {
    const picks = rankMissionPicks("acapella", pool, 3);
    assert.ok(picks.length > 0);
    for (const p of picks) {
      const ids = [p.A, p.B].sort().join();
      assert.equal(ids, "a,b", `got ${ids}`);
    }
    assert.equal(pickFits("acapella", pool[0], pool[1]), true);
    assert.equal(pickFits("acapella", pool[0], pool[2]), false);
  });

  test("the tempo mission wants a gap; short songs are skipped", () => {
    const picks = rankMissionPicks("tempo", pool, 1);
    for (const p of picks) {
      const a = pool.find((c) => c.id === p.A)!;
      const b = pool.find((c) => c.id === p.B)!;
      const g = tempoGap(b.bpm!, a.bpm!);
      assert.ok(g >= 0.025 && g <= 0.14, `${p.A}/${p.B}: ${g}`);
      assert.ok(p.A !== "e" && p.B !== "e");
    }
  });

  test("harmonic: one deck plus a partner that fits", () => {
    const p = rankMissionPicks("harmonic", pool, 2)[0];
    assert.ok(p.partner && !p.B);
    assert.ok(["a", "b"].includes(p.A) && ["a", "b"].includes(p.partner!));
  });

  test("no fitting pair → nothing (the caller falls back to demo songs)", () => {
    assert.deepEqual(rankMissionPicks("acapella", [pool[2], pool[3]], 1), []);
    assert.deepEqual(rankMissionPicks("nope", pool, 1), []);
  });

  test("an adapted setup matches B's tempo to A and keeps start bars in range", () => {
    const phase = MISSIONS.find((m) => m.id === "phase")!;
    const A = libTrack({ id: "lib:a", bpm: 124, firstBeat: 0.2 });
    const B = libTrack({ id: "lib:b", bpm: 128, firstBeat: 0.45, duration: 100 });
    const s = adaptSetup(phase, { A, B });
    assert.equal(s.decks.A!.trackId, "lib:a");
    assert.ok(near(s.decks.B!.tempoPct!, (124 / 128 - 1) * 100, 1e-9));
    assert.ok(0.45 + s.decks.B!.startBar! * (240 / 128) + 90 <= 100);
    assert.equal(s.phaseOffsetMs, phase.setup.phaseOffsetMs);
  });

  test("phase maths work on offset grids", () => {
    const A = libTrack({ bpm: 124, firstBeat: 0.2 });
    const B = libTrack({ bpm: 124, firstBeat: 0.45 });
    const a = { ...emptyDeck(), track: A, playing: true, position: 0.2 + 32 * (60 / 124) };
    const b = { ...emptyDeck(), track: B, playing: true, position: 0.45 + 16 * (60 / 124) };
    assert.ok(Math.abs(phaseOffset(a, b).ms) < 1e-6);
  });
});

describe("waveform bands and loudness", () => {
  test("a low sine lands in the low band, a high one in the high band", () => {
    const rate = 11025;
    const sine = (f: number) => Float32Array.from({ length: rate }, (_, i) => 0.8 * Math.sin((2 * Math.PI * f * i) / rate));
    const lo = computeBands(sine(60), rate, 10);
    const hi = computeBands(sine(4000), rate, 10);
    assert.ok(lo.low[5] > 0.5 && lo.high[5] < 0.05, `low ${lo.low[5]} high ${lo.high[5]}`);
    assert.ok(hi.high[5] > 0.5 && hi.low[5] < 0.05);
  });

  test("loudness ignores silence", () => {
    const loud = Float32Array.from({ length: 100 }, (_, i) => (i < 50 ? 0.1 : 0));
    assert.ok(Math.abs(loudnessDb([loud]) - 20 * Math.log10(0.1)) < 0.01);
  });
});

describe("MIDI", () => {
  test("notes, note-offs and CCs", () => {
    assert.deepEqual(parseMidi([0x91, 36, 100]), { kind: "note", channel: 1, number: 36, value: 100, on: true });
    assert.equal(parseMidi([0x91, 36, 0])!.on, false);
    assert.equal(parseMidi([0x80, 36, 64])!.on, false);
    assert.equal(parseMidi([0xb0, 7, 127])!.kind, "cc");
    assert.equal(parseMidi([0xf8]), null);
  });

  test("relative jog values and learning replaces old mappings", () => {
    assert.equal(relativeStep(1), 1);
    assert.equal(relativeStep(127), -1);
    assert.equal(relativeStep(64), 0);
    const k = controlKey({ kind: "cc", channel: 0, number: 7 });
    let map = learn({}, k, "crossfader");
    map = learn(map, "cc:0:8", "crossfader");
    assert.deepEqual(map, { "cc:0:8": "crossfader" });
  });
});

describe("curriculum", () => {
  test("ids are unique and every exercise runs without errors", () => {
    const ids = ALL_SCENARIOS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const m of ALL_SCENARIOS) {
      const r = new ScenarioRunner(m, 7);
      for (let i = 0; i < 5; i++) r.tick(emptySnapshot(), 0.1);
      r.hint(emptySnapshot());
    }
  });

  test("each level has lessons or practice and a checkride; levels unlock in order", () => {
    for (const l of LEVELS) {
      const items = levelItems(l.level);
      assert.ok(items.lessons.length + items.practice.length > 0);
      assert.ok(items.test, `level ${l.level}`);
    }
    assert.equal(levelUnlocked(2, () => false), false);
    assert.equal(levelUnlocked(2, (id) => id === CHECKRIDES[0].id), true);
  });

  test("quizzes are well formed; Camelot answers blend", () => {
    for (const m of ALL_SCENARIOS) {
      for (const q of quizFor(m, 11)) {
        assert.ok(q.answer >= 0 && q.answer < q.options.length, m.id);
        assert.equal(new Set(q.options).size, q.options.length, `${m.id}: ${q.q}`);
      }
    }
    for (const q of camelotQuestions(5, 9)) assert.equal(q.options.length, 4);
  });

  test("gear profiles", () => {
    assert.ok(GEAR.length >= 4);
    const tt = gearById("turntables");
    assert.equal(tt.sync, false);
    assert.equal(tt.keyLock, false);
    assert.equal(gearById("nonsense").id, "club");
  });
});
