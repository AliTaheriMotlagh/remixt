"use client";

// The browser's side of lib/listens.ts. Each player says, whenever it
// changes, what it's playing (or nothing) and whether it's playing; this
// counts the time heard and, when the song changes or the page goes,
// sends one record per song heard — batched, by beacon.

import { MAX_LISTENS_PER_BEACON, outcome, type Listen, type ListenKind, type ListenSource } from "../listens";
import { visitorId } from "./presence";

type Playing = { kind: ListenKind; id: string; duration?: number | null; station?: string | null };

type Session = Playing & { heardMs: number; since: number | null };

/** Keyed by source, and the player's own slot where it has two at once (the decks' A and B). */
const sessions = new Map<string, Session & { source: ListenSource }>();
const queue: Listen[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

/**
 * What `source` is playing now (null: nothing), and whether it's sounding.
 * Call on every change; calling again with the same is harmless.
 */
export function listening(source: ListenSource, item: Playing | null, playing: boolean, slot = "") {
  // Only in a real page (not on the server, nor a test's stand-in window).
  if (typeof window === "undefined" || typeof addEventListener !== "function" || typeof document === "undefined") return;
  hook();
  const now = performance.now();
  const key = `${source}:${slot}`;
  const s = sessions.get(key);
  if (s && (!item || s.kind !== item.kind || s.id !== item.id)) {
    finish(key, s, now, !!item);
  }
  if (!item) return;
  let cur = sessions.get(key);
  if (!cur) {
    cur = { ...item, source, heardMs: 0, since: null };
    sessions.set(key, cur);
  }
  if (item.duration) cur.duration = item.duration;
  if (item.station !== undefined) cur.station = item.station;
  if (playing && cur.since === null) cur.since = now;
  else if (!playing && cur.since !== null) {
    cur.heardMs += now - cur.since;
    cur.since = null;
  }
}

function finish(key: string, s: Session & { source: ListenSource }, now: number, replaced: boolean) {
  const { source } = s;
  sessions.delete(key);
  const seconds = (s.heardMs + (s.since !== null ? now - s.since : 0)) / 1000;
  const duration = s.duration ?? null;
  queue.push({ kind: s.kind, id: s.id, source, seconds, duration, station: s.station ?? null, ...outcome(seconds, duration, replaced) });
  timer ??= setTimeout(flush, 15_000);
  (timer as unknown as { unref?: () => void }).unref?.();
}

function flush() {
  timer = null;
  while (queue.length) {
    const body = JSON.stringify({ v: visitorId(), listens: queue.splice(0, MAX_LISTENS_PER_BEACON) });
    try {
      if (!navigator.sendBeacon?.("/api/listens", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/listens", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    } catch {
      // Counting a listen must never become a problem.
    }
  }
}

/**
 * Leaving the page ends what's playing as heard so far. Hidden (a locked
 * phone, another tab) only sends what's finished: the radio keeps playing
 * with the screen locked, and one song shouldn't count as two.
 */
function hook() {
  if (hooked) return;
  hooked = true;
  addEventListener("pagehide", () => {
    const now = performance.now();
    for (const [key, s] of [...sessions]) finish(key, s, now, false);
    flush();
  });
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}
