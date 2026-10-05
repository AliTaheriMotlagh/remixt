"use client";

import { useSyncExternalStore } from "react";
import type { PresenceSnapshot } from "@/lib/presence";

// The latest "who's online" this tab knows of. The heartbeat
// (components/PresenceHeartbeat) refreshes it every time it reports in, and
// the home page's live panel when it polls, so every live widget on a page
// shows the same numbers.

let snapshot: PresenceSnapshot | null = null;
const listeners = new Set<() => void>();

export function setPresence(next: PresenceSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Who's online: the newest this tab has heard, or what the server rendered with. */
export function usePresence(initial: PresenceSnapshot): PresenceSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot ?? initial,
    () => initial
  );
}

const VISITOR_KEY = "remixt_visitor";
let memoryId: string | null = null;

function randomId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; a dev server on http://<ip> isn't one.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This browser's anonymous visitor id — the same in every tab. */
export function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode, strict settings): one id for this page load.
    return (memoryId ??= randomId());
  }
}

/** Tells the server this visitor is here, on `path`. */
export async function sendHeartbeat(path: string) {
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: visitorId(), path }),
    });
    if (res.ok) setPresence(await res.json());
  } catch {
    // Offline or the server's down: the next beat will try again.
  }
}
