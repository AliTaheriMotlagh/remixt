"use client";

import type { QueueRow } from "@/lib/radio";
import { crossfadeGains } from "@/lib/radioPick";
import { audioEngine } from "./audioEngine";
import { encodeWav, renderMixWav } from "./mixdown";
import { fetchStem } from "./stemFetch";
import { laneFromApi, projectFromApi, type RemixApi, type RemixLaneApi } from "./remixLanes";
import { useStudioStore } from "./studioStore";

// The radio's two decks. Every song on air is rendered to a WAV in this tab
// (the Studio's own mixdown, so a remix sounds exactly as made) and played
// through an <audio> element — which keeps playing with the screen locked,
// in another app, or on the home screen. The next song is rendered while
// this one plays, so when the station's schedule says it starts (a
// crossfade before this one ends, on its bar lines — see crossfadeFor),
// the two blend with equal-power gains, in every tab at the same moment.
//
// Where the browser lets a page set an element's volume, the decks run
// through Web Audio (gain + an analyser for the visualizer); iPhones don't
// allow that, so there they play as they are and change at the crossfade's
// start.

/** Off the station by more than this (seconds): jump back on. */
const DRIFT = 0.4;
/** Tuning in mid-song: the sound comes up over this long instead of with a click. */
const FADE_IN = 0.35;

type Deck = {
  row: QueueRow;
  el: HTMLAudioElement;
  url: string;
  /** The song's second at the file's start (a tune-in renders from where the station is). */
  offset: number;
  gain: GainNode | null;
  /** When this tab started it (for the short fade-in of a mid-song tune-in). */
  joinedAt: number;
  fadeFromStart: boolean;
};

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data as T;
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

export class RadioDeck {
  private decks: Deck[] = [];
  private rendering = new Map<number, Promise<void>>();
  /** Renders share the Studio's state: one at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private routed = false;
  private volume = 0.9;
  private stopped = true;
  onState: (state: "loading" | "on" | "error", message?: string) => void = () => {};

  constructor(private readonly slug: string) {}

  /** Starts from a tap (so the browser allows sound). */
  start() {
    this.stopped = false;
    if (!this.ctx && volumeWorks()) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor({ latencyHint: "playback" });
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.connect(this.ctx.destination);
        this.routed = true;
      } catch {
        this.routed = false;
      }
    }
    void this.ctx?.resume();
    // The Studio's live engine stays quiet: the radio plays its renders.
    audioEngine.stop();
  }

  stop() {
    this.stopped = true;
    for (const d of this.decks) this.drop(d);
    this.decks = [];
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  getAnalyser() {
    return this.routed && !this.stopped ? this.analyser : null;
  }

  setVolume(v: number) {
    this.volume = v;
  }

  /** The deck playing `row`, if any. */
  has(rowId: number) {
    return this.decks.some((d) => d.row.rowId === rowId);
  }

  /** For the rigs: the newest deck that's playing, and the song second it's at. */
  heard(serverNow?: number): { rowId: number; at: number; offMs: number | null; playing: number; levels: number[] } | null {
    const d = [...this.decks].reverse().find((x) => !x.el.paused);
    const playing = this.decks.filter((x) => !x.el.paused);
    if (!d) return null;
    const at = d.el.currentTime + d.offset;
    const expected = serverNow && d.row.startsAt ? (serverNow - d.row.startsAt) / 1000 : null;
    return {
      rowId: d.row.rowId,
      at,
      offMs: expected === null ? null : Math.round((at - expected) * 1000),
      playing: playing.length,
      levels: playing.map((x) => Math.round((x.gain?.gain.value ?? x.el.volume) * 100) / 100),
    };
  }
  /** This tab's guess of the server's clock (for the rigs). */
  serverClock = 0;

  /** The element sounding loudest now (for the lock screen's play/pause). */
  current(): HTMLAudioElement | null {
    return this.decks[this.decks.length - 1]?.el ?? null;
  }

  private drop(d: Deck) {
    d.el.pause();
    d.el.removeAttribute("src");
    d.el.load();
    try {
      d.gain?.disconnect();
    } catch {
      // already gone
    }
    URL.revokeObjectURL(d.url);
  }

  /**
   * A library song as one file: its vocal and beat (or parts) as uploaded,
   * summed — no effects to run, so it's ready in a second or two, where the
   * Studio's full mixdown of a remix takes much longer.
   */
  private async mixSong(lanes: RemixLaneApi[], from: number, duration: number): Promise<Blob> {
    const rate = 44100;
    const decoder = new OfflineAudioContext(2, 1, rate);
    const buffers = await Promise.all(lanes.map(async (l) => decoder.decodeAudioData(await fetchStem(l.stem_id))));
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
    return encodeWav(await mix.startRendering());
  }

  /** Renders `row` from `from` seconds to its end, as a playable file. */
  private render(row: QueueRow, from: number): Promise<{ url: string; offset: number }> {
    const job = this.queue.then(async () => {
      const payload = await fetch(`/api/radio/${encodeURIComponent(this.slug)}/play?kind=${row.kind}&id=${encodeURIComponent(row.id)}`).then((r) =>
        json<{ remix: RemixApi; lanes: RemixLaneApi[] }>(r)
      );
      if (row.kind === "track") return { url: URL.createObjectURL(await this.mixSong(payload.lanes, from, row.duration)), offset: from };
      const store = useStudioStore.getState();
      store.loadRemix(payload.lanes.map(laneFromApi), projectFromApi(payload.remix), { id: payload.remix.id, title: row.title });
      const end = Math.max(from + 1, row.duration);
      const blob = await renderMixWav({
        span: { start: from, end },
        tailSeconds: 0,
        onProgress: (_stage, f) => {
          if (f !== undefined && !this.decks.some((d) => !d.el.paused)) this.onState("loading", `Getting the remix ready… ${Math.round(f * 100)}%`);
        },
      });
      return { url: URL.createObjectURL(blob), offset: from };
    });
    this.queue = job.catch(() => {});
    return job;
  }

  /** Makes sure `row` is (being) prepared; `from`: the song's second to render from. */
  prepare(row: QueueRow, from: number) {
    if (this.has(row.rowId) || this.rendering.has(row.rowId) || this.stopped) return;
    const job = this.render(row, from)
      .then(({ url, offset }) => {
        if (this.stopped) return URL.revokeObjectURL(url);
        const el = new Audio();
        el.preload = "auto";
        el.src = url;
        // Keeps playing in the background on phones; marks it as music.
        el.setAttribute("playsinline", "");
        let gain: GainNode | null = null;
        if (this.routed && this.ctx && this.analyser) {
          const source = this.ctx.createMediaElementSource(el);
          gain = this.ctx.createGain();
          gain.gain.value = 0;
          source.connect(gain).connect(this.analyser);
        }
        this.decks.push({ row, el, url, offset, gain, joinedAt: 0, fadeFromStart: offset > 0.5 });
        this.decks.sort((a, b) => (a.row.startsAt ?? 0) - (b.row.startsAt ?? 0));
      })
      .catch((e) => this.onState("error", e instanceof Error ? e.message : "Couldn't get the song ready"))
      .finally(() => this.rendering.delete(row.rowId));
    this.rendering.set(row.rowId, job);
  }

  /**
   * Called a few times a second with the station's state: starts each deck
   * at its moment, keeps it on the station's clock, sets the crossfade gains,
   * lets go of songs that have ended.
   */
  tick(now: QueueRow | null, upcoming: QueueRow | null, serverNow: number, fading: QueueRow | null = null) {
    this.serverClock = serverNow - Date.now();
    if (this.stopped) return;
    // The station's word on each song (a skip moves its end, the next one's start): what it no longer plays goes.
    const live = new Map([fading, now, upcoming].filter((r): r is QueueRow => !!r).map((r) => [r.rowId, r]));
    for (const d of [...this.decks]) {
      const row = live.get(d.row.rowId);
      if (row) d.row = row;
      else {
        this.drop(d);
        this.decks.splice(this.decks.indexOf(d), 1);
      }
    }
    // What's on air: ready it from where the station is (plus a little, for the render's own time).
    if (now?.startsAt && now.endsAt && !this.has(now.rowId) && !this.rendering.has(now.rowId)) {
      const left = (now.endsAt - serverNow) / 1000;
      // Seconds before the end: not worth it, the next one is about to take over.
      if (left > 4) {
        this.onState("loading");
        this.prepare(now, Math.max(0, (serverNow - now.startsAt) / 1000));
      }
    }
    if (upcoming) this.prepare(upcoming, 0);

    let sounding = false;
    for (const d of [...this.decks]) {
      const start = d.row.startsAt ?? 0;
      const end = d.row.endsAt ?? 0;
      if (serverNow >= end) {
        this.drop(d);
        this.decks.splice(this.decks.indexOf(d), 1);
        continue;
      }
      const into = (serverNow - start) / 1000 - d.offset;
      if (into < 0) continue;
      if (d.el.paused) {
        d.el.currentTime = into;
        d.joinedAt = performance.now();
        void d.el.play().catch(() => this.onState("error", "Tap Tune in again to start the sound"));
      } else if (Math.abs(d.el.currentTime - into) > DRIFT) d.el.currentTime = into;

      // The gains: in over the overlap with the song before, out over the overlap with the next.
      const before = this.decks.find((o) => o !== d && (o.row.endsAt ?? 0) > start && (o.row.startsAt ?? 0) < start);
      const after = this.decks.find((o) => o !== d && (o.row.startsAt ?? 0) > start && (o.row.startsAt ?? 0) < end) ?? (upcoming && upcoming.rowId !== d.row.rowId ? { row: upcoming } : undefined);
      let g = 1;
      if (before) {
        const overlap = ((before.row.endsAt ?? 0) - start) / 1000;
        if (overlap > 0) g *= crossfadeGains((serverNow - start) / 1000 / overlap).in;
      }
      if (after?.row.startsAt && after.row.startsAt < end) {
        const overlap = (end - after.row.startsAt) / 1000;
        if (serverNow > after.row.startsAt && overlap > 0) g *= crossfadeGains((serverNow - after.row.startsAt) / 1000 / overlap).out;
      }
      if (d.fadeFromStart && d.joinedAt) g *= Math.min(1, (performance.now() - d.joinedAt) / 1000 / FADE_IN);
      const level = g * this.volume;
      if (d.gain) d.gain.gain.setTargetAtTime(level, d.gain.context.currentTime, 0.03);
      else if (this.routed) d.el.volume = Math.min(1, level);
      else {
        // No volume control here (iPhone): the outgoing song stops where the next one starts.
        const next = after?.row.startsAt;
        if (next && serverNow >= next && !d.el.paused) d.el.pause();
      }
      sounding ||= !d.el.paused;
    }
    if (sounding) this.onState("on");
  }
}
