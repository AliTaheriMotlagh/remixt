"use client";

import { useSyncExternalStore } from "react";

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
  kind: "vocals" | "beat";
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
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  isPlaying(stemId: string) {
    return this.state.playing && this.state.current?.stemId === stemId;
  }

  async toggle(track: PreviewTrack) {
    if (this.state.current?.stemId === track.stemId) {
      if (this.state.playing) {
        this.getAudio().pause();
      } else {
        await this.getAudio().play().catch(() => this.stop());
      }
      return;
    }
    await this.play(track);
  }

  async play(track: PreviewTrack) {
    const audio = this.getAudio();
    audio.src = `/api/audio/stem/${track.stemId}`;
    audio.currentTime = 0;
    this.emit({ current: track, progress: 0, currentTime: 0, duration: 0 });
    try {
      await audio.play();
    } catch {
      // Autoplay refusal or a stem that failed to load — don't leave the
      // UI claiming something is playing.
      this.stop();
    }
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
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    this.emit({ current: null, playing: false, progress: 0, currentTime: 0, duration: 0 });
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
