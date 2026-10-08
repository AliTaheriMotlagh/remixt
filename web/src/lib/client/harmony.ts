import type { StemAnalysis } from "./analysis";
import { clipSpan, clipStart, clipsOf } from "./clipEdit";
import { pitchClassOf } from "./melody";
import type { StudioLane } from "./studioStore";

// Does the vocal actually sound in tune over this beat? Two key labels
// agreeing on the Camelot wheel (musicKey.ts) is a guess: keys are easy to
// misread, and songs borrow chords. This listens instead: every note the
// vocal sings (melody.ts), at the moment it lands on the timeline, against
// the chord the beat is playing right then (its chromagram). A note in the
// chord, or at least strong in it, sounds right; one the beat isn't playing
// at all rubs. Worked out for every transposition at once, so the best
// pitch shift is measured, not inferred from labels.
//
// Pure — lanes and analyses in, numbers out.

export type Harmony = {
  /** 0..1 — how strongly the beat plays the sung notes, on average (by shift). */
  fit: number;
  /** Share of the sung time whose note is in the beat's chord right then. */
  inChord: number;
  /** Seconds of singing that landed over the beat (what the numbers are from). */
  seconds: number;
};

export type HarmonyScan = {
  /** Fit with the vocal moved by `shift` semitones (-6…+5) from where it is now. */
  byShift: Map<number, Harmony>;
  now: Harmony;
};

type Lane = Pick<StudioLane, "offsetSeconds" | "tempoRatio" | "pitchSemitones" | "clips" | "originalDuration">;

/** A note counts as "in the chord" when the beat plays it at least this strongly (against its loudest note). */
const IN_CHORD = 0.5;
/** Every other pitch frame is plenty (~20 a second). */
const STEP = 2;
/** Too few held notes over the beat to judge (rap, speech, a short clip). */
const MIN_SECONDS = 10;

/** Chroma frames either side averaged into one chord: ~1.9 s, about a bar — steadier than single frames, still a chord rather than the whole key. */
const CHORD_RADIUS = 4;

/** The beat's chroma, each frame averaged with its neighbours (a chord, not a single hit) and scaled to its loudest note. */
function chordRows(beat: StemAnalysis): Float32Array {
  const n = beat.chroma.length / 12;
  const rows = new Float32Array(n * 12);
  for (let f = 0; f < n; f++) {
    let max = 0;
    for (let pc = 0; pc < 12; pc++) {
      let sum = 0;
      for (let k = Math.max(0, f - CHORD_RADIUS); k <= Math.min(n - 1, f + CHORD_RADIUS); k++) sum += beat.chroma[k * 12 + pc];
      rows[f * 12 + pc] = sum;
      max = Math.max(max, sum);
    }
    if (max > 0) for (let pc = 0; pc < 12; pc++) rows[f * 12 + pc] /= max;
  }
  return rows;
}

const rowCache = new WeakMap<StemAnalysis, Float32Array>();

/** Where on a lane's stem the timeline moment `t` is, or null where the lane isn't playing. */
export function sourceAt(beat: Lane, t: number): number | null {
  for (const clip of clipsOf(beat as StudioLane)) {
    if (clip.muted) continue;
    const start = clipStart(beat as StudioLane, clip);
    const end = start + clipSpan(clip) / beat.tempoRatio;
    if (t < start || t >= end) continue;
    const into = (t - start) * beat.tempoRatio * (clip.stretch ?? 1);
    return clip.reverse ? clip.to - into : clip.from + into;
  }
  return null;
}

/** Every timeline moment a lane plays the stem's moment `source` at (none, or several when a part repeats). */
export function timelinesOf(lane: Lane, source: number): number[] {
  const times: number[] = [];
  for (const clip of clipsOf(lane as StudioLane)) {
    if (clip.muted || source < clip.from || source >= clip.to) continue;
    const into = clip.reverse ? clip.to - source : source - clip.from;
    times.push(clipStart(lane as StudioLane, clip) + into / (clip.stretch ?? 1) / lane.tempoRatio);
  }
  return times;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * How the vocal's notes sit on the beat's chords as the two lanes are
 * placed now — and with the vocal moved by every shift from -6 to +5
 * semitones. Null when the vocal has no pitch track or too little of its
 * singing lands over the beat.
 */
export function scanHarmony(vocal: { analysis: StemAnalysis; lane: Lane }, beat: { analysis: StemAnalysis; lane: Lane }): HarmonyScan | null {
  const melody = vocal.analysis.melody;
  if (!melody || beat.analysis.chroma.length < 12) return null;
  let rows = rowCache.get(beat.analysis);
  if (!rows) rowCache.set(beat.analysis, (rows = chordRows(beat.analysis)));
  const chromaFrames = rows.length / 12;
  const vocalShift = Math.round(vocal.lane.pitchSemitones);
  const beatShift = Math.round(beat.lane.pitchSemitones);

  const fit = new Float64Array(12);
  const inChord = new Float64Array(12);
  let weight = 0;
  let frames = 0;
  for (const clip of clipsOf(vocal.lane as StudioLane)) {
    if (clip.muted) continue;
    const start = clipStart(vocal.lane as StudioLane, clip);
    const stretch = clip.stretch ?? 1;
    const first = Math.max(0, Math.ceil((clip.from - melody.offset) * melody.rate));
    const last = Math.min(melody.midi.length - 1, Math.floor((clip.to - melody.offset) * melody.rate));
    for (let f = first; f <= last; f += STEP) {
      const sung = pitchClassOf(melody, f);
      if (sung < 0) continue;
      const source = f / melody.rate + melody.offset;
      const into = clip.reverse ? clip.to - source : source - clip.from;
      const t = start + into / stretch / vocal.lane.tempoRatio;
      const at = sourceAt(beat.lane, t);
      if (at === null) continue;
      // Chroma frame k is centred on (k + 1) hops in.
      const k = Math.round(at * beat.analysis.chromaRate - 1);
      if (k < 0 || k >= chromaFrames) continue;
      const row = k * 12;
      let any = false;
      for (let pc = 0; pc < 12; pc++) if (rows[row + pc] > 0) any = true;
      if (!any) continue; // the beat is silent there
      const w = melody.confidence[f];
      // The note as it sounds now, moved by each shift, read in the beat's own (unshifted) chroma.
      for (let s = 0; s < 12; s++) {
        const value = rows[row + mod12(sung + vocalShift + s - beatShift)];
        fit[s] += w * value;
        if (value >= IN_CHORD) inChord[s] += w;
      }
      weight += w;
      frames++;
    }
  }
  const seconds = (frames * STEP) / melody.rate;
  if (weight <= 0 || seconds < MIN_SECONDS) return null;
  const byShift = new Map<number, Harmony>();
  for (let shift = -6; shift <= 5; shift++) {
    const s = mod12(shift);
    byShift.set(shift, { fit: fit[s] / weight, inChord: inChord[s] / weight, seconds });
  }
  return { byShift, now: byShift.get(0)! };
}

/** Each semitone of pitch shift costs a little sound quality; it has to buy at least this much fit. */
const COST_PER_SEMITONE = 0.012;
/** A change smaller than this isn't worth hearing a re-pitched vocal for. */
const MIN_GAIN = 0.04;

export type HarmonyAdvice = {
  /** Semitones to move the vocal by from where it is now (0: leave it). */
  shift: number;
  now: Harmony;
  best: Harmony;
};

/**
 * The shift (of the vocal; the beat moves the opposite way) that makes the
 * sung notes sit best in the beat's chords — but only one that's clearly
 * better than leaving it, weighed against how far it bends the voice.
 * `limit` caps the shift (a voice moved far sounds unnatural).
 */
export function adviseShift(scan: HarmonyScan, limit = 5): HarmonyAdvice {
  let shift = 0;
  let value = scan.now.fit;
  for (const [s, h] of scan.byShift) {
    if (Math.abs(s) > limit) continue;
    const v = h.fit - COST_PER_SEMITONE * Math.abs(s);
    if (v > value + 1e-9) {
      value = v;
      shift = s;
    }
  }
  const best = scan.byShift.get(shift)!;
  if (shift !== 0 && best.fit - scan.now.fit < MIN_GAIN) return { shift: 0, now: scan.now, best: scan.now };
  return { shift, now: scan.now, best };
}

/**
 * For the Mix check. Even a vocal over its own song's beat has only about
 * half to three-quarters of its held notes squarely in the chords (passing
 * notes, the bleed in a separated beat), so "good" starts at half.
 */
export function harmonyStatus(h: Harmony): "good" | "warn" | "bad" {
  return h.inChord >= 0.5 ? "good" : h.inChord >= 0.38 ? "warn" : "bad";
}

/**
 * Of the shifts the key labels suggest (`candidates`, semitones for the
 * vocal), the one the vocal's notes actually sit best with — or 0 (leave
 * it) when none is clearly better than how it is. Labels are easy to
 * misread; this never moves a vocal somewhere it measurably sounds worse.
 */
export function pickShift(scan: HarmonyScan, candidates: number[]): HarmonyAdvice {
  let shift = 0;
  let value = scan.now.fit;
  for (const s of new Set([...candidates, adviseShift(scan).shift])) {
    const h = scan.byShift.get(((s + 6) % 12 + 12) % 12 - 6);
    if (!h || s === 0) continue;
    const v = h.fit - COST_PER_SEMITONE * Math.abs(s);
    if (v > value + 1e-9) {
      value = v;
      shift = s;
    }
  }
  const best = scan.byShift.get(((shift + 6) % 12 + 12) % 12 - 6)!;
  if (shift !== 0 && best.fit - scan.now.fit < MIN_GAIN) return { shift: 0, now: scan.now, best: scan.now };
  return { shift, now: scan.now, best };
}
