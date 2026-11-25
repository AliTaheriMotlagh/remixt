"use client";

// The line coming back. Phones switch between Wi-Fi and mobile data, VPNs
// drop and reconnect, a train goes through a tunnel: whatever was waiting
// to try again (a stem download, the radio's feed, an upload) shouldn't sit
// out the rest of its back-off once the line is back. `pause` waits like a
// timer but ends early the moment the device says it's online again or its
// network changed; `onReconnect` is for anything that wants to act then.

type Listener = () => void;
const listeners = new Set<Listener>();
let wired = false;
let lastKick = 0;

/** Every listener, at most once a second (a VPN switch can fire online and a network change together). */
function kick() {
  const now = Date.now();
  if (now - lastKick < 1000) return;
  lastKick = now;
  for (const l of [...listeners]) l();
}

type NetInfo = EventTarget & { type?: string; effectiveType?: string };
const netInfo = (): NetInfo | null =>
  typeof navigator !== "undefined" ? (((navigator as Navigator & { connection?: NetInfo }).connection ?? null) as NetInfo | null) : null;

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", kick);
  // Chrome/Android: Wi-Fi ↔ mobile data, or a VPN coming up, changes the connection without going offline first.
  netInfo()?.addEventListener("change", () => {
    if (navigator.onLine !== false) kick();
  });
}

/** Calls `fn` whenever the line comes back or changes. Returns the way to stop. */
export function onReconnect(fn: Listener): () => void {
  wire();
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Whether the device says it's offline (only `false` from the browser is believed: "online" can be wrong). */
export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Waits `ms`, or less: until the line comes back (or changes), or the
 * signal is aborted. While the device says it's offline, waits for it to be
 * back however long that takes — trying then is pointless.
 */
export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(timer);
      stop();
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const stop = onReconnect(done);
    signal?.addEventListener("abort", done, { once: true });
    if (!isOffline()) timer = setTimeout(done, ms);
  });
}
