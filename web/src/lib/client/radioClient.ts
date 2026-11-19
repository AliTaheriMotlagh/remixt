"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lineAt, type LyricLine } from "@/lib/lyrics";
import type { RadioFeed } from "@/lib/radio";
import type { RadioItem, RadioKind } from "@/lib/radioPick";
import { visitorId } from "./presence";
import { pollEvery } from "@/lib/radioPace";
import { mixEnvelope } from "./lyricsSources";
import { playPayload, RadioDeck } from "./radioDeck";
import { laneFromApi } from "./remixLanes";
import { delayed, frequencyBars, loudnessWindow, type Curve } from "@/lib/visualBars";

// A radio station in this tab: the feed polled every few seconds (with the
// server's clock, so every listener plays the same moment), and — once
// someone taps Tune in — the two decks (radioDeck.ts) playing what's on and
// crossfading into what's next, on the station's schedule.

export type { RadioFeed } from "@/lib/radio";

/** "Still listening" goes with a poll at least this often (the server counts a listener for 40 s). */
const HEARTBEAT_MS = 20_000;
/** How long a clock reading is trusted (the quickest round trip kept that long wins). */
const CLOCK_KEEP_MS = 10 * 60_000;

export type TuneState = "off" | "loading" | "on" | "error";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

/** The lock screen and headphone buttons: what's on, with play/pause. */
function lockScreen(row: RadioFeed["now"], station: string, on: { play: () => void; pause: () => void } | null) {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms) return;
  if (!row || !on) {
    ms.metadata = null;
    ms.playbackState = "none";
    return;
  }
  const art = row.cover ? [{ src: new URL(row.cover, location.origin).href, sizes: "600x600" }] : [];
  ms.metadata = new MediaMetadata({ title: row.title, artist: row.artist, album: station, artwork: art });
  ms.setActionHandler("play", on.play);
  ms.setActionHandler("pause", on.pause);
  ms.setActionHandler("stop", on.pause);
  // A radio can't skip or go back: what plays is the station's.
  for (const action of ["previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[]) {
    try {
      ms.setActionHandler(action, null);
    } catch {
      // not supported here
    }
  }
}

/**
 * What the lock screen (and the Dynamic Island, a watch, a car, headphones'
 * app — whatever shows what's playing) says: the song, and while words are
 * known, the line being sung in place of the artist, the artist moving next
 * to the station's name.
 */
function lockMeta(row: NonNullable<RadioFeed["now"]>, station: string, line: string) {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms) return;
  const art = row.cover ? [{ src: new URL(row.cover, location.origin).href, sizes: "600x600" }] : [];
  ms.metadata = line
    ? new MediaMetadata({ title: row.title, artist: `♪ ${line}`, album: `${row.artist} · ${station}`, artwork: art })
    : new MediaMetadata({ title: row.title, artist: row.artist, album: station, artwork: art });
}

/** How far into the song, for the lock screen's progress bar. */
function lockPosition(row: NonNullable<RadioFeed["now"]>, seconds: number) {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms?.setPositionState || !(row.duration > 0)) return;
  try {
    ms.setPositionState({ duration: row.duration, position: Math.max(0, Math.min(row.duration, seconds)), playbackRate: 1 });
  } catch {
    // Not taken here.
  }
}

const LOCK_WORDS_KEY = "remixt.radio.lockWords";
let lockWordsPref: boolean | null = null;
/** Is the line sung shown on the lock screen? (On unless switched off; kept in this browser.) */
export function lockScreenWords(): boolean {
  if (lockWordsPref === null) {
    try {
      lockWordsPref = localStorage.getItem(LOCK_WORDS_KEY) !== "off";
    } catch {
      lockWordsPref = true;
    }
  }
  return lockWordsPref;
}
export function setLockScreenWords(on: boolean) {
  lockWordsPref = on;
  try {
    localStorage.setItem(LOCK_WORDS_KEY, on ? "on" : "off");
  } catch {
    // This visit only.
  }
}

/** Playing or paused, on the lock screen (the metadata stays, so play there tunes back in). */
function lockScreenState(state: MediaSessionPlaybackState) {
  if (typeof navigator !== "undefined" && navigator.mediaSession) navigator.mediaSession.playbackState = state;
}

/** Asks once for the device to keep what the radio stored (kept mixes, stems) when space runs low. */
let askedToPersist = false;
function askToPersist() {
  if (askedToPersist) return;
  askedToPersist = true;
  void navigator.storage?.persist?.().catch(() => false);
}

/** Everything a station page, its embed and its broadcast view need. */
export function useRadio(slug: string, { heartbeat = true, warm = true }: { heartbeat?: boolean; warm?: boolean } = {}) {
  const [feed, setFeed] = useState<RadioFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tune, setTune] = useState<TuneState>("off");
  const [volume, setVolumeState] = useState(0.9);
  /** What tuning in is busy with ("Getting the remix ready… 40%"). */
  const [status, setStatus] = useState<string | null>(null);
  /** Server time minus this tab's clock (ms). */
  const offset = useRef(0);
  /** Recent clock readings: the one with the quickest round trip is the truest (as NTP does). */
  const clockSamples = useRef<{ offset: number; rtt: number; at: number }[]>([]);
  const sid = useRef("");
  const lastBeat = useRef(0);
  const feedRef = useRef<RadioFeed | null>(null);
  const deck = useRef<RadioDeck | null>(null);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  /** The words of the song on air (from the page's lyrics), for the lock screen. */
  const words = useRef<{ rowId: number; lines: LyricLine[] | null } | null>(null);
  const lockShown = useRef("");
  const lockPositionAt = useRef(0);
  const tuneRef = useRef<TuneState>("off");

  /** The lock screen follows the song heard and the line sung — moved on by the decks' own events, so it keeps up with the screen locked. */
  const updateLock = useCallback(() => {
    const d = deck.current;
    const f = feedRef.current;
    const row = d?.nowPlaying;
    if (!row || !f || tuneRef.current !== "on") return;
    const at = row.startsAt ? (Date.now() + offset.current - row.startsAt) / 1000 : 0;
    const w = words.current;
    let line = "";
    if (lockScreenWords() && w?.rowId === row.rowId && w.lines) {
      const i = lineAt(w.lines, at);
      line = i >= 0 ? w.lines[i].text : "";
    }
    const key = `${row.rowId}|${line}`;
    if (key !== lockShown.current) {
      lockShown.current = key;
      lockMeta(row, f.station.name, line);
    }
    if (Date.now() - lockPositionAt.current > 10_000 || !key.startsWith(`${row.rowId}|`)) {
      lockPositionAt.current = Date.now();
      lockPosition(row, at);
    }
  }, []);

  /** The page's lyrics for a song (null: none): shown line by line on the lock screen. */
  const showWords = useCallback(
    (rowId: number, lines: LyricLine[] | null) => {
      words.current = { rowId, lines };
      lockShown.current = "";
      updateLock();
    },
    [updateLock]
  );

  /** Where the station is in the song on air (seconds). */
  const position = useCallback(() => {
    const now = feedRef.current?.now;
    if (!now?.startsAt) return 0;
    return Math.max(0, Math.min(now.duration, (serverNow() - now.startsAt) / 1000));
  }, [serverNow]);

  const poll = useCallback(async () => {
    if (!sid.current) sid.current = visitorId();
    const hb = heartbeat && Date.now() - lastBeat.current >= HEARTBEAT_MS;
    if (hb) lastBeat.current = Date.now();
    const sent = Date.now();
    try {
      const data = await fetch(`/api/radio/${encodeURIComponent(slug)}?sid=${encodeURIComponent(sid.current)}${hb ? "&hb=1" : ""}`, { cache: "no-store" }).then((r) => json<RadioFeed>(r));
      // The server's clock, taken at the middle of the round trip — trusting the quickest of the last few
      // (a slow answer, while this tab is busy getting the next song ready, would put every tab's idea of "now" off).
      const back = Date.now();
      // Kept 10 minutes (clocks drift apart by far less than that): the best reading isn't dropped after a minute for a worse one, which moved
      // "now" by the difference and the player with it.
      clockSamples.current = [...clockSamples.current, { offset: data.serverNow - (sent + back) / 2, rtt: back - sent, at: back }]
        .filter((x) => back - x.at < CLOCK_KEEP_MS)
        .slice(-150);
      offset.current = clockSamples.current.reduce((best, x) => (x.rtt < best.rtt ? x : best)).offset;
      feedRef.current = data;
      setFeed(data);
      // Every answer moves the decks on too (a hidden page's other timers may be asleep).
      deck.current?.tick(data.now, data.upcoming, Date.now() + offset.current, data.fading);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The station can't be reached");
    }
  }, [slug, heartbeat]);

  // Polls at the pace pollEvery sets — at once when the page comes back on
  // screen — and once more the moment the next song is due (so the decks know of it).
  const playing = useRef(false);
  useEffect(() => {
    playing.current = tune === "on" || tune === "loading";
  }, [tune]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const next = () => {
      clearTimeout(timer);
      if (stopped) return;
      timer = setTimeout(async () => {
        await poll();
        next();
      }, pollEvery({ hidden: document.hidden, playing: playing.current }));
    };
    const onVisible = () => {
      if (document.hidden) return;
      void poll();
      next();
    };
    void poll();
    next();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);
  const endsAt = feed?.now?.endsAt ?? null;
  const upcomingAt = feed?.upcoming?.startsAt ?? null;
  useEffect(() => {
    const at = [upcomingAt, endsAt].filter((t): t is number => !!t).sort((x, y) => x - y)[0];
    if (!at) return;
    const wait = at - (Date.now() + offset.current) + 80;
    if (wait < 0 || wait > 30 * 60_000) return;
    const timer = setTimeout(() => void poll(), wait);
    return () => clearTimeout(timer);
  }, [endsAt, upcomingAt, poll]);

  // The decks follow the station a few times a second.
  useEffect(() => {
    const timer = setInterval(() => {
      const f = feedRef.current;
      if (f && deck.current) deck.current.tick(f.now, f.upcoming, Date.now() + offset.current, f.fading);
      updateLock();
    }, 120);
    return () => clearInterval(timer);
  }, [updateLock]);

  // Leaving the page: the music stops with it.
  useEffect(
    () => () => {
      deck.current?.dispose();
      deck.current = null;
      lockScreen(null, "", null);
    },
    []
  );

  const tuneOut = useCallback(() => {
    deck.current?.stop();
    setTune("off");
    lockScreenState("paused");
  }, []);

  /** The decks, made once: their state goes to the page, their own events move them on. */
  const deckFor = useCallback(() => {
    if (deck.current) return deck.current;
    const d = new RadioDeck(slug);
    deck.current = d;
    d.onState = (state, message) => {
      setTune(state);
      setStatus(state === "loading" ? (message ?? null) : null);
      if (state === "error" && message) setError(message);
    };
    // An element's own event (or the page coming back): look again now, not at the next timer.
    d.onWake = () => {
      const f = feedRef.current;
      if (f && deck.current === d) d.tick(f.now, f.upcoming, Date.now() + offset.current, f.fading);
      updateLock();
    };
    return d;
  }, [slug, updateLock]);

  // Ready before the tap: the players made and the song on air mixed while the page is open, when the browser is idle.
  useEffect(() => {
    if (!warm) return;
    const go = () => deckFor().warm();
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) {
      const id = idle(go, { timeout: 1500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = setTimeout(go, 300);
    return () => clearTimeout(timer);
  }, [warm, deckFor]);

  /** Tune in (call it from a tap, so the browser lets the sound start: everything sound-related runs before any await). */
  const tuneIn = useCallback(async () => {
    const d = deckFor();
    d.setVolume(volume);
    // For the rigs under scripts/ (radio-check.mjs). Development only.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __remixtRadio?: RadioDeck }).__remixtRadio = d;
    setTune("loading");
    setError(null);
    d.start();
    askToPersist();
    const f = feedRef.current;
    if (f) d.tick(f.now, f.upcoming, serverNow(), f.fading);
  }, [volume, serverNow, deckFor]);
  // The lock screen follows the song heard: set when one starts (and again now if one already has).
  useEffect(() => {
    const d = deck.current;
    if (!d || tune === "off") return;
    const handlers = { play: () => void tuneIn(), pause: tuneOut };
    const show = (row: RadioFeed["now"]) => {
      lockScreen(row, feedRef.current?.station.name ?? "Remixt Radio", handlers);
      lockScreenState("playing");
      // The line sung goes on top of it straight away.
      lockShown.current = "";
      updateLock();
    };
    d.onPlaying = show;
    // The phone paused it (a call, headphones out): stay quiet until asked, as any music app does.
    d.onExternalPause = tuneOut;
    if (tune === "on" && d.nowPlaying) show(d.nowPlaying);
  }, [tune, tuneIn, tuneOut, updateLock]);
  useEffect(() => {
    tuneRef.current = tune;
  }, [tune]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    deck.current?.setVolume(v);
  }, []);

  const getAnalyser = useCallback(() => deck.current?.getAnalyser() ?? null, []);

  // The song on air's loudness through it (from its lanes' waveforms, as heard): the visualizer's bars where the browser can't listen in.
  const curves = useRef(new Map<number, Curve>());
  const nowRow = feed?.now ?? null;
  useEffect(() => {
    if (!nowRow || curves.current.has(nowRow.rowId)) return;
    let gone = false;
    playPayload(slug, nowRow.kind, nowRow.id)
      .then((payload) => {
        if (gone) return;
        curves.current.set(nowRow.rowId, mixEnvelope(payload.lanes.map(laneFromApi), 20));
        // Only the songs on air now and next are kept.
        for (const key of [...curves.current.keys()]) if (key < nowRow.rowId - 2) curves.current.delete(key);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [slug, nowRow]);

  /** Frames of what's heard, newest last, to show them as late as the sound reaches the speaker. */
  const frames = useRef<{ t: number; v: Float32Array }[]>([]);
  const freq = useRef<Uint8Array<ArrayBuffer> | null>(null);
  /** The visualizer's bars now (0–1), in time with what's heard; null: nothing to show (it idles). */
  const levels = useCallback((count: number): ArrayLike<number> | null => {
    const d = deck.current;
    const analyser = d?.getAnalyser();
    const t = performance.now();
    if (d && analyser) {
      if (!freq.current || freq.current.length !== analyser.frequencyBinCount) freq.current = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freq.current);
      frames.current.push({ t, v: frequencyBars(freq.current, count) });
      while (frames.current.length > 2 && t - frames.current[0].t > 1000) frames.current.shift();
      return delayed(frames.current, t, d.outputLatency() * 1000);
    }
    const row = d?.nowPlaying ?? feedRef.current?.now;
    const curve = row && curves.current.get(row.rowId);
    if (!row?.startsAt || !curve) return null;
    return loudnessWindow(curve, (Date.now() + offset.current - row.startsAt) / 1000, count);
  }, []);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>, method = "POST") => {
      if (!sid.current) sid.current = visitorId();
      const res = await fetch(`/api/radio/${encodeURIComponent(slug)}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, sid: sid.current }),
      });
      const data = await json<Record<string, unknown>>(res);
      void poll();
      return data;
    },
    [slug, poll]
  );

  const vote = useCallback(
    (item: Pick<RadioItem, "kind" | "id">) => post("/vote", { kind: item.kind, id: item.id, round: feedRef.current?.vote.round ?? -1 }),
    [post]
  );
  const request = useCallback(
    (item: Pick<RadioItem, "kind" | "id">, name: string, message: string) => post("/request", { kind: item.kind, id: item.id, name, message }) as Promise<{ status?: string }>,
    [post]
  );
  const withdraw = useCallback((item: { kind: RadioKind; id: string }) => post("/request", { kind: item.kind, id: item.id }, "DELETE"), [post]);

  return { feed, error, status, tune, tuneIn, tuneOut, showWords, volume, setVolume, position, serverNow, getAnalyser, levels, vote, request, withdraw, refresh: poll };
}

/** Songs and remixes the station can play, matching `q`. */
export async function searchStation(slug: string, q: string): Promise<RadioItem[]> {
  const data = await fetch(`/api/radio/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(q)}`).then((r) => json<{ items: RadioItem[] }>(r));
  return data.items;
}

/** "3:05". */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
