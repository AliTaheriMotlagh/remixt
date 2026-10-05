// The track browser's logic, for demo songs and songs from the shared
// library alike: what a row knows about a track (tempo and key may be
// unknown until a library song has been analysed), how well it fits the
// track on the other deck, search and sort. Also the bits of track analysis
// that turn a library song's raw beats and energy into a DJ beat grid and
// sections. Pure: no audio, no DOM.

import { camelotCode, keyFit, type MusicalKey } from "../musicKey";
import type { SectionName } from "../demoSongDefs";
import type { StemLayout, TrackInfo, TrackSource } from "./djTypes";

export const LIBRARY_PREFIX = "lib:";
export const libraryTrackId = (trackId: string) => `${LIBRARY_PREFIX}${trackId}`;
export const isLibraryId = (id: string) => id.startsWith(LIBRARY_PREFIX);
export const libraryTrackKey = (id: string) => id.slice(LIBRARY_PREFIX.length);

/** One row of the browser. */
export type BrowserEntry = {
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  genre: string;
  /** Null until known (a library song with no stored tempo, before analysis). */
  bpm: number | null;
  key: MusicalKey | null;
  duration: number | null;
  layout: StemLayout;
  /** True once the song's audio has been analysed (tempo and key are measured, not stored). */
  analyzed: boolean;
};

export function entryFromTrack(t: TrackInfo): BrowserEntry {
  return {
    id: t.id,
    source: t.source ?? "demo",
    title: t.title,
    artist: t.artist,
    genre: t.genre,
    bpm: t.bpm,
    key: t.key,
    duration: t.duration,
    layout: t.layout ?? "four",
    analyzed: true,
  };
}

// --------------------------------------------------------- compatibility

/** How far apart two tempos are, as a fraction, reading half and double time as the same. */
export function tempoGap(bpm: number, other: number) {
  if (!(bpm > 0) || !(other > 0)) return Infinity;
  let best = Infinity;
  for (const f of [0.5, 1, 2]) {
    const g = Math.abs(Math.log((bpm * f) / other));
    if (g < best) best = g;
  }
  return Math.exp(best) - 1;
}

/** The gap with its sign (positive: `bpm` is faster), for "+4%" labels. */
export function signedTempoGap(bpm: number, other: number) {
  let best = bpm;
  for (const f of [0.5, 1, 2]) if (Math.abs(Math.log((bpm * f) / other)) < Math.abs(Math.log(best / other))) best = bpm * f;
  return best / other - 1;
}

export const TEMPO_TOLERANCE = 0.06;

export function tempoCompatible(bpm: number | null, other: number | null, tolerance = TEMPO_TOLERANCE) {
  if (bpm === null || other === null) return null;
  return tempoGap(bpm, other) <= tolerance + 1e-9;
}

/** Same Camelot code, its A/B twin, or one step either way round the wheel. */
export function keyCompatible(key: MusicalKey | null, other: MusicalKey | null) {
  if (!key || !other) return null;
  const f = keyFit(key, other);
  return f === "same" || f === "relative" || f === "neighbour";
}

export type Fit = {
  tempo: boolean | null;
  key: boolean | null;
  /** Both known and both fine. */
  compatible: boolean;
  /** Nothing known says it doesn't fit (unknowns count as maybe). */
  possible: boolean;
  /** Higher is better: for ordering suggestions. */
  score: number;
};

export function fitWith(entry: Pick<BrowserEntry, "bpm" | "key">, other: { bpm: number | null; key: MusicalKey | null } | null): Fit | null {
  if (!other) return null;
  const tempo = tempoCompatible(entry.bpm, other.bpm);
  const key = keyCompatible(entry.key, other.key);
  const gap = entry.bpm !== null && other.bpm !== null ? tempoGap(entry.bpm, other.bpm) : 0.1;
  const keyScore = entry.key && other.key ? { same: 3, relative: 3, neighbour: 2, far: 0.5, clash: 0 }[keyFit(entry.key, other.key)] : 1;
  return {
    tempo,
    key,
    compatible: tempo === true && key === true,
    possible: tempo !== false && key !== false,
    score: keyScore * 2 + Math.max(0, 1 - gap / 0.12) * 3,
  };
}

// ---------------------------------------------------------- search, sort

export type SortKey = "title" | "bpm" | "key" | "artist" | "duration";

export type BrowserQuery = {
  text: string;
  sort: SortKey;
  descending: boolean;
  /** Only rows that may fit the other deck. */
  compatibleOnly: boolean;
  other: { bpm: number | null; key: MusicalKey | null } | null;
};

/** Camelot order: 1A, 1B, 2A … 12B; unknown keys last. */
function camelotRank(key: MusicalKey | null) {
  if (!key) return 1e6;
  const code = camelotCode(key);
  const n = Number.parseInt(code, 10);
  return n * 2 + (code.endsWith("B") ? 1 : 0);
}

function matches(e: BrowserEntry, text: string) {
  if (!text) return true;
  const hay = `${e.title} ${e.artist} ${e.genre} ${e.key ? camelotCode(e.key) : ""} ${e.bpm ? Math.round(e.bpm) : ""}`.toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/** The rows to show, filtered and sorted. Unknown values always sort last. */
export function browse(entries: BrowserEntry[], q: BrowserQuery): BrowserEntry[] {
  const rows = entries.filter((e) => matches(e, q.text.trim()) && (!q.compatibleOnly || !q.other || fitWith(e, q.other)?.possible));
  const dir = q.descending ? -1 : 1;
  const value = (e: BrowserEntry): number | string | null => {
    switch (q.sort) {
      case "bpm":
        return e.bpm;
      case "key":
        return e.key ? camelotRank(e.key) : null;
      case "duration":
        return e.duration;
      case "artist":
        return e.artist.toLowerCase();
      default:
        return e.title.toLowerCase();
    }
  };
  return rows.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return a.title.localeCompare(b.title);
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return c !== 0 ? c * dir : a.title.localeCompare(b.title);
  });
}

// ------------------------------------------------- grid from real beats

/**
 * The beat grid's anchor from tracked beats: a song's grid is a straight
 * line (like Rekordbox's default grid), so take the phase most of the
 * tracked beats agree on, which a few wrong or missing beats can't move.
 * Returns seconds within the first beat period, or `fallback` if there are
 * too few beats to tell.
 */
export function gridPhase(beats: ArrayLike<number>, bpm: number, fallback: number) {
  const period = 60 / bpm;
  if (beats.length < 8 || !(period > 0)) return fallback;
  // Circular mean of each beat's phase, then the median around it.
  let sx = 0;
  let sy = 0;
  const phases: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    const ph = (((beats[i] % period) + period) % period) / period;
    phases.push(ph);
    sx += Math.cos(ph * 2 * Math.PI);
    sy += Math.sin(ph * 2 * Math.PI);
  }
  const mean = (Math.atan2(sy, sx) / (2 * Math.PI) + 1) % 1;
  const offsets = phases.map((p) => p - mean - Math.round(p - mean)).sort((a, b) => a - b);
  const med = offsets[Math.floor(offsets.length / 2)];
  const phase = (((mean + med) % 1) + 1) % 1;
  return phase * period;
}

/**
 * Which of the four beats in a bar is the "one": the one where the low end
 * (kick and bass) hits hardest on average. `lowAt(t)` reads low-band onset
 * strength at a time. Returns 0–3: how many beats after `phase` the first
 * downbeat falls.
 */
export function downbeatOffset(phase: number, bpm: number, duration: number, lowAt: (t: number) => number) {
  const period = 60 / bpm;
  const sums = [0, 0, 0, 0];
  let k = 0;
  for (let t = phase; t < duration; t += period, k++) sums[k % 4] += lowAt(t);
  let best = 0;
  for (let i = 1; i < 4; i++) if (sums[i] > sums[best] * 1.04) best = i;
  return best;
}

/**
 * Sections for a library song from its energy per bar: 8-bar blocks
 * labelled by how loud they are compared with the rest of the song (the
 * loudest are "chorus", the quietest "break"; the ends are intro/outro).
 * Gives the crowd and the overview something to read.
 */
export function sectionsFromEnergy(barEnergy: ArrayLike<number>): TrackInfo["sections"] {
  const bars = barEnergy.length;
  if (bars === 0) return [];
  const block = 8;
  const blocks: { startBar: number; bars: number; energy: number }[] = [];
  for (let s = 0; s < bars; s += block) {
    const n = Math.min(block, bars - s);
    let sum = 0;
    for (let i = s; i < s + n; i++) sum += barEnergy[i];
    blocks.push({ startBar: s, bars: n, energy: sum / n });
  }
  const sorted = blocks.map((b) => b.energy).sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const norm = (e: number) => (hi - lo > 1e-12 ? (e - lo) / (hi - lo) : 0.6);
  const highCut = sorted[Math.floor(sorted.length * 0.7)];
  return blocks.map((b, i) => {
    const energy = Math.round((0.25 + 0.75 * norm(b.energy)) * 100) / 100;
    let name: SectionName = "verse";
    if (i === 0) name = "intro";
    else if (i === blocks.length - 1 && blocks.length > 2) name = "outro";
    else if (b.energy >= highCut && energy > 0.7) name = "chorus";
    else if (energy < 0.45) name = "break";
    return { name, startBar: b.startBar, bars: b.bars, energy };
  });
}
