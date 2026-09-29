// Musical keys as pitch-class numbers (C = 0 … B = 11) plus a mode, and
// the arithmetic the Studio needs to put two stems in the same key.

export type KeyMode = "major" | "minor";
export type MusicalKey = { tonic: number; mode: KeyMode };

export const PITCH_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export const ALL_KEYS: MusicalKey[] = [
  ...PITCH_NAMES.map((_, tonic) => ({ tonic, mode: "major" as const })),
  ...PITCH_NAMES.map((_, tonic) => ({ tonic, mode: "minor" as const })),
];

function mod12(n: number) {
  return ((Math.round(n) % 12) + 12) % 12;
}

export function keyLabel(key: MusicalKey) {
  return `${PITCH_NAMES[mod12(key.tonic)]} ${key.mode === "major" ? "maj" : "min"}`;
}

/** Stable string form, for <select> values and persistence. */
export function keyId(key: MusicalKey) {
  return `${mod12(key.tonic)}${key.mode === "major" ? "M" : "m"}`;
}

export function parseKeyId(id: string): MusicalKey | null {
  const match = id.match(/^(\d{1,2})([Mm])$/);
  if (!match) return null;
  const tonic = Number(match[1]);
  if (tonic < 0 || tonic > 11) return null;
  return { tonic, mode: match[2] === "M" ? "major" : "minor" };
}

export function isMusicalKey(value: unknown): value is MusicalKey {
  if (!value || typeof value !== "object") return false;
  const v = value as MusicalKey;
  return (
    typeof v.tonic === "number" &&
    v.tonic >= 0 &&
    v.tonic <= 11 &&
    (v.mode === "major" || v.mode === "minor")
  );
}

/**
 * Camelot wheel code (8A = A minor, 8B = C major). DJs mix by it: the same
 * number is the same set of notes, ±1 is a fifth away and still blends.
 */
export function camelotCode(key: MusicalKey) {
  const number = (mod12(relativeMajor(key) * 7 + 7)) + 1;
  return `${number}${key.mode === "minor" ? "A" : "B"}`;
}

export function transposeKey(key: MusicalKey, semitones: number): MusicalKey {
  return { tonic: mod12(key.tonic + semitones), mode: key.mode };
}

/** A minor and C major use the same notes; both map to C here. */
function relativeMajor(key: MusicalKey) {
  return key.mode === "major" ? mod12(key.tonic) : mod12(key.tonic + 3);
}

/**
 * Wraps a shift into -6…+5. Pitching a vocal down reads as more natural
 * than up (up gets "chipmunk" first), so the tritone case goes down.
 */
function shortestShift(semitones: number) {
  const r = mod12(semitones);
  return r >= 6 ? r - 12 : r;
}

/** Semitones that put `key` onto the same notes as `target`. */
export function semitonesToMatch(key: MusicalKey, target: MusicalKey) {
  return shortestShift(relativeMajor(target) - relativeMajor(key));
}

export type KeyMatch = {
  semitones: number;
  relation: "same" | "relative" | "neighbour";
};

/**
 * Picks the pitch shift that makes `key` sit well against `target`. An
 * exact match (same notes) is preferred, but every semitone of shift costs
 * some audio quality, so a key one step round the Camelot wheel (a fifth
 * away — six of seven notes shared) wins when it saves a big shift.
 */
export function bestKeyShift(key: MusicalKey, target: MusicalKey): KeyMatch {
  const from = relativeMajor(key);
  const to = relativeMajor(target);
  const candidates = [
    { semitones: shortestShift(to - from), penalty: 0 },
    { semitones: shortestShift(to + 7 - from), penalty: 1.5 },
    { semitones: shortestShift(to + 5 - from), penalty: 1.5 },
  ];
  candidates.sort(
    (a, b) => Math.abs(a.semitones) + a.penalty - (Math.abs(b.semitones) + b.penalty)
  );
  const best = candidates[0];
  const shifted = transposeKey(key, best.semitones);
  const relation =
    best.penalty > 0
      ? "neighbour"
      : shifted.tonic === mod12(target.tonic) && shifted.mode === target.mode
        ? "same"
        : "relative";
  return { semitones: best.semitones, relation };
}
