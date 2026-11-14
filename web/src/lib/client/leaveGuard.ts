"use client";

// Asks before the tab is closed or reloaded while something would be lost:
// a song splitting, a take being saved. Moving around the site is fine —
// that work carries on in the background — so only leaving the site (or
// reloading) is guarded. Each kind of work holds the guard under its own
// name, and it's let go once none of them needs it.

const holders = new Set<string>();
let listening = false;

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Older browsers show a dialog only when this is set.
  event.returnValue = "";
}

/** Turns the warning on (`on`) or off for `reason`. */
export function guardLeaving(reason: string, on: boolean) {
  if (typeof window === "undefined") return;
  if (on) holders.add(reason);
  else holders.delete(reason);
  const want = holders.size > 0;
  if (want === listening) return;
  listening = want;
  if (want) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}
