// Analytics, the pure part: what a page view is made of and how the numbers
// in Admin → Analytics are worked out. Shared by the collector (the server),
// the beacon (the page) and the tests.
//
// Kept on this site, the way privacy-first analytics do it: no third-party
// script (Google is blocked for many listeners anyway), no cookie — the
// visitor id is the random one the page already keeps for presence — and no
// IP address stored. A browser asking not to be tracked (Do Not Track,
// Global Privacy Control) isn't.
//
// Definitions follow Google Analytics 4, so the numbers read as people expect:
// - a session ends after 30 minutes without a page view;
// - an engaged session lasted 10 s or more, or had 2+ page views, or a key
//   event (sign-up, upload, publish);
// - bounce rate is the share of sessions that weren't engaged.

export const SESSION_IDLE_MS = 30 * 60_000;
export const ENGAGED_MS = 10_000;
/** Events that make a session count as engaged on their own. */
export const KEY_EVENTS = ["signup", "upload", "publish", "radio_tune", "ad_click"] as const;

/** Events the pages and the server send (others are refused). */
export const EVENTS = [
  "signup", "login", "upload", "publish", "remix_play", "radio_tune", "studio_open", "export", "search", "share", "ad_click", "advertise_start", "follow", "like", "tool_use",
] as const;
export type EventName = (typeof EVENTS)[number];

export type Device = "phone" | "tablet" | "desktop";
export type Client = { device: Device; os: string; browser: string; bot: boolean };

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|python|curl|wget|httpclient|monitor|uptime|vercel-screenshot/i;

/** Device, system and browser from a User-Agent string (enough for a report, not fingerprinting). */
export function parseUserAgent(ua: string): Client {
  const s = ua || "";
  const bot = BOT.test(s);
  const ipad = /iPad/.test(s) || (/Macintosh/.test(s) && /Mobile\//.test(s));
  const tablet = ipad || (/Android/.test(s) && !/Mobile/.test(s)) || /Tablet|Silk/.test(s);
  const phone = !tablet && /iPhone|iPod|Android.*Mobile|Mobile Safari|Windows Phone|Opera Mini/.test(s);
  const os = /Windows/.test(s)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(s) || ipad
      ? "iOS"
      : /Android/.test(s)
        ? "Android"
        : /CrOS/.test(s)
          ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(s)
            ? "macOS"
            : /Linux/.test(s)
              ? "Linux"
              : "Other";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(s)
          ? "Firefox"
          : /CriOS|Chrome\//.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "Other";
  return { device: tablet ? "tablet" : phone ? "phone" : "desktop", os, browser, bot };
}

export type Channel = "Direct" | "Organic search" | "Social" | "Referral" | "Campaign" | "Email" | "Internal";

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|qwant|startpage|naver|seznam|search\.)/i;
const SOCIAL = /(^|\.)(t\.co|twitter|x\.com|facebook|fb\.|instagram|linkedin|reddit|youtube|youtu\.be|tiktok|pinterest|telegram|t\.me|whatsapp|wa\.me|discord|threads|bsky|mastodon|vk\.com|snapchat|soundcloud|aparat|rubika|eitaa|bale\.ai)/i;
const MAIL = /(^|\.)(mail\.|outlook|gmail|yahoo\.com\/mail|proton)/i;

/**
 * Where a session came from. `utm` wins (the link was tagged on purpose),
 * then the referrer's host; none is Direct. A referrer on this site is Internal.
 */
export function channelOf(referrerHost: string | null, utm: { source?: string | null; medium?: string | null }, ownHost: string): Channel {
  const medium = (utm.medium ?? "").toLowerCase();
  if (medium) {
    if (/e-?mail|newsletter/.test(medium)) return "Email";
    if (/social|sm|story/.test(medium)) return "Social";
    if (/organic|seo/.test(medium)) return "Organic search";
    return "Campaign";
  }
  if (utm.source) return "Campaign";
  const host = (referrerHost ?? "").toLowerCase().replace(/^www\./, "");
  if (!host) return "Direct";
  if (host === ownHost.toLowerCase().replace(/^www\./, "")) return "Internal";
  if (MAIL.test(host)) return "Email";
  if (SEARCH.test(host)) return "Organic search";
  if (SOCIAL.test(host)) return "Social";
  return "Referral";
}

/** The host of a referrer URL ("" when there isn't one, or it can't be read). */
export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const UUIDish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{16,}$|^\d+$/i;

/**
 * A path as a route, so "/remixes/3f…" and "/remixes/9a…" count as one page
 * kind ("/remixes/[id]"). Known named routes keep their names.
 */
export function routeOf(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const parts = clean.split("/").filter(Boolean);
  // The segment after these is an id or code (tool and station names are few, and worth seeing one by one).
  const idAfter: Record<string, string> = { r: "[code]", invite: "[id]", embed: "[id]", artist: "[id]", remixes: "[id]", live: "[id]", remix: "[id]" };
  const out = parts.map((p, i) => {
    if (UUIDish.test(p)) return "[id]";
    const parent = parts[i - 1];
    if (parent && idAfter[parent] && p !== "new") return idAfter[parent];
    return p;
  });
  return `/${out.join("/")}`;
}

/** A path made safe to keep: no query string (it can carry tokens), at most 200 characters. */
export function cleanPath(path: string): string {
  const p = (path || "/").split(/[?#]/)[0];
  return (p.startsWith("/") ? p : `/${p}`).slice(0, 200);
}

/** Screen width in a few buckets (enough to design for, not to fingerprint). */
export function screenBucket(width: number): string {
  if (!(width > 0)) return "";
  if (width < 400) return "< 400";
  if (width < 768) return "400–767";
  if (width < 1024) return "768–1023";
  if (width < 1440) return "1024–1439";
  return "1440+";
}

// ——— numbers for the report ———

export type SessionFacts = { views: number; engagedMs: number; keyEvents: number };

export function isEngaged(s: SessionFacts): boolean {
  return s.engagedMs >= ENGAGED_MS || s.views >= 2 || s.keyEvents > 0;
}

/** A change against the period before, as a fraction (+0.25 = 25% up); null when there was nothing to compare with. */
export function changeOf(now: number, before: number): number | null {
  if (!before) return now ? null : 0;
  return (now - before) / before;
}

/** "+25%", "−8%", "new" (nothing before), "—". */
export function changeText(change: number | null, hadBefore = true): string {
  if (change === null) return hadBefore ? "—" : "new";
  const pct = Math.round(change * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** Milliseconds as "1m 05s" / "42s". */
export function durationText(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** The days of a range, oldest first, as YYYY-MM-DD (UTC), ending at `end`. */
export function daysOf(end: Date, count: number): string[] {
  const base = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: count }, (_, i) => new Date(base - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** A funnel's steps as counts and the share of the first step that reached each. */
export function funnel(steps: { name: string; count: number }[]): { name: string; count: number; ofFirst: number; ofPrevious: number }[] {
  const first = steps[0]?.count ?? 0;
  return steps.map((s, i) => ({
    ...s,
    ofFirst: first ? s.count / first : 0,
    ofPrevious: i === 0 ? 1 : steps[i - 1].count ? s.count / steps[i - 1].count : 0,
  }));
}

/** Whether this browser asked not to be followed (Do Not Track or Global Privacy Control). */
export function optedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined): boolean {
  return !!nav && (nav.doNotTrack === "1" || nav.globalPrivacyControl === true);
}
