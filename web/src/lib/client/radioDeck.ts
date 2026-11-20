"use client";

import type { QueueRow } from "@/lib/radio";
import { planDecks } from "@/lib/radioPlan";
import { audioEngine } from "./audioEngine";
import { encodeWavGently, renderMixWav } from "./mixdown";
import { fetchStem, within } from "./stemFetch";
import { forgetMix, keepMix, keptMix, radioMixKey } from "./radioCache";
import { laneFromApi, projectFromApi, type RemixApi, type RemixLaneApi } from "./remixLanes";
import { useStudioStore } from "./studioStore";
import { renderTransition } from "./radioTransition";
import { isRendered } from "@/lib/radioTransitions";

// The radio's player. Every song on air is mixed to a WAV in this tab (the
// Studio's own mixdown, so a remix sounds exactly as made) and played by an
// <audio> element, which keeps going with the screen locked, in another
// app, or on the home screen. The next song is mixed while this one plays;
// radioPlan.ts says which songs sound at each moment and how loud, so every
// tab blends them on the station's clock.
//
// The elements ("players") are made once, in the Tune in tap, and used for
// every song after it: a phone only lets a page start an element it has
// started from a tap, and a new element made later (the next song, with
// the screen locked) is refused. Between songs, or while one is being
// mixed, a player plays silence, so the phone doesn't take the page's sound
// session (and its lock-screen controls) away.
//
// - Computers and Android: two players crossfading by their own volume.
// - iPhone/iPad (a page can't set an element's volume): one player that
//   never stops; it changes song halfway through the crossfade.
// Nothing is routed through Web Audio: the browser's own media pipeline
// plays the sound, so a busy page (or a slow sound device — opening one
// can block a page for a second) never stutters or delays it. The
// visualizer only listens in: a tap on each playing element
// (captureStream, where the browser has it), made in idle time once the
// music has started. Elsewhere (Safari) the visualizer idles.
//
// The player is driven by tick() from a timer and also by its elements'
// own events (timeupdate, ended, loadedmetadata): a phone may slow a hidden
// page's timers down to once a minute, but an element that's playing keeps
// reporting.
//
// Every song is kept on the device once mixed (radioCache.ts), whole from
// its start: the next time it's on, this visit or another, it plays at once.
// A song tuned into part way is mixed from where the station is (quickest
// to sound); the whole of it is mixed for keeping later, only while nothing
// else is being mixed, and that gives way at once to a song the station
// needs. A song that can't be readied (the connection dropped) is tried
// again after 2, 5, then 15 s; the listener only hears about it when
// nothing is playing.

// Keeping on the station's clock. A seek stops the sound for a moment
// (longer on a phone), and that pause puts the player off again: seeking
// on every small drift was the radio cutting in and out every second. Now:
// - An element starts (or lands after a seek) a little late: how late is
//   learned on this device (`lead`), and it's started that far ahead.
// - Once playing, the media clock keeps time by itself. A small drift
//   (the station's clock reading moving) is taken up by playing a touch
//   faster or slower (pitch kept: not heard) — not in Safari's engine
//   (desktop Safari, every iPhone browser), which stalls on a speed change;
//   a radio a fraction of a second off isn't heard there.
// - Only a big drift (a stall, the phone holding the sound) is a jump, at
//   most one per SEEK_GAP_MS; a start that landed off gets one fix early on.
/** Off by more than this (seconds): drawn back by the playing speed. */
const NUDGE_FROM = 0.08;
/** ...until within this. */
const NUDGE_TO = 0.02;
/** At most this much faster or slower (3%: not heard, pitch kept). */
const MAX_NUDGE = 0.03;
/** Off by more than this (seconds): jump back on. */
const JUMP = 1.5;
const SEEK_GAP_MS = 8000;
/** After a start or a seek, the element's clock is trusted only this long after it really plays. */
const SETTLE_MS = 400;
/** The longest a start or seek is waited for before measuring anyway. */
const SETTLE_MAX_MS = 3000;
/** A start (or jump) that landed off by more than this gets one fix while the song is just in. */
const LANDED_OFF = 0.25;
/** The most an element is started ahead to make up for its start-up (seconds). */
const MAX_LEAD = 1;
/** Tuning in mid-song: the sound comes up over this long instead of with a click. */
const FADE_IN = 0.35;
/** Waits before readying a song again after it failed. */
const RETRY_MS = [2000, 5000, 15_000];
/** A song's download taking longer than this is shown as it goes, so a listener on a poor line sees it's coming. */
const SLOW_DOWNLOAD_MS = 2000;
/** A pause this soon after the player itself changed an element is its own, not the phone's. */
const OWN_CHANGE_MS = 800;

type Deck = {
  row: QueueRow;
  url: string;
  /** The song's second at the file's start (a tune-in mixes from where the station is). */
  offset: number;
  /** When this tab started it (for the short fade-in of a mid-song tune-in). */
  joinedAt: number;
  fadeFromStart: boolean;
  /** The kept mix it plays, if it came from the cache (forgotten if it won't play). */
  keptKey: string | null;
  /** Its file begins with the transition from the song before (lib/radioTransitions.ts): hand over at its start. */
  cut: boolean;
};

type Player = {
  el: HTMLAudioElement;
  /** The visualizer's tap on this element's sound, if listening. */
  tap: MediaStreamAudioSourceNode | null;
  deck: Deck | null;
  /** Playing silence (holding the sound session between songs). */
  silent: boolean;
  /** The element knows its deck's length: it can be sought and started. */
  loaded: boolean;
  /** Started once from the tap: this browser lets the page start it again. */
  unlocked: boolean;
  /** When the player last changed it itself (performance.now()). */
  touchedAt: number;
  /** When it was last sought to the station's spot (performance.now()). */
  seekedAt: number;
  /** Not measured against the station before this (performance.now()): a start or seek still taking effect. */
  settleUntil: number;
  /** Drawing back to the station by the playing speed. */
  nudging: boolean;
  /** Just started or sought: where it lands is measured once it plays (teaching `lead`); `fix`: it may be put right once if it landed off. */
  landing: { fix: boolean } | null;
};

type Mode = "volume" | "switch";

export type PlayPayload = { remix: RemixApi; lanes: RemixLaneApi[] };

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

const payloads = new Map<string, { at: number; job: Promise<PlayPayload> }>();
const PAYLOAD_MS = 5 * 60_000;

/** What a song or remix is made of (its lanes), asked once for the player and the lyrics. */
export function playPayload(slug: string, kind: string, id: string): Promise<PlayPayload> {
  const key = `${slug}|${kind}|${id}`;
  const kept = payloads.get(key);
  if (kept && Date.now() - kept.at < PAYLOAD_MS) return kept.job;
  const job = fetch(`/api/radio/${encodeURIComponent(slug)}/play?kind=${kind}&id=${encodeURIComponent(id)}`, { signal: within(30_000) }).then((r) => json<PlayPayload>(r));
  payloads.set(key, { at: Date.now(), job });
  job.catch(() => payloads.delete(key));
  if (payloads.size > 20) payloads.delete(payloads.keys().next().value!);
  return job;
}

/** Safari's engine (desktop Safari, every browser on iPhone/iPad): its elements stall when their speed changes. */
function safariEngine() {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|Android/.test(ua) || /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Can this browser set an <audio> element's volume? (iOS keeps it at 1.) */
function volumeWorks() {
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    return Math.abs(probe.volume - 0.5) < 0.01;
  } catch {
    return false;
  }
}

let silence: string | null = null;
/** Half a second of silence as a WAV (8 kHz, 8-bit mono: 4 KB), looped between songs. */
function silenceUrl(): string {
  if (silence) return silence;
  const samples = 4000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => (bytes[at + i] = ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  silence = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  return silence;
}

export class RadioDeck {
  private decks: Deck[] = [];
  private players: Player[] = [];
  private mode: Mode = "volume";
  private rendering = new Map<number, Promise<void>>();
  private failures = new Map<number, { count: number; retryAt: number }>();
  /** Renders share the Studio's state: one at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Renders the station needs, waiting or running. */
  private busy = 0;
  /** Whole mixes still to keep (songs tuned into part way), by cache key. */
  private toKeep = new Map<string, (signal: AbortSignal) => Promise<void>>();
  /** The keeping mix running now: stopped when the station needs the mixer. */
  private keeping: AbortController | null = null;
  /** The visualizer's listening (not the sound's path). */
  private ctx: AudioContext | null = null;
  /** Listening in has been asked for once. */
  private listening = false;
  private analyser: AnalyserNode | null = null;
  private volume = 0.9;
  /** How far behind an element is once a start or seek takes effect, on this device (s): it's started this far ahead. */
  private lead = 0;
  /** Small drifts are taken up by the playing speed (not in Safari's engine). */
  private nudges = false;
  /** Not tuned in: nothing plays. */
  private stopped = true;
  /** Getting ready before Tune in (the page is open): the song on air is mixed so the tap plays it at once. */
  private warming = false;
  /** The browser refused to start sound: don't ask again before this (performance.now()). */
  private blockedUntil = 0;
  private wokeAt = 0;
  /** When an element paused by something else was last played again. */
  private resumedAt = -Infinity;
  /** The newest song heard, told once to onPlaying. */
  private announced: QueueRow | null = null;

  onState: (state: "loading" | "on" | "error", message?: string) => void = () => {};
  /** A new song is heard (for the lock screen). */
  onPlaying: (row: QueueRow) => void = () => {};
  /** The phone paused the sound (a call, headphones out, another app's sound): the radio goes quiet until asked again. */
  onExternalPause: () => void = () => {};
  /** Time to look again (an element's event or the page coming back): the owner calls tick() with the station's state. */
  onWake: () => void = () => {};

  constructor(private readonly slug: string) {}

  /** The newest song heard (for the lock screen). */
  get nowPlaying(): QueueRow | null {
    return this.announced;
  }

  /** How this device plays (for the rigs). */
  get playMode(): Mode {
    return this.mode;
  }

  /** Nothing to do at all: neither tuned in nor getting ready. */
  private get idle() {
    return this.stopped && !this.warming;
  }

  /** Gets ready before Tune in, while the page is open: makes the players and mixes the song on air, so the tap plays at once. */
  warm() {
    if (this.players.length === 0) this.makePlayers();
    this.warming = true;
  }

  /** Starts from a tap (so the browser allows sound). Everything sound-related here must happen before any await. */
  start() {
    this.stopped = false;
    if (this.players.length === 0) this.makePlayers();
    void this.ctx?.resume();
    // The Studio's live engine stays quiet: the radio plays its renders.
    audioEngine.stop();
    // Every player is started inside the tap (silence), so this page may start each of them later, screen locked or not.
    for (const p of this.players) if (!p.deck) this.playSilence(p);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  private makePlayers() {
    this.mode = volumeWorks() ? "volume" : "switch";
    this.nudges = !safariEngine();
    const count = this.mode === "switch" ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const el = new Audio();
      el.preload = "auto";
      // Plays in the page, not full screen, and marks it as music.
      el.setAttribute("playsinline", "");
      const player: Player = { el, tap: null, deck: null, silent: false, loaded: false, unlocked: false, touchedAt: 0, seekedAt: -Infinity, settleUntil: 0, nudging: false, landing: null };
      el.addEventListener("loadedmetadata", () => {
        if (player.deck && el.src === player.deck.url) {
          player.loaded = true;
          // Straight on, not at the next timer: a hidden page's timers may be slow.
          this.onWake();
        }
      });
      el.addEventListener("timeupdate", () => this.wake());
      // The element's clock runs true once it really plays; while it waits for data it stands still.
      const settled = () => (player.settleUntil = Math.min(player.settleUntil, performance.now() + SETTLE_MS));
      el.addEventListener("playing", settled);
      el.addEventListener("seeked", () => !el.paused && settled());
      el.addEventListener("waiting", () => (player.settleUntil = performance.now() + SETTLE_MAX_MS));
      el.addEventListener("ended", () => this.onWake());
      // A new file is new tracks in the element's stream: the visualizer listens to those.
      el.addEventListener("playing", () => this.tapInto(player));
      el.addEventListener("pause", () => this.pausedBy(player));
      el.addEventListener("error", () => this.failed(player));
      this.players.push(player);
    }
  }

  /**
   * The visualizer listens in: a tap on each player's sound (captureStream —
   * Chrome, Edge, Firefox; not Safari), read by an analyser. The sound
   * itself keeps going straight from the element to the speaker. Made in
   * idle time once the music plays: opening the sound device can block the
   * page for a quarter of a second or more, and here that holds up nothing
   * but the bars.
   */
  private listen() {
    if (this.ctx || this.stopped || !this.players.length) return;
    const capture = (this.players[0].el as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
    if (typeof capture !== "function") return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      // Light smoothing: heavy smoothing makes the bars trail the beat.
      analyser.smoothingTimeConstant = 0.5;
      // Pulled through a silent gain: the analyser is read, never heard (the elements play the sound).
      const mute = ctx.createGain();
      mute.gain.value = 0;
      analyser.connect(mute).connect(ctx.destination);
      this.ctx = ctx;
      this.analyser = analyser;
      void ctx.resume();
      for (const p of this.players) if (!p.el.paused) this.tapInto(p);
    } catch {
      // No visualizer: the bars idle.
    }
  }

  /** Points the visualizer's tap at what `p` plays now. */
  private tapInto(p: Player) {
    if (!this.ctx || !this.analyser) return;
    try {
      const stream = (p.el as HTMLAudioElement & { captureStream: () => MediaStream }).captureStream();
      if (!stream.getAudioTracks().length) return;
      p.tap?.disconnect();
      p.tap = this.ctx.createMediaStreamSource(stream);
      p.tap.connect(this.analyser);
    } catch {
      // This element can't be listened to: its bars stay still.
    }
  }

  private onVisible = () => {
    if (document.hidden || this.stopped) return;
    void this.ctx?.resume();
    this.onWake();
  };

  private wake() {
    const t = performance.now();
    if (t - this.wokeAt < 200) return;
    this.wokeAt = t;
    this.onWake();
  }

  /**
   * The element paused: by the player (ignored), at its end (ignored), or by
   * something else. That's tried once more: a glitch plays on; the phone
   * taking the sound (a call, another app) refuses, or pauses it again at
   * once — then the radio goes quiet until asked, as any music app does.
   */
  private pausedBy(p: Player) {
    if (this.stopped || p.el.ended || performance.now() - p.touchedAt < OWN_CHANGE_MS) return;
    if (!p.deck && !p.silent) return;
    const t = performance.now();
    if (t - this.resumedAt < 5000) return this.onExternalPause();
    this.resumedAt = t;
    p.touchedAt = t;
    p.el.play().then(
      () => this.onWake(),
      () => this.onExternalPause()
    );
  }

  /** The element couldn't play its file: a kept mix is forgotten, and the song is readied again. */
  private failed(p: Player) {
    const d = p.deck;
    if (!d || p.el.src !== d.url) return;
    if (d.keptKey) void forgetMix(d.keptKey);
    this.release(d);
    this.fail(d.row.rowId, "This song couldn't be played");
  }

  /** Tunes out. The songs mixed stay (the station drops them when they end): tuning back in plays at once. */
  stop() {
    this.endBreak();
    this.stopped = true;
    for (const p of this.players) this.free(p);
    this.announced = null;
    document.removeEventListener("visibilitychange", this.onVisible);
  }

  /** Leaving the page: everything goes. */
  dispose() {
    this.stop();
    this.warming = false;
    this.keeping?.abort();
    this.toKeep.clear();
    for (const d of this.decks) URL.revokeObjectURL(d.url);
    this.decks = [];
    this.failures.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.listening = false;
    this.players = [];
  }

  getAnalyser() {
    return this.ctx && !this.stopped ? this.analyser : null;
  }

  /** How long the sound takes from the page to the speaker (s): the visualizer shows its bars this late. */
  outputLatency(): number {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!ctx) return 0;
    return Math.max(0, Math.min(0.5, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)));
  }

  setVolume(v: number) {
    this.volume = v;
  }

  // ——— ad breaks (like a music app's free tier: one per ~20 minutes of listening) ———

  /** Listening since the last break (ms of a song actually sounding). */
  private listenedMs = 0;
  private lastListenAt = 0;
  /** The break playing now: the songs wait; the station's clock goes on, and they rejoin it after. */
  private adBreak: { p: Player; end: () => void } | null = null;

  /** How long this listener has listened since their last break. */
  get listenedSinceBreak(): number {
    return this.listenedMs;
  }

  get inBreak(): boolean {
    return !!this.adBreak;
  }

  /**
   * Plays an ad (`url`, at most `seconds`) on a player this tap unlocked —
   * on a phone the one player that never stops — then hands back to the
   * station where it is by then. `onHeard` once `heardAfter` seconds were
   * heard (the ad is paid then). Resolves true when it played, false when it
   * couldn't (the songs go on as if nothing happened).
   */
  playBreak(url: string, seconds: number, heardAfter: number, onHeard: () => void): Promise<boolean> {
    if (this.stopped || this.adBreak || !this.players.length) return Promise.resolve(false);
    const playing = this.sounding().sort((a, b) => (b.deck!.row.startsAt ?? 0) - (a.deck!.row.startsAt ?? 0));
    const p = playing[0] ?? this.players.find((x) => !x.deck) ?? this.players[0];
    return new Promise<boolean>((resolve) => {
      let heard = false;
      let started = false;
      const el = p.el;
      const finish = () => {
        if (this.adBreak?.p !== p) return;
        clearTimeout(timer);
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("ended", finish);
        el.removeEventListener("error", finish);
        el.removeEventListener("pause", onPause);
        this.adBreak = null;
        this.listenedMs = 0;
        // One player: straight to silence (never a pause, which could lose the phone's sound session); the next tick puts the song on.
        if (this.players.length === 1) this.playSilence(p);
        else this.free(p);
        resolve(started);
        this.onWake();
      };
      const onTime = () => {
        if (el.currentTime > 0.05) started = true;
        if (!heard && el.currentTime >= Math.min(heardAfter, seconds - 0.5)) {
          heard = true;
          onHeard();
        }
        if (el.currentTime >= seconds) finish();
      };
      // Paused by the phone (a call): the break ends; the radio's own pause handling takes over from there.
      const onPause = () => {
        if (performance.now() - p.touchedAt > OWN_CHANGE_MS && !el.ended) finish();
      };
      const timer = setTimeout(finish, (seconds + 8) * 1000);
      this.adBreak = { p, end: finish };
      for (const other of this.players) {
        if (other === p || other.el.paused) continue;
        other.touchedAt = performance.now();
        other.el.pause();
      }
      // The song on this player lets go of it (its deck stays readied and rejoins the station after).
      p.touchedAt = performance.now();
      p.deck = null;
      p.loaded = false;
      p.silent = false;
      p.nudging = false;
      p.landing = null;
      p.el.loop = false;
      p.el.playbackRate = 1;
      p.el.volume = Math.min(1, this.volume);
      p.el.src = url;
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("ended", finish);
      el.addEventListener("error", finish);
      el.addEventListener("pause", onPause);
      this.play(p);
    });
  }

  /** Ends a break now (tuning out, leaving the page). */
  endBreak() {
    this.adBreak?.end();
  }

  /** A deck is ready for `row`. */
  has(rowId: number) {
    return this.decks.some((d) => d.row.rowId === rowId);
  }

  private sounding() {
    return this.players.filter((p) => p.deck && !p.el.paused);
  }

  /** For the rigs: the newest song playing, and the song second it's at. */
  heard(serverNow?: number): { rowId: number; at: number; offMs: number | null; playing: number; levels: number[] } | null {
    const playing = this.sounding();
    const p = [...playing].sort((a, b) => (b.deck!.row.startsAt ?? 0) - (a.deck!.row.startsAt ?? 0))[0];
    if (!p?.deck) return null;
    const d = p.deck;
    const at = p.el.currentTime + d.offset;
    const expected = serverNow && d.row.startsAt ? (serverNow - d.row.startsAt) / 1000 : null;
    return {
      rowId: d.row.rowId,
      at,
      offMs: expected === null ? null : Math.round((at - expected) * 1000),
      playing: playing.length,
      levels: playing.map((x) => Math.round(x.el.volume * 100) / 100),
    };
  }
  /** This tab's guess of the server's clock (for the rigs). */
  serverClock = 0;

  // ——— players ———

  private play(p: Player) {
    p.touchedAt = performance.now();
    p.settleUntil = p.touchedAt + SETTLE_MAX_MS;
    p.el.play().then(
      () => {
        p.unlocked = true;
      },
      (e: unknown) => {
        // AbortError: a newer change took its place. NotAllowedError: the browser wants a tap.
        if ((e as { name?: string })?.name !== "NotAllowedError") return;
        this.blockedUntil = performance.now() + 2000;
        if (this.sounding().length === 0 && !this.stopped) this.onState("error", "Tap Tune in again to start the sound");
      }
    );
  }

  private playSilence(p: Player) {
    p.touchedAt = performance.now();
    p.deck = null;
    p.loaded = false;
    p.silent = true;
    p.nudging = false;
    p.el.playbackRate = 1;
    p.el.loop = true;
    p.el.src = silenceUrl();
    this.play(p);
  }

  /** Lets go of whatever `p` plays. */
  private free(p: Player) {
    p.touchedAt = performance.now();
    p.deck = null;
    p.loaded = false;
    p.silent = false;
    p.el.loop = false;
    p.el.pause();
    p.el.removeAttribute("src");
    p.el.load();
  }

  /** Puts `d` on `p` (it starts once loaded). On one player the song before is cut here, with no pause in between. */
  private load(p: Player, d: Deck) {
    p.touchedAt = performance.now();
    p.deck = d;
    p.loaded = false;
    p.seekedAt = -Infinity;
    p.nudging = false;
    p.landing = null;
    p.silent = false;
    p.el.loop = false;
    p.el.playbackRate = 1;
    if (this.mode === "volume") p.el.volume = 0;
    p.el.src = d.url;
  }

  /** A deck is done with: off its player, its file let go. */
  private release(d: Deck) {
    const p = this.players.find((x) => x.deck === d);
    if (p) this.free(p);
    URL.revokeObjectURL(d.url);
    this.decks = this.decks.filter((x) => x !== d);
  }

  /** Keeps a playing `p` at `into` (its file's second the station is at now): small drift by speed (two players), big by a jump. */
  private follow(p: Player, into: number) {
    const t = performance.now();
    if (t < p.settleUntil) return;
    const off = p.el.currentTime - into;
    const landing = p.landing;
    if (landing) {
      // How late this device's elements come in: the next start or jump makes up for it.
      p.landing = null;
      this.lead = Math.max(0, Math.min(MAX_LEAD, this.lead - off * 0.8));
    }
    const jump = Math.abs(off) > JUMP || (landing?.fix && Math.abs(off) > LANDED_OFF);
    if (jump && t - p.seekedAt > SEEK_GAP_MS) {
      p.seekedAt = t;
      p.touchedAt = t;
      p.settleUntil = t + SETTLE_MAX_MS;
      p.landing = { fix: false };
      p.nudging = false;
      p.el.playbackRate = 1;
      p.el.currentTime = Math.max(0, into + this.lead);
      return;
    }
    if (!this.nudges) return;
    if (Math.abs(off) > NUDGE_FROM) p.nudging = true;
    else if (Math.abs(off) < NUDGE_TO) p.nudging = false;
    // Ahead: slower; behind: faster. In steps of 0.5%, so the speed isn't changed on every look.
    const rate = p.nudging ? 1 - Math.round(Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, off * 0.15)) * 200) / 200 : 1;
    if (p.el.playbackRate !== rate) {
      p.el.preservesPitch = true;
      p.el.playbackRate = rate;
    }
  }

  // ——— mixing ———

  /**
   * A library song as one file: its vocal and beat (or parts) as uploaded,
   * summed — no effects to run, so it's ready in a second or two, where the
   * Studio's full mixdown of a remix takes much longer.
   */
  private async mixSong(lanes: RemixLaneApi[], from: number, duration: number, onProgress?: (fraction: number) => void): Promise<Blob> {
    const rate = 44100;
    const decoder = new OfflineAudioContext(2, 1, rate);
    // Each lane's download, as a share of all of them (a lane not started yet counts as 0 of unknown).
    const got = lanes.map(() => ({ loaded: 0, total: 0 }));
    const report = () => {
      const total = got.reduce((sum, g) => sum + g.total, 0);
      if (total && got.every((g) => g.total)) onProgress?.(got.reduce((sum, g) => sum + g.loaded, 0) / total);
    };
    const buffers = await Promise.all(
      lanes.map(async (l, i) =>
        decoder.decodeAudioData(
          await fetchStem(l.stem_id, (loaded, total) => {
            got[i] = { loaded, total };
            report();
          })
        )
      )
    );
    const length = Math.max(1, Math.ceil((Math.min(duration, Math.max(...buffers.map((b) => b.duration))) - from) * rate));
    const mix = new OfflineAudioContext(2, length, rate);
    for (const [i, buffer] of buffers.entries()) {
      const source = mix.createBufferSource();
      source.buffer = buffer;
      const gain = mix.createGain();
      gain.gain.value = lanes[i].volume ?? 1;
      source.connect(gain).connect(mix.destination);
      source.start(0, from);
    }
    return encodeWavGently(await mix.startRendering());
  }

  /** A remix mixed by the Studio's mixdown, from `from` to the song's end. */
  private async mixRemix(row: QueueRow, payload: PlayPayload, from: number, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
    const store = useStudioStore.getState();
    store.loadRemix(payload.lanes.map(laneFromApi), projectFromApi(payload.remix), { id: payload.remix.id, title: row.title });
    return renderMixWav({
      span: { start: from, end: Math.max(from + 1, row.duration) },
      tailSeconds: 0,
      signal,
      onProgress: onProgress && ((_stage, f) => f !== undefined && onProgress(f)),
    });
  }

  /** `row` from `from` seconds to its end as a playable file — or the kept whole mix, from its start. */
  private render(row: QueueRow, from: number): Promise<{ url: string; offset: number; keptKey: string | null }> {
    // The station needs the mixer: a keeping mix running now stops (and is tried again later).
    this.keeping?.abort();
    this.busy++;
    const job = this.queue.then(async () => {
      const asked = Date.now();
      const payload = await playPayload(this.slug, row.kind, row.id);
      const key = await radioMixKey(row.kind, payload, row.duration).catch(() => null);
      const kept = key ? await keptMix(key) : null;
      if (kept) return { url: URL.createObjectURL(kept), offset: 0, keptKey: key };
      const whole = from < 0.01;
      const blob =
        row.kind === "track"
          ? await this.mixSong(payload.lanes, from, row.duration, (f) => {
              // Shown only when it's slow (a poor line, a VPN): on a good one the song is in within a second or two.
              if (Date.now() - asked > SLOW_DOWNLOAD_MS && f < 1 && !this.stopped && this.sounding().length === 0) {
                this.onState("loading", `Slow connection — downloading the song… ${Math.round(f * 100)}%`);
              }
            })
          : await this.mixRemix(row, payload, from, (f) => {
              if (!this.stopped && this.sounding().length === 0) this.onState("loading", `Getting the remix ready… ${Math.round(f * 100)}%`);
            });
      if (key && whole) void keepMix(key, blob);
      else if (key) this.keepLater(key, row, payload);
      return { url: URL.createObjectURL(blob), offset: from, keptKey: null };
    });
    this.queue = job.catch(() => {}).finally(() => {
      this.busy--;
      this.keepNext();
    });
    return job;
  }

  /** Remembers to mix the whole of `row` for keeping, once the mixer is free. */
  private keepLater(key: string, row: QueueRow, payload: PlayPayload) {
    if (this.toKeep.has(key)) return;
    this.toKeep.set(key, async (signal) => {
      if (await keptMix(key)) return;
      // A remix's mix stops when the station needs the mixer; a song's takes a second or two and is kept even then.
      const blob = row.kind === "track" ? await this.mixSong(payload.lanes, 0, row.duration) : await this.mixRemix(row, payload, 0, undefined, signal);
      await keepMix(key, blob);
    });
  }

  /** Runs one keeping mix if nothing the station needs is waiting. */
  private keepNext() {
    if (this.busy > 0 || this.keeping || this.idle) return;
    const next = this.toKeep.entries().next();
    if (next.done) return;
    const [key, task] = next.value;
    this.toKeep.delete(key);
    const control = new AbortController();
    this.keeping = control;
    this.queue = this.queue
      .then(() => (control.signal.aborted ? Promise.reject(control.signal.reason) : task(control.signal)))
      .catch(() => {
        // Stopped for the station (or failed): tried again when the mixer is free, unless the radio was turned off.
        if (control.signal.aborted && !this.idle && !this.toKeep.has(key)) this.toKeep.set(key, task);
      })
      .finally(() => {
        if (this.keeping === control) this.keeping = null;
        this.keepNext();
      });
  }

  /** Notes a failure to ready `rowId`, to try again later; says so only when nothing is playing. */
  private fail(rowId: number, message: string) {
    const count = (this.failures.get(rowId)?.count ?? 0) + 1;
    this.failures.set(rowId, { count, retryAt: Date.now() + RETRY_MS[Math.min(count, RETRY_MS.length) - 1] });
    if (this.stopped || this.sounding().length > 0) return;
    if (count >= RETRY_MS.length) this.onState("error", message);
    else this.onState("loading", "The connection dropped — trying again…");
  }

  /**
   * The station's style for this change (AutoMix, filter sweep, echo…) built
   * into the start of the incoming song's file, from the outgoing song's own
   * file: then every device plays the same change, locked screens included.
   * Only for a song readied from its start, with the song before it ready;
   * otherwise (a tune-in mid-change, a failure) the plain crossfade plays.
   */
  private async withTransition(
    row: QueueRow,
    ready: { url: string; offset: number; keptKey: string | null }
  ): Promise<{ url: string; offset: number; keptKey: string | null; cut: boolean }> {
    const plain = { ...ready, cut: false };
    if (!isRendered(row.transition) || ready.offset > 0.01 || !row.startsAt) return plain;
    const before = this.decks.find((d) => d.row.startsAt && d.row.endsAt && d.row.startsAt < row.startsAt! && d.row.endsAt > row.startsAt!);
    if (!before?.row.endsAt || !before.row.startsAt) return plain;
    try {
      const seconds = (before.row.endsAt - row.startsAt) / 1000;
      const decoder = new OfflineAudioContext(2, 1, 44_100);
      const [a, b] = await Promise.all(
        [before.url, ready.url].map(async (u) => decoder.decodeAudioData(await (await fetch(u)).arrayBuffer()))
      );
      const tailFrom = (row.startsAt - before.row.startsAt) / 1000 - before.offset;
      if (tailFrom < 0 || tailFrom >= a.duration) return plain;
      const mixed = await renderTransition(row.transition!, { buffer: a, from: tailFrom }, b, seconds, before.row.bpm ?? null, row.bpm ?? null);
      const blob = await encodeWavGently(mixed);
      URL.revokeObjectURL(ready.url);
      // Not the kept whole song any more (the change is in it): nothing to forget if it won't play.
      return { url: URL.createObjectURL(blob), offset: 0, keptKey: null, cut: true };
    } catch {
      return plain;
    }
  }

  /** Makes sure `row` is (being) prepared; `from`: the song's second to mix from. */
  prepare(row: QueueRow, from: number) {
    if (this.has(row.rowId) || this.rendering.has(row.rowId) || this.idle) return;
    const failed = this.failures.get(row.rowId);
    if (failed && Date.now() < failed.retryAt) return;
    // The change into this song is built from the song before it, which may still be getting ready
    // (on tuning in, the song on air and the next one start together): wait for those first, or the
    // first change after tuning in fell back to the plain crossfade — a hard cut on an iPhone or iPad.
    // Only songs already being readied are waited for, so two can never wait on each other.
    const earlier = [...this.rendering.values()];
    const job = this.render(row, from)
      .then(async (ready) => {
        await Promise.allSettled(earlier);
        return this.withTransition(row, ready);
      })
      .then(({ url, offset, keptKey, cut }) => {
        if (this.idle) return URL.revokeObjectURL(url);
        this.failures.delete(row.rowId);
        this.decks.push({ row, url, offset, joinedAt: 0, fadeFromStart: from > 0.5, keptKey, cut });
        this.onWake();
      })
      .catch((e) => this.fail(row.rowId, e instanceof Error ? e.message : "Couldn't get the song ready"))
      .finally(() => this.rendering.delete(row.rowId));
    this.rendering.set(row.rowId, job);
  }

  // ——— following the station ———

  /**
   * Called a few times a second (and on the elements' events) with the
   * station's state: readies what's on and what's next, puts each song on a
   * player at its moment, keeps it on the station's clock, sets the
   * crossfade, and lets go of songs that have ended.
   */
  tick(now: QueueRow | null, upcoming: QueueRow | null, serverNow: number, fading: QueueRow | null = null) {
    this.serverClock = serverNow - Date.now();
    if (this.idle) return;
    // The station's word on each song (a skip moves its end, the next one's start): what it no longer plays goes.
    const live = new Map([fading, now, upcoming].filter((r): r is QueueRow => !!r).map((r) => [r.rowId, r]));
    for (const d of [...this.decks]) {
      const row = live.get(d.row.rowId);
      if (row && serverNow < (row.endsAt ?? 0)) d.row = row;
      else this.release(d);
    }
    // What's on air: readied from where the station is. Seconds before its end: not worth it, the next one is about to take over.
    if (now?.startsAt && now.endsAt && !this.has(now.rowId) && !this.rendering.has(now.rowId) && (now.endsAt - serverNow) / 1000 > 4) {
      if (!this.stopped && this.sounding().length === 0 && !this.failures.has(now.rowId)) this.onState("loading");
      // Getting ready, the page hidden: nothing is mixed for no one to hear.
      if (!this.stopped || !document.hidden) this.prepare(now, Math.max(0, (serverNow - now.startsAt) / 1000));
    }
    // The next song: while tuned in, or about to start (a tap near the change plays at once).
    if (upcoming && (!this.stopped || (!document.hidden && (upcoming.startsAt ?? 0) - serverNow < 20_000))) this.prepare(upcoming, 0);
    if (this.stopped) return;
    // Listening time, for the next break: only while a song really sounds.
    const t = performance.now();
    if (this.lastListenAt && this.sounding().length && !this.adBreak) this.listenedMs += Math.min(2000, t - this.lastListenAt);
    this.lastListenAt = t;
    if (this.adBreak) return;

    const plan = planDecks(
      this.decks.map((d) => ({ rowId: d.row.rowId, startsAt: d.row.startsAt ?? 0, endsAt: d.row.endsAt ?? 0, offset: d.offset, cut: d.cut })),
      serverNow,
      this.players.length === 1 ? 1 : 2
    );
    const deckOf = (rowId: number) => this.decks.find((d) => d.row.rowId === rowId)!;
    const wanted = new Map(plan.sound.map((v) => [v.rowId, v]));

    // Players whose song isn't wanted now (and isn't the next one, loading early) let it go.
    for (const p of this.players) {
      if (p.deck && !wanted.has(p.deck.row.rowId) && p.deck.row.rowId !== plan.preload) {
        // One player: the next song goes straight on (load cuts this one), or silence does — never a pause, which could lose the sound session.
        if (this.players.length === 1) {
          if (!plan.sound.length) this.playSilence(p);
          continue;
        }
        this.free(p);
      }
    }
    const freePlayer = () => this.players.find((p) => !p.deck) ?? (this.players.length === 1 ? this.players[0] : null);
    for (const v of plan.sound) {
      const d = deckOf(v.rowId);
      if (this.players.some((p) => p.deck === d)) continue;
      const p = freePlayer();
      if (p) this.load(p, d);
    }
    if (plan.preload !== null) {
      const d = deckOf(plan.preload);
      const p = this.players.find((x) => !x.deck);
      if (p && !this.players.some((x) => x.deck === d)) this.load(p, d);
    }

    let newest: Deck | null = null;
    for (const p of this.players) {
      const d = p.deck;
      const v = d && wanted.get(d.row.rowId);
      if (!d || !v) {
        if (d && !p.el.paused) {
          p.touchedAt = performance.now();
          p.el.pause();
        }
        continue;
      }
      if (!p.loaded) continue;
      if (p.el.paused) {
        if (performance.now() < this.blockedUntil) continue;
        p.el.currentTime = Math.max(0, v.into + this.lead);
        p.landing = { fix: !d.joinedAt };
        d.joinedAt ||= performance.now();
        this.play(p);
      } else {
        this.follow(p, v.into);
      }
      let level = v.gain * this.volume;
      if (d.fadeFromStart && d.joinedAt) level *= Math.min(1, (performance.now() - d.joinedAt) / 1000 / FADE_IN);
      if (this.mode === "volume") p.el.volume = Math.min(1, Math.max(0, level));
      if (!p.el.paused && (!newest || (d.row.startsAt ?? 0) > (newest.row.startsAt ?? 0))) newest = d;
    }

    // Nothing to hear yet (a song being mixed, a gap): a free player plays silence, keeping the page's sound session.
    if (!this.players.some((p) => p.deck && wanted.has(p.deck.row.rowId))) {
      const p = this.players.find((x) => !x.deck);
      if (p && !p.silent) this.playSilence(p);
    }
    // Spare silence (the tap's unlocking) stops once a song plays.
    for (const p of this.players) {
      if (p.silent && p.unlocked && newest) {
        p.touchedAt = performance.now();
        p.silent = false;
        p.el.pause();
      }
    }

    if (newest) {
      this.onState("on");
      if (!this.ctx && !this.listening) {
        this.listening = true;
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (idle) idle(() => this.listen(), { timeout: 3000 });
        else setTimeout(() => this.listen(), 1000);
      }
      if (this.announced?.rowId !== newest.row.rowId) {
        this.announced = newest.row;
        this.onPlaying(newest.row);
      }
    }
  }
}
