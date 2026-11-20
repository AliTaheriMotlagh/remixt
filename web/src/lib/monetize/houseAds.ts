// Remixt's own ads: what an ad spot shows when no paying campaign fits.
// They earn nobody anything (they say "From Remixt", not "Sponsored"), and
// they point at things on the site, so an empty spot still helps the site
// grow. Every claim must stay true of the app.
//
// Kinds, by spot:
//   card    a picture card — every picture spot (pages, a remix, the radio)
//   motion  the animated "Remix it your way" spot (components/ads/HouseMotion),
//           drawn in code, a few KB: the promo video's story in the ad box
//   video   an uploaded video (the owner's, Admin → Remixt ads), muted until tapped
//   audio   a short sound: a station ID in a radio break, or (when the owner
//           turns it on) before a remix
//
// The built-in ones below are put in the database the first time (houseStore.ts),
// where the owner can change, turn off, weight and add to them. This list
// is also the fallback when the database can't be read: a spot never breaks.
//
// Pure: the server, the pages and the tests share it.

import { z } from "zod";

export const HOUSE_KINDS = ["card", "motion", "video", "audio"] as const;
export type HouseKind = (typeof HOUSE_KINDS)[number];

/** The spots one of our ads can fill (lists' promoted slots are members' own promotions). */
export const HOUSE_SPOTS = ["site", "remix", "radio"] as const;
export type HouseSpot = (typeof HOUSE_SPOTS)[number];

export const HOUSE_TONES = ["brand", "vocals", "beat", "drums"] as const;
export type HouseTone = (typeof HOUSE_TONES)[number];

export type HouseLang = "en" | "fa" | "any";

export type HouseAd = {
  id: string;
  lang: HouseLang;
  kind: HouseKind;
  title: string;
  body: string;
  cta: string;
  /** A page on Remixt ("/radio") or an https address (Remixt's own channels). */
  href: string;
  tone: HouseTone;
  spots: HouseSpot[];
  /** How often, against the others that fit (1–100). */
  weight: number;
  active: boolean;
  /** One of the list below (can be turned off and changed, not deleted). */
  builtin: boolean;
  /** Picture, video or sound address; null for a card/motion drawn here. */
  media: string | null;
  /** A sound's length. */
  seconds: number | null;
};

const ad = (a: Omit<HouseAd, "active" | "builtin" | "media" | "seconds" | "weight"> & Partial<HouseAd>): HouseAd => ({
  weight: 10,
  active: true,
  builtin: true,
  media: null,
  seconds: null,
  ...a,
});

export const BUILTIN_HOUSE_ADS: HouseAd[] = [
  // ——— the hero: the promo's story, animated ———
  ad({ id: "promo-en", lang: "en", kind: "motion", title: "Remix it your way", body: "Drop any vocal on any beat. Free, in your browser.", cta: "Start remixing", href: "/studio", tone: "brand", spots: ["site", "remix", "radio"], weight: 30 }),
  ad({ id: "promo-fa", lang: "fa", kind: "motion", title: "ریمیکس، به سبکِ خودت", body: "هر صدایی را روی هر بیتی بگذار. رایگان، در مرورگر.", cta: "شروع ریمیکس", href: "/studio", tone: "brand", spots: ["site", "remix", "radio"], weight: 30 }),
  // ——— cards ———
  ad({ id: "earn", lang: "en", kind: "card", title: "Your remixes can earn", body: "Ads on your remix pay you, and the artists you used. See how it's shared.", cta: "How you earn", href: "/earnings", tone: "brand", spots: ["site", "remix"] }),
  ad({ id: "karaoke", lang: "en", kind: "card", title: "Make a karaoke track", body: "Take the voice out of any song, right in your browser.", cta: "Try it free", href: "/tools/karaoke-maker", tone: "vocals", spots: ["site"] }),
  ad({ id: "radio", lang: "en", kind: "card", title: "Tune in to Remixt Radio", body: "Everyone hears the same song at once. Vote for what plays next.", cta: "Listen", href: "/radio", tone: "beat", spots: ["site", "remix"] }),
  ad({ id: "mashup", lang: "en", kind: "card", title: "Make a mashup", body: "One song's vocal over another's beat, matched in tempo and key.", cta: "Open the Studio", href: "/studio", tone: "drums", spots: ["site", "remix", "radio"] }),
  ad({ id: "claim", lang: "en", kind: "card", title: "Is a song here yours?", body: "Artists get a share of every ad on remixes of their songs. Claim yours.", cta: "Claim your songs", href: "/earnings#claims", tone: "vocals", spots: ["site", "remix", "radio"] }),
  ad({ id: "together", lang: "en", kind: "card", title: "Make music together, privately", body: "Upload a beat only you and your vocalist can hear. Publish when it's ready.", cta: "Upload privately", href: "/upload", tone: "beat", spots: ["site", "remix"] }),
  ad({ id: "advertise", lang: "en", kind: "card", title: "Advertise on Remixt", body: "Reach listeners on remixes and the radio. You pay only for ads really seen or heard.", cta: "Make an ad", href: "/advertise", tone: "drums", spots: ["site", "radio"], weight: 6 }),
  ad({ id: "earn-fa", lang: "fa", kind: "card", title: "از ریمیکس‌هایت درآمد داشته باش", body: "تبلیغِ صفحهٔ ریمیکس تو، به تو و هنرمندانِ آهنگ‌ها سهم می‌دهد.", cta: "ببین چطور", href: "/fa/earnings", tone: "brand", spots: ["site", "remix"] }),
  ad({ id: "karaoke-fa", lang: "fa", kind: "card", title: "کارائوکه بساز", body: "صدای خواننده را از هر آهنگی بردار، همین‌جا در مرورگر.", cta: "رایگان امتحان کن", href: "/fa/tools/karaoke-maker", tone: "vocals", spots: ["site"] }),
  ad({ id: "radio-fa", lang: "fa", kind: "card", title: "رادیو ریمیکست", body: "همه یک آهنگ را با هم می‌شنوند؛ به آهنگِ بعدی رأی بده.", cta: "گوش بده", href: "/radio", tone: "beat", spots: ["site", "remix"] }),
  ad({ id: "claim-fa", lang: "fa", kind: "card", title: "آهنگی از تو این‌جاست؟", body: "هنرمند از هر تبلیغ روی ریمیکسِ آهنگش سهم دارد. ادعا کن.", cta: "ثبت آهنگ‌هایم", href: "/fa/earnings#claims", tone: "vocals", spots: ["site", "remix", "radio"] }),
  ad({ id: "together-fa", lang: "fa", kind: "card", title: "با هم آهنگ بسازید، خصوصی", body: "بیتی بگذار که فقط تو و خواننده‌ات می‌شنوید؛ هر وقت آماده شد منتشرش کن.", cta: "آپلود خصوصی", href: "/upload", tone: "beat", spots: ["site", "remix"] }),
  ad({ id: "advertise-fa", lang: "fa", kind: "card", title: "در ریمیکست تبلیغ کن", body: "به شنونده‌های ریمیکس‌ها و رادیو برس؛ فقط برای تبلیغِ دیده‌شده یا شنیده‌شده پول بده.", cta: "ساخت تبلیغ", href: "/fa/advertise", tone: "drums", spots: ["site", "radio"], weight: 6 }),
  // ——— sounds (made by scripts/make-house-audio.mjs: no words, so any language) ———
  ad({ id: "radio-id", lang: "any", kind: "audio", title: "You're listening to Remixt Radio", body: "Vote for what plays next, or ask for a song.", cta: "Request a song", href: "/radio", tone: "beat", spots: ["radio"], media: "/ads/remixt-radio-id.mp3", seconds: 6.5 }),
  ad({ id: "sting", lang: "any", kind: "audio", title: "Made on Remixt", body: "Split any song and remix it your way — free, in your browser.", cta: "Make your own", href: "/studio", tone: "brand", spots: ["remix"], media: "/ads/remixt-sting.mp3", seconds: 3.6 }),
];

/** Visual kinds fill picture spots; audio fills sound spots. */
export function isVisual(kind: HouseKind): boolean {
  return kind !== "audio";
}

/** The ads that may fill this spot, in this language, of this sense. */
export function houseCandidates(ads: HouseAd[], spot: HouseSpot, lang: "en" | "fa", sense: "visual" | "audio"): HouseAd[] {
  return ads.filter(
    (a) =>
      a.active &&
      a.weight > 0 &&
      a.spots.includes(spot) &&
      (a.lang === "any" || a.lang === lang) &&
      (sense === "audio" ? a.kind === "audio" && !!a.media : isVisual(a.kind) && (a.kind !== "video" || !!a.media))
  );
}

/** One of `ads`, a heavier one more often. `rand` in [0, 1). */
export function pickWeighted<T extends { weight: number }>(ads: T[], rand: number): T | null {
  const total = ads.reduce((sum, a) => sum + Math.max(0, a.weight), 0);
  if (total <= 0) return null;
  let at = Math.min(0.999999, Math.max(0, rand)) * total;
  for (const a of ads) {
    at -= Math.max(0, a.weight);
    if (at < 0) return a;
  }
  return ads[ads.length - 1];
}

/** Where a house ad may send people: a page here, or an https address. */
export function safeHref(href: string): boolean {
  if (/^\/(?!\/)[^\s]*$/.test(href)) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/** What the admin page sends to make or change one. */
export const houseAdInput = z.object({
  lang: z.enum(["en", "fa", "any"]),
  kind: z.enum(HOUSE_KINDS),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(200).default(""),
  cta: z.string().trim().min(1).max(30),
  href: z.string().trim().max(500).refine(safeHref, "Link to a page here (/radio) or an https:// address"),
  tone: z.enum(HOUSE_TONES).default("brand"),
  spots: z.array(z.enum(HOUSE_SPOTS)).min(1, "Pick at least one place").max(HOUSE_SPOTS.length),
  weight: z.number().int().min(0).max(100).default(10),
  active: z.boolean().default(true),
});
export type HouseAdInput = z.infer<typeof houseAdInput>;

/** Click-through rate as a percentage with one decimal ("2.4%"); "—" before anything was seen. */
export function ctrText(views: number, clicks: number): string {
  if (views <= 0) return "—";
  return `${((clicks / views) * 100).toFixed(1)}%`;
}

/**
 * Old callers (and the database's fallback): a picture ad for an ordinary
 * spot, varied by `seed` so a page doesn't show the same one twice.
 */
export function houseAd(lang: "en" | "fa", seed: number, spot: HouseSpot = "site"): HouseAd {
  const list = houseCandidates(BUILTIN_HOUSE_ADS, spot, lang, "visual").filter((a) => a.kind === "card");
  return list[Math.abs(Math.floor(seed)) % list.length];
}
