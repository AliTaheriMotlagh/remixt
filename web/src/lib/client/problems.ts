"use client";

// Notices when something goes wrong for the person using the site, and tells
// the owner (Admin → Feedback & problems), with no action from them:
// script errors, promises nobody caught, rage clicks (the same spot clicked
// again and again: something didn't answer), a link tapped and the page not
// there after 8 s, the server failing a request, a page slow to show.
// Batched and sent by beacon; never more than a few a minute.

import { groupPath, isNoise, isRage, problemKey, repeatsOnPurpose, type ProblemReport } from "@/lib/feedback";
import { isPageNavigation } from "@/lib/client/navigation";
import { visitorId } from "@/lib/client/presence";

const queue: ProblemReport[] = [];
/** The last few, for the Feedback box to attach. */
const recent: ProblemReport[] = [];
/** Each kind of problem once per page load. */
const sent = new Set<string>();
let installed = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Paths whose own failures aren't worth reporting (the reports themselves, beacons). */
const QUIET_API = /^\/api\/(problems|analytics|presence|feedback|ads\/view|version|listens)/;

export function recentProblems(): ProblemReport[] {
  return recent.slice();
}

export function reportProblem(p: ProblemReport) {
  if (isNoise(p)) return;
  const key = problemKey(p);
  if (sent.has(key) || sent.size > 40) return;
  sent.add(key);
  queue.push(p);
  recent.push(p);
  if (recent.length > 10) recent.shift();
  timer ??= setTimeout(flush, 5_000);
}

function flush() {
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ v: visitorId(), p: queue.splice(0, 10) });
  try {
    if (!navigator.sendBeacon?.("/api/problems", new Blob([body], { type: "application/json" }))) {
      void realFetch?.("/api/problems", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting a problem must never become one.
  }
}

function stackOf(err: unknown): string | undefined {
  const s = err instanceof Error ? err.stack : undefined;
  return s?.split("\n").slice(0, 6).join("\n");
}

function labelOf(el: Element | null): string {
  if (!el) return "the page";
  const target = el.closest("button, a, [role=button], input, select, label, summary") ?? el;
  const text = (target.getAttribute("aria-label") || (target as HTMLElement).innerText || target.getAttribute("title") || "").trim().replace(/\s+/g, " ");
  const tag = target.tagName.toLowerCase();
  return `${tag}${text ? ` “${text.slice(0, 40)}”` : ""}`;
}

/** A click on something that's clicked again and again by design (see repeatsOnPurpose). */
function onPurpose(el: Element | null): boolean {
  if (!el?.closest) return false;
  if (el.closest("[data-repeat]")) return true;
  const label = el.closest("label");
  const control = (label ? (label.control ?? label.querySelector("input, select, textarea")) : el.closest("input, textarea, select")) as HTMLInputElement | null;
  if (!control) return false;
  return repeatsOnPurpose({ tag: control.tagName, type: control.getAttribute("type") });
}

let realFetch: typeof fetch | null = null;

/** Starts watching (once per page load). */
export function watchProblems() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    // A resource that failed to load (an <img>) comes here too, without a message: not a script error.
    if (!e.message) return;
    reportProblem({ kind: "error", message: e.message, path: location.pathname, detail: stackOf(e.error) ?? `${e.filename}:${e.lineno}:${e.colno}` });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const message = r instanceof Error ? `${r.name}: ${r.message}` : typeof r === "string" ? r : "A promise failed";
    reportProblem({ kind: "error", message, path: location.pathname, detail: stackOf(r) });
  });

  // Rage clicks.
  let clicks: { t: number; x: number; y: number }[] = [];
  document.addEventListener(
    "click",
    (e) => {
      const now = performance.now();
      clicks = [...clicks.filter((c) => now - c.t < 1_000), { t: now, x: e.clientX, y: e.clientY }];
      if (isRage(clicks) && !onPurpose(e.target as Element | null)) {
        clicks = [];
        reportProblem({ kind: "rage", message: labelOf(e.target as Element), path: location.pathname });
      }
      // A link to another page: is it there in 8 s?
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const going = isPageNavigation(
        { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute("download") },
        { button: e.button, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey },
        location
      );
      if (!going) return;
      const from = location.pathname;
      const to = new URL(anchor.href).pathname;
      setTimeout(() => {
        // A link whose own handler kept the page (opened a panel, a menu) was never going anywhere.
        if (e.defaultPrevented) return;
        if (location.pathname === from && document.visibilityState === "visible" && navigator.onLine) {
          reportProblem({ kind: "stuck", message: `to ${groupPath(to)}`, path: from, detail: labelOf(anchor) });
        }
      }, 8_000);
    },
    true
  );

  // The server failing a request (5xx), or not answering while the device is online.
  realFetch = window.fetch.bind(window);
  const original = realFetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let path = "";
    let method = init?.method ?? "GET";
    try {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
      if (url.origin === location.origin && url.pathname.startsWith("/api/") && !QUIET_API.test(url.pathname)) path = url.pathname;
      if (input instanceof Request) method = init?.method ?? input.method;
    } catch {
      // Not a URL we can read: not ours to report.
    }
    try {
      const res = await original(input, init);
      if (path && res.status >= 500) reportProblem({ kind: "api", message: `${method} ${groupPath(path)} → ${res.status}`, path: location.pathname });
      return res;
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (path && !aborted && navigator.onLine) reportProblem({ kind: "api", message: `${method} ${groupPath(path)} → no answer`, path: location.pathname });
      throw err;
    }
  };

  // A page slow to show its main content (largest contentful paint over 5 s, the "poor" line).
  try {
    let lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) lcp = Math.max(lcp, entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    const check = () => {
      if (lcp > 5_000) reportProblem({ kind: "slow", message: `shown after ${Math.round(lcp / 1000)} s`, path: location.pathname });
    };
    addEventListener("pagehide", check, { once: true });
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && check(), { once: true });
  } catch {
    // No LCP in this browser (Safari before 26): nothing to measure.
  }

  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}
