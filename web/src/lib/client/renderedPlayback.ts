"use client";

import type { StudioLane, MasterFx } from "./studioStore";

// Listening mode, for pages that play a finished mix (a remix's page, the
// embed): the mix is rendered once into a WAV and played through an
// <audio> element. Phones keep a media element playing with the screen
// locked, in another app or on the home screen far more reliably than Web
// Audio, which iOS stops with the page. Play starts at once on the live
// engine; the render runs meanwhile and playback moves over to it, at the
// same spot, when it's ready. Any change to what's heard (a stem muted in
// the mixer) is a different mix: playback goes back to the live engine.
// The engine (audioEngine.ts) drives this; nothing else should.

/** What decides how the mix sounds — not the playhead, selection or waveforms. */
export type ListenState = {
  lanes: StudioLane[];
  master: MasterFx;
  masterVolume: number;
  projectBpm: number;
  crossfader: number;
  duration: number;
};

/** The same text for the same sound: a rendered file is good for as long as this doesn't change. */
export function listenKey(state: ListenState): string {
  return JSON.stringify([
    // The waveform and the lane's name don't change the sound (undefined is left out).
    state.lanes.map((lane) => ({ ...lane, peaks: undefined, name: undefined })),
    state.master,
    state.masterVolume,
    state.projectBpm,
    state.crossfader,
    state.duration,
  ]);
}

/** The key, worked out again only when one of its parts is a new object. */
export function keyKeeper() {
  let last: ListenState | null = null;
  let key = "";
  return (state: ListenState) => {
    if (
      !last ||
      state.lanes !== last.lanes ||
      state.master !== last.master ||
      state.masterVolume !== last.masterVolume ||
      state.projectBpm !== last.projectBpm ||
      state.crossfader !== last.crossfader ||
      state.duration !== last.duration
    ) {
      key = listenKey(state);
      last = state;
    }
    return key;
  };
}

/** Half a second of silence, to unlock the element inside the tap that starts play (iOS asks for that). */
function silence(): string {
  const rate = 8000;
  const samples = rate / 2;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
}

export class RenderedPlayback {
  /** On while a listening page is open. */
  enabled = false;
  private el: HTMLAudioElement | null = null;
  private silentUrl: string | null = null;
  /** The rendered mix, and the key of the mix it is. */
  private file: { key: string; url: string } | null = null;
  private rendering: { key: string; promise: Promise<boolean>; abort: AbortController } | null = null;
  /** Whether it's playing because we asked it to (a pause we didn't ask for is the phone's: a call, another app). */
  private wanted = false;
  /** Called when the phone pauses it on its own. */
  onLost: (() => void) | null = null;
  /** Called when it plays to its end. */
  onEnded: (() => void) | null = null;

  private element(): HTMLAudioElement {
    if (!this.el) {
      const el = new Audio();
      el.preload = "auto";
      el.setAttribute("playsinline", "");
      el.addEventListener("pause", () => {
        if (!this.wanted || el.ended) return;
        this.wanted = false;
        this.onLost?.();
      });
      el.addEventListener("ended", () => {
        if (!this.wanted) return;
        this.wanted = false;
        this.onEnded?.();
      });
      this.el = el;
    }
    return this.el;
  }

  /**
   * Inside the tap that starts play: the element plays a moment of silence,
   * so it may play the mix later without a tap of its own (iOS).
   */
  prime() {
    if (!this.enabled || typeof Audio === "undefined") return;
    const el = this.element();
    if (this.file || !el.paused) return;
    this.silentUrl ??= silence();
    el.src = this.silentUrl;
    el.play().catch(() => {});
  }

  /** Whether the mix with `key` is rendered and ready to play. */
  readyFor(key: string) {
    return this.enabled && this.file?.key === key;
  }

  /** Renders the mix with `key` (once; a render of another mix is dropped). True when it's ready. */
  ensure(key: string): Promise<boolean> {
    if (!this.enabled) return Promise.resolve(false);
    if (this.file?.key === key) return Promise.resolve(true);
    if (this.rendering?.key === key) return this.rendering.promise;
    this.rendering?.abort.abort();
    const abort = new AbortController();
    const promise = import("./mixdown")
      .then(({ renderMixWav }) => renderMixWav({ signal: abort.signal }))
      .then((blob) => {
        if (abort.signal.aborted || !this.enabled) return false;
        if (this.file) URL.revokeObjectURL(this.file.url);
        this.file = { key, url: URL.createObjectURL(blob) };
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (this.rendering?.promise === promise) this.rendering = null;
      });
    this.rendering = { key, promise, abort };
    return promise;
  }

  /** Plays the rendered mix from `seconds`; false when it can't (not rendered, or the browser refused). */
  async start(seconds: number): Promise<boolean> {
    if (!this.file) return false;
    const el = this.element();
    if (el.src !== this.file.url) {
      el.src = this.file.url;
      // The new file's length has to be known before it can be seeked.
      await new Promise<void>((resolve) => {
        if (el.readyState >= 1) return resolve();
        const done = () => {
          el.removeEventListener("loadedmetadata", done);
          el.removeEventListener("error", done);
          resolve();
        };
        el.addEventListener("loadedmetadata", done);
        el.addEventListener("error", done);
      });
    }
    el.currentTime = Math.max(0, seconds);
    this.wanted = true;
    try {
      await el.play();
      return true;
    } catch {
      this.wanted = false;
      return false;
    }
  }

  /** Where it's playing, in seconds. */
  time() {
    return this.el?.currentTime ?? 0;
  }

  seek(seconds: number) {
    if (this.el) this.el.currentTime = Math.max(0, seconds);
  }

  pause() {
    this.wanted = false;
    if (this.el && !this.el.paused) this.el.pause();
  }

  /** Off: the render and the file let go. */
  drop() {
    this.pause();
    this.rendering?.abort.abort();
    this.rendering = null;
    if (this.file) URL.revokeObjectURL(this.file.url);
    this.file = null;
    if (this.el) {
      this.el.removeAttribute("src");
      this.el.load();
    }
  }
}
