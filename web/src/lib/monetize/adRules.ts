// What may show where, and who decides — pure, shared by the server (which
// serves and books ads) and the pages (which explain the choices), so they
// can never disagree. The owner's answers (PLAN.md, "Ads, complete"):
//
// - A remix's maker decides for its page: ads on or off, which kinds, and
//   topics they don't want next to their music (like YouTube's per-video
//   monetization settings).
// - A verified artist decides for their song, like Content ID: Monetize
//   (ads stay on every remix of it, whatever the remixer chose — the
//   remixer still gets their share), Follow the remixer, or Block (remixes
//   of it can't be public).
// - Audio ads are gentle: before a remix at most once per listener per 30
//   minutes and never on the first remix of a visit; on the radio one break
//   per ~20 minutes of listening. Never for the music's own makers.

import { MICROS } from "./policy";
import { DEFAULTS, type AppSettings } from "../settings/registry";

/** The audio-ad rules (Admin → Settings → Audio ads). */
export type AudioRules = AppSettings["audio"];

// ——— kinds and formats ———

/** What a remixer can allow next to their remix. */
export const AD_KINDS = ["card", "preroll", "radio"] as const;
export type AdKind = (typeof AD_KINDS)[number];

/** Each kind's name and what it means, with the owner's numbers in it. */
export function adKindText(a: AudioRules = DEFAULTS.audio): Record<AdKind, { en: string; fa: string; enHelp: string; faHelp: string }> {
  return {
    card: {
      en: "Picture ads",
      fa: "تبلیغ تصویری",
      enHelp: "A card under the player, and on the radio page while it plays.",
      faHelp: "یک کارت زیر پخش‌کننده، و در صفحهٔ رادیو هنگام پخش.",
    },
    preroll: {
      en: "Audio ad before it plays",
      fa: "تبلیغ صوتی پیش از پخش",
      enHelp: `Up to ${a.maxSeconds} s before the remix starts, skippable after ${a.skipAfter} s. At most once per listener every ${a.prerollEveryMinutes} minutes.`,
      faHelp: `تا ${persianNumber(a.maxSeconds)} ثانیه پیش از شروع ریمیکس، پس از ${persianNumber(a.skipAfter)} ثانیه رد شدنی. برای هر شنونده حداکثر هر ${persianNumber(a.prerollEveryMinutes)} دقیقه یک بار.`,
    },
    radio: {
      en: "Audio ads on the radio",
      fa: "تبلیغ صوتی در رادیو",
      enHelp: `A short break before it on the radio, about once every ${a.radioEveryMinutes} minutes of listening.`,
      faHelp: `یک وقفهٔ کوتاه پیش از آن در رادیو، تقریباً هر ${persianNumber(a.radioEveryMinutes)} دقیقه شنیدن یک بار.`,
    },
  };
}

/** What an advertiser buys. */
export const FORMATS = ["card", "audio", "promote"] as const;
export type Format = (typeof FORMATS)[number];

/** The remix kinds a campaign's format fills. */
export function kindsOf(format: Format): AdKind[] {
  return format === "card" ? ["card"] : format === "audio" ? ["preroll", "radio"] : [];
}

/** An audio ad's file: 1 MB at most (15 s of good MP3 is ~250 KB). */
export const AUDIO_MAX_BYTES = 1024 * 1024;

// ——— topics ———

/** What an ad is about. An advertiser picks one; a remixer can keep any of them off their page. */
export const TOPICS = [
  { id: "music", en: "Music & instruments", fa: "موسیقی و ساز" },
  { id: "events", en: "Concerts & events", fa: "کنسرت و رویداد" },
  { id: "apps", en: "Apps & tech", fa: "اپ و فناوری" },
  { id: "education", en: "Education & courses", fa: "آموزش و دوره" },
  { id: "games", en: "Games", fa: "بازی" },
  { id: "fashion", en: "Fashion & beauty", fa: "مد و زیبایی" },
  { id: "food", en: "Food & drink", fa: "غذا و نوشیدنی" },
  { id: "shopping", en: "Shopping", fa: "خرید" },
  { id: "travel", en: "Travel", fa: "سفر" },
  { id: "health", en: "Health & sport", fa: "سلامت و ورزش" },
  { id: "finance", en: "Money & finance", fa: "مالی و سرمایه‌گذاری" },
  { id: "crypto", en: "Crypto", fa: "رمزارز" },
  { id: "dating", en: "Dating", fa: "دوست‌یابی" },
  { id: "politics", en: "Politics & causes", fa: "سیاست و کمپین" },
  { id: "religion", en: "Religion", fa: "مذهب" },
  { id: "other", en: "Something else", fa: "موارد دیگر" },
] as const;
export type Topic = (typeof TOPICS)[number]["id"];
export const TOPIC_IDS: readonly string[] = TOPICS.map((t) => t.id);

/** Never on Remixt, whoever pays: not offered to advertisers at all. */
export const NEVER = ["Gambling and betting", "Adult content", "Weapons", "Drugs", "Alcohol and tobacco", "Fake money-making schemes"];
/** The same list, in Persian (same order). */
export const NEVER_FA = ["قمار و شرط‌بندی", "محتوای بزرگسالان", "سلاح", "مواد مخدر", "الکل و دخانیات", "طرح‌های پولسازی دروغین"];

// ——— who decides ———

export type SongPolicy = "monetize" | "follow" | "block";

export const SONG_POLICY_TEXT: Record<SongPolicy, { en: string; fa: string; enHelp: string; faHelp: string }> = {
  monetize: {
    en: "Monetize",
    fa: "کسب درآمد",
    enHelp: "Ads stay on every remix of this song, even if its remixer turns them off. You're paid your share; the remixer still gets theirs.",
    faHelp: "تبلیغ روی همهٔ ریمیکس‌های این آهنگ می‌ماند، حتی اگر ریمیکسر خاموشش کند. سهم شما پرداخت می‌شود و ریمیکسر هم سهمش را می‌گیرد.",
  },
  follow: {
    en: "Follow the remixer",
    fa: "تصمیم با ریمیکسر",
    enHelp: "Each remixer decides about ads on their remix. When they're on, you're paid your share.",
    faHelp: "هر ریمیکسر دربارهٔ تبلیغ ریمیکس خودش تصمیم می‌گیرد. وقتی روشن باشد، سهم شما پرداخت می‌شود.",
  },
  block: {
    en: "Block",
    fa: "مسدود",
    enHelp: "Remixes using this song can't be public. Ones already published go private and their makers are told why.",
    faHelp: "ریمیکس‌هایی که از این آهنگ استفاده می‌کنند نمی‌توانند عمومی باشند. ریمیکس‌های منتشرشده خصوصی می‌شوند و به سازنده‌شان دلیلش گفته می‌شود.",
  },
};

/** Where on (and around) a remix's page a picture ad may sit. */
export const AD_SPOTS = ["player", "comments", "radio"] as const;
export type AdSpot = (typeof AD_SPOTS)[number];

export const AD_SPOT_TEXT: Record<AdSpot, { en: string; fa: string; enHelp: string; faHelp: string }> = {
  player: { en: "Under the player", fa: "زیر پخش‌کننده", enHelp: "Seen by most listeners.", faHelp: "بیشترِ شنونده‌ها می‌بینند." },
  comments: { en: "Below the comments", fa: "زیر نظرها", enHelp: "Out of the way: only people who scroll down see it.", faHelp: "دور از دید: فقط کسی که پایین برود می‌بیند." },
  radio: { en: "On the radio page while it plays", fa: "در صفحهٔ رادیو هنگام پخش", enHelp: "When your remix is on air.", faHelp: "وقتی ریمیکست در رادیو پخش می‌شود." },
};

/** How a picture ad looks on the page. */
export const AD_STYLES = ["full", "compact"] as const;
export type AdStyle = (typeof AD_STYLES)[number];

export const AD_STYLE_TEXT: Record<AdStyle, { en: string; fa: string; enHelp: string; faHelp: string }> = {
  full: { en: "Full card", fa: "کارت کامل", enHelp: "Picture, words and a button.", faHelp: "تصویر، متن و دکمه." },
  compact: { en: "Slim strip", fa: "نوار باریک", enHelp: "One quiet line with a small picture.", faHelp: "یک خطِ آرام با تصویر کوچک." },
};

export type RemixAdSettings = {
  on: boolean;
  kinds: AdKind[];
  blockedTopics: string[];
  /** Where picture ads sit (at least one while picture ads are on). */
  spots: AdSpot[];
  style: AdStyle;
  /** Remixt's own ads may fill the spots no paying ad takes (they pay nobody). */
  house: boolean;
};

export const DEFAULT_REMIX_ADS: RemixAdSettings = {
  on: true,
  kinds: [...AD_KINDS],
  blockedTopics: [],
  spots: ["player", "radio"],
  style: "full",
  house: true,
};

/** Settings as stored or sent, made safe: known kinds, topics and spots only. */
export function cleanSettings(s: Partial<RemixAdSettings> | null | undefined): RemixAdSettings {
  if (!s) return { ...DEFAULT_REMIX_ADS, kinds: [...DEFAULT_REMIX_ADS.kinds], spots: [...DEFAULT_REMIX_ADS.spots] };
  const spots = AD_SPOTS.filter((x) => (s.spots ?? DEFAULT_REMIX_ADS.spots).includes(x));
  return {
    on: s.on !== false,
    kinds: AD_KINDS.filter((k) => (s.kinds ?? AD_KINDS).includes(k)),
    blockedTopics: TOPIC_IDS.filter((t) => (s.blockedTopics ?? []).includes(t)),
    // Picture ads on with nowhere to sit would be "on" in name only: under the player, then.
    spots: spots.length ? spots : ["player"],
    style: s.style === "compact" ? "compact" : "full",
    house: s.house !== false,
  };
}

export type EffectiveAds = {
  /** Paying ads may show at all. */
  on: boolean;
  /** Which kinds. */
  kinds: AdKind[];
  blockedTopics: string[];
  /** On because an artist chose Monetize, though the remixer turned ads off. */
  forced: boolean;
  /** A song in it is blocked by its artist: the remix can't be public. */
  blocked: boolean;
  /** Where picture ads sit, and how they look. */
  spots: AdSpot[];
  style: AdStyle;
  /** Remixt's own ads may fill an empty spot. */
  house: boolean;
};

/**
 * What actually shows on a remix: the remixer's choice, unless an artist
 * of a song in it chose Monetize (then ads stay on — in the kinds the
 * remixer allowed, and at least picture ads) or Block (then nothing: the
 * remix can't be public). Topics the remixer blocked stay blocked always.
 */
export function effectiveAds(settings: RemixAdSettings, policies: (SongPolicy | null)[]): EffectiveAds {
  const { blockedTopics, style, house } = settings;
  const spots = settings.spots.length ? settings.spots : (["player"] as AdSpot[]);
  const none = { on: false, kinds: [] as AdKind[], blockedTopics, forced: false, spots, style, house };
  if (policies.includes("block")) return { ...none, blocked: true };
  const monetize = policies.includes("monetize");
  const remixerOn = settings.on && settings.kinds.length > 0;
  if (!remixerOn && !monetize) return { ...none, blocked: false };
  // The remixer's ticked kinds always count; an artist's Monetize adds the picture card when none are ticked.
  const kinds: AdKind[] = settings.kinds.length ? [...settings.kinds] : ["card"];
  return { on: true, kinds, blockedTopics, forced: !remixerOn, blocked: false, spots, style, house };
}

// ——— how often ———

export type ListenerAds = { lastAdAt: number; visitStartedAt: number; lastPlayAt: number; playsThisVisit: number };

/** A play is starting: whether an audio ad goes first, and what to remember. */
export function prerollDue(state: ListenerAds | null, now: number, a: AudioRules = DEFAULTS.audio): { due: boolean; next: ListenerAds } {
  const s = state ?? { lastAdAt: 0, visitStartedAt: now, lastPlayAt: 0, playsThisVisit: 0 };
  const newVisit = now - s.lastPlayAt > a.visitGapMinutes * 60_000;
  const plays = newVisit ? 0 : s.playsThisVisit;
  const due = !(a.prerollFreeFirst && plays === 0) && now - s.lastAdAt >= a.prerollEveryMinutes * 60_000;
  return {
    due,
    next: { lastAdAt: s.lastAdAt, visitStartedAt: newVisit ? now : s.visitStartedAt, lastPlayAt: now, playsThisVisit: plays + 1 },
  };
}

/** The ad was heard: remembered so the next one waits. */
export function adHeard(state: ListenerAds, now: number): ListenerAds {
  return { ...state, lastAdAt: now };
}

/** On the radio: a break is due once this much has been listened to since the last one. */
export function radioBreakDue(listenedMs: number, a: AudioRules = DEFAULTS.audio): boolean {
  return listenedMs >= a.radioEveryMinutes * 60_000;
}

// ——— Toman ———

/** Persian digits, grouped by thousands: 12300 → "۱۲٬۳۰۰". */
export function persianNumber(n: number): string {
  return Math.round(n)
    .toLocaleString("en-US")
    .replace(/,/g, "٬")
    .replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** USD micros in Toman at `rate` (Toman per dollar), rounded to 10 Toman (no smaller coin is used). */
export function tomanOf(micros: number, rate: number): number {
  return Math.round((micros / MICROS) * rate / 10) * 10;
}

/** Toman back into USD micros, for prices typed in Toman. */
export function microsOfToman(toman: number, rate: number): number {
  return rate > 0 ? Math.round((toman / rate) * MICROS) : 0;
}

/** Money for Persian pages: "۱۲٬۳۰۰ تومان"; a sliver above zero shows as "کمتر از ۱۰ تومان". */
export function formatToman(micros: number, rate: number): string {
  const t = tomanOf(micros, rate);
  if (micros > 0 && t === 0) return "کمتر از ۱۰ تومان";
  return `${persianNumber(t)} تومان`;
}
