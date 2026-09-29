"use client";

import { findPhrases, trackBeats, type Phrase, type StemAnalysis } from "./analysis";
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
/** Longest a section runs before the next line starts a new one, in bars. */
const BLOCK_BARS = 8;

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
  /** Mean power of each bar. */
  barEnergy: number[];
  /** Bars before the beat reaches full strength. */
  introBars: number;
  /** The bar after the last one with music in it. */
  endBar: number;
  /** 0..1 — how clearly the chosen downbeat beat the runner-up. */
  downbeatConfidence: number;
};

/** Below this, which beat is "the one" was a close call — worth saying so. */
export const UNSURE_DOWNBEAT = 0.15;

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

/** How far the best score is ahead of the runner-up, 0..1. */
function margin(scores: number[]) {
  const [best, second] = [...scores].sort((a, b) => b - a);
  return best > 0 ? (best - second) / best : 0;
}

/** Where a beat's bars are, and which of them carry the song. */
export function beatStructure(analysis: StemAnalysis, bpm: number): BeatStructure | null {
  const grid = beatGrid(analysis, bpm, 100);
  if (!grid) return null;
  const { times } = grid;
  const n = times.length;
  const scores = downbeatScores(analysis, grid);
  const downbeat = argmax(scores);

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
  return { grid, downbeat, bars, barEnergy, introBars, endBar, downbeatConfidence: margin(scores) };
}

type PlacedPhrase = {
  start: number;
  end: number;
  /** Position of `start` and `end` on the vocal's beat grid, in beats. */
  startBeat: number;
  endBeat: number;
  /** The vocal's bar this phrase belongs to (a pickup belongs to the bar it leads into). */
  bar: number;
  /** Where it starts relative to that bar's downbeat, in beats (negative = pickup). */
  inBeats: number;
  startBar: number;
  endBar: number;
  /** Cut out of a longer phrase at this end: no pre-roll/tail there, the audio runs on. */
  joinedBefore: boolean;
  joinedAfter: boolean;
};

export type Section = {
  phrases: PlacedPhrase[];
  /** The vocal's bar the section starts on, and its span in (fractional) bars. */
  bar: number;
  start: number;
  end: number;
};

export type HeardVocal = {
  sections: Section[];
  /** The vocal's beats (from its original beat when guided). */
  grid: BeatGrid;
  /** Whether the bars came from the vocal's original beat (exact) or its voice (a guess). */
  guided: boolean;
  downbeatConfidence: number;
};

/**
 * Cuts phrases longer than four bars at their quietest moment near every
 * other bar line (a breath, usually) — so each piece gets re-locked to
 * the beat and stretched to its local tempo, instead of drifting over a
 * long unbroken take.
 */
function splitLongPhrases(analysis: StemAnalysis, grid: BeatGrid, downbeat: number, phrases: Phrase[]) {
  const out: (Phrase & { joinedBefore: boolean; joinedAfter: boolean })[] = [];
  const { energy, onsetRate } = analysis;
  for (const p of phrases) {
    const first = grid.position(p.start);
    const last = grid.position(p.end);
    if (last - first <= 16) {
      out.push({ ...p, joinedBefore: false, joinedAfter: false });
      continue;
    }
    const cuts: number[] = [];
    // Bar lines two bars apart, at least a bar in from either end.
    for (let bar = Math.ceil((first - downbeat) / 4) + 2; downbeat + 4 * bar < last - 4; bar += 2) {
      const line = grid.time(downbeat + 4 * bar);
      const reach = grid.period;
      let quietest = line;
      let lowest = Infinity;
      for (let t = line - reach; t <= line + reach; t += 1 / onsetRate) {
        const e = energy[Math.round(t * onsetRate)] ?? Infinity;
        if (e < lowest) {
          lowest = e;
          quietest = t;
        }
      }
      cuts.push(quietest);
    }
    const bounds = [p.start, ...cuts.filter((c) => c > p.start + 0.5 && c < p.end - 0.5), p.end];
    for (let i = 0; i + 1 < bounds.length; i++) {
      out.push({
        start: bounds[i],
        end: bounds[i + 1],
        joinedBefore: i > 0,
        joinedAfter: i + 2 < bounds.length,
      });
    }
  }
  return out;
}

/**
 * The vocal's phrases, grouped into sections and located in its bars.
 * With `guide` — the beat of the song the vocal was sung over — the bars
 * come from that beat's actual hits, which is exact. Without it they're
 * guessed from the voice alone, which only gets the tempo right: a voice
 * doesn't mark the beat clearly enough to find its phase.
 */
export function hearVocal(analysis: StemAnalysis, bpm: number, guide: StemAnalysis | undefined): HeardVocal | null {
  const guideGrid = guide ? beatGrid(guide, bpm, 100) : null;
  const grid = guideGrid ?? beatGrid(analysis, bpm, 400);
  const found = findPhrases(analysis);
  if (!grid || found.length === 0) return null;

  let downbeat: number;
  let downbeatConfidence: number;
  if (guide && guideGrid) {
    // Found exactly as the backing beat's is, so both agree on what "the
    // one" sounds like.
    const scores = downbeatScores(guide, guideGrid);
    downbeat = argmax(scores);
    downbeatConfidence = margin(scores);
  } else {
    // From the voice alone: lines mostly start on the one or a beat or so
    // before it, the longer phrases counting for more, and stressed
    // syllables lean towards the downbeat.
    const fromPhrases = [0, 0, 0, 0];
    for (const p of found) {
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
    const scores = phraseScore.map((s, k) => s + 0.3 * stressScore[k]);
    downbeat = argmax(scores);
    downbeatConfidence = margin(scores);
  }

  const phrases = guideGrid
    ? splitLongPhrases(analysis, grid, downbeat, found)
    : found.map((p) => ({ ...p, joinedBefore: false, joinedAfter: false }));
  const placed: PlacedPhrase[] = phrases.map((p) => {
    const startBeat = grid.position(p.start);
    const endBeat = grid.position(p.end);
    const startBar = (startBeat - downbeat) / 4;
    // Up to 1.6 beats early is a pickup into the next bar.
    const bar = Math.floor(startBar + 0.4);
    return {
      ...p,
      startBeat,
      endBeat,
      bar,
      inBeats: startBeat - (downbeat + 4 * bar),
      startBar,
      endBar: (endBeat - downbeat) / 4,
    };
  });

  // A section runs until two bars of silence — or, since verse runs into
  // chorus without a pause, until it's eight bars long and a new line
  // starts: blocks the size songs are built from, which can then be moved,
  // repeated or left out one at a time.
  const sections: Section[] = [];
  for (const p of placed) {
    const current = sections[sections.length - 1];
    if (current && p.startBar - current.end < SECTION_GAP && p.bar - current.bar < BLOCK_BARS) {
      current.phrases.push(p);
      current.end = Math.max(current.end, p.endBar);
    } else {
      sections.push({ phrases: [p], bar: p.bar, start: p.startBar, end: p.endBar });
    }
  }
  return { sections, grid, guided: !!guideGrid, downbeatConfidence };
}

/** Whole bars a section takes from its downbeat to its last word. */
export function sectionBars(section: Section) {
  return Math.max(1, Math.ceil(section.end - section.bar - 0.05));
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

/** One section of the vocal on one bar of the beat. */
export type SectionPlacement = { section: number; bar: number };

export type SuggestedLayout = {
  placements: SectionPlacement[];
  entry: number;
  /** Bars of long instrumental gaps taken out. */
  shortened: number;
  /** Sections left out because the beat ends first. */
  dropped: number[];
};

/**
 * The arrangement AI Match picks on its own: in after the intro, the
 * original song's spacing, long breaks shortened, and the sections that
 * don't fit before the beat ends left out.
 */
export function suggestLayout(heard: HeardVocal, structure: BeatStructure): SuggestedLayout {
  const { sections } = heard;
  const { introBars, endBar } = structure;
  // In after the intro, on a 4-bar line — or after 4 bars, if the beat
  // starts at full strength, the way a song lets the groove land first.
  const preferred = introBars <= 1 ? 4 : Math.ceil((introBars - 1) / 4) * 4;
  const entries: number[] = [];
  for (let e = preferred; e >= 0; e -= 4) entries.push(e);
  if (entries[entries.length - 1] !== 0) entries.push(0);
  const fits = (end: number) => end <= endBar + 0.25;
  const result = (entry: number, kept: number, plan: ReturnType<typeof layout>): SuggestedLayout => ({
    placements: plan.targets.map((bar, section) => ({ section, bar })),
    entry,
    shortened: plan.shortened,
    dropped: sections.slice(kept).map((_, i) => kept + i),
  });

  for (const keepGapsUpTo of [8, 2]) {
    for (const entry of entries) {
      const plan = layout(sections, entry, keepGapsUpTo);
      if (fits(plan.end)) return result(entry, sections.length, plan);
    }
  }
  // Still too long for the beat: keep a short intro, and leave out the
  // sections at the end that don't fit.
  const entry = Math.min(preferred, endBar > 24 ? 4 : 0);
  let kept = sections.length;
  let plan = layout(sections, entry, 2);
  while (kept > 1 && !fits(plan.end)) {
    kept--;
    plan = layout(sections.slice(0, kept), entry, 2);
  }
  return result(entry, kept, plan);
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

export type LaneInput = {
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

/** How far a phrase may be sped up or slowed down to follow the beat's local tempo. */
const MAX_PHRASE_STRETCH = 0.08;
/** Tempo differences smaller than this are left alone — not worth re-rendering for. */
const MIN_PHRASE_STRETCH = 0.01;

/**
 * Seconds per beat around `position`, over eight beats either side — wide
 * enough that the wobble of single tracked beats averages out and only a
 * real change of tempo remains.
 */
function localPeriod(grid: BeatGrid, position: number) {
  return (grid.time(position + 8) - grid.time(position - 8)) / 16;
}

export type Placement = {
  offsetSeconds: number;
  clips: LaneClip[];
  /** Largest gap between where a phrase went and where playing the section straight through would put it. */
  drift: number;
  /** Largest per-phrase speed change, as a fraction (0.03 = 3%). */
  maxStretch: number;
};

/**
 * Turns "this section on that bar" choices into clips. With the vocal's
 * own bars known, every phrase goes on its bar at the spot in the bar it
 * was sung, and is stretched a little so it ends where the beat's own
 * tempo says it should; without, each section is kept as sung. `shiftBeats`
 * moves the whole vocal against the bar lines — for when the one was misread.
 */
export function placeVocal(
  vocal: LaneInput,
  beat: LaneInput,
  structure: BeatStructure,
  heard: HeardVocal,
  placements: SectionPlacement[],
  shiftBeats = 0
): Placement | null {
  const { grid, downbeat } = structure;
  const beatTimeline = (position: number) => beat.offsetSeconds + grid.time(position) / beat.tempoRatio;

  type Piece = { from: number; to: number; start: number; stretch: number; rigidError: number };
  const lay = (shift: number) => {
    const pieces: Piece[] = [];
    for (const { section: index, bar: target } of placements) {
      const section = heard.sections[index];
      if (!section) continue;
      const first = section.phrases[0];
      let firstStart = 0;
      section.phrases.forEach((p, i) => {
        let start: number;
        let stretch = 1;
        if (heard.guided) {
          // Each phrase on its own bar, at the same spot in the bar it was sung…
          const position = downbeat + 4 * (target + p.bar - section.bar) + p.inBeats + shift;
          start = beatTimeline(position);
          // …at the speed the beat is going there, if that's drifted from its average.
          const middle = (p.endBeat - p.startBeat) / 2;
          const sung = localPeriod(heard.grid, p.startBeat + middle) / vocal.tempoRatio;
          const played = localPeriod(grid, position + middle) / beat.tempoRatio;
          stretch = sung / played;
          if (Math.abs(stretch - 1) < MIN_PHRASE_STRETCH) stretch = 1;
          stretch = Math.min(1 + MAX_PHRASE_STRETCH, Math.max(1 - MAX_PHRASE_STRETCH, stretch));
        } else {
          // The vocal's beat is only a guess, so keep each section as sung
          // and start it on the downbeat.
          start =
            i === 0
              ? beatTimeline(downbeat + 4 * target + shift)
              : firstStart + (p.start - first.start) / vocal.tempoRatio;
        }
        if (i === 0) firstStart = start;
        const from = p.joinedBefore ? p.start : Math.max(0, p.start - PRE_ROLL);
        const to = p.joinedAfter ? p.end : Math.min(vocal.duration, p.end + TAIL);
        const rigid = firstStart + (p.start - first.start) / vocal.tempoRatio;
        pieces.push({
          from,
          to,
          start: start - (p.start - from) / (vocal.tempoRatio * stretch),
          stretch,
          rigidError: Math.abs(start - rigid),
        });
      });
    }
    if (!heard.guided && pieces.length) {
      const lag = syllableLag(pieces, vocal, beat);
      for (const piece of pieces) piece.start += lag;
    }
    return pieces;
  };

  let pieces = lay(shiftBeats);
  if (pieces.length === 0) return null;
  // A pickup into bar 1 of a beat that starts right away would begin
  // before the timeline does; come in a bar later instead.
  if (pieces.some((p) => p.start < 0)) pieces = lay(shiftBeats + 4);

  pieces.sort((a, b) => a.start - b.start);
  // A clip's tail never runs into the next phrase.
  const speed = (p: Piece) => vocal.tempoRatio * p.stretch;
  for (let i = 0; i + 1 < pieces.length; i++) {
    const current = pieces[i];
    const next = pieces[i + 1];
    const end = current.start + (current.to - current.from) / speed(current);
    if (end > next.start) current.to = Math.max(current.from + 0.05, current.to - (end - next.start) * speed(current));
  }

  const offsetSeconds = Math.max(0, pieces[0].start);
  return {
    offsetSeconds,
    clips: pieces.map((p) => ({
      from: p.from,
      to: p.to,
      at: Math.max(0, (p.start - offsetSeconds) * vocal.tempoRatio),
      ...(p.stretch !== 1 ? { stretch: p.stretch } : {}),
    })),
    drift: Math.max(...pieces.map((p) => p.rigidError)),
    maxStretch: Math.max(...pieces.map((p) => Math.abs(p.stretch - 1))),
  };
}

/** The ruler's bar number (1-based) for a bar of the beat. */
export function rulerBar(beat: LaneInput, structure: BeatStructure, beatBar: number, projectBar: number) {
  const seconds = beat.offsetSeconds + structure.grid.time(structure.downbeat + 4 * beatBar) / beat.tempoRatio;
  return Math.round(seconds / projectBar) + 1;
}

/** Report lines on how sure the bar lines are and how hard the phrases were bent. */
export function placementNotes(
  vocal: LaneInput,
  beat: LaneInput,
  structure: BeatStructure,
  heard: HeardVocal,
  placement: Placement
) {
  const lines: string[] = [];
  if (!heard.guided) {
    lines.push(
      `${vocal.title}: its original beat isn't in the library, so each section is kept as sung and started on a downbeat — nudge by a beat if the phrasing feels early or late`
    );
  } else if (placement.maxStretch > 0.02) {
    lines.push(
      `${vocal.title}: “${beat.title}” speeds up and slows down, so phrases are stretched up to ${(
        placement.maxStretch * 100
      ).toFixed(1)}% each to follow it`
    );
  } else if (placement.drift > 0.02) {
    lines.push(
      `${vocal.title}: phrases re-locked to the beat's real hits — up to ${Math.round(placement.drift * 1000)} ms of drift corrected`
    );
  }
  if (structure.downbeatConfidence < UNSURE_DOWNBEAT || heard.downbeatConfidence < UNSURE_DOWNBEAT) {
    const which = structure.downbeatConfidence < UNSURE_DOWNBEAT ? `“${beat.title}”` : `${vocal.title}'s original beat`;
    lines.push(
      `⚠ Couldn't tell for sure where the bar starts in ${which} — if the vocal feels half a bar early or late, use +½bar or −½bar on its lane`
    );
  }
  return lines;
}

export type Arrangement = {
  offsetSeconds: number;
  clips: LaneClip[];
  lines: string[];
};

/**
 * Cuts `vocal` into phrases and lays them on `beat`'s bars the way AI
 * Match decides on its own. Both lanes must already play at the same
 * tempo. `projectBar` (seconds) is only used to name bars in the report
 * the way the ruler numbers them.
 */
export function arrangeVocal(
  vocal: LaneInput,
  beat: LaneInput,
  structure: BeatStructure,
  projectBar: number
): Arrangement | { error: string } {
  const heard = hearVocal(vocal.analysis, vocal.bpm, vocal.guide);
  if (!heard) return { error: `${vocal.title}: couldn't hear clear enough phrases to arrange` };
  const suggestion = suggestLayout(heard, structure);
  const placement = placeVocal(vocal, beat, structure, heard, suggestion.placements);
  if (!placement) return { error: `${vocal.title}: couldn't hear clear enough phrases to arrange` };

  const { sections } = heard;
  const kept = suggestion.placements.length;
  const phraseCount = placement.clips.length;
  const lines: string[] = [];
  lines.push(
    `“${beat.title}”: ${structure.introBars > 0 ? `${structure.introBars}-bar intro, ` : ""}music runs to bar ${rulerBar(
      beat,
      structure,
      structure.endBar,
      projectBar
    )}`
  );
  lines.push(
    `${vocal.title}: cut into ${phraseCount} phrase${phraseCount === 1 ? "" : "s"} in ${kept} section${
      kept === 1 ? "" : "s"
    }, ${
      heard.guided ? "each phrase on its own bar of the beat" : "each section on a bar of the beat"
    } — silences between lines removed (that's where the original song's bleed was)`
  );
  const entryBar = suggestion.entry;
  lines.push(
    `${vocal.title}: comes in on bar ${rulerBar(beat, structure, entryBar, projectBar)}${
      entryBar > 0 ? `, after ${entryBar} bar${entryBar === 1 ? "" : "s"} of beat` : ""
    }`
  );
  if (suggestion.shortened > 0) {
    lines.push(`${vocal.title}: long instrumental gaps shortened by ${suggestion.shortened} bars in total`);
  }
  lines.push(...placementNotes(vocal, beat, structure, heard, placement));
  if (suggestion.dropped.length) {
    const seconds = suggestion.dropped.reduce(
      (sum, i) => sum + sections[i].phrases.reduce((t, p) => t + (p.end - p.start), 0),
      0
    );
    const n = suggestion.dropped.length;
    lines.push(
      `${vocal.title}: the last ${n} section${n === 1 ? "" : "s"} (~${Math.round(
        seconds / vocal.tempoRatio
      )} s of singing) didn't fit before the beat ends and ${n === 1 ? "was" : "were"} left out`
    );
  }
  return { offsetSeconds: placement.offsetSeconds, clips: placement.clips, lines };
}
