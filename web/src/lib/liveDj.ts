// DJing live: what travels from the host's decks to the room. Like a studio
// session there's no audio stream — the host's decks are described (which
// song is on each, where, how fast, every fader and knob) and each
// listener's browser plays the same songs on its own decks, in step. This
// is the pure half, shared by the server (checking and keeping it), the
// host (sending it) and listeners (following it). Tested in
// tests/live-dj.test.ts.

export type DjLiveDeckId = "A" | "B";

export type DjLiveDeck = {
  /** The song on the deck ("lib:<trackId>" or a demo song's id), null when empty. */
  id: string | null;
  title: string;
  artist: string;
  /** A stem of the song, for its cover. */
  cover?: string;
  /** The song's own tempo (before the tempo fader). */
  bpm: number;
  camelot: string;
  duration: number;
  playing: boolean;
  /** Seconds into the song when this was sent. */
  position: number;
  /** Playback speed from the tempo fader. */
  rate: number;
  keyLock: boolean;
  /** Channel fader, 0…1. */
  volume: number;
  eq: { low: number; mid: number; high: number };
  kill: { low: boolean; mid: boolean; high: boolean };
  /** -1 low-pass … +1 high-pass. */
  filter: number;
  /** Which stems are cut. */
  stems: { drums: boolean; bass: boolean; chords: boolean; vocal: boolean };
  trim: number;
  /** An active loop, else null. */
  loop: { start: number; end: number } | null;
};

export type DjLiveStage = {
  decks: Record<DjLiveDeckId, DjLiveDeck>;
  /** -1 all deck A … +1 all deck B. */
  crossfader: number;
  curve: "blend" | "linear" | "cut";
  faderCurve: "smooth" | "linear" | "steep";
  /** How many times each one-shot effect has fired: a listener fires it when the count goes up. */
  fx: { echo: number; reverb: number; horn: number };
  /** The set the Auto DJ is playing, if any. */
  set?: string;
};

export const EMPTY_DJ_DECK: DjLiveDeck = {
  id: null,
  title: "",
  artist: "",
  bpm: 0,
  camelot: "",
  duration: 0,
  playing: false,
  position: 0,
  rate: 1,
  keyLock: false,
  volume: 0.8,
  eq: { low: 0, mid: 0, high: 0 },
  kill: { low: false, mid: false, high: false },
  filter: 0,
  stems: { drums: false, bass: false, chords: false, vocal: false },
  trim: 0,
  loop: null,
};

const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const bool = (v: unknown) => v === true;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const LONGEST = 6 * 3600;

function cleanDeck(raw: unknown): DjLiveDeck {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const eq = (d.eq ?? {}) as Record<string, unknown>;
  const kill = (d.kill ?? {}) as Record<string, unknown>;
  const stems = (d.stems ?? {}) as Record<string, unknown>;
  const loop = d.loop as Record<string, unknown> | null | undefined;
  const id = typeof d.id === "string" && /^[\w:.-]{1,120}$/.test(d.id) ? d.id : null;
  const duration = num(d.duration, 0, LONGEST, 0);
  const loopStart = num(loop?.start, 0, LONGEST, -1);
  const loopEnd = num(loop?.end, 0, LONGEST, -1);
  return {
    id,
    title: text(d.title, 200),
    artist: text(d.artist, 200),
    ...(typeof d.cover === "string" && /^[\w-]{1,80}$/.test(d.cover) ? { cover: d.cover } : {}),
    bpm: num(d.bpm, 0, 400, 0),
    camelot: text(d.camelot, 4),
    duration,
    playing: id !== null && bool(d.playing),
    position: num(d.position, 0, LONGEST, 0),
    rate: num(d.rate, 0.05, 4, 1),
    keyLock: bool(d.keyLock),
    volume: num(d.volume, 0, 1, 0.8),
    eq: { low: num(eq.low, -60, 12, 0), mid: num(eq.mid, -60, 12, 0), high: num(eq.high, -60, 12, 0) },
    kill: { low: bool(kill.low), mid: bool(kill.mid), high: bool(kill.high) },
    filter: num(d.filter, -1, 1, 0),
    stems: { drums: bool(stems.drums), bass: bool(stems.bass), chords: bool(stems.chords), vocal: bool(stems.vocal) },
    trim: num(d.trim, -24, 24, 0),
    loop: loopStart >= 0 && loopEnd > loopStart + 0.01 ? { start: loopStart, end: loopEnd } : null,
  };
}

/** Anything claiming to be a DJ stage, made safe (out-of-range numbers clamped, unknown fields dropped); null when it isn't one. */
export function cleanDjStage(raw: unknown): DjLiveStage | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const decks = s.decks as Record<string, unknown> | undefined;
  if (!decks || typeof decks !== "object") return null;
  const fx = (s.fx ?? {}) as Record<string, unknown>;
  const curve = s.curve === "linear" || s.curve === "cut" ? s.curve : "blend";
  const faderCurve = s.faderCurve === "linear" || s.faderCurve === "steep" ? s.faderCurve : "smooth";
  const set = text(s.set, 60).trim();
  return {
    decks: { A: cleanDeck(decks.A), B: cleanDeck(decks.B) },
    crossfader: num(s.crossfader, -1, 1, 0),
    curve,
    faderCurve,
    fx: { echo: Math.floor(num(fx.echo, 0, 1e6, 0)), reverb: Math.floor(num(fx.reverb, 0, 1e6, 0)), horn: Math.floor(num(fx.horn, 0, 1e6, 0)) },
    ...(set ? { set } : {}),
  };
}

/** Where a deck is `elapsed` seconds after the stage was sent: moving at its rate while it plays, round its loop, never past the end. */
export function djDeckPosition(deck: Pick<DjLiveDeck, "playing" | "position" | "rate" | "loop" | "duration">, elapsed: number) {
  let at = deck.position + (deck.playing ? Math.max(0, elapsed) * deck.rate : 0);
  const loop = deck.loop;
  if (loop && loop.end - loop.start > 0.01 && at > loop.end && deck.position <= loop.end + 0.05) {
    at = loop.start + ((at - loop.start) % (loop.end - loop.start));
  }
  return deck.duration > 0 ? Math.min(at, deck.duration) : at;
}

/** How much of each deck the room hears, 0…1 (fader times crossfader side), roughly as the mixer does. */
export function djDeckGain(stage: Pick<DjLiveStage, "decks" | "crossfader">, id: DjLiveDeckId) {
  const d = stage.decks[id];
  if (!d.id || !d.playing) return 0;
  const x = stage.crossfader;
  const side = id === "A" ? Math.min(1, 1 - x) : Math.min(1, 1 + x);
  return d.volume * Math.max(0, side);
}

/** The deck the room hears most (null when nothing plays). */
export function djOnAir(stage: Pick<DjLiveStage, "decks" | "crossfader">): DjLiveDeckId | null {
  const a = djDeckGain(stage, "A");
  const b = djDeckGain(stage, "B");
  if (a <= 0 && b <= 0) return null;
  return a >= b ? "A" : "B";
}

/** A playhead this far from where the last stage puts it is a jump (a seek, a cue), not drift. */
const JUMP_SECONDS = 1;

/**
 * Whether `next` says something `prev` didn't: anything but the positions
 * moving on as expected. Keyframes that only confirm the decks are still
 * playing stay out of the replay.
 */
export function djStageChanged(prev: DjLiveStage | null | undefined, next: DjLiveStage | null | undefined, secondsSincePrev: number) {
  if (!prev || !next) return !!prev !== !!next;
  const still = (s: DjLiveStage) => JSON.stringify({ ...s, decks: { A: { ...s.decks.A, position: 0 }, B: { ...s.decks.B, position: 0 } } });
  if (still(prev) !== still(next)) return true;
  return (["A", "B"] as const).some((id) => Math.abs(next.decks[id].position - djDeckPosition(prev.decks[id], secondsSincePrev)) > JUMP_SECONDS);
}
