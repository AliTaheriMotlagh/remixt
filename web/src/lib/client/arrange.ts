"use client";

import { findPhrases, trackBeats, type StemAnalysis } from "./analysis";
import type { LaneClip } from "./studioStore";

// Laying a vocal onto a beat the way a producer would, rather than just
// dropping the whole take at one offset:
//
//   1. Listen to the beat: follow its actual hits, find which of them are
//      the downbeats (the "one" of each bar), and where the music is at
//      full strength — its intro and its end.
//   2. Listen to the vocal: cut it into phrases at its silences, find its
//      own beats and bar lines, and note where in its bar each phrase
//      starts (on the one, or a pickup just before it).
//   3. Place every phrase on the matching bar of the beat, keeping the
//      singer's timing inside the bar. Sections come in after the intro,
//      keep the original song's spacing, have long instrumental breaks
//      shortened, and don't run past the end of the beat.
//
// Pitch is never touched here. Placing phrase by phrase also re-locks the
// vocal to the beat's real hits every line, so two recordings whose tempos
// drift apart stay together, and cutting the silences out removes the
// faint bleed of the original song a separated vocal carries between lines.

/** Kept before each phrase (consonants start below the detection level). */
export const PRE_ROLL = 0.06;
/** Kept after each phrase, for the decay of the last word. */
export const TAIL = 0.18;
/** Silence (in bars) that starts a new section. */
const SECTION_GAP = 2;

/** Beat times with fractional positions between and beyond them. */
class BeatGrid {
  readonly times: Float64Array;
  readonly period: number;

  constructor(times: Float64Array, period: number) {
    this.times = times;
    this.period = period;
  }

  /** Fractional beat index at `t` seconds. */
  position(t: number): number {
    const { times, period } = this;
    const last = times.length - 1;
    if (t <= times[0]) return (t - times[0]) / period;
    if (t >= times[last]) return last + (t - times[last]) / period;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid;
    }
    return lo + (t - times[lo]) / (times[hi] - times[lo]);
  }

  /** Seconds at a fractional beat index. */
  time(position: number): number {
    const { times, period } = this;
    const last = times.length - 1;
    if (position <= 0) return times[0] + position * period;
    if (position >= last) return times[last] + (position - last) * period;
    const i = Math.floor(position);
    return times[i] + (position - i) * (times[i + 1] - times[i]);
  }
}

// Beat tracking is the slow part; a plan per anchor lane asks for the
// same stems at the same tempo more than once.
const gridCache = new WeakMap<StemAnalysis, Map<string, BeatGrid | null>>();

function beatGrid(analysis: StemAnalysis, bpm: number, tightness: number) {
  let byTempo = gridCache.get(analysis);
  if (!byTempo) gridCache.set(analysis, (byTempo = new Map()));
  const key = `${bpm.toFixed(3)}|${tightness}`;
  if (!byTempo.has(key)) {
    const times = trackBeats(analysis, bpm, tightness);
    byTempo.set(key, times.length >= 8 ? new BeatGrid(times, 60 / bpm) : null);
  }
  return byTempo.get(key)!;
}

const mod4 = (n: number) => ((n % 4) + 4) % 4;

function peakNear(values: Float32Array, rate: number, seconds: number, radius = 2) {
  const centre = Math.round(seconds * rate);
  let peak = 0;
  for (let i = centre - radius; i <= centre + radius; i++) peak = Math.max(peak, values[i] ?? 0);
  return peak;
}

function meanEnergy(analysis: StemAnalysis, from: number, to: number) {
  const { energy, onsetRate } = analysis;
  const a = Math.max(0, Math.floor(from * onsetRate));
  const b = Math.min(energy.length, Math.ceil(to * onsetRate));
  let sum = 0;
  for (let i = a; i < b; i++) sum += energy[i];
  return b > a ? sum / (b - a) : 0;
}

function normalised(values: number[]) {
  const max = Math.max(...values);
  return max > 0 ? values.map((v) => v / max) : values.map(() => 0);
}

function argmax(values: number[]) {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

export type BeatStructure = {
  grid: BeatGrid;
  /** Index of a downbeat in `grid`; bar j starts at beat `downbeat + 4j`. */
  downbeat: number;
  bars: number;
  /** Bars before the beat reaches full strength. */
  introBars: number;
  /** The bar after the last one with music in it. */
  endBar: number;
};

/**
 * How strongly each of the four beats of a bar reads as its "one": where
 * the kick lands hardest, and where the song changes — sections start on
 * a downbeat, so a jump in level between the bar before and the bar after
 * is strongest there. Scores, 0..2, indexed by beat number mod 4.
 */
function downbeatScores(analysis: StemAnalysis, grid: BeatGrid) {
  const { times } = grid;
  const n = times.length;
  const rate = analysis.onsetRate;
  const logEnergy: number[] = [];
  for (let i = 0; i + 1 < n; i++) logEnergy.push(Math.log10(meanEnergy(analysis, times[i], times[i + 1]) + 1e-10));
  const kick = [0, 0, 0, 0];
  const change = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) kick[i % 4] += peakNear(analysis.lowOnsets, rate, times[i]);
  for (let i = 4; i + 4 <= logEnergy.length; i++) {
    let before = 0;
    let after = 0;
    for (let j = 0; j < 4; j++) {
      before += logEnergy[i - 4 + j];
      after += logEnergy[i + j];
    }
    change[i % 4] += ((after - before) / 4) ** 2;
  }
  const kickScore = normalised(kick);
  const changeScore = normalised(change);
  return kickScore.map((k, i) => k + changeScore[i]);
}

/** Where a beat's bars are, and which of them carry the song. */
export function beatStructure(analysis: StemAnalysis, bpm: number): BeatStructure | null {
  const grid = beatGrid(analysis, bpm, 100);
  if (!grid) return null;
  const { times } = grid;
  const n = times.length;
  const downbeat = argmax(downbeatScores(analysis, grid));

  const bars = Math.floor((n - 1 - downbeat) / 4);
  if (bars < 2) return null;
  const barEnergy = Array.from({ length: bars }, (_, j) =>
    meanEnergy(analysis, times[downbeat + 4 * j], times[downbeat + 4 * j + 4])
  );
  const sorted = barEnergy.filter((e) => e > 0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  let introBars = 0;
  while (
    introBars < bars &&
    !(barEnergy[introBars] >= 0.5 * median && (barEnergy[introBars + 1] ?? median) >= 0.35 * median)
  ) {
    introBars++;
  }
  let endBar = bars;
  while (endBar > 0 && barEnergy[endBar - 1] < 0.25 * median) endBar--;
  if (introBars >= endBar) introBars = 0;
  return { grid, downbeat, bars, introBars, endBar };
}

type PlacedPhrase = {
  start: number;
  end: number;
  /** The vocal's bar this phrase belongs to (a pickup belongs to the bar it leads into). */
  bar: number;
  /** Where it starts relative to that bar's downbeat, in beats (negative = pickup). */
  inBeats: number;
  startBar: number;
  endBar: number;
};

type Section = { phrases: PlacedPhrase[]; bar: number; start: number; end: number };

/**
 * The vocal's phrases, grouped into sections and located in its bars.
 * With `guide` — the beat of the song the vocal was sung over — the bars
 * come from that beat's actual hits, which is exact. Without it they're
 * guessed from the voice alone, which only gets the tempo right: a voice
 * doesn't mark the beat clearly enough to find its phase.
 */
function vocalSections(analysis: StemAnalysis, bpm: number, guide: StemAnalysis | undefined) {
  const guideGrid = guide ? beatGrid(guide, bpm, 100) : null;
  const grid = guideGrid ?? beatGrid(analysis, bpm, 400);
  const phrases = findPhrases(analysis);
  if (!grid || phrases.length === 0) return null;

  let downbeat: number;
  if (guide && guideGrid) {
    // Found exactly as the backing beat's is, so both agree on what "the
    // one" sounds like.
    downbeat = argmax(downbeatScores(guide, guideGrid));
  } else {
    // From the voice alone: lines mostly start on the one or a beat or so
    // before it, the longer phrases counting for more, and stressed
    // syllables lean towards the downbeat.
    const fromPhrases = [0, 0, 0, 0];
    for (const p of phrases) {
      const f = grid.position(p.start);
      const weight = Math.min(4, p.end - p.start);
      for (let k = 0; k < 4; k++) {
        const untilDownbeat = mod4(k - f);
        const fit =
          untilDownbeat <= 0.25 || untilDownbeat >= 3.75 ? 1 : untilDownbeat <= 1.25 ? 0.6 : untilDownbeat <= 2.25 ? 0.25 : 0;
        fromPhrases[k] += weight * fit;
      }
    }
    const stress = [0, 0, 0, 0];
    grid.times.forEach((t, i) => (stress[i % 4] += peakNear(analysis.onsets, analysis.onsetRate, t)));
    const phraseScore = normalised(fromPhrases);
    const stressScore = normalised(stress);
    downbeat = argmax(phraseScore.map((s, k) => s + 0.3 * stressScore[k]));
  }

  const placed: PlacedPhrase[] = phrases.map((p) => {
    const f = grid.position(p.start);
    const startBar = (f - downbeat) / 4;
    // Up to 1.6 beats early is a pickup into the next bar.
    const bar = Math.floor(startBar + 0.4);
    return {
      ...p,
      bar,
      inBeats: f - (downbeat + 4 * bar),
      startBar,
      endBar: (grid.position(p.end) - downbeat) / 4,
    };
  });

  const sections: Section[] = [];
  for (const p of placed) {
    const current = sections[sections.length - 1];
    if (current && p.startBar - current.end < SECTION_GAP) {
      current.phrases.push(p);
      current.end = Math.max(current.end, p.endBar);
    } else {
      sections.push({ phrases: [p], bar: p.bar, start: p.startBar, end: p.endBar });
    }
  }
  return { sections, guided: !!guideGrid };
}

/**
 * Bar (on the beat) where each section starts. Gaps up to `keepGapsUpTo`
 * bars of silence stay as the original song had them — that spacing is
 * its arrangement. Longer breaks shrink to the next 4-bar line after a
 * bar's rest, so the sections still fall on phrase boundaries.
 */
function layout(sections: Section[], entry: number, keepGapsUpTo: number) {
  const targets = [entry];
  let shortened = 0;
  for (let s = 1; s < sections.length; s++) {
    const previous = sections[s - 1];
    const current = sections[s];
    const original = current.bar - previous.bar;
    let target = targets[s - 1] + original;
    if (current.start - previous.end > keepGapsUpTo) {
      const needed = previous.end - previous.bar + 1;
      const compact = targets[s - 1] + Math.ceil(needed / 4) * 4;
      if (compact < target) {
        shortened += target - compact;
        target = compact;
      }
    }
    targets.push(target);
  }
  const last = sections.length - 1;
  const end = targets[last] + (sections[last].end - sections[last].bar);
  return { targets, end, shortened };
}

/**
 * Without the vocal's own beat, its phase within the beat is unknown. The
 * best guess: slide it (by under half a beat) to where its syllables line
 * up with the most hits of the beat. Usually right, else off by an eighth
 * note — still on the grid. Returns seconds to add to every clip.
 */
function syllableLag(
  clips: { from: number; to: number; start: number }[],
  vocal: LaneInput,
  beat: LaneInput
) {
  const rate = vocal.analysis.onsetRate;
  const step = 1 / rate;
  // Vocal onsets along the timeline, sampled once per block.
  const samples: { t: number; v: number }[] = [];
  for (const clip of clips) {
    const length = (clip.to - clip.from) / vocal.tempoRatio;
    for (let t = 0; t < length; t += step) {
      const v = vocal.analysis.onsets[Math.round((clip.from + t * vocal.tempoRatio) * rate)] ?? 0;
      if (v > 0) samples.push({ t: clip.start + t, v });
    }
  }
  const beatOnsets = beat.analysis.onsets;
  const beatRate = beat.analysis.onsetRate;
  const halfBeat = 30 / beat.bpm / beat.tempoRatio;
  let best = 0;
  let bestScore = -1;
  for (let lag = -halfBeat; lag <= halfBeat; lag += step) {
    let score = 0;
    for (const { t, v } of samples) {
      score += v * (beatOnsets[Math.round((t + lag - beat.offsetSeconds) * beat.tempoRatio * beatRate)] ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

export type Arrangement = {
  offsetSeconds: number;
  clips: LaneClip[];
  lines: string[];
};

type LaneInput = {
  analysis: StemAnalysis;
  /** Source tempo, as read for matching (half/double already resolved). */
  bpm: number;
  tempoRatio: number;
  offsetSeconds: number;
  title: string;
  duration: number;
  /** A vocal's original beat (the other half of its song), for its bar lines. */
  guide?: StemAnalysis;
};

/**
 * Cuts `vocal` into phrases and lays them on `beat`'s bars. Both lanes
 * must already play at the same tempo. `projectBar` (seconds) is only used
 * to name bars in the report the way the ruler numbers them.
 */
export function arrangeVocal(
  vocal: LaneInput,
  beat: LaneInput,
  structure: BeatStructure,
  projectBar: number
): Arrangement | { error: string } {
  const heard = vocalSections(vocal.analysis, vocal.bpm, vocal.guide);
  if (!heard) return { error: `${vocal.title}: couldn't hear clear enough phrases to arrange` };
  const { sections, guided } = heard;

  const { grid, downbeat, introBars, endBar } = structure;
  const beatTimeline = (position: number) => beat.offsetSeconds + grid.time(position) / beat.tempoRatio;

  // In after the intro, on a 4-bar line — or after 4 bars, if the beat
  // starts at full strength, the way a song lets the groove land first.
  const preferred = introBars <= 1 ? 4 : Math.ceil((introBars - 1) / 4) * 4;
  const entries: number[] = [];
  for (let e = preferred; e >= 0; e -= 4) entries.push(e);
  if (entries[entries.length - 1] !== 0) entries.push(0);
  const fits = (end: number) => end <= endBar + 0.25;

  type Choice = { entry: number; kept: Section[]; keepGapsUpTo: number; plan: ReturnType<typeof layout> };
  let chosen: Choice | null = null;
  for (const keepGapsUpTo of [8, 2]) {
    for (const entry of entries) {
      const plan = layout(sections, entry, keepGapsUpTo);
      if (fits(plan.end)) {
        chosen = { entry, kept: sections, keepGapsUpTo, plan };
        break;
      }
    }
    if (chosen) break;
  }
  let dropped: Section[] = [];
  if (!chosen) {
    // Still too long for the beat: keep a short intro, and leave out the
    // sections at the end that don't fit.
    const entry = Math.min(preferred, endBar > 24 ? 4 : 0);
    let kept = sections;
    let plan = layout(kept, entry, 2);
    while (kept.length > 1 && !fits(plan.end)) {
      kept = kept.slice(0, -1);
      plan = layout(kept, entry, 2);
    }
    dropped = sections.slice(kept.length);
    chosen = { entry, kept, keepGapsUpTo: 2, plan };
  }
  const { kept, keepGapsUpTo, plan } = chosen;

  const place = (entry: number) => {
    const { targets } = layout(kept, entry, keepGapsUpTo);
    const placed: { clip: { from: number; to: number; start: number }; rigidError: number }[] = [];
    kept.forEach((section, s) => {
      const first = section.phrases[0];
      let firstStart = 0;
      section.phrases.forEach((p, i) => {
        let start: number;
        if (guided) {
          // Each phrase on its own bar, at the same spot in the bar it was sung.
          const bar = targets[s] + (p.bar - section.bar);
          start = beatTimeline(downbeat + 4 * bar + p.inBeats);
        } else {
          // The vocal's beat is only a guess, so keep each section as sung
          // and start it on the downbeat.
          start =
            i === 0
              ? beatTimeline(downbeat + 4 * targets[s])
              : firstStart + (p.start - first.start) / vocal.tempoRatio;
        }
        if (i === 0) firstStart = start;
        const from = Math.max(0, p.start - PRE_ROLL);
        const to = Math.min(vocal.duration, p.end + TAIL);
        const rigid = firstStart + (p.start - first.start) / vocal.tempoRatio;
        placed.push({
          clip: { from, to, start: start - (p.start - from) / vocal.tempoRatio },
          rigidError: Math.abs(start - rigid),
        });
      });
    });
    return placed;
  };

  let entry = chosen.entry;
  const placed = place(entry);
  if (!guided) {
    const lag = syllableLag(placed.map((p) => p.clip), vocal, beat);
    for (const p of placed) p.clip.start += lag;
  }
  // A pickup into bar 1 of a beat that starts right away would begin
  // before the timeline does; come in a bar later instead.
  if (placed.some((p) => p.clip.start < 0)) {
    const bar = 4 * (60 / beat.bpm / beat.tempoRatio);
    for (const p of placed) p.clip.start += bar;
    entry++;
  }

  placed.sort((a, b) => a.clip.start - b.clip.start);
  // A clip's tail never runs into the next phrase.
  for (let i = 0; i + 1 < placed.length; i++) {
    const current = placed[i].clip;
    const next = placed[i + 1].clip;
    const end = current.start + (current.to - current.from) / vocal.tempoRatio;
    if (end > next.start) {
      current.to = Math.max(current.from + 0.05, current.to - (end - next.start) * vocal.tempoRatio);
    }
  }

  const offsetSeconds = Math.max(0, placed[0].clip.start);
  const clips: LaneClip[] = placed.map(({ clip }) => ({
    from: clip.from,
    to: clip.to,
    at: Math.max(0, (clip.start - offsetSeconds) * vocal.tempoRatio),
  }));

  const rulerBar = (beatBar: number) => Math.round(beatTimeline(downbeat + 4 * beatBar) / projectBar) + 1;
  const phraseCount = placed.length;
  const lines: string[] = [];
  lines.push(
    `“${beat.title}”: ${introBars > 0 ? `${introBars}-bar intro, ` : ""}music runs to bar ${rulerBar(endBar)}`
  );
  lines.push(
    `${vocal.title}: cut into ${phraseCount} phrase${phraseCount === 1 ? "" : "s"} in ${kept.length} section${
      kept.length === 1 ? "" : "s"
    }, ${
      guided ? "each phrase on its own bar of the beat" : "each section on a bar of the beat"
    } — silences between lines removed (that's where the original song's bleed was)`
  );
  lines.push(
    `${vocal.title}: comes in on bar ${rulerBar(entry)}${entry > 0 ? `, after ${entry} bar${entry === 1 ? "" : "s"} of beat` : ""}`
  );
  if (plan.shortened > 0) {
    lines.push(`${vocal.title}: long instrumental gaps shortened by ${plan.shortened} bars in total`);
  }
  const drift = Math.max(...placed.map((p) => p.rigidError));
  if (!guided) {
    lines.push(
      `${vocal.title}: its original beat isn't in the library, so each section is kept as sung and started on a downbeat — nudge by a beat if the phrasing feels early or late`
    );
  } else if (drift > (60 / beat.bpm / beat.tempoRatio)) {
    lines.push(
      `“${beat.title}” speeds up and slows down (a live recording?) — each phrase starts on its own bar so the vocal follows it`
    );
  } else if (drift > 0.02) {
    lines.push(
      `${vocal.title}: phrases re-locked to the beat's real hits — up to ${Math.round(drift * 1000)} ms of drift corrected`
    );
  }
  if (dropped.length) {
    const seconds = dropped.reduce(
      (sum, s) => sum + s.phrases.reduce((t, p) => t + (p.end - p.start), 0),
      0
    );
    lines.push(
      `${vocal.title}: the last ${dropped.length} section${dropped.length === 1 ? "" : "s"} (~${Math.round(
        seconds / vocal.tempoRatio
      )} s of singing) didn't fit before the beat ends and ${dropped.length === 1 ? "was" : "were"} left out`
    );
  }
  return { offsetSeconds, clips, lines };
}
