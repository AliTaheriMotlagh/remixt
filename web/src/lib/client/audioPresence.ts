"use client";

// Is music playing in another tab of this site? Mining (splitting songs for
// others, see splitQueue.ts) takes the GPU or every CPU core but one, which
// stutters or stops audio in any tab of the same browser — the radio, a
// remix page, the Studio. A tab that plays says so here every few seconds,
// and the helper doesn't start a song while one does.

const CHANNEL = "remixt-audio";
/** A playing tab says so this often… */
const BEAT_MS = 4_000;
/** …and counts as playing for this long after it last did. */
const FRESH_MS = 10_000;

let channel: BroadcastChannel | null | undefined;
let heardAt = 0;
let beat: ReturnType<typeof setInterval> | null = null;

function open(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  // Only in a real page: Node has BroadcastChannel too, and an open one keeps a test (or a server) running for ever.
  channel = typeof BroadcastChannel === "undefined" || typeof document === "undefined" ? null : new BroadcastChannel(CHANNEL);
  if (channel) {
    // Never what keeps a process alive (Node, where tests run this; browsers have no unref).
    (channel as unknown as { unref?: () => void }).unref?.();
    channel.onmessage = (event: MessageEvent<{ playing?: boolean }>) => {
      heardAt = event.data?.playing ? Date.now() : 0;
    };
  }
  return channel;
}

/** This tab started or stopped playing (called from mediaSession, which every player reports to). */
export function announcePlaying(playing: boolean) {
  const ch = open();
  if (!ch) return;
  if (playing && !beat) {
    ch.postMessage({ playing: true });
    beat = setInterval(() => ch.postMessage({ playing: true }), BEAT_MS);
    (beat as unknown as { unref?: () => void }).unref?.();
  } else if (!playing && beat) {
    clearInterval(beat);
    beat = null;
    ch.postMessage({ playing: false });
  }
}

/** Whether another tab of this site has played audio in the last few seconds. */
export function otherTabPlaying(): boolean {
  open();
  return heardAt > 0 && Date.now() - heardAt < FRESH_MS;
}

/** Start listening early (the helper calls this when mining is switched on). */
export function listenForOtherTabs() {
  open();
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("pagehide", () => announcePlaying(false));
}
