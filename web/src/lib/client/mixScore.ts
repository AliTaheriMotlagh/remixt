"use client";

import { clipEnd, clipsOf, normaliseLane } from "./clipEdit";
import { adviseShift, sourceAt, timelinesOf } from "./harmony";
import { harmonyOf, ideaFits, keysNow, type Idea, type Session } from "./aiIdeas";
import { keyFit } from "./musicKey";
import { beatLength, type StudioLane } from "./studioStore";
import { isBacking } from "@/lib/stemKinds";

// The AI producer's ears. Every idea it has is a guess about what will
// sound good; this listens to the result — without playing it — and says
// how good it is, the way a producer would: do the two move at one speed,
// do the vocal's syllables land on the beat's grid, do its lines start on
// bar lines, are its notes in the beat's chords, is the vocal neither
// buried nor shouting, has anything been bent far enough to sound
// processed, do they end together. `bestVersions` runs every idea through
// it and keeps the ones that score highest: the AI auditioning its own
// ideas before playing you one.

export type ScorePart = {
  id: "tempo" | "groove" | "bars" | "harmony" | "balance" | "natural" | "ending";
  label: string;
  /** 0..1 */
  score: number;
  /** How much it counts towards the total. */
  weight: number;
  /** What was heard, in plain words. */
  text: string;
};

export type MixScore = {
  /** 0..100 */
  total: number;
  parts: ScorePart[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The strongest onsets of a stem (syllables, for a vocal), in its own seconds, with their strength. */
function strongOnsets(onsets: Float32Array, rate: number): { t: number; w: number }[] {
  const values = Array.from(onsets).filter((v) => v > 0).sort((a, b) => a - b);
  const threshold = values[Math.floor(values.length * 0.9)] ?? Infinity;
  const found: { t: number; w: number }[] = [];
  for (let i = 2; i < onsets.length - 2; i++) {
    const v = onsets[i];
    if (v < threshold || v < onsets[i - 1] || v < onsets[i + 1] || v < onsets[i - 2] || v < onsets[i + 2]) continue;
    found.push({ t: i / rate, w: v });
  }
  return found;
}

const onsetCache = new WeakMap<Float32Array, { t: number; w: number }[]>();

/** Scores a mix: `lanes` as they would be, against what the session heard. */
export function scoreMix(session: Session, lanes: StudioLane[]): MixScore {
  const parts: ScorePart[] = [];
  const { pair } = session;
  const vocal = (session.vocal && lanes.find((l) => l.laneId === session.vocal!.laneId)) ?? null;
  const beat = (session.beat && lanes.find((l) => l.laneId === session.beat!.laneId)) ?? null;

  if (pair && vocal && beat) {
    // Tempo: one speed, or drifting apart.
    const off = Math.abs(Math.log((pair.reading * vocal.tempoRatio) / (pair.beatBpm * beat.tempoRatio)));
    parts.push({
      id: "tempo",
      label: "Same speed",
      score: clamp01(1 - off / 0.03),
      weight: 0.2,
      text: off < 0.005 ? "vocal and beat at one tempo" : `${(off * 100).toFixed(1)}% apart — they drift`,
    });

    // Groove: is the vocal timed as well as it could be against the beat's
    // 16th-note grid? Sung syllables aren't all on 16ths, so this compares
    // how they land now with how they'd land nudged a little either way.
    // (Vocals over their own songs' beats, as recorded, score ~0.86 of
    // their best nudge on average; 60 ms off, ~0.5.)
    let onsets = onsetCache.get(pair.vocalAnalysis.onsets);
    if (!onsets) onsetCache.set(pair.vocalAnalysis.onsets, (onsets = strongOnsets(pair.vocalAnalysis.onsets, pair.vocalAnalysis.onsetRate)));
    const { grid, downbeat } = pair.structure;
    const landing: { at: number; w: number }[] = [];
    for (const { t, w } of onsets) for (const at of timelinesOf(vocal, t)) landing.push({ at, w });
    const onGrid = (lag: number) => {
      let hit = 0;
      let total = 0;
      for (const { at, w } of landing) {
        const source = sourceAt(beat, at + lag);
        if (source === null) continue;
        const position = grid.position(source);
        const sixteenth = Math.abs(position * 4 - Math.round(position * 4)) / 4; // in beats
        const seconds = (sixteenth * grid.period) / beat.tempoRatio;
        hit += w * Math.exp(-((seconds / 0.03) ** 2));
        total += w;
      }
      return total > 0 ? hit / total : 0;
    };
    // At two speeds the lines drift through the beat: nothing lands, however it's nudged.
    const drifting = off >= 0.012;
    if (drifting) {
      parts.push({ id: "groove", label: "On the beat", score: 0, weight: 0.2, text: "the lines can't land on the beat until the speeds match" });
    } else if (landing.length >= 20) {
      const now = onGrid(0);
      let best = now;
      let bestLag = 0;
      for (let lag = -0.06; lag <= 0.0601; lag += 0.005) {
        const v = onGrid(lag);
        if (v > best) {
          best = v;
          bestLag = lag;
        }
      }
      const ratio = best > 0 ? now / best : 0;
      // A syllable's measured onset (the vowel) lands ~25 ms after the beat
      // it's sung on, so a best nudge of up to ~45 ms earlier is in the pocket.
      const offBy = bestLag < -0.045 ? bestLag + 0.025 : bestLag > 0.015 ? bestLag : 0;
      parts.push({
        id: "groove",
        label: "On the beat",
        score: clamp01((ratio - 0.55) / 0.4),
        weight: 0.2,
        text:
          ratio >= 0.9
            ? "the vocal's syllables sit in the beat's pocket"
            : offBy
              ? `the vocal sits ~${Math.round(Math.abs(offBy) * 1000)} ms ${offBy < 0 ? "late" : "early"} against the beat — a nudge ${offBy < 0 ? "earlier" : "later"} tightens it`
              : "syllables sit loosely on the beat's grid",
      });
    }

    // Bars: lines start on a bar line or as a pickup into one.
    const starts = vocal.clips?.length ? vocal.clips.map((c) => ({ source: c.from })) : [];
    let onBar = 0;
    let lines = 0;
    for (const { source } of starts) {
      for (const at of timelinesOf(vocal, source + 0.06)) {
        const b = sourceAt(beat, at);
        if (b === null) continue;
        const intoBar = (((grid.position(b) - downbeat) % 4) + 4) % 4; // 0..4 beats past the one
        onBar += intoBar < 0.4 || intoBar > 2.4 ? 1 : intoBar < 1.2 ? 0.6 : 0.2;
        lines++;
      }
    }
    if (drifting) {
      parts.push({ id: "bars", label: "Lines on the bars", score: 0, weight: 0.1, text: "lines drift across the bar lines" });
    } else if (lines > 0) {
      parts.push({
        id: "bars",
        label: "Lines on the bars",
        score: onBar / lines,
        weight: 0.1,
        text: onBar / lines > 0.75 ? "lines start on the bar lines" : "some lines start mid-bar",
      });
    } else {
      parts.push({ id: "bars", label: "Lines on the bars", score: 0.5, weight: 0.1, text: "one long take — its lines aren't placed on bars" });
    }

    // Harmony: measured when there's a melody, else the key labels.
    const scan = harmonyOf(session, { vocal, beat });
    if (scan) {
      const advice = adviseShift(scan);
      parts.push({
        id: "harmony",
        label: "In tune",
        score: clamp01((scan.now.inChord - 0.3) / 0.4),
        weight: 0.25,
        text: `${pct(scan.now.inChord)} of the sung notes in the beat's chords${advice.shift ? ` (${advice.shift > 0 ? "+" : ""}${advice.shift} st would make it ${pct(advice.best.inChord)})` : ""}`,
      });
    } else {
      const { vocalKey, beatKey } = keysNow(pair, vocal, beat);
      const fit = keyFit(vocalKey, beatKey);
      parts.push({
        id: "harmony",
        label: "In tune",
        score: { same: 1, relative: 1, neighbour: 0.8, far: 0.45, clash: 0.1 }[fit],
        weight: 0.25,
        text: `keys ${fit === "same" || fit === "relative" ? "match" : fit === "neighbour" ? "are neighbours" : fit === "far" ? "rub" : "clash"} (no clear melody to measure)`,
      });
    }

    // Natural: how far anything has been bent.
    const bend = Math.max(Math.abs(Math.log(vocal.tempoRatio)), Math.abs(Math.log(beat.tempoRatio)));
    const pitch = Math.abs(vocal.pitchSemitones);
    parts.push({
      id: "natural",
      label: "Natural sound",
      score: clamp01(1 - Math.max(0, bend - 0.04) / 0.2) * clamp01(1 - Math.max(0, pitch - 2) / 5),
      weight: 0.1,
      text: bend < 0.04 && pitch <= 2 ? "barely stretched or re-keyed" : `stretched ${(bend * 100).toFixed(0)}%, ${pitch ? `${pitch} st re-keyed` : "not re-keyed"}`,
    });
  }

  // Balance: the vocal a touch over the beat.
  if (vocal && beat) {
    const vl = session.analyses.get(vocal.laneId)?.loudness ?? 0;
    const bl = session.analyses.get(beat.laneId)?.loudness ?? 0;
    if (vl > 0 && bl > 0) {
      const ratio = (vl * vocal.volume) / (bl * beat.volume) / 1.12;
      const off = Math.abs(Math.log(ratio));
      parts.push({
        id: "balance",
        label: "Balance",
        score: clamp01(1 - Math.max(0, off - 0.15) / 0.8),
        weight: 0.1,
        text: ratio < 0.75 ? "the vocal is buried" : ratio > 1.5 ? "the vocal is much louder than the beat" : "vocal sits just over the beat",
      });
    }
  }

  // Ending: they finish together.
  const vocals = lanes.filter((l) => l.kind === "vocals" && !l.muted);
  const backing = lanes.filter((l) => isBacking(l.kind) && !l.muted);
  if (vocals.length && backing.length) {
    const bar = beatLength(session.projectBpm) * 4;
    const vEnd = Math.max(...vocals.map((l) => Math.max(...clipsOf(l).map((c) => clipEnd(l, c)))));
    const bEnd = Math.max(...backing.map((l) => Math.max(...clipsOf(l).map((c) => clipEnd(l, c)))));
    parts.push({
      id: "ending",
      label: "Ending",
      score: vEnd > bEnd + bar ? 0.2 : bEnd - vEnd > 8 * bar ? 0.7 : 1,
      weight: 0.05,
      text: vEnd > bEnd + bar ? "the vocal sings on after the beat stops" : bEnd - vEnd > 8 * bar ? "the beat plays on long after the singing" : "they end together",
    });
  }

  const weight = parts.reduce((s, p) => s + p.weight, 0);
  const total = weight > 0 ? Math.round((100 * parts.reduce((s, p) => s + p.score * p.weight, 0)) / weight) : 0;
  return { total, parts };
}

/** The lanes as they'd be with `idea` on, starting from the session's mix. */
export function lanesWith(session: Session, idea: Idea): StudioLane[] {
  const remove = new Set(idea.lanes?.remove ?? []);
  const lanes = [...session.lanes.filter((l) => !remove.has(l.laneId)), ...(idea.lanes?.add ?? [])];
  return lanes.map((lane) => {
    const patch = idea.patches[lane.laneId];
    return patch ? normaliseLane({ ...lane, ...patch, offsetSeconds: Math.max(0, patch.offsetSeconds ?? lane.offsetSeconds) }) : lane;
  });
}

export type Version = { idea: Idea; score: MixScore };

/**
 * Every idea that sets the whole timing (Make it sound good, the sync
 * templates, the styles, the fixes), scored as it would sound — best
 * first. With `limit`, only that many.
 */
export function bestVersions(session: Session, ideas: Idea[], limit = 5): { now: MixScore; versions: Version[] } {
  const now = scoreMix(session, session.lanes);
  const contenders = ideas.filter((i) => (i.kind === "auto" || i.kind === "sync" || i.kind === "full" || i.kind === "fix") && ideaFits(i, session.lanes));
  const versions = contenders
    .map((idea) => ({ idea, score: scoreMix({ ...session, projectBpm: idea.projectBpm ?? session.projectBpm }, lanesWith(session, idea)) }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, limit);
  return { now, versions };
}

/** For the Mix check's header: the score in a word. */
export function scoreWord(total: number) {
  return total >= 85 ? "Sounds great" : total >= 70 ? "Sounds good" : total >= 50 ? "Getting there" : "Needs work";
}
