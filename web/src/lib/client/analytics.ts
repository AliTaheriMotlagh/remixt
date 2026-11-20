// The page's side of analytics (lib/analytics.ts has the why): a page view
// when a page is opened, how long it was looked at when it's left, and the
// events pages report (`trackEvent`). Sent as beacons: they never slow the
// page or show an error. Nothing is sent when the browser asks not to be
// tracked, or the owner has analytics off.

import { optedOut, SESSION_IDLE_MS, type EventName } from "@/lib/analytics";
import { visitorId } from "./presence";

const SESSION_KEY = "remixt_session";

function randomId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

let memory: { id: string; last: number } | null = null;

/** This visit: the same across tabs; a new one after 30 minutes without a page view. `fresh`: it just began. */
export function session(now = Date.now(), touch = true): { id: string; fresh: boolean } {
  let current = memory;
  try {
    current = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") ?? memory;
  } catch {
    // Storage blocked: this page load's memory.
  }
  const fresh = !current || now - current.last > SESSION_IDLE_MS;
  const next = { id: fresh ? randomId() : current!.id, last: touch ? now : (current?.last ?? now) };
  memory = next;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {}
  return { id: next.id, fresh };
}

export function analyticsAllowed(): boolean {
  if (typeof navigator === "undefined") return false;
  return !optedOut(navigator as Navigator & { globalPrivacyControl?: boolean });
}

function beacon(payload: unknown) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.("/api/analytics", body)) return;
  } catch {}
  void fetch("/api/analytics", { method: "POST", body, keepalive: true }).catch(() => {});
}

/** A page view; its id, for the time-on-page sent when it's left. */
export function sendView(path: string): string | null {
  if (!analyticsAllowed()) return null;
  const { id: s, fresh } = session();
  const id = randomId();
  const params = new URLSearchParams(location.search);
  beacon({
    t: "view",
    id,
    v: visitorId(),
    s,
    p: path,
    e: fresh,
    r: fresh ? document.referrer || null : null,
    u: fresh ? { source: params.get("utm_source"), medium: params.get("utm_medium"), campaign: params.get("utm_campaign") } : undefined,
    l: navigator.language,
    w: screen.width,
  });
  return id;
}

export function sendEngagement(viewId: string, ms: number) {
  if (ms < 500) return;
  beacon({ t: "engage", id: viewId, ms: Math.round(ms) });
}

/** Something the visitor did (a play, a search, a share…). */
export function trackEvent(name: EventName, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined" || !analyticsAllowed()) return;
  const { id: s } = session(Date.now(), false);
  beacon({ t: "event", n: name, v: visitorId(), s, p: location.pathname, x: props });
}
