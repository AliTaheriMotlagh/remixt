"use client";

// Keeps the screen on while something is playing — the mix, a remix, a
// library preview — the way a video player does, so a phone doesn't dim
// and lock mid-song. Nothing else holds it: the moment playback pauses or
// stops, the screen follows the device's own sleep setting again.
// Several players can ask at once; the lock is held while any of them
// wants it. Browsers drop the lock whenever the
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
  if (on) holders.add(reason);
  else holders.delete(reason);
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => void sync());
  }
  void sync();
}
