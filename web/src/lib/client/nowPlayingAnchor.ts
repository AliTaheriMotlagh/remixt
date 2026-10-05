"use client";

// The mix plays through Web Audio, which has no media element — and phones
// tie what's playing to one: iOS's lock screen and Dynamic Island open the
// tab whose <audio> is playing when tapped (with only Web Audio, tapping
// did nothing or opened Safari on another tab), and Chrome on Android only
// shows its media notification for a media element at least 5 seconds
// long. So while the mix plays, an inaudible looping <audio> plays beside
// it. It also tells the phone the page is playing media, so the mix keeps
// going with the screen locked. The lock screen still shows the mix's
// title, cover and position (see mediaSession).

let audio: HTMLAudioElement | null = null;
let url: string | null = null;
/** Whether we want it playing — a pause we didn't ask for came from the phone. */
let wanted = false;
/** Turned off for the visit when it seemed to stop the mix from starting. */
let disabled = false;
const lostListeners = new Set<() => void>();

/** 10 seconds of near-silence (±1 in 16 bits, about -90 dB) as a WAV. */
function silentWav(): string {
  const rate = 8000;
  const samples = rate * 10;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  // Not digital zero: some players treat a perfectly silent track as no audio at all.
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);
  return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
}

function element(): HTMLAudioElement {
  if (!audio) {
    url ??= silentWav();
    audio = new Audio(url);
    audio.loop = true;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    audio.addEventListener("pause", () => {
      // A call, Siri or another app taking the audio pauses media elements:
      // the mix should stop with it rather than play on unseen. (The event
      // comes late: after a seek's pause-and-play it's already playing again.)
      if (!wanted || !audio?.paused) return;
      wanted = false;
      for (const listener of lostListeners) listener();
    });
  }
  return audio;
}

/**
 * Starts it. Must run inside the tap (or lock-screen button) that starts
 * the mix, before anything is awaited. Returns whether it was started.
 */
export function startNowPlayingAnchor(): boolean {
  if (disabled || typeof Audio === "undefined") return false;
  const el = element();
  wanted = true;
  if (!el.paused) return true;
  el.play().catch(() => {
    wanted = false;
  });
  return true;
}

/** Pauses it (the lock screen then shows the mix as paused, still one tap from this tab). */
export function stopNowPlayingAnchor() {
  wanted = false;
  audio?.pause();
}

/** For the rest of the visit, the mix plays without it. */
export function disableNowPlayingAnchor() {
  disabled = true;
  stopNowPlayingAnchor();
}

/** Called when the phone pauses it on its own (a call, another app's audio). */
export function onNowPlayingAnchorLost(listener: () => void): () => void {
  lostListeners.add(listener);
  return () => {
    lostListeners.delete(listener);
  };
}
