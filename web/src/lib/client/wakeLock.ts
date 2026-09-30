"use client";

import { useEffect, useId } from "react";

// Keeps the screen on while the app is doing something that a sleeping
// phone would interrupt or the user is watching — and only then:
//
//   - playback: the Studio mix, a remix, a library preview
//   - recording a vocal, and saving the take
//   - adding a song: fetching a link, splitting, uploading the stems, or
//     sending it to the split queue
//   - a computer splitting a queued song for someone (the helper)
//   - exporting the mix or a lane, rendering a social clip, AI Match
//
// Just being on a page (Upload, Studio) never holds it: the moment the
// work finishes, fails or is cancelled, the screen follows the device's
// own sleep setting again. Several things can ask at once; the lock is
// held while any of them wants it. Browsers drop the lock whenever the
// page is hidden, so it's taken again when the page comes back.

const holders = new Set<string>();
let lock: WakeLockSentinel | null = null;
let requesting = false;
let listening = false;

async function sync() {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  if (holders.size === 0) {
    const current = lock;
    lock = null;
    await current?.release().catch(() => {});
    return;
  }
  if (lock || requesting || document.visibilityState !== "visible") return;
  requesting = true;
  try {
    const next = await navigator.wakeLock.request("screen");
    next.addEventListener("release", () => {
      if (lock === next) lock = null;
    });
    lock = next;
    // Everyone may have let go while the request was in flight.
    if (holders.size === 0) void sync();
  } catch {
    // Refused (e.g. low-power mode). The page still works; the screen
    // just follows the phone's own sleep setting.
  } finally {
    requesting = false;
  }
}

/** Asks for the screen to stay on (`on`) or stops asking, for `reason`. */
export function keepScreenOn(reason: string, on: boolean) {
  if (typeof document === "undefined") return;
  if (on === holders.has(reason)) return;
  if (on) holders.add(reason);
  else holders.delete(reason);
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => void sync());
  }
  void sync();
}

/**
 * Keeps the screen on while `active` is true, for as long as the calling
 * component is mounted — leaving the page mid-task lets go too.
 */
export function useKeepScreenOn(reason: string, active: boolean) {
  // Two of the same component (two lanes exporting) each hold their own.
  const key = `${reason}:${useId()}`;
  useEffect(() => {
    keepScreenOn(key, active);
    return () => keepScreenOn(key, false);
  }, [key, active]);
}
