// The notes a vocal sings, and the key they're in.
//
// The key analysis.ts finds for a stem comes from its overall sound — a
// chromagram, which for a full beat is a fine fingerprint of the chords. A
// separated vocal is one voice: its chromagram is mostly harmonics and the
// faint bleed of the original song, and a key read from it is often a
// relative or a fifth off. Following the voice's pitch (YIN, de Cheveigné &
// Kawahara 2002) gives the notes actually sung; how long each note is held
// says the key far more reliably, and the notes are what the harmony check
// (harmony.ts) compares against the beat's chords bar by bar.
//
// Pure: works on mono samples, no Web Audio, so it's tested directly.

import type { MusicalKey } from "./musicKey";

/** Samples between pitch frames (at 11025 Hz: ~23 ms, 43 frames a second). */
export const PITCH_HOP = 256;
/** Analysis window: ~46 ms — two periods of a 70 Hz voice. */
const WINDOW = 512;
const MIN_HZ = 70;
const MAX_HZ = 1000;
/** YIN's threshold on the normalised difference: below it, the period is clear. */
const THRESHOLD = 0.15;

export type Melody = {
  /** The pitch of each frame as a (fractional) MIDI note — held notes only, 0 elsewhere. */
  midi: Float32Array;
  /** 0..1 — how clearly periodic each frame is (0 where nothing is sung). */
  confidence: Float32Array;
  /** Frames per second. */
  rate: number;
  /** Seconds from a frame's index time to its window's centre. */
  offset: number;
  /** How far the singer sits from concert pitch, in semitones (-0.5..0.5). */
  tuning: number;
};

function percentile(values: Float32Array, p: number) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The pitch of a vocal, frame by frame. `sampleRate` is the rate of `mono`. */
export async function trackMelody(mono: Float32Array, sampleRate: number): Promise<Melody> {
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const tauMax = Math.ceil(sampleRate / MIN_HZ);
  const frames = Math.max(0, Math.floor((mono.length - WINDOW - tauMax) / PITCH_HOP) + 1);
  const midi = new Float32Array(frames);
  const confidence = new Float32Array(frames);

  // Only where the voice is clearly there: the floor sits above the faint
  // bleed of the original song a separated vocal carries between lines.
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * PITCH_HOP, end = i + WINDOW; i < end; i++) sum += mono[i] * mono[i];
    rms[f] = Math.sqrt(sum / WINDOW);
  }
  const floor = percentile(rms, 0.95) * 0.1;

  const d = new Float64Array(tauMax + 2);
  for (let f = 0; f < frames; f++) {
    if (!(rms[f] > floor)) continue;
    const start = f * PITCH_HOP;
    // Difference function, then normalised by its running mean (CMNDF).
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let sum = 0;
      for (let j = 0; j < WINDOW; j++) {
        const diff = mono[start + j] - mono[start + j + tau];
        sum += diff * diff;
      }
      running += sum;
      d[tau] = running > 0 ? (sum * tau) / running : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < THRESHOLD) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) continue;
    // The dip between samples, from a parabola through its neighbours.
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const curve = a - 2 * b + c;
    const exact = curve > 0 ? tau + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curve)) : tau;
    const hz = sampleRate / exact;
    midi[f] = 69 + 12 * Math.log2(hz / 440);
    confidence[f] = Math.max(0, Math.min(1, 1 - b));
    if (f % 256 === 255) await yieldToUI();
  }

  keepHeldNotes(midi, confidence);

  // Tuning: the circular mean of how far each note sits from the nearest
  // semitone, so a song recorded a little sharp or flat isn't read a
  // semitone off.
  let x = 0;
  let y = 0;
  for (let f = 0; f < frames; f++) {
    if (!midi[f]) continue;
    const angle = 2 * Math.PI * (midi[f] - Math.round(midi[f]));
    x += confidence[f] * Math.cos(angle);
    y += confidence[f] * Math.sin(angle);
  }
  const tuning = x || y ? Math.atan2(y, x) / (2 * Math.PI) : 0;

  return { midi, confidence, rate: sampleRate / PITCH_HOP, offset: WINDOW / 2 / sampleRate, tuning };
}

/** Frames a note must be held for to count (~115 ms). */
const MIN_NOTE_FRAMES = 5;
/** How far the pitch may wander inside one held note, in semitones (vibrato included). */
const NOTE_WANDER = 0.35;

/**
 * Keeps only notes that are held: rap, speech, slides and breaths glide
 * through pitches without settling, and say nothing about key — counted,
 * they make a rapped verse look like it clashes with its own beat.
 */
function keepHeldNotes(midi: Float32Array, confidence: Float32Array) {
  let start = 0;
  const end = (f: number) => {
    if (f - start < MIN_NOTE_FRAMES) for (let i = start; i < f; i++) midi[i] = confidence[i] = 0;
  };
  for (let f = 0; f <= midi.length; f++) {
    const continues = f < midi.length && midi[f] && f > start && Math.abs(midi[f] - midi[f - 1]) <= NOTE_WANDER;
    if (continues) continue;
    end(f);
    start = f;
  }
}

/** The pitch class (0 = C … 11 = B) of a frame, tuning taken out; -1 where nothing is sung. */
export function pitchClassOf(melody: Melody, frame: number): number {
  const m = melody.midi[frame];
  if (!m) return -1;
  return ((Math.round(m - melody.tuning) % 12) + 12) % 12;
}

/** How long each pitch class is sung, weighted by how clear it is — sums to 1 (all 0 when silent). */
export function noteProfile(melody: Melody): number[] {
  const profile = new Array(12).fill(0);
  for (let f = 0; f < melody.midi.length; f++) {
    const pc = pitchClassOf(melody, f);
    if (pc >= 0) profile[pc] += melody.confidence[f];
  }
  const total = profile.reduce((s, v) => s + v, 0);
  return total > 0 ? profile.map((v) => v / total) : profile;
}

/** Seconds of held, clearly sung notes (little for rap or speech). */
export function sungSeconds(melody: Melody): number {
  let frames = 0;
  for (let f = 0; f < melody.midi.length; f++) if (melody.midi[f]) frames++;
  return frames / melody.rate;
}

// Albrecht & Shanahan (2013): how much of a melody's time each scale degree
// takes, measured over a corpus of melodies — the profile to match notes
// against (the Krumhansl profiles in analysis.ts suit a chromagram).
const MAJOR_NOTES = [0.238, 0.006, 0.111, 0.006, 0.137, 0.094, 0.016, 0.214, 0.009, 0.08, 0.008, 0.081];
const MINOR_NOTES = [0.22, 0.006, 0.104, 0.123, 0.019, 0.103, 0.012, 0.214, 0.062, 0.022, 0.061, 0.052];

function correlation(a: number[], b: number[]) {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - meanA) * (b[i] - meanB);
    denA += (a[i] - meanA) ** 2;
    denB += (b[i] - meanB) ** 2;
  }
  return denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
}

/** How well a note profile fits each of the 24 keys (index: tonic, major first then minor). */
export function melodyKeyScores(profile: number[]): { key: MusicalKey; score: number }[] {
  const scores: { key: MusicalKey; score: number }[] = [];
  for (const mode of ["major", "minor"] as const) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotated = Array.from({ length: 12 }, (_, i) => profile[(i + tonic) % 12]);
      scores.push({ key: { tonic, mode }, score: correlation(rotated, mode === "major" ? MAJOR_NOTES : MINOR_NOTES) });
    }
  }
  return scores;
}
