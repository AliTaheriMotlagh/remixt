// The DJ simulator's shared vocabulary: a plain-data snapshot of both decks
// and the mixer. The engine produces one; scoring, the co-pilot, the crowd
// and the missions only ever read one, so they can be tested without audio.

import type { DemoStem, SectionName } from "../demoSongDefs";
import type { MusicalKey } from "../musicKey";

export type DeckId = "A" | "B";
export const DECK_IDS: DeckId[] = ["A", "B"];
export const otherDeck = (d: DeckId): DeckId => (d === "A" ? "B" : "A");

/** Where a track comes from: a synthesised demo song, or a song from the shared library. */
export type TrackSource = "demo" | "library";
/**
 * How a track's stems are split: the demo songs (and library songs split
 * since the 4-stem update) have drums, bass, melody and vocals; older
 * library songs only have the vocals and the beat (everything else).
 */
export type StemLayout = "four" | "two";

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
  /** Missing on the demo songs (they're all "demo", "four"). */
  source?: TrackSource;
  layout?: StemLayout;
};

/** A deck's stem players: the four demo stems, plus "beat" for a two-stem library song. */
export type StemSlot = DemoStem | "beat";
export const STEM_SLOTS: StemSlot[] = ["drums", "bass", "chords", "vocal", "beat"];

export const HOT_CUE_COUNT = 8;
export const TEMPO_RANGES = [6, 10, 16, 100] as const;
export const DEFAULT_TEMPO_RANGE = 10;
export const TRIM_DB = 12;

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
  /** Master tempo: the tempo fader changes speed but not pitch. */
  keyLock: boolean;
  /** Snap cues, loops and hot cues to the beat grid; jumps keep the beat phase. */
  quantize: boolean;
  /** Loops, scratches and held hot cues leave the track running underneath; letting go rejoins it. */
  slip: boolean;
  /** Jog wheel: vinyl (touching the platter scratches) or CDJ (it bends the pitch). */
  vinyl: boolean;
  /** Hand on the platter: playback follows the jog wheel. */
  scratching: boolean;
  /** Where the track would be without the slip action (slip mode), else null. */
  slipPosition: number | null;
  /** Hot cue positions (seconds), null where unset. */
  hotCues: (number | null)[];
  /** Channel trim, dB (on top of the auto gain). */
  trim: number;
  autoGain: boolean;
  /** The loudness correction auto gain applies for this track, dB. */
  autoGainDb: number;
};

export type Curve = "blend" | "linear" | "cut";
/** Channel fader curve: "smooth" eases in (the mixer default), "linear", or "steep" (opens fast, for cuts). */
export type FaderCurve = "smooth" | "linear" | "steep";
/**
 * Where the headphone cue goes: "single" (one output, the cue laid over the
 * master), "split" (cue in the left ear, master in the right) or "device"
 * (the cue on a second audio output, master on the first: a real booth setup).
 */
export type MonitorMode = "single" | "split" | "device";

export type MixState = {
  /** -1 = all Deck A, +1 = all Deck B. */
  crossfader: number;
  curve: Curve;
  master: number;
  masterLevel: number;
  faderCurve: FaderCurve;
  /** Headphone mix: 0 = only the cued channels, 1 = only the master. */
  cueMix: number;
  /** Headphone level, 0…1. */
  phones: number;
  monitor: MonitorMode;
  recording: boolean;
  /** Talkover: the music is ducked for an announcement. */
  talkover: boolean;
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
  tempoRange: DEFAULT_TEMPO_RANGE,
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
  keyLock: false,
  quantize: false,
  slip: false,
  vinyl: false,
  scratching: false,
  slipPosition: null,
  hotCues: Array<number | null>(HOT_CUE_COUNT).fill(null),
  trim: 0,
  autoGain: true,
  autoGainDb: 0,
});

export const emptySnapshot = (): DjSnapshot => ({
  time: 0,
  decks: { A: emptyDeck(), B: emptyDeck() },
  mix: { crossfader: 0, curve: "blend", master: 0.85, masterLevel: 0, faderCurve: "smooth", cueMix: 0.5, phones: 0.8, monitor: "single", recording: false, talkover: false },
  fx: {},
});
