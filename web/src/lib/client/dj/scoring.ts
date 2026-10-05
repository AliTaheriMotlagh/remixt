// Scoring a DJ run: while the decks run, a RunStats accumulates how well the
// two were blended; at the end scoreRun turns that into sub-scores (timing,
// tempo, EQ discipline, key, smoothness), a total out of 100 and stars.

import {
  bassClash,
  isAudible,
  keyRelation,
  onAirGain,
  phaseOffset,
  tempoDiffBpm,
} from "./djMath";
import { camelotCode } from "../musicKey";
import type { DjSnapshot } from "./djTypes";

export type SubScore = "timing" | "tempo" | "eq" | "key" | "smoothness" | "crowd";
export const SUB_SCORES: SubScore[] = ["timing", "tempo", "eq", "key", "smoothness", "crowd"];
export const SUB_SCORE_LABELS: Record<SubScore, string> = {
  timing: "Beat timing",
  tempo: "Tempo match",
  eq: "EQ discipline",
  key: "Key / harmony",
  smoothness: "Smoothness",
  crowd: "Crowd",
};
export type Weights = Partial<Record<SubScore, number>>;

export type RunStats = {
  elapsed: number;
  /** Seconds both decks were audible together. */
  overlap: number;
  timingSum: number;
  tempoSum: number;
  keySum: number;
  /** Seconds both decks' bass was open at once. */
  bassClash: number;
  /** Seconds nothing was audible while the run was going. */
  deadAir: number;
  /** Seconds the decks overlapped more than 120 ms apart. */
  trainWreck: number;
  /** Sudden jumps in volume / crossfader. */
  jolts: number;
  /** A crowd score 0..100 (averaged energy etc.) set by the club scenario. */
  crowdScore: number | null;
  prevLevels: { A: number; B: number; xf: number; master: number } | null;
  prevTime: number;
};

export const newStats = (): RunStats => ({
  elapsed: 0,
  overlap: 0,
  timingSum: 0,
  tempoSum: 0,
  keySum: 0,
  bassClash: 0,
  deadAir: 0,
  trainWreck: 0,
  jolts: 0,
  crowdScore: null,
  prevLevels: null,
  prevTime: 0,
});

const KEY_CREDIT = { same: 1, relative: 1, neighbour: 0.9, far: 0.55, clash: 0.12 } as const;

/** Adds `dt` seconds of the current state to the stats. */
export function accumulate(stats: RunStats, snap: DjSnapshot, dt: number) {
  const { A, B } = snap.decks;
  stats.elapsed += dt;
  const audA = isAudible(A, "A", snap.mix);
  const audB = isAudible(B, "B", snap.mix);
  if (!audA && !audB) stats.deadAir += dt;

  // Beatmatching happens with one deck in the headphones, so timing and
  // tempo count whenever both are playing; bass only when both are on air.
  if (A.track && B.track && A.playing && B.playing) {
    stats.overlap += dt;
    const ms = Math.abs(phaseOffset(A, B).ms);
    stats.timingSum += dt * Math.max(0, 1 - ms / 150);
    if (ms > 120) stats.trainWreck += dt;
    stats.tempoSum += dt * Math.max(0, 1 - Math.abs(tempoDiffBpm(A, B)) / 4);
    const rel = keyRelation(A, B, camelotCode);
    if (rel) stats.keySum += dt * KEY_CREDIT[rel.fit] * (rel.detuneCents > 60 ? 0.85 : 1);
    else stats.keySum += dt;
    if (audA && audB && bassClash(snap)) stats.bassClash += dt;
  }

  // Jolts: a deck's on-air level (or the master) jumping a lot within a tick.
  const levels = {
    A: onAirGain(A, "A", snap.mix),
    B: onAirGain(B, "B", snap.mix),
    xf: snap.mix.crossfader,
    master: snap.mix.master,
  };
  if (stats.prevLevels && dt > 0 && dt < 0.5) {
    const p = stats.prevLevels;
    const jump = (a: number, b: number, limit: number) => Math.abs(a - b) > limit;
    // Only count a slam that changes what the crowd hears while something is playing.
    if ((audA || audB) && (jump(levels.A, p.A, 0.55) || jump(levels.B, p.B, 0.55) || jump(levels.master, p.master, 0.5))) stats.jolts++;
  }
  stats.prevLevels = levels;
  stats.prevTime = snap.time;
}

export type Score = {
  total: number;
  parts: Record<SubScore, number | null>;
  stars: 0 | 1 | 2 | 3;
};

export const STAR_THRESHOLDS = [60, 80, 92] as const;

export function starsFor(total: number): 0 | 1 | 2 | 3 {
  return total >= STAR_THRESHOLDS[2] ? 3 : total >= STAR_THRESHOLDS[1] ? 2 : total >= STAR_THRESHOLDS[0] ? 1 : 0;
}

const MIN_OVERLAP = 2;

export function subScores(stats: RunStats): Record<SubScore, number | null> {
  const has = stats.overlap >= MIN_OVERLAP;
  const pct = (v: number) => Math.round(clamp100(v));
  return {
    timing: has ? pct((stats.timingSum / stats.overlap) * 100) : null,
    tempo: has ? pct((stats.tempoSum / stats.overlap) * 100) : null,
    eq: has ? pct(100 - (stats.bassClash / stats.overlap) * 130) : null,
    key: has ? pct((stats.keySum / stats.overlap) * 100) : null,
    smoothness: stats.elapsed > 3 ? pct(100 - stats.jolts * 10 - (stats.deadAir / stats.elapsed) * 160) : null,
    crowd: stats.crowdScore === null ? null : pct(stats.crowdScore),
  };
}

function clamp100(v: number) {
  return Math.min(100, Math.max(0, v));
}

/**
 * The weighted average of the sub-scores a mission cares about (the ones
 * that were measurable). `completion` (0..1) scales it, so an unfinished
 * mission can't get full marks.
 */
export function scoreRun(stats: RunStats, weights: Weights, completion = 1): Score {
  const parts = subScores(stats);
  let sum = 0;
  let total = 0;
  for (const k of SUB_SCORES) {
    const w = weights[k] ?? 0;
    const v = parts[k];
    if (w > 0 && v !== null) {
      sum += w * v;
      total += w;
    }
  }
  // Nothing measurable (e.g. a mission about pressing buttons): judge smoothness only.
  const raw = total > 0 ? sum / total : parts.smoothness ?? 100;
  const final = Math.round(clamp100(raw * (0.5 + 0.5 * Math.min(1, Math.max(0, completion)))));
  return { total: final, parts, stars: completion >= 1 ? starsFor(final) : 0 };
}

export const RANKS = [
  { id: "rookie", label: "Rookie", minStars: 0 },
  { id: "pilot", label: "Booth Pilot", minStars: 6 },
  { id: "resident", label: "Resident", minStars: 14 },
  { id: "headliner", label: "Headliner", minStars: 22 },
] as const;

export function rankForStars(stars: number) {
  let rank: (typeof RANKS)[number] = RANKS[0];
  for (const r of RANKS) if (stars >= r.minStars) rank = r;
  return rank;
}
