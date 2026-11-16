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
  progress: number; // 0..1
  currentTime: number;
  duration: number;
};

type Listener = (state: PreviewState) => void;

class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private startListeners = new Set<() => void>();
  private state: PreviewState = {
    current: null,
    playing: false,
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
      audio.addEventListener("ended", () => this.stop());
      audio.addEventListener("pause", () => this.emit({ playing: false }));
      audio.addEventListener("play", () => this.emit({ playing: true }));
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
    setNowPlaying(
      "preview",
      current && {
        title: current.title,
        artist: current.artist,
        album: `${kindLabel(current.kind)} · Remixt`,
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
      }
    );
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

  async toggle(track: PreviewTrack) {
    if (this.state.current?.stemId === track.stemId) {
      if (this.state.playing) {
        this.getAudio().pause();
      } else {
        this.claim();
        await this.getAudio().play().catch(() => this.stop());
      }
      return;
    }
    await this.play(track);
  }

  async play(track: PreviewTrack) {
    this.claim();
    const audio = this.getAudio();
    const playing = ++this.playCount;
    this.emit({ current: track, progress: 0, currentTime: 0, duration: 0 });
    // Kept on this device already: played from there — at once, and offline.
    const kept = await keptStem(track.stemId);
    if (playing !== this.playCount) return;
    this.setSource(kept ? this.objectUrl(kept) : `/api/audio/stem/${track.stemId}`);
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch (err) {
      if (playing !== this.playCount) return;
      // The store's CDN can be blocked where this site isn't: through this app instead.
      if (!kept && !(err instanceof DOMException && err.name === "NotAllowedError")) {
        this.setSource(`/api/audio/stem/${track.stemId}?via=app`);
        try {
          await audio.play();
        } catch {
          if (playing === this.playCount) this.stop();
          return;
        }
      } else {
        // Autoplay refusal or a stem that failed to load — don't leave the
        // UI claiming something is playing.
        this.stop();
        return;
      }
    }
    if (track.keep && !kept) void keepStem(track.stemId);
  }

  /** Bumped by every play, so a slow cache lookup can't start an older one. */
  private playCount = 0;
  private url: string | null = null;

  private objectUrl(blob: Blob) {
    return URL.createObjectURL(blob);
  }

  private setSource(src: string) {
    if (this.url) URL.revokeObjectURL(this.url);
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
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.emit({ current: null, playing: false, progress: 0, currentTime: 0, duration: 0 });
  }
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

/** Downloads a stem into the device's cache, once at a time per stem. */
const keeping = new Set<string>();
async function keepStem(stemId: string) {
  if (keeping.has(stemId)) return;
  keeping.add(stemId);
  try {
    const { fetchStem } = await import("./stemFetch");
    await fetchStem(stemId);
  } catch {
    // Only the shortcut is lost: it streams again next time.
  } finally {
    keeping.delete(stemId);
  }
}

export const previewPlayer = new PreviewPlayer();

const SERVER_SNAPSHOT: PreviewState = {
  current: null,
  playing: false,
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
