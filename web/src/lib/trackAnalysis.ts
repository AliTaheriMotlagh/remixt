// What's measured about a song once, by the first browser that has its
// audio — the one that split it (at upload, or a miner splitting it for
// someone's phone), else the first to open it on the decks, measure it in
// the set planner, or a miner with nothing to split (see splitQueue.ts) —
// and kept on the track for everyone: the DJ set planner, the decks'
// suggestions, the radio's transitions, and whatever comes next (charts by
// energy, "more like this"). Shared by the browser (which measures) and the
// server (which checks what it's sent before keeping it).
//
// Bump ANALYSIS_VERSION when the way it's measured changes: songs measured
// the old way are then measured again by the next browser that can.

export const ANALYSIS_VERSION = 1;
/** Points in the energy curve: enough to see an intro, drops and an outro. */
export const CURVE_POINTS = 48;

export type TrackAnalysis = {
  v: number;
  /** Tempo, refined against the beat's onsets, folded into 70–180. */
  bpm: number | null;
  /** "9:minor" (tonic 0 = C), as tracks.music_key stores it. */
  key: string | null;
  /** 0..1: how clearly that key beat the runner-up. */
  keyConfidence: number;
  /** Seconds to the first beat of the grid (its anchor). */
  firstBeat: number | null;
  /** The song's length in seconds, as measured. */
  duration: number;
  /** Loudness of the beat's non-silent parts, dBFS. */
  loudnessDb: number;
  /** Onsets per second in the beat: how busy it is. */
  onsetsPerSecond: number;
  /** 1–10, measured from loudness, busyness and tempo (see energyScore). */
  energy: number;
  /** Seconds before the beat gets going, and after it stops: room to mix in and out. */
  introSeconds: number;
  outroSeconds: number;
  /** The beat's energy across the song, CURVE_POINTS values 0..1 (its loudest moment = 1). */
  curve: number[];
  /** "split" (measured as it was split), "decks", "planner", "miner". */
  by: string;
};

const BY = ["split", "decks", "planner", "miner", "studio"];

const finite = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;

/** `raw` as an analysis, or null when it isn't a well-formed one (anything a browser sends is checked here). */
export function parseTrackAnalysis(raw: unknown): TrackAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (!finite(a.v, 1, 1000) || !Number.isInteger(a.v)) return null;
  if (a.bpm !== null && !finite(a.bpm, 20, 300)) return null;
  if (a.key !== null && (typeof a.key !== "string" || !/^(\d|1[01]):(major|minor)$/.test(a.key))) return null;
  if (!finite(a.keyConfidence, 0, 1)) return null;
  if (!finite(a.duration, 1, 3600)) return null;
  if (a.firstBeat !== null && !finite(a.firstBeat, 0, a.duration as number)) return null;
  if (!finite(a.loudnessDb, -120, 6)) return null;
  if (!finite(a.onsetsPerSecond, 0, 100)) return null;
  if (!finite(a.energy, 1, 10)) return null;
  if (!finite(a.introSeconds, 0, a.duration as number) || !finite(a.outroSeconds, 0, a.duration as number)) return null;
  if (!Array.isArray(a.curve) || a.curve.length > CURVE_POINTS || !a.curve.every((x) => finite(x, 0, 1))) return null;
  if (typeof a.by !== "string" || !BY.includes(a.by)) return null;
  return {
    v: a.v,
    bpm: a.bpm === null ? null : Math.round((a.bpm as number) * 100) / 100,
    key: a.key as string | null,
    keyConfidence: round(a.keyConfidence, 3),
    firstBeat: a.firstBeat === null ? null : round(a.firstBeat as number, 4),
    duration: round(a.duration, 3),
    loudnessDb: round(a.loudnessDb, 2),
    onsetsPerSecond: round(a.onsetsPerSecond, 2),
    energy: Math.round(a.energy),
    introSeconds: round(a.introSeconds, 2),
    outroSeconds: round(a.outroSeconds, 2),
    curve: (a.curve as number[]).map((x) => round(x, 3)),
    by: a.by,
  };
}

function round(x: number, places: number) {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}

/**
 * 1–10: how much a song drives a dance floor, from what's measured. A loud,
 * busy beat at a quick tempo is high; a quiet, sparse, slow one low. Tempo
 * is read as felt (doubled or halved into 85–170), as a DJ hears it.
 */
export function energyScore({ loudnessDb, onsetsPerSecond, bpm }: { loudnessDb: number; onsetsPerSecond: number; bpm: number | null }): number {
  // −30 dBFS (quiet) → 0, −8 dBFS (mastered loud) → 1.
  const loud = clamp01((loudnessDb + 30) / 22);
  // 1 onset a second (sparse) → 0, 8 (busy hats and drums) → 1.
  const busy = clamp01((onsetsPerSecond - 1) / 7);
  let feel = bpm ?? 110;
  while (feel < 85) feel *= 2;
  while (feel > 175) feel /= 2;
  const pace = clamp01((Math.min(155, feel) - 85) / 70);
  const score = 1 + 9 * (0.4 * loud + 0.3 * busy + 0.3 * pace);
  return Math.max(1, Math.min(10, Math.round(score)));
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** Whether `stored` should be replaced by an analysis of `version` (none yet, or measured the old way). */
export function needsAnalysis(stored: unknown, version = ANALYSIS_VERSION): boolean {
  const v = (stored as { v?: unknown } | null)?.v;
  return typeof v !== "number" || v < version;
}
