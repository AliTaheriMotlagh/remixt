// The Examples lab with real songs from the library: picking a musical
// excerpt on a song's bar lines, which of its bars are sung, and ranking
// library beats for a vocal by tempo and key. Pure (no audio, no DOM), so
// the tests can check the arithmetic.

import { nearestReading, type PairSettings } from "./examplesMatch";
import { bestKeyShift, camelotCode, keyFit, type KeyFit, type MusicalKey } from "./musicKey";

/** Song ids in the lab: a demo song's id as is, a library song's as `lib:<trackId>`. */
export const LIBRARY_PREFIX = "lib:";
export const isLibraryId = (id: string) => id.startsWith(LIBRARY_PREFIX);
export const libraryId = (trackId: string) => `${LIBRARY_PREFIX}${trackId}`;
export const trackIdOf = (id: string) => (isLibraryId(id) ? id.slice(LIBRARY_PREFIX.length) : null);

/** A stored or measured tempo for display: whole numbers as is, else one decimal. */
export function bpmLabel(bpm: number) {
  const whole = Math.round(bpm);
  return Math.abs(bpm - whole) < 0.05 ? String(whole) : bpm.toFixed(1);
}

export function durationLabel(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// --- Bars and excerpts -------------------------------------------------------

export type TimeSpan = { start: number; end: number };

/**
 * Bar lines (seconds) from tracked beats and the index of one downbeat:
 * every fourth beat, counting back to the start of the song too.
 */
export function barLinesFromBeats(times: ArrayLike<number>, downbeat: number): number[] {
  const out: number[] = [];
  for (let i = ((downbeat % 4) + 4) % 4; i < times.length; i += 4) out.push(times[i]);
  return out;
}

/** An even grid of bar lines through `anchor`, covering 0…duration. */
export function constantBarLines(anchor: number, barSec: number, duration: number): number[] {
  if (!(barSec > 0)) return [0];
  const first = anchor - Math.floor(anchor / barSec) * barSec;
  const out: number[] = [];
  for (let t = first; t < duration; t += barSec) out.push(t);
  return out.length ? out : [0];
}

/**
 * The first phrase long enough to carry a line (at least `minBars` of a
 * bar), so a stray breath or ad-lib near the top isn't taken as the
 * vocal's entry. Falls back to the longest phrase.
 */
export function firstStrongPhrase(phrases: TimeSpan[], barSec: number, minBars = 0.75): TimeSpan | null {
  if (phrases.length === 0) return null;
  const strong = phrases.find((p) => p.end - p.start >= barSec * minBars);
  return strong ?? phrases.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
}

export type Excerpt = { start: number; end: number; bars: number };

/**
 * A `bars`-long excerpt starting on a bar line: the last bar line at or
 * just after `target` (a sixteenth of a bar of slack, so a line sung a
 * hair early still starts its own bar; a pickup a beat early starts the
 * bar before). Moved back a bar at a time if it would run off the end.
 */
export function alignExcerpt(o: { barLines: number[]; barSec: number; target: number; duration: number; bars: number }): Excerpt {
  const { barSec, target, duration, bars } = o;
  const lines = o.barLines.filter((t) => t >= 0 && t < duration);
  if (lines.length === 0) lines.push(0);
  let i = 0;
  for (let k = 0; k < lines.length; k++) if (lines[k] <= target + barSec / 16) i = k;
  const length = bars * barSec;
  while (i > 0 && lines[i] + length > duration + 0.01) i--;
  const start = lines[i];
  return { start, end: Math.min(duration, start + length), bars };
}

/** Per bar of an excerpt: is the voice singing in at least `minFraction` of it? */
export function sungBars(phrases: TimeSpan[], start: number, barSec: number, bars: number, minFraction = 0.25): boolean[] {
  return Array.from({ length: bars }, (_, j) => {
    const a = start + j * barSec;
    const b = a + barSec;
    let sung = 0;
    for (const p of phrases) sung += Math.max(0, Math.min(b, p.end) - Math.max(a, p.start));
    return sung >= barSec * minFraction;
  });
}

// --- Suggesting a beat -------------------------------------------------------

export type KnownSong = {
  id: string;
  title: string;
  bpm: number;
  key: MusicalKey;
  /** A real song the team featured (with its credit): recipes prefer these. */
  featured?: boolean;
};

export type BeatSuggestion = {
  id: string;
  /** Lower is better. */
  score: number;
  level: "great" | "good" | "stretch";
  stretchPct: number;
  readingNote: "as written" | "double-time" | "half-time";
  fit: KeyFit;
  /** Pitch shift the vocal needs (0 when the keys already sit together). */
  semitones: number;
  reasons: string[];
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** How well `beat` carries `vocal` (the beat keeps its tempo), with the reasons in words. */
export function scoreBeatForVocal(vocal: { bpm: number; key: MusicalKey }, beat: KnownSong): BeatSuggestion {
  const reading = nearestReading(vocal.bpm, beat.bpm);
  const readingNote = Math.abs(reading - vocal.bpm) < 1e-9 ? "as written" : reading > vocal.bpm ? "double-time" : "half-time";
  const stretchPct = Math.abs(beat.bpm / reading - 1) * 100;
  const fit = keyFit(vocal.key, beat.key);
  const shift = bestKeyShift(vocal.key, beat.key);
  const blends = fit === "same" || fit === "relative" || fit === "neighbour";
  const semitones = blends ? 0 : shift.semitones;

  const tempoCost = stretchPct / 3 + (readingNote === "as written" ? 0 : 0.5);
  const keyCost = fit === "same" || fit === "relative" ? 0 : fit === "neighbour" ? 0.75 : 1 + Math.abs(semitones) * 0.5;
  const score = tempoCost + keyCost;

  const reasons: string[] = [];
  const vb = bpmLabel(vocal.bpm);
  const bb = bpmLabel(beat.bpm);
  const half =
    readingNote === "as written" ? "" : `, with the vocal counted ${readingNote === "double-time" ? "double" : "half"} time (${vb} → ${bpmLabel(reading)})`;
  reasons.push(
    stretchPct < 0.5
      ? `Tempo: already together (${bb} BPM)${half}`
      : `Tempo: ${vb} → ${bb} BPM, a ${stretchPct.toFixed(1)}% stretch${half}`
  );
  const vc = camelotCode(vocal.key);
  const bc = camelotCode(beat.key);
  reasons.push(
    fit === "same"
      ? `Key: the same key (${bc}), no pitch shift`
      : fit === "relative"
        ? `Key: relative keys (${vc} + ${bc}), the same seven notes`
        : fit === "neighbour"
          ? `Key: Camelot neighbours (${vc} → ${bc}), blends with no shift`
          : `Key: ${vc} against ${bc} clashes; pitching the vocal ${signed(semitones)} fixes it`
  );
  const level = score < 1.5 ? "great" : score < 3.5 ? "good" : "stretch";
  return { id: beat.id, score, level, stretchPct, readingNote, fit, semitones, reasons };
}

/** The best `limit` beats for a vocal, best first. */
export function rankBeats(vocal: { bpm: number; key: MusicalKey }, beats: KnownSong[], limit = 3): BeatSuggestion[] {
  return beats
    .map((b) => scoreBeatForVocal(vocal, b))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

/**
 * The `n` candidates nearest in tempo (half/double counted), from what's
 * cheap to know before any audio is decoded; songs with no tempo yet go last.
 */
export function nearestInTempo<T extends { bpm: number | null }>(vocalBpm: number, candidates: T[], n: number): T[] {
  const cost = (c: T) => (c.bpm == null || !(c.bpm > 0) ? Infinity : Math.abs(Math.log(c.bpm / nearestReading(vocalBpm, c.bpm))));
  return [...candidates].sort((a, b) => cost(a) - cost(b)).slice(0, n);
}

// --- Recipes from the library -----------------------------------------------

export type LibraryRecipe = {
  id: string;
  tag: string;
  title: string;
  why: string;
  settings: PairSettings;
  vocal: KnownSong;
  beat: KnownSong;
  suggestion: BeatSuggestion;
};

/**
 * Up to three pairings from analysed library songs, each teaching one idea:
 * the best same-key pair, a half/double-time pair, and one a small pitch
 * shift fixes. A kind is left out when no pair qualifies. Pairs of featured
 * songs win over pairs with one, which win over pairs with none; within
 * that, the best fit.
 */
export function libraryRecipes(songs: KnownSong[]): LibraryRecipe[] {
  const pairs: { vocal: KnownSong; beat: KnownSong; s: BeatSuggestion }[] = [];
  for (const vocal of songs) {
    for (const beat of songs) {
      if (vocal.id === beat.id) continue;
      pairs.push({ vocal, beat, s: scoreBeatForVocal(vocal, beat) });
    }
  }
  type Pair = (typeof pairs)[number];
  const featuredCount = (p: Pair) => Number(!!p.vocal.featured) + Number(!!p.beat.featured);
  const best = (ok: (p: Pair) => boolean, by: (p: Pair) => number) =>
    pairs.filter(ok).sort((a, b) => featuredCount(b) - featuredCount(a) || by(a) - by(b))[0];

  const out: LibraryRecipe[] = [];
  const sameKey = best(
    (p) => (p.s.fit === "same" || p.s.fit === "relative") && p.s.readingNote === "as written" && p.s.stretchPct <= 10,
    (p) => p.s.stretchPct
  );
  if (sameKey) {
    const { vocal, beat, s } = sameKey;
    out.push({
      id: `lib-same-${vocal.id}-${beat.id}`,
      tag: "Same notes",
      title: `${vocal.title} over ${beat.title}: no pitch shift at all`,
      why: `${s.fit === "same" ? "Both are in the same key" : "Their keys are relatives, with the same seven notes"} (${camelotCode(vocal.key)} and ${camelotCode(beat.key)}), and only ${s.stretchPct.toFixed(1)}% apart in tempo. The best pair your library has: nothing to fix but a small stretch.`,
      settings: { vocalId: vocal.id, beatId: beat.id, mode: "beat", semitones: "auto" },
      vocal,
      beat,
      suggestion: s,
    });
  }
  const halfTime = best((p) => p.s.readingNote !== "as written" && p.s.stretchPct <= 8, (p) => p.s.score);
  if (halfTime) {
    const { vocal, beat, s } = halfTime;
    out.push({
      id: `lib-half-${vocal.id}-${beat.id}`,
      tag: "Half-time",
      title: `${bpmLabel(vocal.bpm)} against ${bpmLabel(beat.bpm)} BPM: closer than it looks`,
      why: `As numbers, ${vocal.title} and ${beat.title} are far apart. Count the vocal ${s.readingNote === "double-time" ? "double" : "half"} time and the gap is only ${s.stretchPct.toFixed(1)}%: each of its bars spans ${s.readingNote === "double-time" ? "two" : "half"} of the beat's.`,
      settings: { vocalId: vocal.id, beatId: beat.id, mode: "beat", semitones: "auto" },
      vocal,
      beat,
      suggestion: s,
    });
  }
  const pitchFix = best(
    (p) => (p.s.fit === "far" || p.s.fit === "clash") && Math.abs(p.s.semitones) >= 1 && Math.abs(p.s.semitones) <= 3 && p.s.stretchPct <= 10,
    (p) => Math.abs(p.s.semitones) * 4 + p.s.stretchPct
  );
  if (pitchFix) {
    const { vocal, beat, s } = pitchFix;
    out.push({
      id: `lib-pitch-${vocal.id}-${beat.id}`,
      tag: "Key fix",
      title: `Pitch ${vocal.title} ${signed(s.semitones)} to sit on ${beat.title}`,
      why: `Close in tempo, but ${camelotCode(vocal.key)} against ${camelotCode(beat.key)} clashes. A ${Math.abs(s.semitones)}-semitone shift puts the vocal on the beat's notes: small enough that the voice still sounds like itself. Hear Raw, then Matched.`,
      settings: { vocalId: vocal.id, beatId: beat.id, mode: "beat", semitones: "auto" },
      vocal,
      beat,
      suggestion: s,
    });
  }
  return out;
}
