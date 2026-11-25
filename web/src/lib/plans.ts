// Free and Plus. Free: everything that runs in the browser, with ads. Plus:
// everything, the things that run on Remixt's servers or cost it money too,
// and no ads. Which features are Plus-only, the prices and the ways to pay
// are the owner's (Admin → Settings → Plans). With plans switched off there's
// one plan and everyone has everything — as before plans existed. Pure (no
// database), so the server, the pages and the tests share it.

import type { AppSettings } from "./settings/registry";

export type Plan = "free" | "plus";
export type Period = "month" | "year";
export type Provider = "stripe" | "paypal" | "manual" | "admin";

/** Something only Plus may use when the owner says so. */
export type PlusFeature = "linkImport" | "queue" | "ai" | "lyricsWeb";

export const FEATURE_TEXT: Record<PlusFeature, { en: string; fa: string }> = {
  linkImport: { en: "Add songs from a link (YouTube, SoundCloud…)", fa: "افزودن آهنگ از لینک" },
  queue: { en: "Split songs from your phone", fa: "جداسازی آهنگ از گوشی" },
  ai: { en: "The AI co-producer on Remixt's key", fa: "هوش مصنوعیِ هم‌تهیه‌کننده" },
  lyricsWeb: { en: "Lyrics from any web page", fa: "متن آهنگ از هر صفحهٔ وب" },
};

/** A member's subscription as stored (lib/billing/store.ts). */
export type Subscription = {
  plan: Plan;
  status: "active" | "trialing" | "past_due" | "canceled" | "pending";
  provider: Provider;
  /** Plus lasts until then (the paid-for period, or the end of a grant). */
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/** Grace after a renewal fails (a card declined): Plus stays while the gateway retries. */
export const GRACE_DAYS = 3;

/** The plan someone is on now, from their subscription (none = Free). */
export function planOf(sub: Subscription | null | undefined, now = Date.now()): Plan {
  if (!sub || sub.plan !== "plus") return "free";
  if (!sub.currentPeriodEnd) return sub.status === "active" ? "plus" : "free";
  const end = sub.currentPeriodEnd.getTime();
  if (sub.status === "active" || sub.status === "trialing" || sub.status === "canceled") return end > now ? "plus" : "free";
  if (sub.status === "past_due") return end + GRACE_DAYS * 86_400_000 > now ? "plus" : "free";
  return "free";
}

const SWITCH: Record<PlusFeature, keyof AppSettings["plans"]> = {
  linkImport: "plusOnlyLinkImport",
  queue: "plusOnlyQueue",
  ai: "plusOnlyAi",
  lyricsWeb: "plusOnlyLyricsWeb",
};

/** Whether a feature is Plus-only right now (plans on and its switch on). */
export function plusOnly(feature: PlusFeature, settings: Pick<AppSettings, "plans">): boolean {
  return settings.plans.enabled && settings.plans[SWITCH[feature]] === true;
}

/** Whether someone on `plan` may use `feature`. */
export function canUse(feature: PlusFeature, plan: Plan, settings: Pick<AppSettings, "plans">): boolean {
  return plan === "plus" || !plusOnly(feature, settings);
}

/** Whether ads are shown to someone on `plan`. */
export function showsAds(plan: Plan, settings: Pick<AppSettings, "plans">): boolean {
  return !(settings.plans.enabled && settings.plans.plusNoAds && plan === "plus");
}

/** The site's AI tokens a day for `plan` (0 = none). */
export function aiTokensPerDay(plan: Plan, settings: Pick<AppSettings, "plans" | "ai">): number {
  if (!settings.plans.enabled) return settings.ai.plusTokensPerDay;
  if (plan === "plus") return settings.ai.plusTokensPerDay;
  return settings.plans.plusOnlyAi ? 0 : settings.ai.freeTokensPerDay;
}

/** The price of a period, in micros (US$1 = 1,000,000). */
export function priceOf(period: Period, settings: Pick<AppSettings, "plans">): number {
  return period === "year" ? settings.plans.yearlyMicros : settings.plans.monthlyMicros;
}

/** What a year saves against twelve months, as a whole percent (0 when it doesn't). */
export function yearlySaving(settings: Pick<AppSettings, "plans">): number {
  const twelve = settings.plans.monthlyMicros * 12;
  return twelve > settings.plans.yearlyMicros ? Math.round((1 - settings.plans.yearlyMicros / twelve) * 100) : 0;
}

/** The Toman price of a month paid by hand: the owner's, else the dollar price at the rate (rounded to 1,000); 0 when neither is set. */
export function tomanMonthly(settings: Pick<AppSettings, "plans" | "payouts">): number {
  if (settings.plans.tomanMonthly > 0) return settings.plans.tomanMonthly;
  if (!settings.payouts.tomanRate) return 0;
  return Math.round((settings.plans.monthlyMicros / 1_000_000) * settings.payouts.tomanRate / 1000) * 1000;
}

/** The end of a period that starts at `from` (a month is the same day next month, clamped to its last day). */
export function periodEnd(from: Date, period: Period, count = 1): Date {
  const d = new Date(from.getTime());
  if (period === "year") {
    d.setUTCFullYear(d.getUTCFullYear() + count);
    return d;
  }
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + count);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** "$4.99". */
export function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}
