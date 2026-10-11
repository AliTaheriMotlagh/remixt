// Auto-mix: one tap and the simulator blends the playing song into the
// other deck the way a club DJ would, saying what it's doing at each step,
// so someone who has never mixed can watch a transition happen on the very
// controls they'll use themselves. It only uses the engine's public
// controls, like the AI DJ (aiDj.ts), and it's driven by tick().
//
//   1. Match the speed: SYNC the incoming deck (widening its range if needed),
//      cue it on its first beat with its bass cut and its fader down.
//   2. Wait for the playing song's next phrase line (every 8 bars).
//   3. Start it there, in step, and bring its fader up while the crossfader moves.
//   4. Halfway, swap the bass lines: one bass at a time keeps the mix clean.
//   5. Fade the old song out and stop it.

import { beatIndex } from "./djControls";
import { beatSeconds } from "./djMath";
import { otherDeck, type DeckId, type DjSnapshot, type EqBand } from "./djTypes";

/** The engine controls auto-mix uses (DjEngine has them all). */
export type AutoMixEngine = {
  snapshot(): DjSnapshot;
  sync(id: DeckId): "ok" | "out-of-range" | "no-track";
  setTempoRange(id: DeckId, range: number): void;
  seek(id: DeckId, pos: number): void;
  play(id: DeckId, when?: number): void;
  pause(id: DeckId): void;
  setVolume(id: DeckId, v: number): void;
  setKill(id: DeckId, band: EqBand, on: boolean): void;
  setCrossfader(x: number): void;
};

export type AutoMixPhase = "match" | "wait" | "blend" | "swap" | "out" | "done" | "stopped";

export const AUTO_MIX_STEPS: { phase: Exclude<AutoMixPhase, "done" | "stopped">; label: string; detail: string }[] = [
  { phase: "match", label: "Match the speed", detail: "SYNC sets the new song to the same tempo and lines up its beats." },
  { phase: "wait", label: "Wait for the phrase", detail: "Songs move in 8-bar phrases. Starting on a phrase line makes them fit together." },
  { phase: "blend", label: "Bring it in, bass cut", detail: "The new song fades in with its bass cut: two bass lines at once sound muddy." },
  { phase: "swap", label: "Swap the bass", detail: "Halfway, the old song's bass goes out as the new one's comes in." },
  { phase: "out", label: "Fade the old song out", detail: "The crossfader finishes the move and the old deck stops." },
];

/** Beats in a phrase: transitions start on these lines. */
export const PHRASE_BEATS = 32;
/** How long the blend takes, in beats (16 bars), when the song has that long left. */
export const BLEND_BEATS = 64;
/** The shortest blend worth doing (2 bars). */
const MIN_BLEND_BEATS = 8;
/** Starts are scheduled on the audio clock this far ahead, so a late tick never misses the line. */
const LOOKAHEAD_SECONDS = 0.3;
const FADER = 0.8;

const ramp = (p: number, from: number, to: number) => Math.max(0, Math.min(1, (p - from) / (to - from)));

export class AutoMix {
  readonly from: DeckId;
  readonly to: DeckId;
  phase: AutoMixPhase = "match";
  /** 0…1 over the whole transition. */
  progress = 0;
  /** Beats until the incoming song starts (while waiting). */
  beatsToGo = 0;
  /** Why it stopped early, if it did. */
  reason: string | null = null;
  private startBeat = 0;
  private lastBeat: number | null = null;
  /** The lines it waits for, and how long it blends: shorter when the playing song is near its end. */
  private phrase = PHRASE_BEATS;
  private blendBeats = BLEND_BEATS;
  private scheduled = false;
  private xStart = 0;
  private readonly engine: AutoMixEngine;

  constructor(engine: AutoMixEngine, from: DeckId) {
    this.engine = engine;
    this.from = from;
    this.to = otherDeck(from);
  }

  /** Can a transition from `from` start now? Null if so, else what's missing, in plain words. */
  static blocker(snap: DjSnapshot, from: DeckId): string | null {
    const to = otherDeck(from);
    if (!snap.decks[from].track) return `Load a song on deck ${from} first.`;
    if (!snap.decks[to].track) return `Load a song on deck ${to} to mix into.`;
    if (!snap.decks[from].playing) return `Press play on deck ${from} first: auto-mix blends out of the song that's playing.`;
    return null;
  }

  /** Sets the incoming deck up. False (with `reason`) if it can't. */
  start(): boolean {
    const e = this.engine;
    const snap = e.snapshot();
    const why = AutoMix.blocker(snap, this.from);
    if (why) return this.stop(why);
    const incoming = snap.decks[this.to];
    const out = snap.decks[this.from];
    const left = (out.track!.duration - out.position) / beatSeconds(out.track!);
    const beat = beatIndex(out.track!, out.position);
    const until = (every: number) => every - (((beat % every) + every) % every);
    // The longest phrase that still leaves room for a blend before the song ends.
    const fit = [PHRASE_BEATS, 16, 4].find((every) => left - until(every) >= Math.min(BLEND_BEATS, every === 4 ? MIN_BLEND_BEATS : 32));
    if (!fit) return this.stop(`Deck ${this.from} is about to end: start deck ${this.to} by hand.`);
    this.phrase = fit;
    this.blendBeats = Math.max(MIN_BLEND_BEATS, Math.min(BLEND_BEATS, Math.floor((left - until(fit) - 2) / 4) * 4));
    if (e.sync(this.to) === "out-of-range") {
      e.setTempoRange(this.to, 100);
      if (e.sync(this.to) !== "ok") return this.stop("These two songs are too far apart in tempo to mix.");
    }
    if (incoming.playing) e.pause(this.to);
    e.seek(this.to, incoming.track!.firstBeat);
    e.setVolume(this.to, 0);
    e.setKill(this.to, "low", true);
    this.xStart = snap.mix.crossfader;
    this.phase = "wait";
    return true;
  }

  /** Call often (every 50–100 ms): moves the transition on. */
  tick() {
    if (this.phase === "done" || this.phase === "stopped" || this.phase === "match") return;
    const e = this.engine;
    const snap = e.snapshot();
    const out = snap.decks[this.from];
    if (!out.track || !snap.decks[this.to].track) return void this.stop("A deck was emptied, so auto-mix stopped.");
    if (!out.playing) return void this.stop(`Deck ${this.from} was stopped, so auto-mix stopped.`);
    const beat = beatIndex(out.track, out.position);

    if (this.phase === "wait") {
      const every = this.phrase;
      const toLine = every - (((beat % every) + every) % every);
      const beatSec = 60 / (out.track.bpm * out.rate);
      this.beatsToGo = Math.ceil(toLine - 1e-6);
      this.progress = 0.05 + 0.15 * (1 - toLine / every);
      const crossed = this.lastBeat !== null && Math.floor(beat / every) > Math.floor(this.lastBeat / every);
      this.lastBeat = beat;
      if (!this.scheduled && toLine * beatSec < LOOKAHEAD_SECONDS) {
        // Started on the audio clock at the line itself: the tempos already
        // match and it's cued on a beat, so the beats land together exactly.
        e.play(this.to, snap.time + toLine * beatSec);
        this.scheduled = true;
        this.startBeat = beat + toLine;
        this.phase = "blend";
      } else if (crossed) {
        // A tick came very late and the line has passed: start now, and SYNC lines the beats up.
        e.play(this.to);
        e.sync(this.to);
        this.startBeat = beat;
        this.phase = "blend";
      }
      return;
    }

    const p = Math.max(0, Math.min(1, (beat - this.startBeat) / this.blendBeats));
    this.progress = 0.2 + 0.8 * p;
    const xEnd = this.to === "B" ? 1 : -1;
    e.setVolume(this.to, FADER * ramp(p, 0, 0.3));
    e.setCrossfader(this.xStart + (xEnd - this.xStart) * ramp(p, 0.2, 0.9));
    if (p >= 0.5 && this.phase === "blend") {
      e.setKill(this.from, "low", true);
      e.setKill(this.to, "low", false);
      this.phase = "swap";
    }
    if (p >= 0.75 && this.phase === "swap") this.phase = "out";
    if (this.phase === "out") e.setVolume(this.from, FADER * (1 - ramp(p, 0.75, 1)));
    if (p >= 1) {
      e.pause(this.from);
      e.setCrossfader(xEnd);
      e.setVolume(this.from, FADER);
      e.setKill(this.from, "low", false);
      e.setVolume(this.to, FADER);
      this.progress = 1;
      this.phase = "done";
    }
  }

  /** Stopped by hand: both basses back on and both faders up, so nothing is left silent. */
  cancel() {
    if (this.phase === "done" || this.phase === "stopped") return;
    for (const id of [this.from, this.to]) {
      this.engine.setKill(id, "low", false);
      this.engine.setVolume(id, FADER);
    }
    this.stop(null);
  }

  /** Stops where it is; the decks keep whatever state they're in. */
  stop(reason: string | null = null): false {
    if (this.phase !== "done") this.phase = "stopped";
    this.reason = reason;
    return false;
  }
}
