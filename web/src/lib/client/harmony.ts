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
  /**
   * Share of the sung time whose note rubs: a semitone from a note the
   * beat plays loudly right then, and not in the chord itself. That's what
   * an ear hears as "wrong", far more than a note the beat just doesn't play.
   */
  clash: number;
  /** Seconds of singing that landed over the beat (what the numbers are from). */
  seconds: number;
};

/** How it sounds over one stretch of the timeline, by shift as `byShift`. */
export type HarmonyWindow = { start: number; end: number; byShift: Map<number, Harmony> };

export type HarmonyScan = {
  /** Fit with the vocal moved by `shift` semitones (-6…+5) from where it is now. */
  byShift: Map<number, Harmony>;
  now: Harmony;
  /** The same, stretch by stretch along the timeline (WINDOW seconds each), where there's singing. */
  windows: HarmonyWindow[];
};

type Lane = Pick<StudioLane, "offsetSeconds" | "tempoRatio" | "pitchSemitones" | "clips" | "originalDuration">;

/** A note counts as "in the chord" when the beat plays it at least this strongly (against its loudest note). */
const IN_CHORD = 0.5;
/** Every other pitch frame is plenty (~20 a second). */
const STEP = 2;
/** Too few held notes over the beat to judge (rap, speech, a short clip). */
const MIN_SECONDS = 10;

/** A neighbour this strong (of the chord's loudest note) makes a note that isn't in the chord rub. */
const RUBS_WITH = 0.75;
/** …when the note itself is this weak in the chord. */
const NOT_IN = 0.25;
/** How much more a note sung on one of the beat's hits counts (those are what the ear checks against). */
const ACCENT = 0.6;
/** Seconds per stretch in `windows`. */
export const WINDOW = 8;

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
const accentCache = new WeakMap<StemAnalysis, Float32Array>();

/** The beat's hits, 0..1 against its strong ones (the 95th percentile), so one huge hit doesn't flatten the rest. */
function accents(beat: StemAnalysis): Float32Array {
  let out = accentCache.get(beat);
  if (out) return out;
  // An analysis without onsets (an older one kept on the device): every note counts the same.
  const onsets = beat.onsets ?? new Float32Array(0);
  const sorted = Float32Array.from(onsets).sort();
  const top = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] : 0;
  out = new Float32Array(onsets.length);
  if (top > 0) for (let i = 0; i < onsets.length; i++) out[i] = Math.min(1, onsets[i] / top);
  accentCache.set(beat, out);
  return out;
}

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

  const accent = accents(beat.analysis);
  const fit = new Float64Array(12);
  const inChord = new Float64Array(12);
  const clash = new Float64Array(12);
  let weight = 0;
  let frames = 0;
  // Stretch by stretch: per window, per shift, the same sums (and frames, for its seconds).
  const win = new Map<number, { fit: Float64Array; inChord: Float64Array; clash: Float64Array; weight: number; frames: number }>();
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
      const hit = accent.length && beat.analysis.onsetRate ? accent[Math.min(accent.length - 1, Math.max(0, Math.round(at * beat.analysis.onsetRate)))] : 0;
      const w = melody.confidence[f] * (1 + ACCENT * hit);
      const index = Math.floor(t / WINDOW);
      let bin = win.get(index);
      if (!bin) win.set(index, (bin = { fit: new Float64Array(12), inChord: new Float64Array(12), clash: new Float64Array(12), weight: 0, frames: 0 }));
      // The note as it sounds now, moved by each shift, read in the beat's own (unshifted) chroma.
      for (let s = 0; s < 12; s++) {
        const pc = mod12(sung + vocalShift + s - beatShift);
        const value = rows[row + pc];
        const rubs = value < NOT_IN && Math.max(rows[row + mod12(pc + 1)], rows[row + mod12(pc - 1)]) >= RUBS_WITH;
        fit[s] += w * value;
        bin.fit[s] += w * value;
        if (value >= IN_CHORD) {
          inChord[s] += w;
          bin.inChord[s] += w;
        }
        if (rubs) {
          clash[s] += w;
          bin.clash[s] += w;
        }
      }
      weight += w;
      frames++;
      bin.weight += w;
      bin.frames++;
    }
  }
  const seconds = (frames * STEP) / melody.rate;
  if (weight <= 0 || seconds < MIN_SECONDS) return null;
  const shifts = (sums: { fit: Float64Array; inChord: Float64Array; clash: Float64Array }, total: number, secs: number) => {
    const out = new Map<number, Harmony>();
    for (let shift = -6; shift <= 5; shift++) {
      const s = mod12(shift);
      out.set(shift, { fit: sums.fit[s] / total, inChord: sums.inChord[s] / total, clash: sums.clash[s] / total, seconds: secs });
    }
    return out;
  };
  const byShift = shifts({ fit, inChord, clash }, weight, seconds);
  const windows = [...win.entries()]
    .filter(([, w]) => w.weight > 0)
    .sort(([a], [b]) => a - b)
    .map(([index, w]) => ({ start: index * WINDOW, end: (index + 1) * WINDOW, byShift: shifts(w, w.weight, (w.frames * STEP) / melody.rate) }));
  return { byShift, now: byShift.get(0)!, windows };
}

/** How good a harmony sounds, all told: how much the beat plays the sung notes, less what rubs. */
export function quality(h: Harmony) {
  return h.fit - CLASH_WEIGHT * h.clash;
}

/** Each semitone of pitch shift costs a little sound quality; it has to buy at least this much fit. */
const COST_PER_SEMITONE = 0.012;
/** How much a note that rubs takes off (a note simply not in the chord takes off nothing). */
const CLASH_WEIGHT = 0.5;
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
export function adviseShift(scan: Pick<HarmonyScan, "byShift" | "now">, limit = 5): HarmonyAdvice {
  let shift = 0;
  let value = quality(scan.now);
  for (const [s, h] of scan.byShift) {
    if (Math.abs(s) > limit) continue;
    const v = quality(h) - COST_PER_SEMITONE * Math.abs(s);
    if (v > value + 1e-9) {
      value = v;
      shift = s;
    }
  }
  const best = scan.byShift.get(shift)!;
  if (shift !== 0 && quality(best) - quality(scan.now) < MIN_GAIN) return { shift: 0, now: scan.now, best: scan.now };
  return { shift, now: scan.now, best };
}

/**
 * For the Mix check. Even a vocal over its own song's beat has only about
 * half to three-quarters of its held notes squarely in the chords (passing
 * notes, the bleed in a separated beat), so "good" starts at half.
 */
export function harmonyStatus(h: Harmony): "good" | "warn" | "bad" {
  // A vocal mostly in the chords can still sound wrong if a good share of it rubs a semitone off them.
  if (h.inChord < 0.38 || h.clash >= 0.25) return "bad";
  return h.inChord >= 0.5 && h.clash < 0.15 ? "good" : "warn";
}

/** Shortest stretch of singing worth calling out on its own, in seconds. */
const MIN_STRETCH_SECONDS = 3;

export type HarmonyStretch = HarmonyAdvice & { start: number; end: number };

/**
 * The stretch of the song where the vocal sounds most out of tune with
 * the beat — clearly worse than the rest — with the shift that would fix
 * it there (a key change in the beat, a line sung in another key). Null
 * when no stretch stands out, or none could be made better. Neighbouring
 * windows that are just as bad are taken in with it.
 */
export function worstStretch(scan: HarmonyScan): HarmonyStretch | null {
  const overall = quality(scan.now);
  const bad = (w: HarmonyWindow) => {
    const h = w.byShift.get(0)!;
    return h.seconds >= MIN_STRETCH_SECONDS && harmonyStatus(h) === "bad" && quality(h) < overall - 0.08;
  };
  let worst: HarmonyWindow | null = null;
  for (const w of scan.windows) if (bad(w) && (!worst || quality(w.byShift.get(0)!) < quality(worst.byShift.get(0)!))) worst = w;
  if (!worst) return null;
  // Its run of bad windows, side by side on the timeline.
  const at = scan.windows.indexOf(worst);
  let first = at;
  let last = at;
  while (first > 0 && scan.windows[first - 1].end === scan.windows[first].start && bad(scan.windows[first - 1])) first--;
  while (last < scan.windows.length - 1 && scan.windows[last + 1].start === scan.windows[last].end && bad(scan.windows[last + 1])) last++;
  const run = scan.windows.slice(first, last + 1);
  // The run's numbers, weighted by how much singing each window holds.
  const byShift = new Map<number, Harmony>();
  for (let shift = -6; shift <= 5; shift++) {
    const parts = run.map((w) => w.byShift.get(shift)!);
    const secs = parts.reduce((sum, h) => sum + h.seconds, 0);
    const avg = (k: "fit" | "inChord" | "clash") => parts.reduce((sum, h) => sum + h[k] * h.seconds, 0) / Math.max(1e-9, secs);
    byShift.set(shift, { fit: avg("fit"), inChord: avg("inChord"), clash: avg("clash"), seconds: secs });
  }
  const advice = adviseShift({ byShift, now: byShift.get(0)! });
  if (!advice.shift) return null;
  return { ...advice, start: run[0].start, end: run[run.length - 1].end };
}

/**
 * Of the shifts the key labels suggest (`candidates`, semitones for the
 * vocal), the one the vocal's notes actually sit best with — or 0 (leave
 * it) when none is clearly better than how it is. Labels are easy to
 * misread; this never moves a vocal somewhere it measurably sounds worse.
 */
export function pickShift(scan: HarmonyScan, candidates: number[]): HarmonyAdvice {
  let shift = 0;
  let value = quality(scan.now);
  for (const s of new Set([...candidates, adviseShift(scan).shift])) {
    const h = scan.byShift.get(((s + 6) % 12 + 12) % 12 - 6);
    if (!h || s === 0) continue;
    const v = quality(h) - COST_PER_SEMITONE * Math.abs(s);
    if (v > value + 1e-9) {
      value = v;
      shift = s;
    }
  }
  const best = scan.byShift.get(((shift + 6) % 12 + 12) % 12 - 6)!;
  if (shift !== 0 && quality(best) - quality(scan.now) < MIN_GAIN) return { shift: 0, now: scan.now, best: scan.now };
  return { shift, now: scan.now, best };
}
