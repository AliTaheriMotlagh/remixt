// Feedback people send, and the problems their browsers run into (errors,
// rage clicks, a page that never comes, the server failing them) — so the
// owner sees where people get stuck, confused or broken, not only what they
// say. Pure: the browser, the server and the tests share it.

export const FEEDBACK_KINDS = ["problem", "confusing", "idea", "love"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_TEXT: Record<FeedbackKind, { en: string; fa: string; emoji: string }> = {
  problem: { en: "Something's broken", fa: "چیزی خراب است", emoji: "🐞" },
  confusing: { en: "I'm confused / stuck", fa: "گیج شدم / گیر کردم", emoji: "🤔" },
  idea: { en: "An idea", fa: "یک پیشنهاد", emoji: "💡" },
  love: { en: "I love something", fa: "چیزی را دوست دارم", emoji: "❤️" },
};

export const FEEDBACK_STATUS = ["new", "seen", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUS)[number];

/**
 * What a browser reports by itself:
 * - error: a script error or a promise nobody caught
 * - rage: the same spot clicked again and again in a moment (something didn't answer)
 * - stuck: a link tapped and the next page not there after 8 s
 * - api: the server answered 5xx, or didn't answer at all
 * - slow: a page took over 5 s to show (largest contentful paint)
 */
export const PROBLEM_KINDS = ["error", "rage", "stuck", "api", "slow"] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

export const PROBLEM_TEXT: Record<ProblemKind, string> = {
  error: "Script error",
  rage: "Rage clicks (nothing answered)",
  stuck: "Stuck going to a page",
  api: "Server failed them",
  slow: "Slow page",
};

export type ProblemReport = {
  kind: ProblemKind;
  /** What went wrong, short: the error message, the clicked thing's label, the API path. */
  message: string;
  /** The page it happened on. */
  path: string;
  /** More, for the owner: the stack's first lines, the status, the target. */
  detail?: string;
};

/** Ids and numbers in a message become placeholders, so one problem groups as one (not one per remix). */
export function groupMessage(message: string): string {
  return String(message)
    .replace(/https?:\/\/[^\s)'"]+/g, (url) => {
      try {
        return new URL(url).pathname;
      } catch {
        return "<url>";
      }
    })
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "<id>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** A page path with its ids taken out ("/remixes/abc123" → "/remixes/<id>"). */
export function groupPath(path: string): string {
  const clean = String(path).split(/[?#]/)[0] || "/";
  return clean
    .split("/")
    .map((seg, i) => (i > 1 && (seg.length >= 8 || /\d/.test(seg)) ? "<id>" : seg))
    .join("/")
    .slice(0, 120);
}

/** The key one kind of problem is counted under: kind, page and message. */
export function problemKey(p: Pick<ProblemReport, "kind" | "message" | "path">): string {
  return `${p.kind}|${groupPath(p.path)}|${groupMessage(p.message)}`;
}

/** Browser noise that isn't Remixt's to fix: extensions, cross-origin scripts, a tab being closed. */
export function isNoise(p: ProblemReport): boolean {
  if (p.kind !== "error") return false;
  const m = p.message;
  return (
    /^Script error\.?$/i.test(m) ||
    /ResizeObserver loop/i.test(m) ||
    /extension:\/\/|moz-extension|safari-extension/i.test(`${m} ${p.detail ?? ""}`) ||
    /AbortError|The user aborted a request|cancel(l)?ed/i.test(m) ||
    /NotAllowedError: play\(\)/i.test(m) ||
    /^Load failed$/i.test(m)
  );
}

/** A report checked and trimmed, or null when it isn't one. */
export function cleanReport(raw: unknown): ProblemReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!PROBLEM_KINDS.includes(r.kind as ProblemKind)) return null;
  if (typeof r.message !== "string" || typeof r.path !== "string" || !r.path.startsWith("/")) return null;
  const report: ProblemReport = {
    kind: r.kind as ProblemKind,
    message: r.message.slice(0, 300),
    path: r.path.slice(0, 300),
    detail: typeof r.detail === "string" ? r.detail.slice(0, 2_000) : undefined,
  };
  return isNoise(report) ? null : report;
}

/** Clicks close together in time and place: three within 0.8 s and 40 px is a rage click. */
export function isRage(clicks: { t: number; x: number; y: number }[], windowMs = 800, radius = 40, count = 3): boolean {
  if (clicks.length < count) return false;
  const last = clicks.slice(-count);
  if (last[last.length - 1].t - last[0].t > windowMs) return false;
  const [x0, y0] = [last[0].x, last[0].y];
  return last.every((c) => Math.hypot(c.x - x0, c.y - y0) <= radius);
}
