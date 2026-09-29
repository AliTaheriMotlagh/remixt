"use client";

import { NOW_PLAYING_ARTWORK } from "@/lib/brand";

// What's playing, for the phone's lock screen and Control Center, Android's
// media notification, and the media controls in desktop browsers and OSes:
// title, artist and the Remixt mark, with play/pause/seek buttons that work.
// The two things that play report here — library previews (previewPlayer)
// and the mix (audioEngine) — and a preview, being the more recent, wins.

export type NowPlaying = {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
};

type Owner = "preview" | "mix";

const owners: Record<Owner, NowPlaying | null> = { preview: null, mix: null };
let current: NowPlaying | null = null;
let mixCredit: string | null = null;
let lastKey = "";
let lastPlaybackState: MediaSessionPlaybackState | null = null;
// Where the OS was last told the playhead was; it counts on from there by itself.
let lastPosition = { at: 0, position: 0, playing: false, duration: -1 };
let handlersSet = false;

function mediaSession(): MediaSession | null {
  return typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
}

export function setNowPlaying(owner: Owner, value: NowPlaying | null) {
  owners[owner] = value;
  apply();
}

/**
 * Who the mix is credited to on the lock screen ("remix by …") while a
 * remix's own page or embed is playing it; null for the Studio, which lists
 * the artists of the stems in it.
 */
export function setMixCredit(credit: string | null) {
  mixCredit = credit;
  apply();
}

export function getMixCredit() {
  return mixCredit;
}

function setHandlers(session: MediaSession) {
  if (handlersSet) return;
  handlersSet = true;
  // Each reads `current` when pressed, so they're set once. Browsers throw
  // for actions they don't support.
  const handle = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // unsupported here
    }
  };
  handle("play", () => current?.play());
  handle("pause", () => current?.pause());
  handle("stop", () => current?.stop());
  handle("seekto", (details) => {
    if (current && details.seekTime !== undefined) current.seekTo(details.seekTime);
  });
  handle("seekbackward", (details) => {
    if (current) current.seekTo(Math.max(0, current.position - (details.seekOffset ?? 10)));
  });
  handle("seekforward", (details) => {
    if (current) current.seekTo(Math.min(current.duration, current.position + (details.seekOffset ?? 10)));
  });
}

function apply() {
  const session = mediaSession();
  if (!session) return;
  current = owners.preview ?? owners.mix;
  setHandlers(session);

  if (!current) {
    if (lastKey) {
      session.metadata = null;
      session.playbackState = "none";
      lastKey = "";
      lastPlaybackState = "none";
      lastPosition = { at: 0, position: 0, playing: false, duration: -1 };
    }
    return;
  }

  const key = `${current.title}\n${current.artist}\n${current.album}`;
  if (key !== lastKey) {
    lastKey = key;
    session.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: NOW_PLAYING_ARTWORK,
    });
    lastPosition.duration = -1;
  }

  const playbackState = current.playing ? "playing" : "paused";
  if (playbackState !== lastPlaybackState) {
    session.playbackState = playbackState;
    lastPlaybackState = playbackState;
  }

  // The mix reports its playhead every frame; only pass it on when it's
  // drifted from where the OS thinks it is (a seek, a pause, a new song).
  const now = performance.now();
  const expected = lastPosition.playing
    ? lastPosition.position + (now - lastPosition.at) / 1000
    : lastPosition.position;
  if (
    current.playing !== lastPosition.playing ||
    current.duration !== lastPosition.duration ||
    Math.abs(current.position - expected) > 1
  ) {
    lastPosition = { at: now, position: current.position, playing: current.playing, duration: current.duration };
    if (current.duration > 0 && typeof session.setPositionState === "function") {
      try {
        session.setPositionState({
          duration: current.duration,
          position: Math.max(0, Math.min(current.position, current.duration)),
          playbackRate: 1,
        });
      } catch {
        // an out-of-range value — skip this update
      }
    }
  }
}
