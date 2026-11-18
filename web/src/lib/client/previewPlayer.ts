"use client";

import { useSyncExternalStore } from "react";
import { keepScreenOn } from "./wakeLock";
import { setNowPlaying } from "./mediaSession";
import { kindLabel, type StemKind } from "@/lib/stemKinds";

// A single <audio> element shared by every "play this stem" button in the
// app. Previews used to be owned by the component that started them, so
// navigating away, switching library tabs or jumping to the Studio left
// audio playing with the stop button unmounted and no way to reach it.
// Routing every preview through one module means there is always exactly
// one thing playing and always somewhere to stop it (see PreviewBar).
//
// A stem played from a list (the Library) remembers that list as its
// queue: when it ends the next one plays, and the lock screen's next and
// previous buttons step through it — so the Library keeps playing with the
// phone locked or another app open.

export type PreviewTrack = {
  stemId: string;
  title: string;
  artist: string;
  kind: StemKind;
  /**
   * Keep the stem on this device once it's played (the Studio's stem cache,
   * see stemFetch): a song just uploaded is about to be opened in the
   * Studio, which then needs no download — and plays it again offline.
   */
  keep?: boolean;
};

export type PreviewState = {
  current: PreviewTrack | null;
  playing: boolean;
  /** Between the tap and the sound (finding the file, buffering), or stalled mid-play. */
  loading: boolean;
  /** Why the last stem asked for couldn't be played; gone when the next one starts. */
  error: string | null;
  progress: number; // 0..1
  currentTime: number;
  duration: number;
};

/** A second tap this soon after the first is the same tap (a double tap), not a change of mind. */
const DOUBLE_TAP_MS = 600;

type Listener = (state: PreviewState) => void;

/** What the player needs from the device's stem cache (tests give it their own). */
type Cache = {
  /** The stem's file, if this device keeps it. */
  kept: (stemId: string) => Promise<Blob | null>;
  /** Keep it for next time, when nothing more urgent wants the line. */
  keepLater: (stemId: string) => void;
};

export class PreviewPlayer {
  private cache: Cache;
  constructor(cache: Cache = { kept: keptStem, keepLater }) {
    this.cache = cache;
  }

  private audio: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private startListeners = new Set<() => void>();
  private state: PreviewState = {
    current: null,
    playing: false,
    loading: false,
    error: null,
    progress: 0,
    currentTime: 0,
    duration: 0,
  };

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.addEventListener("timeupdate", () => {
        const duration = audio.duration || 0;
        this.emit({
          progress: duration ? audio.currentTime / duration : 0,
          currentTime: audio.currentTime,
          duration,
        });
      });
      audio.addEventListener("loadedmetadata", () => {
        this.emit({ duration: audio.duration || 0 });
      });
      // The next in the queue, if there is one; else done.
      audio.addEventListener("ended", () => {
        const next = this.neighbour(1);
        if (next) void this.play(next);
        else this.stop();
      });
      audio.addEventListener("pause", () => this.emit({ playing: false }));
      audio.addEventListener("play", () => this.emit({ playing: true }));
      // Sound is actually coming out / it has run dry and is waiting for more.
      audio.addEventListener("playing", () => this.emit({ loading: false }));
      audio.addEventListener("waiting", () => this.state.current && this.emit({ loading: true }));
      // The source gave out after it had started (the line dropped, the
      // CDN hiccuped): carry on from the same place by the next way there.
      audio.addEventListener("error", () => {
        if (this.starting || !this.state.current) return;
        const at = audio.currentTime;
        this.source++;
        void this.start(this.playCount, at);
      });
      this.audio = audio;
    }
    return this.audio;
  }

  getState(): PreviewState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(patch: Partial<PreviewState>) {
    if (patch.playing !== undefined && patch.playing !== this.state.playing) {
      keepScreenOn("preview", patch.playing);
    }
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
    this.reportNowPlaying();
  }

  /** The lock screen / media notification (see mediaSession). */
  private reportNowPlaying() {
    const { current, playing, currentTime, duration } = this.state;
    // The song's picture on the lock screen: made once, then the report is made again with it.
    if (current && this.art?.stemId !== current.stemId && typeof document !== "undefined") {
      const stemId = current.stemId;
      this.art = { stemId, url: null };
      void import("./mixArt")
        .then(({ songArtworkUrl }) => songArtworkUrl({ stemId, title: current.title, artist: current.artist, peaks: [] }))
        .then((url) => {
          if (this.art?.stemId !== stemId || !url) return;
          this.art = { stemId, url };
          this.reportNowPlaying();
        });
    }
    setNowPlaying(
      "preview",
      current && {
        title: current.title,
        artist: current.artist,
        album: `${kindLabel(current.kind)} · Remixt`,
        artwork: this.art?.stemId === current.stemId ? this.art.url : null,
        playing,
        position: currentTime,
        duration,
        play: () => {
          if (!this.state.playing) void this.toggle(current);
        },
        pause: () => this.audio?.pause(),
        stop: () => this.stop(),
        seekTo: (seconds) => {
          if (duration > 0) this.seek(seconds / duration);
        },
        next: this.neighbour(1) ? () => void this.next() : undefined,
        previous: this.neighbour(-1) || current ? () => void this.previous() : undefined,
      }
    );
  }

  /** The lock screen's picture of the current stem's song (see reportNowPlaying). */
  private art: { stemId: string; url: string | null } | null = null;

  /** The list the current stem was played from (the Library's, as shown), to go on with. */
  private queue: PreviewTrack[] = [];

  /** The stem `step` places from the current one in its queue, if any. */
  private neighbour(step: 1 | -1): PreviewTrack | null {
    const id = this.state.current?.stemId;
    if (!id) return null;
    const at = this.queue.findIndex((t) => t.stemId === id);
    if (at < 0) return null;
    return this.queue[at + step] ?? null;
  }

  /** On to the next stem in the queue (nothing when it's the last). */
  async next() {
    const next = this.neighbour(1);
    if (next) await this.play(next);
  }

  /** Back to the start of this stem, or — at its start already — the one before it. */
  async previous() {
    const before = this.neighbour(-1);
    if (before && (this.audio?.currentTime ?? 0) < 3) await this.play(before);
    else this.seek(0);
  }

  /**
   * Called just before a preview starts, so whatever else is playing (the
   * Studio mix) can stop first — only one thing plays at a time.
   */
  onStart(listener: () => void): () => void {
    this.startListeners.add(listener);
    return () => {
      this.startListeners.delete(listener);
    };
  }

  private claim() {
    for (const listener of this.startListeners) listener();
  }

  isPlaying(stemId: string) {
    return this.state.playing && this.state.current?.stemId === stemId;
  }

  /** Plays or pauses `track`; `queue`, the list it's in, is what plays after it (see next). */
  async toggle(track: PreviewTrack, queue?: PreviewTrack[]) {
    if (queue) this.queue = queue.slice();
    if (this.state.current?.stemId === track.stemId) {
      if (this.state.playing) {
        this.getAudio().pause();
      } else if (this.state.loading) {
        // Still on its way. Tapped again at once: the same tap, twice (it
        // used to cancel the play it had just started). Later: a change of mind.
        if (Date.now() - this.startedAt > DOUBLE_TAP_MS) this.stop();
      } else {
        this.claim();
        await this.getAudio().play().catch(() => this.stop());
      }
      return;
    }
    await this.play(track);
  }

  async play(track: PreviewTrack, queue?: PreviewTrack[]) {
    if (queue) this.queue = queue.slice();
    // Played on its own (not from the list it was queued from): no queue.
    else if (!this.queue.some((t) => t.stemId === track.stemId)) this.queue = [];
    this.claim();
    const playing = ++this.playCount;
    this.startedAt = Date.now();
    this.emit({ current: track, playing: false, loading: true, error: null, progress: 0, currentTime: 0, duration: 0 });
    // Kept on this device already: played from there — at once, and offline.
    const kept = await this.cache.kept(track.stemId);
    if (playing !== this.playCount) return;
    // The ways to this stem, best first. The store's CDN can be blocked
    // where this site isn't, so the last is through this app.
    this.sources = [
      ...(kept ? [URL.createObjectURL(playable(kept))] : []),
      `/api/audio/stem/${track.stemId}`,
      `/api/audio/stem/${track.stemId}?via=app`,
    ];
    this.source = 0;
    if (await this.start(playing, 0)) {
      if (track.keep && !kept) this.cache.keepLater(track.stemId);
    }
  }

  /**
   * Plays the current stem from `seconds` in, by the first of its sources
   * (from `this.source` on) that works; false when none does. A copy kept
   * on this device that won't play (the browser lost the file behind it, or
   * can't read it) is no reason to play nothing: it's streamed instead.
   */
  private async start(playing: number, seconds: number): Promise<boolean> {
    const audio = this.getAudio();
    this.starting = true;
    try {
      for (; this.source < this.sources.length; this.source++) {
        this.setSource(this.sources[this.source]);
        audio.currentTime = seconds;
        try {
          await audio.play();
          return true;
        } catch (err) {
          if (playing !== this.playCount) return false;
          // The browser wants a tap first: another source won't change its mind.
          if (err instanceof DOMException && err.name === "NotAllowedError") break;
        }
      }
    } finally {
      if (playing === this.playCount) this.starting = false;
    }
    if (playing === this.playCount) {
      // Don't leave the UI claiming something is playing.
      this.stop();
      this.emit({ error: "Couldn't play that — check your connection and try again" });
    }
    return false;
  }

  /** Bumped by every play, so a slow cache lookup can't start an older one. */
  private playCount = 0;
  private startedAt = 0;
  /** The ways to the current stem, and the one in use. */
  private sources: string[] = [];
  private source = 0;
  /** While `start` is trying sources: their failures are its to handle, not the error event's. */
  private starting = false;
  private url: string | null = null;

  private setSource(src: string) {
    if (this.url && this.url !== src) URL.revokeObjectURL(this.url);
    this.url = src.startsWith("blob:") ? src : null;
    this.getAudio().src = src;
  }

  seek(fraction: number) {
    const audio = this.audio;
    if (!audio || !audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
  }

  setVolume(volume: number) {
    this.getAudio().volume = Math.max(0, Math.min(1, volume));
  }

  stop() {
    this.playCount++;
    this.starting = false;
    // A kept copy that was lined up but never reached.
    for (const src of this.sources) if (src.startsWith("blob:") && src !== this.url) URL.revokeObjectURL(src);
    this.sources = [];
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.emit({ current: null, playing: false, loading: false, error: null, progress: 0, currentTime: 0, duration: 0 });
  }

  /** Nothing is playing or about to: resolves at once if so, else when it's so. */
  untilQuiet(): Promise<void> {
    const busy = () => this.state.playing || this.state.loading;
    if (!busy()) return Promise.resolve();
    return new Promise((resolve) => {
      const stop = this.subscribe(() => {
        if (busy()) return;
        stop();
        resolve();
      });
    });
  }
}

/**
 * A kept stem as something every browser will play. The cache keeps bare
 * bytes, with no type — which Chrome works out for itself and Safari (so
 * every browser on an iPhone) refuses to play: a stem played once, or
 * opened in the Studio, then wouldn't play again. Stems are MP3s.
 */
export function playable(blob: Blob): Blob {
  return blob.type ? blob : new Blob([blob], { type: "audio/mpeg" });
}

/** The stem's file, if this device keeps it (see stemFetch). */
async function keptStem(stemId: string): Promise<Blob | null> {
  try {
    const { cacheGet } = await import("./localCache");
    return await cacheGet<Blob>("stem", stemId);
  } catch {
    return null;
  }
}

/**
 * Keeps stems on this device for later (the Studio then opens them with no
 * download) — one at a time, in small slices, and only while nothing is
 * playing or loading: fetched alongside the stream, the copies took the
 * line from the very thing being listened to, and after a few stems on a
 * phone nothing would start at all.
 */
const toKeep: string[] = [];
let keeping = false;
function keepLater(stemId: string) {
  if (!toKeep.includes(stemId)) toKeep.push(stemId);
  if (keeping) return;
  keeping = true;
  void (async () => {
    const { fetchStem } = await import("./stemFetch");
    const pace = { parallel: 1, slice: 512 * 1024, before: () => previewPlayer.untilQuiet() };
    for (let id = toKeep.shift(); id; id = toKeep.shift()) {
      // Only the shortcut is lost if it fails: it streams again next time.
      await fetchStem(id, undefined, pace).catch(() => {});
    }
    keeping = false;
  })();
}

export const previewPlayer = new PreviewPlayer();

const SERVER_SNAPSHOT: PreviewState = {
  current: null,
  playing: false,
  loading: false,
  error: null,
  progress: 0,
  currentTime: 0,
  duration: 0,
};

/** Subscribes a component to the shared preview player. */
export function usePreviewState(): PreviewState {
  return useSyncExternalStore(
    (onChange) => previewPlayer.subscribe(onChange),
    () => previewPlayer.getState(),
    () => SERVER_SNAPSHOT
  );
}
