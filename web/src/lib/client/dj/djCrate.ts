// The DJ's crate (/dj/crate): planning a set for an event the way a working
// DJ does — browse every song with its numbers (tempo, key on the Camelot
// wheel, energy, length), pick an event to get a starting set, see how well
// each song goes into the next, ask "what goes well after (or before) this
// one?", and add songs Remixt doesn't have yet (planned by hand, with
// whatever is known about them). Pure: no audio, no DOM — tested in
// tests/dj-crate.test.ts. Saved sets share SetBuilder's store, so the decks
// can play them (songs not in the library are skipped there).

import { camelotCode, keyFit, keyLabel, type KeyFit, type MusicalKey } from "../musicKey";
import { tempoGap, signedTempoGap, type BrowserEntry } from "./djLibrary";
import { buildSet, type SetShape } from "./djPlaylist";

/** A song in the crate: from the library, or planned by hand (not on Remixt yet). */
export type CrateSong = BrowserEntry & {
  /** Planned by hand: not in Remixt's library (yet). */
  outside?: boolean;
  /** Words to match events on: the song's tags, its genre. */
  tags?: string[];
  /** The DJ's own note ("first dance", "the bride's request"). */
  note?: string;
};

export const OUTSIDE_PREFIX = "out:";

/** A song typed in by hand. Tempo, key and length are optional: what's unknown just isn't scored. */
export function outsideSong(input: { title: string; artist?: string; bpm?: number | null; key?: MusicalKey | null; minutes?: number | null; genre?: string; note?: string }, id: string): CrateSong {
  const bpm = input.bpm && input.bpm >= 40 && input.bpm <= 250 ? Math.round(input.bpm * 10) / 10 : null;
  return {
    id: `${OUTSIDE_PREFIX}${id}`,
    source: "library",
    title: input.title.trim().slice(0, 120) || "Untitled",
    artist: (input.artist ?? "").trim().slice(0, 120),
    genre: (input.genre ?? "").trim().slice(0, 40) || "Not on Remixt",
    bpm,
    key: input.key ?? null,
    duration: input.minutes && input.minutes > 0 ? Math.round(input.minutes * 60) : null,
    layout: "two",
    analyzed: false,
    outside: true,
    tags: [],
    note: input.note?.trim().slice(0, 200) || undefined,
  };
}

// ——— energy ———

const HIGH_WORDS = ["edm", "house", "techno", "trance", "dance", "club", "drum", "dnb", "rave", "party", "hard", "trap", "dubstep", "reggaeton", "bandari"];
const LOW_WORDS = ["chill", "ambient", "lounge", "acoustic", "ballad", "lofi", "lo-fi", "piano", "jazz", "classical", "sad", "slow", "sonati", "traditional"];

/**
 * How much a song lifts a room, 1–10: mostly its tempo (half/double time
 * read as the feel between 85 and 170), nudged by words in its genre and
 * tags. A guess, said as one in the UI.
 */
export function energyOf(s: Pick<CrateSong, "bpm" | "genre" | "tags">): number | null {
  const words = `${s.genre} ${(s.tags ?? []).join(" ")}`.toLowerCase();
  let base: number | null = null;
  if (s.bpm) {
    let feel = s.bpm;
    while (feel < 85) feel *= 2;
    while (feel > 175) feel /= 2;
    // 85 BPM → 3, 128 → 7, 150+ → 9.
    base = 3 + ((Math.min(155, feel) - 85) / 70) * 6.5;
  }
  const high = HIGH_WORDS.some((w) => words.includes(w));
  const low = LOW_WORDS.some((w) => words.includes(w));
  if (base === null) {
    if (!high && !low) return null;
    base = high ? 7 : 3;
  } else base += high ? 1 : low ? -1.5 : 0;
  return Math.max(1, Math.min(10, Math.round(base)));
}

// ——— how two songs go together ———

export type Transition = {
  /** 0–100: how well `b` follows `a`. Null when neither tempo nor key is known. */
  score: number | null;
  level: "smooth" | "ok" | "rough" | "unknown";
  /** "Same key", "8A → 9A", "Key jump"… */
  keyText: string;
  keyFit: KeyFit | null;
  /** Tempo change, +0.03 = 3% faster (half/double time read as the same). */
  tempo: number | null;
  /** One line a DJ can act on. */
  tip: string;
};

const KEY_POINTS: Record<KeyFit, number> = { same: 50, relative: 45, neighbour: 40, far: 12, clash: 0 };

export function transition(a: Pick<CrateSong, "bpm" | "key">, b: Pick<CrateSong, "bpm" | "key">): Transition {
  const fit = a.key && b.key ? keyFit(a.key, b.key) : null;
  const gap = a.bpm && b.bpm ? tempoGap(a.bpm, b.bpm) : null;
  const tempo = a.bpm && b.bpm ? signedTempoGap(b.bpm, a.bpm) : null;
  if (fit === null && gap === null) {
    return { score: null, level: "unknown", keyText: "Key not known", keyFit: null, tempo: null, tip: "Listen first: tempo and key aren't known yet." };
  }
  // Tempo: 50 points within 2%, down to 0 at 12% apart.
  const tempoPoints = gap === null ? 30 : Math.max(0, 50 * (1 - Math.max(0, gap - 0.02) / 0.1));
  const keyPoints = fit === null ? 30 : KEY_POINTS[fit];
  const score = Math.round(tempoPoints + keyPoints);
  // Half a picture is never called smooth: with the tempo or the key unknown, "OK" at best.
  const partial = fit === null || gap === null;
  const level = score >= 75 && !partial ? "smooth" : score >= 50 ? "ok" : "rough";
  const keyText =
    fit === null ? "Key not known"
    : fit === "same" ? "Same key"
    : `${camelotCode(a.key!)} → ${camelotCode(b.key!)}${fit === "relative" ? " (relative)" : fit === "neighbour" ? " (next on the wheel)" : " (key jump)"}`;
  const tip =
    level === "smooth" ? "Long blend: beatmatch and fade over 16–32 bars."
    : partial && score >= 50 ? (fit === null ? "Tempos fit; the key isn't measured yet — check it by ear." : "Keys fit; the tempo isn't known yet.")
    : gap !== null && gap > 0.08 ? "Tempos far apart: cut on a phrase, or use an echo out."
    : fit === "far" || fit === "clash" ? "Keys clash: keep the overlap short, or bring the bass in late."
    : "Short blend over 8 bars.";
  return { score, level, keyText, keyFit: fit, tempo, tip };
}

// ——— events ———

export type DjEvent = {
  id: string;
  label: string;
  hint: string;
  shape: SetShape;
  /** The tempo range that suits it (feel, half/double time count). */
  bpm: [number, number];
  minutes: number;
  /** Genre/tag words that suit it. */
  words: string[];
};

export const EVENTS: DjEvent[] = [
  { id: "wedding", label: "Wedding", hint: "Dinner, first dance, then the dance floor", shape: "journey", bpm: [88, 128], minutes: 180, words: ["love", "pop", "dance", "persian", "wedding", "bandari", "romantic"] },
  { id: "party", label: "House party", hint: "Familiar songs that build", shape: "warmup", bpm: [95, 128], minutes: 120, words: ["pop", "hip hop", "rap", "dance", "party", "reggaeton"] },
  { id: "club", label: "Club night", hint: "High and steady, peak time", shape: "peak", bpm: [120, 132], minutes: 90, words: ["house", "techno", "edm", "dance", "club"] },
  { id: "birthday", label: "Birthday", hint: "Happy songs everyone knows", shape: "journey", bpm: [95, 125], minutes: 120, words: ["pop", "dance", "happy", "party"] },
  { id: "lounge", label: "Dinner / lounge", hint: "Low and warm, under conversation", shape: "steady", bpm: [80, 110], minutes: 120, words: ["chill", "lounge", "jazz", "acoustic", "lofi", "soul"] },
  { id: "corporate", label: "Corporate event", hint: "Upbeat but never in the way", shape: "steady", bpm: [95, 118], minutes: 90, words: ["pop", "funk", "soul", "disco"] },
  { id: "workout", label: "Workout / gym", hint: "Climbs and keeps pushing", shape: "warmup", bpm: [120, 150], minutes: 60, words: ["edm", "trap", "rock", "drum", "workout"] },
  { id: "opening", label: "Opening set", hint: "Warm the room for the headliner", shape: "warmup", bpm: [100, 122], minutes: 60, words: ["deep", "house", "chill", "groove"] },
];

/** How well a song suits an event, 0–1: its tempo in range (with some give), and matching words. */
export function eventFit(s: Pick<CrateSong, "bpm" | "genre" | "tags">, e: DjEvent): number {
  const words = `${s.genre} ${(s.tags ?? []).join(" ")}`.toLowerCase();
  const wordFit = e.words.some((w) => words.includes(w)) ? 1 : 0;
  if (!s.bpm) return 0.4 + 0.3 * wordFit;
  const [lo, hi] = e.bpm;
  // The closest of its half, own and double time to the range.
  const dist = Math.min(...[s.bpm / 2, s.bpm, s.bpm * 2].map((b) => (b < lo ? (lo - b) / lo : b > hi ? (b - hi) / hi : 0)));
  const tempoFit = Math.max(0, 1 - dist / 0.12);
  return Math.round((0.75 * tempoFit + 0.25 * wordFit) * 100) / 100;
}

/** A starting set for an event: the songs that suit it, chained key-to-key in its shape. */
export function buildEventSet(songs: CrateSong[], e: DjEvent, o: { minutes?: number; seed?: number } = {}): CrateSong[] {
  const suited = songs.filter((s) => eventFit(s, e) >= 0.6);
  const pool = suited.length >= 4 ? suited : songs;
  const byId = new Map(pool.map((s) => [s.id, s]));
  return buildSet(pool, { shape: e.shape, minutes: o.minutes ?? e.minutes, seed: o.seed }).map((step) => byId.get(step.entry.id)!).filter(Boolean);
}

// ——— suggestions ———

export type Suggestion = { song: CrateSong; score: number; why: string };

/**
 * Songs not in the set that go well at a place in it: after `set[at]`
 * ("next"), before it ("prev"), or between `set[at]` and `set[at + 1]`
 * ("between" — both blends count). An event, when chosen, adds its fit.
 */
export function suggest(songs: CrateSong[], set: CrateSong[], at: number, dir: "next" | "prev" | "between", o: { event?: DjEvent | null; count?: number } = {}): Suggestion[] {
  const used = new Set(set.map((s) => s.id));
  const here = set[at];
  if (!here) return [];
  const after = dir === "between" ? set[at + 1] : null;
  const out: Suggestion[] = [];
  for (const s of songs) {
    if (used.has(s.id)) continue;
    const t1 = dir === "prev" ? transition(s, here) : transition(here, s);
    const t2 = after ? transition(s, after) : null;
    const parts = [t1.score ?? 35, ...(t2 ? [t2.score ?? 35] : [])];
    let score = parts.reduce((a, b) => a + b, 0) / parts.length;
    if (o.event) score = score * 0.8 + eventFit(s, o.event) * 20;
    const tempo = t1.tempo !== null ? ` · ${t1.tempo >= 0 ? "+" : ""}${(t1.tempo * 100).toFixed(1)}%` : "";
    out.push({ song: s, score: Math.round(score), why: `${t1.keyText}${tempo}${t2 ? ` · into “${after!.title}”: ${t2.keyText}` : ""}` });
  }
  return out.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title)).slice(0, o.count ?? 6);
}

// ——— the set as a whole ———

export type SetSummary = {
  songs: number;
  seconds: number;
  /** Songs with no known length are counted at 3:20. */
  guessedLength: boolean;
  outside: number;
  transitions: Transition[];
  rough: number;
  /** Average transition score (known ones). */
  flow: number | null;
  bpmRange: [number, number] | null;
};

export function summarize(set: CrateSong[]): SetSummary {
  const transitions = set.slice(1).map((s, i) => transition(set[i], s));
  const known = transitions.filter((t) => t.score !== null);
  const bpms = set.map((s) => s.bpm).filter((b): b is number => !!b);
  return {
    songs: set.length,
    seconds: set.reduce((a, s) => a + (s.duration ?? 200), 0),
    guessedLength: set.some((s) => !s.duration),
    outside: set.filter((s) => s.outside).length,
    transitions,
    rough: transitions.filter((t) => t.level === "rough").length,
    flow: known.length ? Math.round(known.reduce((a, t) => a + t.score!, 0) / known.length) : null,
    bpmRange: bpms.length ? [Math.min(...bpms), Math.max(...bpms)] : null,
  };
}

/** Each song's tempo as it's mixed in this set: half or double time read at the feel of the set's middle tempo (a 185 next to 92s is a 92.5). */
export function playedTempos(set: Pick<CrateSong, "bpm">[]): (number | null)[] {
  const known = set.map((s) => s.bpm).filter((b): b is number => !!b).sort((a, b) => a - b);
  if (!known.length) return set.map(() => null);
  const mid = known[Math.floor(known.length / 2)];
  return set.map((s) => (s.bpm ? [s.bpm / 2, s.bpm, s.bpm * 2].reduce((best, x) => (Math.abs(Math.log(x / mid)) < Math.abs(Math.log(best / mid)) ? x : best)) : null));
}

/** "1:05:20" or "42:10". */
export function clock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The set as CSV for a spreadsheet or another DJ app. */
export function setCsv(set: CrateSong[]): string {
  const q = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = [["#", "Title", "Artist", "BPM", "Key", "Camelot", "Length", "Energy", "On Remixt", "Note"].join(",")];
  set.forEach((s, i) =>
    rows.push([
      i + 1, q(s.title), q(s.artist), s.bpm ? Math.round(s.bpm) : "", s.key ? q(keyLabel(s.key)) : "", s.key ? camelotCode(s.key) : "",
      s.duration ? clock(s.duration) : "", energyOf(s) ?? "", s.outside ? "no" : "yes", q(s.note ?? ""),
    ].join(","))
  );
  return rows.join("\n");
}

/** Keys that mix well with this one (same, relative, one step either way), as Camelot codes. */
export function friendlyKeys(key: MusicalKey): string[] {
  const code = camelotCode(key);
  const n = Number(code.slice(0, -1));
  const l = code.slice(-1);
  const wrap = (x: number) => ((x + 11) % 12) + 1;
  return [code, `${n}${l === "A" ? "B" : "A"}`, `${wrap(n - 1)}${l}`, `${wrap(n + 1)}${l}`];
}

/** A hue for a Camelot number (the wheel's colours), so neighbouring keys look alike. */
export function keyHue(key: MusicalKey | null): number | null {
  if (!key) return null;
  return ((Number(camelotCode(key).slice(0, -1)) - 1) * 30) % 360;
}

// ——— saved on the device (shared with SetBuilder) ———

export const SETS_STORE = "remixt-dj-sets";
export type SavedCrate = { name: string; shape: SetShape; ids: string[]; at: number; event?: string; outside?: CrateSong[]; notes?: Record<string, string> };

export function toSaved(name: string, set: CrateSong[], event: DjEvent | null, at: number): SavedCrate {
  const notes = Object.fromEntries(set.filter((s) => s.note).map((s) => [s.id, s.note!]));
  return {
    name: name.trim().slice(0, 60) || "My set",
    shape: event?.shape ?? "journey",
    ids: set.map((s) => s.id),
    at,
    event: event?.id,
    outside: set.filter((s) => s.outside),
    notes,
  };
}

/** A saved set back into songs: library songs by id (gone ones counted), planned ones as they were saved. */
export function fromSaved(saved: SavedCrate, library: CrateSong[]): { set: CrateSong[]; missing: number } {
  const byId = new Map(library.map((s) => [s.id, s]));
  for (const s of saved.outside ?? []) byId.set(s.id, { ...s, outside: true });
  const set: CrateSong[] = [];
  let missing = 0;
  for (const id of saved.ids) {
    const s = byId.get(id);
    if (s) set.push(saved.notes?.[id] ? { ...s, note: saved.notes[id] } : s);
    else missing++;
  }
  return { set, missing };
}
