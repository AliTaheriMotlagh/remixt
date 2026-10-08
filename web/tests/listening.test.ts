// The Studio's ears: the beat model's pre/post-processing (beatNet.ts) and
// its beats turned into a grid (arrange.ts neuralGrid), following a voice's
// pitch (melody.ts), and whether the notes sit in a beat's chords
// (harmony.ts) — on synthetic audio and analyses with known answers.
//
//   node --import ./tests/support/register.mjs --test tests/listening.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StemAnalysis } from "../src/lib/client/analysis.ts";
import { neuralGrid } from "../src/lib/client/arrange.ts";
import { BEAT_NET, aggregate, logMelSpectrogram, melFilterbank, pickBeats, splitPiece } from "../src/lib/client/beatNet.ts";
import { adviseShift, harmonyStatus, pickShift, scanHarmony, sourceAt, timelinesOf } from "../src/lib/client/harmony.ts";
import { melodyKeyScores, noteProfile, sungSeconds, trackMelody, type Melody } from "../src/lib/client/melody.ts";

// trackMelody yields to the page now and then; tests don't need to wait.
globalThis.setTimeout = ((fn: () => void) => {
  fn();
  return 0;
}) as unknown as typeof setTimeout;

describe("beat model processing", () => {
  test("the mel filterbank is torchaudio's slaney triangles", () => {
    const fb = melFilterbank();
    assert.equal(fb.length, 513 * 128);
    // Every band has a peak near 1 and no negative weights.
    for (let m = 0; m < 128; m++) {
      let peak = 0;
      for (let k = 0; k < 513; k++) {
        assert.ok(fb[k * 128 + m] >= 0);
        peak = Math.max(peak, fb[k * 128 + m]);
      }
      assert.ok(peak > 0.35 && peak <= 1, `band ${m} peaks at ${peak}`);
    }
    // Nothing below 30 Hz (bin 1 is 21.5 Hz).
    for (let m = 0; m < 128; m++) assert.equal(fb[128 + m], 0);
  });

  test("a spectrogram has 50 frames a second, louder where there's sound", () => {
    const sr = BEAT_NET.sampleRate;
    const audio = new Float32Array(sr * 2);
    for (let i = sr; i < sr * 2; i++) audio[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5;
    const { data, frames } = logMelSpectrogram(audio);
    assert.equal(frames, 1 + Math.floor(audio.length / BEAT_NET.hop));
    const energy = (f: number) => data.subarray(f * 128, (f + 1) * 128).reduce((s, v) => s + v, 0);
    assert.ok(energy(10) < 1e-6, "silence stays at log1p(0)");
    assert.ok(energy(80) > 10);
  });

  test("windows cover the song with borders, and joining them gives each frame back", () => {
    for (const frames of [100, 1488, 1500, 4000, 13169]) {
      const spect = new Float32Array(frames * 128);
      const windows = splitPiece(spect, frames);
      for (const w of windows) assert.ok(w.frames <= BEAT_NET.chunk);
      // A "model" that answers each frame with its own index in the song.
      const predictions = windows.map((w) => Float32Array.from({ length: w.frames }, (_, i) => w.start + i));
      const joined = aggregate(windows, predictions, frames);
      for (let i = 0; i < frames; i++) assert.equal(joined[i], i, `frame ${i} of ${frames}`);
    }
  });

  test("beats are the confident local peaks, downbeats snapped onto them", () => {
    const n = 500;
    const beat = new Float32Array(n).fill(-5);
    const down = new Float32Array(n).fill(-5);
    for (let t = 25; t < n; t += 25) {
      beat[t - 1] = 1;
      beat[t] = 3;
      beat[t + 1] = 2;
    }
    for (let t = 25; t < n; t += 100) down[t + 1] = 2; // a frame late
    const found = pickBeats(beat, down);
    assert.equal(found.beats.length, 19);
    assert.ok(Math.abs(found.beats[0] - 0.5) < 1e-9);
    assert.deepEqual(found.downbeats, [0.5, 2.5, 4.5, 6.5, 8.5]);
  });
});

describe("the model's beats as a grid", () => {
  const analysis = (beats: number[], downbeats: number[], seconds: number) =>
    ({ neural: { beats, downbeats }, energy: new Float32Array(Math.round(seconds * 86)), onsetRate: 86 }) as unknown as StemAnalysis;
  const at = (bpm: number, from: number, count: number) => Array.from({ length: count }, (_, i) => from + (60 / bpm) * i);

  test("followed at the same tempo, gaps filled, carried to both ends", () => {
    const beats = at(120, 1, 60).filter((_, i) => i < 20 || i > 27); // a break with no beats heard
    const grid = neuralGrid(analysis(beats, [], 40), 120)!;
    assert.ok(grid);
    for (let i = 1; i < grid.length; i++) assert.ok(Math.abs(grid[i] - grid[i - 1] - 0.5) < 1e-6);
    assert.ok(grid[0] < 0.5 && grid[grid.length - 1] > 39.4);
  });

  test("half time takes the beats the downbeats are on", () => {
    const beats = at(140, 0.3, 120);
    const downbeats = beats.filter((_, i) => i % 4 === 1);
    const grid = neuralGrid(analysis(beats, downbeats, 60), 70)!;
    // To the tracker's resolution (11.6 ms blocks).
    assert.ok(grid.some((t) => Math.abs(t - downbeats[0]) < 0.015), "the half-time grid keeps the downbeats");
    assert.ok(!grid.some((t) => Math.abs(t - beats[0]) < 0.015), "…not the beats between them");
  });

  test("a tempo the model disagrees with falls back to the onset tracker", () => {
    assert.equal(neuralGrid(analysis(at(120, 0, 60), [], 40), 97), null);
  });
});

/** A synthetic voice: harmonic tones, each note held, with small gaps. */
function sing(midi: number[], seconds = 0.5, sr = 11025) {
  const out = new Float32Array(Math.round(midi.length * seconds * sr));
  midi.forEach((m, n) => {
    const hz = 440 * 2 ** ((m - 69) / 12);
    const start = Math.round(n * seconds * sr);
    const length = Math.round(seconds * 0.85 * sr);
    for (let i = 0; i < length; i++) for (let h = 1; h <= 5; h++) out[start + i] += (0.3 * Math.sin((2 * Math.PI * hz * h * i) / sr)) / h;
  });
  return out;
}

describe("following a voice", () => {
  test("held notes come out at their pitch", async () => {
    const melody = await trackMelody(sing([60, 64, 67, 72]), 11025);
    const notes = [0, 1, 2, 3].map((n) => {
      const frames = Array.from(melody.midi).slice(Math.round((n + 0.2) * 0.5 * melody.rate), Math.round((n + 0.7) * 0.5 * melody.rate));
      const voiced = frames.filter((m) => m > 0);
      return voiced.reduce((s, m) => s + m, 0) / voiced.length;
    });
    notes.forEach((m, i) => assert.ok(Math.abs(m - [60, 64, 67, 72][i]) < 0.1, `note ${i}: ${m}`));
  });

  test("glides (rap, speech, slides) don't count as notes", async () => {
    const sr = 11025;
    const glide = new Float32Array(sr * 3);
    let phase = 0;
    for (let i = 0; i < glide.length; i++) {
      phase += (2 * Math.PI * 200 * 2 ** ((i / sr) * 4)) / sr; // two octaves a second... and up
      glide[i] = 0.3 * Math.sin(phase);
    }
    assert.ok(sungSeconds(await trackMelody(glide, sr)) < 0.5);
  });

  test("a melody in A minor reads as A minor", async () => {
    // A natural minor tune that dwells on A, C and E.
    const tune = [57, 60, 64, 62, 60, 59, 57, 64, 65, 64, 62, 60, 59, 57, 57, 60, 64, 69, 67, 65, 64, 62, 60, 59, 57, 57];
    const melody = await trackMelody(sing(tune), 11025);
    const best = melodyKeyScores(noteProfile(melody)).sort((a, b) => b.score - a.score)[0].key;
    assert.deepEqual(best, { tonic: 9, mode: "minor" });
  });
});

describe("harmony: the sung notes against the beat's chords", () => {
  const RATE = 43;
  /** A vocal holding `notes` (MIDI), one a second. */
  const vocal = (notes: number[]) => {
    const midi = new Float32Array(notes.length * RATE);
    const confidence = new Float32Array(midi.length);
    notes.forEach((m, n) => {
      for (let f = n * RATE; f < n * RATE + RATE - 4; f++) {
        midi[f] = m;
        confidence[f] = 0.9;
      }
    });
    const melody: Melody = { midi, confidence, rate: RATE, offset: 0, tuning: 0 };
    return { melody } as unknown as StemAnalysis;
  };
  /** A beat playing the C major triad (C E G) the whole time, transposed by `shift`. */
  const beat = (seconds: number, shift = 0) => {
    const chromaRate = 11025 / 2048;
    const frames = Math.ceil(seconds * chromaRate) + 4;
    const chroma = new Float32Array(frames * 12);
    for (let f = 0; f < frames; f++) for (const [pc, v] of [[0, 0.4], [4, 0.3], [7, 0.3]]) chroma[f * 12 + ((pc + shift) % 12)] = v;
    return { chroma, chromaRate } as unknown as StemAnalysis;
  };
  const lane = (duration: number, pitch = 0) => ({ offsetSeconds: 0, tempoRatio: 1, pitchSemitones: pitch, clips: null, originalDuration: duration });
  const tune = Array.from({ length: 24 }, (_, i) => [60, 64, 67, 72, 64, 60][i % 6]);

  test("a vocal on its chord fits; the same vocal over a beat two semitones up is told to move up two", () => {
    const same = scanHarmony({ analysis: vocal(tune), lane: lane(24) }, { analysis: beat(24), lane: lane(24) })!;
    assert.ok(same.now.inChord > 0.95);
    assert.equal(harmonyStatus(same.now), "good");
    assert.equal(adviseShift(same).shift, 0);

    const up = scanHarmony({ analysis: vocal(tune), lane: lane(24) }, { analysis: beat(24, 2), lane: lane(24) })!;
    assert.ok(up.now.inChord < 0.4);
    assert.equal(adviseShift(up).shift, 2);
    // The lanes' own pitch shifts count: the vocal already up two, or the beat down two, is in tune.
    assert.equal(adviseShift(scanHarmony({ analysis: vocal(tune), lane: lane(24, 2) }, { analysis: beat(24, 2), lane: lane(24) })!).shift, 0);
    assert.equal(adviseShift(scanHarmony({ analysis: vocal(tune), lane: lane(24) }, { analysis: beat(24, 2), lane: lane(24, -2) })!).shift, 0);
  });

  test("a label's shift that measurably sounds worse isn't made", () => {
    const same = scanHarmony({ analysis: vocal(tune), lane: lane(24) }, { analysis: beat(24), lane: lane(24) })!;
    assert.equal(pickShift(same, [3]).shift, 0);
  });

  test("too little singing isn't judged", () => {
    assert.equal(scanHarmony({ analysis: vocal(tune.slice(0, 5)), lane: lane(5) }, { analysis: beat(5), lane: lane(5) }), null);
  });

  test("clips map between the stem's time and the timeline both ways", () => {
    const l = { offsetSeconds: 2, tempoRatio: 2, pitchSemitones: 0, originalDuration: 30, clips: [{ from: 10, to: 14, at: 0 }, { from: 10, to: 12, at: 8, stretch: 2 }] };
    // Clip 1 starts at 2 s and plays twice as fast; clip 2 starts at 2 + 8/2 = 6 s, four times as fast.
    assert.deepEqual(timelinesOf(l, 11), [2.5, 6.25]);
    assert.equal(sourceAt(l, 2.5), 11);
    assert.equal(sourceAt(l, 6.25), 11);
    assert.equal(sourceAt(l, 5), null);
  });
});
