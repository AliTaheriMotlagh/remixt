// The DJ simulator's shared vocabulary: a plain-data snapshot of both decks
// and the mixer. The engine produces one; scoring, the co-pilot, the crowd
// and the missions only ever read one, so they can be tested without audio.

import type { DemoStem, SectionName } from "../demoSongDefs";
import type { MusicalKey } from "../musicKey";

export type DeckId = "A" | "B";
export const DECK_IDS: DeckId[] = ["A", "B"];
export const otherDeck = (d: DeckId): DeckId => (d === "A" ? "B" : "A");

export type TrackInfo = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  key: MusicalKey;
  camelot: string;
  /** Seconds. The beat grid starts at 0 for every demo song. */
  duration: number;
  firstBeat: number;
  bars: number;
  sections: { name: SectionName; startBar: number; bars: number; energy: number }[];
};

export type StemKills = Record<DemoStem, boolean>;
export const NO_KILLS: StemKills = { drums: false, bass: false, chords: false, vocal: false };

export type EqBand = "low" | "mid" | "high";
export const EQ_MIN_DB = -26;
export const EQ_MAX_DB = 6;
export const KILL_DB = -60;

export type LoopState = { active: boolean; start: number; end: number; beats: number | null };

export type DeckState = {
  track: TrackInfo | null;
  playing: boolean;
  /** Seconds into the track (source time). */
  position: number;
  /** Playback speed from the tempo fader (1 = the track's own tempo). */
  rate: number;
  /** The same as a percentage, -16…+16 (or wider). */
  tempoPct: number;
  tempoRange: number;
  /** Momentary nudge, -1…+1. */
  bend: number;
  /** Channel fader, 0…1. */
  volume: number;
  eq: Record<EqBand, number>;
  kill: Record<EqBand, boolean>;
  /** Filter knob -1 (low-pass) … +1 (high-pass). */
  filter: number;
  loop: LoopState;
  cue: number;
  pfl: boolean;
  stems: StemKills;
  /** Channel peak level, 0…1 (live). */
  level: number;
};

export type Curve = "blend" | "linear" | "cut";

export type MixState = {
  /** -1 = all Deck A, +1 = all Deck B. */
  crossfader: number;
  curve: Curve;
  master: number;
  masterLevel: number;
};

export type DjSnapshot = {
  /** Seconds since the engine started. */
  time: number;
  decks: Record<DeckId, DeckState>;
  mix: MixState;
  /** How many times each FX has been fired (echo, reverb, siren, horn, brake, spin, roll). */
  fx: Record<string, number>;
};

export const emptyDeck = (): DeckState => ({
  track: null,
  playing: false,
  position: 0,
  rate: 1,
  tempoPct: 0,
  tempoRange: 8,
  bend: 0,
  volume: 0.8,
  eq: { low: 0, mid: 0, high: 0 },
  kill: { low: false, mid: false, high: false },
  filter: 0,
  loop: { active: false, start: 0, end: 0, beats: null },
  cue: 0,
  pfl: false,
  stems: { ...NO_KILLS },
  level: 0,
});

export const emptySnapshot = (): DjSnapshot => ({
  time: 0,
  decks: { A: emptyDeck(), B: emptyDeck() },
  mix: { crossfader: 0, curve: "blend", master: 0.85, masterLevel: 0 },
  fx: {},
});
