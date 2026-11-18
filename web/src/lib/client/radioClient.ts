"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RadioFeed } from "@/lib/radio";
import type { RadioItem, RadioKind } from "@/lib/radioPick";
import { visitorId } from "./presence";
import { RadioDeck } from "./radioDeck";

// A radio station in this tab: the feed polled every few seconds (with the
// server's clock, so every listener plays the same moment), and — once
// someone taps Tune in — the two decks (radioDeck.ts) playing what's on and
// crossfading into what's next, on the station's schedule.

export type { RadioFeed } from "@/lib/radio";

const POLL_MS = 3000;

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
    return;
  }
  const art = row.cover ? [{ src: new URL(row.cover, location.origin).href, sizes: "600x600" }] : [];
  ms.metadata = new MediaMetadata({ title: row.title, artist: row.artist, album: station, artwork: art });
  ms.setActionHandler("play", on.play);
  ms.setActionHandler("pause", on.pause);
  // A radio can't skip or go back: what plays is the station's.
  for (const action of ["previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[]) {
    try {
      ms.setActionHandler(action, null);
    } catch {
      // not supported here
    }
  }
}

/** Everything a station page, its embed and its broadcast view need. */
export function useRadio(slug: string, { heartbeat = true }: { heartbeat?: boolean } = {}) {
  const [feed, setFeed] = useState<RadioFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tune, setTune] = useState<TuneState>("off");
  const [volume, setVolumeState] = useState(0.9);
  /** What tuning in is busy with ("Getting the remix ready… 40%"). */
  const [status, setStatus] = useState<string | null>(null);
  /** Server time minus this tab's clock (ms). */
  const offset = useRef(0);
  /** Recent clock readings: the one with the quickest round trip is the truest (as NTP does). */
  const clockSamples = useRef<{ offset: number; rtt: number }[]>([]);
  const sid = useRef("");
  const polls = useRef(0);
  const feedRef = useRef<RadioFeed | null>(null);
  const deck = useRef<RadioDeck | null>(null);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  /** Where the station is in the song on air (seconds). */
  const position = useCallback(() => {
    const now = feedRef.current?.now;
    if (!now?.startsAt) return 0;
    return Math.max(0, Math.min(now.duration, (serverNow() - now.startsAt) / 1000));
  }, [serverNow]);

  const poll = useCallback(async () => {
    if (!sid.current) sid.current = visitorId();
    const hb = heartbeat && polls.current++ % 3 === 0;
    const sent = Date.now();
    try {
      const data = await fetch(`/api/radio/${encodeURIComponent(slug)}?sid=${encodeURIComponent(sid.current)}${hb ? "&hb=1" : ""}`, { cache: "no-store" }).then((r) => json<RadioFeed>(r));
      // The server's clock, taken at the middle of the round trip — trusting the quickest of the last few
      // (a slow answer, while this tab is busy getting the next song ready, would put every tab's idea of "now" off).
      const back = Date.now();
      clockSamples.current = [...clockSamples.current, { offset: data.serverNow - (sent + back) / 2, rtt: back - sent }].slice(-12);
      offset.current = clockSamples.current.reduce((best, x) => (x.rtt < best.rtt ? x : best)).offset;
      feedRef.current = data;
      setFeed(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The station can't be reached");
    }
  }, [slug, heartbeat]);

  // Polls, and once more the moment the next song is due (so the decks know of it).
  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
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
    }, 120);
    return () => clearInterval(timer);
  }, []);

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
  }, []);

  /** Tune in (call it from a tap, so the browser lets the sound start). */
  const tuneIn = useCallback(async () => {
    if (!deck.current) {
      deck.current = new RadioDeck(slug);
      deck.current.onState = (state, message) => {
        setTune(state);
        setStatus(state === "loading" ? (message ?? null) : null);
        if (state === "error" && message) setError(message);
      };
    }
    deck.current.setVolume(volume);
    // For the rigs under scripts/ (radio-check.mjs). Development only.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __remixtRadio?: RadioDeck }).__remixtRadio = deck.current;
    setTune("loading");
    deck.current.start();
    // A silent element played inside the tap: the browser then lets this page play sound later too.
    try {
      const unlock = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
      await unlock.play().catch(() => {});
    } catch {
      // nothing to unlock
    }
    const f = feedRef.current;
    if (f) deck.current.tick(f.now, f.upcoming, serverNow(), f.fading);
  }, [slug, volume, serverNow]);

  // The lock screen follows the song on air while tuned in.
  const nowId = feed?.now?.rowId;
  useEffect(() => {
    if (tune !== "on" || !feedRef.current) return;
    lockScreen(feedRef.current.now, feedRef.current.station.name, { play: () => void tuneIn(), pause: tuneOut });
  }, [tune, nowId, tuneIn, tuneOut]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    deck.current?.setVolume(v);
  }, []);

  const getAnalyser = useCallback(() => deck.current?.getAnalyser() ?? null, []);

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

  return { feed, error, status, tune, tuneIn, tuneOut, volume, setVolume, position, serverNow, getAnalyser, vote, request, withdraw, refresh: poll };
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
