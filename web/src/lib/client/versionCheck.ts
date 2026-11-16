// "Is a newer build live?" — the checking behind the update prompt
// (components/UpdatePrompt), kept apart from it so it can be tested.
//
// It asks when told to (`check()`: the app came back on screen, the device
// came back online, a timer) but not more than once a minute — and at once
// when it must (`check(true)`: the page just opened, a script failed to
// load). Two things a phone does used to stop it asking for good:
//
//   - A request in flight when the phone suspends the page can come back
//     never. The check waited on it for ever, and every later check saw
//     "one's already running" and left. Now a request gets a time limit, and
//     one that has been out too long is simply asked again.
//   - Coming back to the app, the network usually isn't up for a second or
//     two, so the check made at that moment fails — and it used to count as
//     done, with the next one ten minutes off (by when the phone is back in
//     a pocket). Now a failed check is tried again shortly, a few times.

/** Told to check more often than this, it doesn't (unless it must). */
export const MIN_GAP_MS = 60_000;
/** A request that hasn't answered in this long is given up on. */
export const CHECK_LIMIT_MS = 15_000;
/** After a check that failed: how long before each next try. */
export const RETRY_AFTER_MS = [3_000, 10_000, 30_000];

export type VersionWatch = {
  /** Checks, if it's time to (`now`: whatever the time). */
  check: (now?: boolean) => Promise<void>;
  stop: () => void;
};

export function versionWatch({
  mine,
  live,
  onNewer,
  visible = () => typeof document === "undefined" || document.visibilityState === "visible",
}: {
  /** The build this page is running. */
  mine: string;
  /** Asks the server which build is live (null: it doesn't say); stopped by `signal`. */
  live: (signal: AbortSignal) => Promise<string | null>;
  onNewer: (id: string) => void;
  visible?: () => boolean;
}): VersionWatch {
  let lastAnswer = 0;
  /** The request in flight: when it went out, and which one it is. */
  let outSince = 0;
  let round = 0;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  /** `again`: one of the tries that follow a failed check, rather than a check asked for afresh. */
  const run = async (now: boolean, again: boolean) => {
    if (stopped) return;
    const at = Date.now();
    // One at a time — unless that one has been out so long it isn't coming back.
    if (outSince && at - outSince < CHECK_LIMIT_MS) return;
    if (!now && (!visible() || at - lastAnswer < MIN_GAP_MS)) return;
    // Asked afresh (the app came back, say), it gets its full run of tries again.
    if (!again) failures = 0;
    const mineRound = ++round;
    outSince = at;
    if (retry) clearTimeout(retry);
    retry = null;
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), CHECK_LIMIT_MS);
    try {
      const id = await live(limit.signal);
      if (stopped || mineRound !== round) return;
      lastAnswer = Date.now();
      failures = 0;
      if (id && id !== mine) onNewer(id);
    } catch {
      // Offline, mid-deploy, or the phone dropped it: asked again soon, while there's someone to tell.
      if (stopped || mineRound !== round) return;
      const wait = RETRY_AFTER_MS[failures++];
      if (wait !== undefined) retry = setTimeout(() => void run(true, true), wait);
    } finally {
      clearTimeout(timer);
      if (mineRound === round) outSince = 0;
    }
  };

  return {
    check: (now = false) => run(now, false),
    stop: () => {
      stopped = true;
      if (retry) clearTimeout(retry);
    },
  };
}
