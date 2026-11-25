// Ad networks (Google AdSense, or another such as Yektanet / Mediaad): which
// one fills an empty picture spot, the site's ads.txt, and how a month's
// network money is shared out. Pure — the server, the ad spot and the tests
// all read it.
//
// How network money reaches people: a network ad that was really seen (the
// same rule as a paying ad: half on screen for a second, not a robot, not
// the page's own makers, under the per-address cap) is booked as a network
// view of its page. The network pays Remixt once a month; the owner enters
// that amount (Admin → Ads & earnings → Ad networks) and it's split between
// the pages by their network views, then each page's part by the same shares
// as any ad (artists, remixers, uploaders, miners, Remixt).

import type { AppSettings } from "../settings/registry";
import { allocate } from "./policy";

export type NetworkSettings = Omit<AppSettings["network"], "adsTxt"> & { adsTxt?: string };

export type NetworkAd =
  | { kind: "adsense"; client: string; slot: string }
  | { kind: "script"; name: string; src: string; elementId: string };

/** The network names booked in ad_views.network and network_revenue. */
export type NetworkId = "adsense" | "other";

export function networkId(ad: NetworkAd): NetworkId {
  return ad.kind === "adsense" ? "adsense" : "other";
}

function adsense(n: NetworkSettings): NetworkAd | null {
  return n.adsense && n.adsenseClient && n.adsenseSlot ? { kind: "adsense", client: n.adsenseClient, slot: n.adsenseSlot } : null;
}

function other(n: NetworkSettings): NetworkAd | null {
  return n.other && n.otherScript && n.otherElementId
    ? { kind: "script", name: n.otherName || "Ad network", src: n.otherScript, elementId: n.otherElementId }
    : null;
}

/**
 * The network for an empty spot on a page in `lang`, or null. With both on,
 * Persian pages get the other network (AdSense doesn't serve Iran) unless the
 * owner says otherwise; either stands in when the other is off.
 */
export function networkFor(n: NetworkSettings, lang: "en" | "fa"): NetworkAd | null {
  const a = adsense(n);
  const o = other(n);
  if (lang === "fa" && n.persianOther) return o ?? a;
  return a ?? o;
}

/** The body of /ads.txt: AdSense's own line (from the publisher id) and the owner's extra lines. */
export function adsTxt(n: NetworkSettings): string {
  const lines: string[] = [];
  if (/^ca-pub-\d+$/.test(n.adsenseClient)) {
    // Google's certification authority id is the same for every publisher.
    lines.push(`google.com, ${n.adsenseClient.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0`);
  }
  for (const raw of (n.adsTxt ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !lines.includes(line)) lines.push(line);
  }
  return lines.length ? `${lines.join("\n")}\n` : "# No ad networks yet.\n";
}

export type NetworkPage = { placement: string; target: string; views: number };

/**
 * A month's network money split between the pages by their views, in whole
 * micros adding up to exactly `micros`. Pages with no views get nothing.
 */
export function shareNetworkMonth<T extends NetworkPage>(micros: number, pages: T[]): (T & { micros: number })[] {
  const parts = allocate(Math.max(0, Math.floor(micros)), pages.map((p) => p.views));
  return pages.map((p, i) => ({ ...p, micros: parts[i] })).filter((p) => p.micros > 0);
}

/** "2026-11" for a month that's over (network money is only known after the month ends). */
export function isClosedMonth(month: string, now = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return false;
  const end = Date.UTC(Number(m[1]), Number(m[2]), 1);
  return Number(m[2]) >= 1 && Number(m[2]) <= 12 && end <= now.getTime();
}
