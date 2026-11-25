// Playlists for DJs: a set built from the library the way a DJ plans one —
// each song mixes into the next (key on the Camelot wheel, tempo within
// reach, half and double time counting), and the tempo follows a shape:
// a warm-up that climbs, a peak-time set that holds high, a journey that
// rises and comes back down, or a steady groove. Pure (no audio, no DOM),
// tested in tests/dj-playlist.test.ts. Saved sets live on the device
// (djPlaylistStore.ts).

import { camelotCode, keyFit } from "../musicKey";
import type { BrowserEntry } from "./djLibrary";

export type SetShape = "warmup" | "peak" | "journey" | "steady";

export const SET_SHAPES: { id: SetShape; label: string; hint: string }[] = [
  { id: "warmup", label: "Warm-up", hint: "Starts slow, climbs" },
  { id: "peak", label: "Peak time", hint: "Fast and holds it" },
  { id: "journey", label: "Journey", hint: "Up, then back down" },
  { id: "steady", label: "Steady groove", hint: "One tempo all night" },
];

export type SetStep = {
  entry: BrowserEntry;
  /** How it goes in from the song before: "Same key", "+1 on the wheel"… (empty for the first). */
  why: string;
  /** Tempo change from the song before, as a fraction (+0.03 = 3% faster). */
  tempoStep: number;
};

/** Where in the set's tempo range a song at position `t` (0…1) should sit, 0 = slowest, 1 = fastest. */
export function shapeAt(shape: SetShape, t: number): number {
  if (shape === "warmup") return t;
  if (shape === "peak") return 0.7 + 0.3 * Math.min(1, t * 3);
  if (shape === "journey") return t < 0.65 ? t / 0.65 : 1 - ((t - 0.65) / 0.35) * 0.7;
  return 0.5;
}

const KEY_POINTS = { same: 4, relative: 3.5, neighbour: 3, far: 0.6, clash: 0 } as const;

/** How a key change sounds, for the list ("Same key", "8A → 9A"). */
export function keyStepText(a: BrowserEntry, b: BrowserEntry): string {
  if (!a.key || !b.key) return "Key not measured yet";
  const fit = keyFit(a.key, b.key);
  if (fit === "same") return "Same key";
  if (fit === "relative") return `Relative key (${camelotCode(a.key)} → ${camelotCode(b.key)})`;
  if (fit === "neighbour") return `One step on the wheel (${camelotCode(a.key)} → ${camelotCode(b.key)})`;
  return `Key jump (${camelotCode(a.key)} → ${camelotCode(b.key)}) — keep the blend short`;
}

/**
 * The tempo a song plays at next to `ref`: itself, halved or doubled (or
 * twice over — a stored tempo is sometimes read at a quarter or four times
 * the feel), whichever is closest.
 */
function alignedBpm(bpm: number, ref: number) {
  return [bpm / 4, bpm / 2, bpm, bpm * 2, bpm * 4].reduce((best, x) => (Math.abs(Math.log(x / ref)) < Math.abs(Math.log(best / ref)) ? x : best));
}

/** How far apart two tempos are as played together (see alignedBpm), as a fraction. */
function playedGap(bpm: number, ref: number) {
  return Math.abs(alignedBpm(bpm, ref) / ref - 1);
}

/**
 * A set of up to `count` songs (or as many as fill `minutes`), from
 * `entries`, starting with `startId` when given. Greedy: each next song is
 * the one that mixes best out of the last and sits nearest the tempo the
 * shape wants there. Songs without a known tempo go last, if they're needed.
 */
export function buildSet(
  entries: BrowserEntry[],
  o: { shape: SetShape; count?: number; minutes?: number; startId?: string | null; seed?: number }
): SetStep[] {
  const pool = entries.filter((e) => (e.duration ?? 0) >= 60 || e.duration === null);
  if (!pool.length) return [];
  const known = pool.filter((e) => e.bpm);
  const bpms = known.map((e) => e.bpm!).sort((a, b) => a - b);
  // The range the set moves through: the middle of the library's tempos (outliers left out).
  const lo = bpms.length ? bpms[Math.floor(bpms.length * 0.15)] : 0;
  const hi = bpms.length ? bpms[Math.min(bpms.length - 1, Math.floor(bpms.length * 0.85))] : 0;
  const wantCount = Math.max(2, Math.min(pool.length, o.count ?? (o.minutes ? Math.ceil(o.minutes / 3.2) : 12)));
  const seconds = o.minutes ? o.minutes * 60 : Infinity;
  // A little variety between builds of the same library (seeded, so tests can fix it).
  let r = (o.seed ?? 1) >>> 0 || 1;
  const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  const target = (i: number) => lo + (hi - lo) * shapeAt(o.shape, wantCount > 1 ? i / (wantCount - 1) : 0);
  const first =
    pool.find((e) => e.id === o.startId) ??
    (known.length ? known.reduce((best, e) => (Math.abs(e.bpm! - target(0)) < Math.abs(best.bpm! - target(0)) ? e : best)) : pool[0]);

  const out: SetStep[] = [{ entry: first, why: "", tempoStep: 0 }];
  const used = new Set([first.id]);
  let total = first.duration ?? 200;
  while (out.length < wantCount && total < seconds) {
    const last = out[out.length - 1].entry;
    const want = target(out.length);
    let best: { e: BrowserEntry; score: number } | null = null;
    for (const e of pool) {
      if (used.has(e.id)) continue;
      let score = 0;
      if (last.key && e.key) score += KEY_POINTS[keyFit(last.key, e.key)] * 2;
      else score += 2;
      if (last.bpm && e.bpm) {
        const gap = playedGap(e.bpm, last.bpm);
        score += gap <= 0.06 ? 4 - gap * 30 : gap <= 0.12 ? 1 : -4;
        const at = alignedBpm(e.bpm, last.bpm);
        // Against the shape's tempo for this place in the set (read in the same octave).
        score -= want ? Math.abs(Math.log(alignedBpm(at, want) / want)) * 25 : 0;
      } else score -= 3;
      if (last.artist && e.artist === last.artist) score -= 1.5;
      score += rand() * 0.6;
      if (!best || score > best.score) best = { e, score };
    }
    if (!best) break;
    const e = best.e;
    used.add(e.id);
    total += e.duration ?? 200;
    const step = last.bpm && e.bpm ? alignedBpm(e.bpm, last.bpm) / last.bpm - 1 : 0;
    out.push({ entry: e, why: keyStepText(last, e), tempoStep: step });
  }
  return out;
}

/** The set's length in seconds (unknown lengths count as 3:20, an average song). */
export function setSeconds(steps: SetStep[]) {
  return steps.reduce((s, x) => s + (x.entry.duration ?? 200), 0);
}

/** The set as text, to copy or share: "1. Title — Artist (124 BPM, 8A)". */
export function setText(name: string, steps: SetStep[]) {
  const lines = steps.map((s, i) => `${i + 1}. ${s.entry.title}${s.entry.artist ? ` — ${s.entry.artist}` : ""}${s.entry.bpm ? ` (${Math.round(s.entry.bpm)} BPM${s.entry.key ? `, ${camelotCode(s.entry.key)}` : ""})` : ""}`);
  return [name, ...lines].join("\n");
}
