// Every setting the owner can change in Admin → Settings: its default, its
// unit, its limits, what it's called (English and Persian), and the rules
// between settings (a split adds up to 100%). Pure — the server (which
// stores and enforces them), the admin page (which is drawn from this list)
// and the public pages (which explain the rules) all read the same thing.
//
// To add a setting: put its default in DEFAULTS and a line in FIELDS. The
// admin page, validation, storage, history and the tests pick it up.

export type Split = { platform: number; artists: number; remixers: number };

export type AppSettings = {
  shares: {
    /** A remix's page, or a remix on the radio (basis points: 10,000 = 100%). */
    remix: Split;
    /** A library song played as it is (the radio): no remixer. */
    song: Split;
    /** Each song's uploader, of every ad using it, out of Remixt's part. */
    uploader: number;
    /** Each song's miner (whose computer split it), out of Remixt's part. */
    miner: number;
    /** A remix of a remix: this part of the remixers' share goes to the remix it came from. */
    parent: number;
    /** How much a used vocal counts against other parts in the artists' share. */
    vocalWeight: number;
    /** A remix's maker always keeps at least this part of the remixers' share when sharing it. */
    ownerKeeps: number;
  };
  payouts: {
    holdDays: number;
    /** The least paid out at once (micros: $1 = 1,000,000). */
    minMicros: number;
    unclaimedYears: number;
    /** Toman per US dollar; 0 = not set (Persian pages show dollars). */
    tomanRate: number;
  };
  ads: {
    /** A view counts when this much of the ad is on screen (basis points)… */
    viewShare: number;
    /** …for this long, in a visible tab. */
    viewMs: number;
    paidViewsPerAddress: number;
    /** Lowest price per 1,000 paid views (micros). */
    floors: { card: number; audio: number; promote: number };
  };
  audio: {
    maxSeconds: number;
    skipAfter: number;
    paidAfter: number;
    prerollEveryMinutes: number;
    prerollFreeFirst: boolean;
    visitGapMinutes: number;
    radioEveryMinutes: number;
  };
  features: {
    ads: boolean;
    audioAds: boolean;
    selfServe: boolean;
    promotions: boolean;
    signups: boolean;
    wrongInfo: boolean;
    /** Remixt's own ads fill a picture spot no paying ad takes. */
    houseAds: boolean;
    /** Remixt's own audio (a station ID) in a radio break no paying ad takes. */
    houseRadio: boolean;
    /** Remixt's own audio before a remix when no paying ad takes the spot (pays nobody, so off unless chosen). */
    housePreroll: boolean;
    /** First-party analytics (Admin → Analytics): page views, sessions, sources. */
    analytics: boolean;
    /** Publishing, payouts and paying for Plus need a confirmed email (sign-up sends the link). */
    requireVerifiedEmail: boolean;
  };
  mining: {
    base: number;
    longSong: number;
    firstToday: number;
    rushMultiplier: number;
    longSongMinutes: number;
    rushAfterMinutes: number;
  };
  limits: {
    signupsPerHour: number;
    wrongPasswordsPerAccount: number;
    loginsPerAddress: number;
    takedownsPerHour: number;
    claimsPerDay: number;
    jamInvitesPerHour: number;
    adsPerDay: number;
    adPaymentsPerDay: number;
    wrongInfoPerHour: number;
  };
  security: {
    /** The captcha's work: the browser tries up to this many answers (≈1.5 s at 50,000 on a laptop). */
    captchaWork: number;
  };
  payTo: { en: string; fa: string };
  /** Free (ads, no server features) and Plus (everything, no ads) — see lib/plans.ts. */
  plans: {
    /** Off: there's one plan and everyone has everything (as before plans existed). */
    enabled: boolean;
    monthlyMicros: number;
    yearlyMicros: number;
    /** Toman a month when paying by hand (card to card); 0 = the dollar price at the Toman rate. */
    tomanMonthly: number;
    /** What only Plus can use (each of these runs on Remixt's servers or costs it money). */
    plusOnlyLinkImport: boolean;
    plusOnlyQueue: boolean;
    plusOnlyAi: boolean;
    plusOnlyLyricsWeb: boolean;
    /** Plus members see and hear no ads. */
    plusNoAds: boolean;
    /** Ways to pay offered on /plus (each also needs its keys; Admin → Plans says which are connected). */
    stripe: boolean;
    paypal: boolean;
    manual: boolean;
    /** How to pay by hand (card number, Sheba, USDT…) on the English and Persian pages. */
    manualHowEn: string;
    manualHowFa: string;
  };
  /** The site's own AI (the Studio's co-producer) on Remixt's OpenRouter key, metered in tokens. */
  ai: {
    /** The OpenRouter model id, e.g. "anthropic/claude-sonnet-5.5". */
    model: string;
    freeTokensPerDay: number;
    plusTokensPerDay: number;
  };
};

const M = 1_000_000;

/** What Remixt runs on before the owner changes anything (the values the site was built with). */
export const DEFAULTS: AppSettings = {
  shares: {
    remix: { platform: 3_000, artists: 4_000, remixers: 3_000 },
    song: { platform: 4_000, artists: 6_000, remixers: 0 },
    uploader: 500,
    miner: 300,
    parent: 2_500,
    vocalWeight: 2,
    ownerKeeps: 1_000,
  },
  payouts: { holdDays: 30, minMicros: 10 * M, unclaimedYears: 3, tomanRate: 0 },
  ads: { viewShare: 5_000, viewMs: 1_000, paidViewsPerAddress: 60, floors: { card: M / 2, audio: 2 * M, promote: M / 2 } },
  audio: { maxSeconds: 15, skipAfter: 5, paidAfter: 5, prerollEveryMinutes: 30, prerollFreeFirst: true, visitGapMinutes: 30, radioEveryMinutes: 20 },
  features: {
    ads: true,
    audioAds: true,
    selfServe: true,
    promotions: true,
    signups: true,
    wrongInfo: true,
    houseAds: true,
    houseRadio: true,
    housePreroll: false,
    analytics: true,
    requireVerifiedEmail: true,
  },
  mining: { base: 10, longSong: 5, firstToday: 5, rushMultiplier: 2, longSongMinutes: 5, rushAfterMinutes: 15 },
  limits: {
    // Phone networks put many people behind one address (CGNAT, common in Iran): 5 an hour turned real people away.
    signupsPerHour: 20,
    wrongPasswordsPerAccount: 8,
    loginsPerAddress: 30,
    takedownsPerHour: 10,
    claimsPerDay: 20,
    jamInvitesPerHour: 30,
    adsPerDay: 20,
    adPaymentsPerDay: 10,
    wrongInfoPerHour: 10,
  },
  security: { captchaWork: 50_000 },
  payTo: { en: "", fa: "" },
  plans: {
    enabled: false,
    monthlyMicros: 4_990_000,
    yearlyMicros: 49_990_000,
    tomanMonthly: 0,
    plusOnlyLinkImport: true,
    plusOnlyQueue: true,
    plusOnlyAi: false,
    plusOnlyLyricsWeb: false,
    plusNoAds: true,
    stripe: true,
    paypal: true,
    manual: true,
    manualHowEn: "",
    manualHowFa: "",
  },
  ai: { model: "anthropic/claude-sonnet-5.5", freeTokensPerDay: 20_000, plusTokensPerDay: 400_000 },
};

// ——— the fields ———

/**
 * How a value is stored and shown: "percent" is stored in basis points and
 * shown as a percent; "usd" is stored in micros and shown in dollars.
 */
export type Unit = "percent" | "usd" | "count" | "times" | "seconds" | "ms" | "minutes" | "days" | "years" | "toman" | "switch" | "text";

export type Group = "shares" | "payouts" | "ads" | "audio" | "features" | "mining" | "limits" | "security" | "payTo" | "plans" | "ai";

export type Field = {
  path: string;
  group: Group;
  unit: Unit;
  en: string;
  fa: string;
  /** What it does, for the admin. */
  help?: string;
  min?: number;
  max?: number;
  /** Whole numbers only (in the stored unit). */
  int?: boolean;
  /** Seen by everyone's browser (the pages explain the rules with it). Limits and security stay on the server. */
  public: boolean;
};

export const GROUPS: { id: Group; en: string; fa: string; help: string }[] = [
  { id: "shares", en: "Who gets what", fa: "سهم‌ها", help: "Shares of every ad's money. Changes apply to new views; what was earned stays as it was." },
  { id: "payouts", en: "Payouts", fa: "پرداخت به اعضا", help: "When and how much members can withdraw, and the Toman rate." },
  { id: "ads", en: "Ads and prices", fa: "تبلیغ و قیمت", help: "What counts as a paid view, and the lowest prices advertisers can pay." },
  { id: "audio", en: "Audio ads", fa: "تبلیغ صوتی", help: "How long audio ads are and how often listeners hear them." },
  { id: "features", en: "Switches", fa: "کلیدها", help: "Turn whole features on or off at once." },
  { id: "mining", en: "Mining rewards (XP)", fa: "پاداش ماینینگ", help: "XP for splitting songs for others." },
  { id: "limits", en: "Limits against abuse", fa: "محدودیت‌ها", help: "How often one person or address may do something." },
  { id: "security", en: "Security", fa: "امنیت", help: "The captcha's difficulty." },
  { id: "payTo", en: "How advertisers pay you", fa: "روش پرداخت تبلیغ‌دهنده", help: "Shown on the advertiser page: card number, IBAN, USDT address…" },
  { id: "plans", en: "Plans: Free and Plus", fa: "اشتراک: رایگان و پلاس", help: "Prices, what only Plus can use, and the ways to pay. Gateway keys are in Admin → Plans." },
  { id: "ai", en: "The site's AI", fa: "هوش مصنوعیِ سایت", help: "The co-producer on Remixt's own OpenRouter key (OPENROUTER_API_KEY), counted in tokens per person per day." },
];

const pct = (path: string, group: Group, en: string, fa: string, help: string, max = 10_000): Field => ({ path, group, unit: "percent", en, fa, help, min: 0, max, int: true, public: true });

export const FIELDS: Field[] = [
  pct("shares.remix.platform", "shares", "Remix page — Remixt", "صفحهٔ ریمیکس — ریمیکست", "Remixt's part of an ad on a remix (uploaders and miners are paid out of it)."),
  pct("shares.remix.artists", "shares", "Remix page — the songs' artists", "صفحهٔ ریمیکس — هنرمندان", "Shared between the songs a remix uses."),
  pct("shares.remix.remixers", "shares", "Remix page — remixers", "صفحهٔ ریمیکس — ریمیکسرها", "The remix's maker and their collaborators."),
  pct("shares.song.platform", "shares", "Song on the radio — Remixt", "آهنگ در رادیو — ریمیکست", "A library song played as it is."),
  pct("shares.song.artists", "shares", "Song on the radio — its artist", "آهنگ در رادیو — هنرمند", "Held for the artist until they claim the song."),
  pct("shares.song.remixers", "shares", "Song on the radio — remixers", "آهنگ در رادیو — ریمیکسرها", "Usually 0: a song played as it is has no remixer."),
  pct("shares.uploader", "shares", "Each song's uploader", "آپلودکنندهٔ هر آهنگ", "Of every ad using the song, out of Remixt's part."),
  pct("shares.miner", "shares", "Each song's miner", "ماینرِ هر آهنگ", "Whoever's computer split it (the uploader when split in their own browser). Out of Remixt's part."),
  pct("shares.parent", "shares", "A remix of a remix → the remix it came from", "ریمیکسِ یک ریمیکس → ریمیکس اصلی", "Part of the remixers' share."),
  { path: "shares.vocalWeight", group: "shares", unit: "times", en: "A vocal counts as", fa: "وزن وکال", help: "Against a beat or other part, in the artists' share (2 = double).", min: 1, max: 10, public: true },
  pct("shares.ownerKeeps", "shares", "A remix's maker always keeps at least", "حداقل سهم سازندهٔ ریمیکس", "Of the remixers' share, when they share it with collaborators."),

  { path: "payouts.holdDays", group: "payouts", unit: "days", en: "Earnings wait before withdrawal", fa: "مدت انتظار پیش از برداشت", help: "Time to catch invalid traffic and refunds.", min: 0, max: 365, int: true, public: true },
  { path: "payouts.minMicros", group: "payouts", unit: "usd", en: "Smallest withdrawal", fa: "حداقل برداشت", min: 1_000_000, max: 10_000_000_000, int: true, public: true },
  { path: "payouts.unclaimedYears", group: "payouts", unit: "years", en: "Unclaimed artist money goes to Remixt after", fa: "پول ادعانشده پس از", min: 1, max: 20, int: true, public: true },
  { path: "payouts.tomanRate", group: "payouts", unit: "toman", en: "Toman per US dollar", fa: "تومان برای هر دلار", help: "Persian pages and Sheba payouts use it. 0 = not set (Persian pages show dollars).", min: 0, max: 100_000_000, int: true, public: true },

  pct("ads.viewShare", "ads", "A view counts when this much of the ad is on screen", "بازدید وقتی حساب می‌شود که این مقدار از تبلیغ دیده شود", "The industry standard is 50%."),
  { path: "ads.viewMs", group: "ads", unit: "ms", en: "…for at least", fa: "…دست‌کم به مدت", help: "Milliseconds in a visible tab (standard: 1,000).", min: 100, max: 30_000, int: true, public: true },
  { path: "ads.paidViewsPerAddress", group: "ads", unit: "count", en: "Paid views per network address per day", fa: "بازدید پولی برای هر آدرس در روز", help: "Shared Wi-Fi and phone networks share one address.", min: 1, max: 100_000, int: true, public: false },
  { path: "ads.floors.card", group: "ads", unit: "usd", en: "Lowest price per 1,000 — picture ads", fa: "کمترین قیمت ۱۰۰۰ بازدید — تصویری", min: 1_000, max: 1_000_000_000, int: true, public: true },
  { path: "ads.floors.audio", group: "ads", unit: "usd", en: "Lowest price per 1,000 — audio ads", fa: "کمترین قیمت ۱۰۰۰ بازدید — صوتی", min: 1_000, max: 1_000_000_000, int: true, public: true },
  { path: "ads.floors.promote", group: "ads", unit: "usd", en: "Lowest price per 1,000 — promotions", fa: "کمترین قیمت ۱۰۰۰ بازدید — معرفی ویژه", min: 1_000, max: 1_000_000_000, int: true, public: true },

  { path: "audio.maxSeconds", group: "audio", unit: "seconds", en: "Longest audio ad", fa: "بیشترین طول تبلیغ صوتی", min: 3, max: 60, int: true, public: true },
  { path: "audio.skipAfter", group: "audio", unit: "seconds", en: "Skippable after", fa: "رد شدنی پس از", min: 0, max: 60, int: true, public: true },
  { path: "audio.paidAfter", group: "audio", unit: "seconds", en: "Counts as heard (paid) after", fa: "شنیده‌شده (پولی) پس از", min: 1, max: 60, int: true, public: true },
  { path: "audio.prerollEveryMinutes", group: "audio", unit: "minutes", en: "Before remixes: at most one per listener every", fa: "پیش از ریمیکس: حداکثر یک بار برای هر شنونده هر", min: 1, max: 1_440, int: true, public: true },
  { path: "audio.prerollFreeFirst", group: "audio", unit: "switch", en: "Never on the first remix of a visit", fa: "هرگز روی اولین ریمیکسِ هر بازدید", public: true },
  { path: "audio.visitGapMinutes", group: "audio", unit: "minutes", en: "A visit ends after this long without playing", fa: "بازدید پس از این مدت بی‌پخش تمام می‌شود", min: 1, max: 1_440, int: true, public: true },
  { path: "audio.radioEveryMinutes", group: "audio", unit: "minutes", en: "Radio: one break per this much listening", fa: "رادیو: یک وقفه برای هر این مقدار شنیدن", min: 1, max: 1_440, int: true, public: true },

  { path: "features.ads", group: "features", unit: "switch", en: "Paying ads", fa: "تبلیغ پولی", help: "Off: only Remixt's own ads show, and nobody is paid.", public: true },
  { path: "features.audioAds", group: "features", unit: "switch", en: "Audio ads (before remixes and on the radio)", fa: "تبلیغ صوتی", public: true },
  { path: "features.selfServe", group: "features", unit: "switch", en: "Advertisers can make their own ads", fa: "ساخت تبلیغ توسط تبلیغ‌دهنده", help: "Off: the advertiser page says it's closed; ads you enter still run.", public: true },
  { path: "features.promotions", group: "features", unit: "switch", en: "Members can promote their remixes and songs", fa: "معرفی ویژه توسط اعضا", public: true },
  { path: "features.signups", group: "features", unit: "switch", en: "New accounts", fa: "ثبت‌نام", help: "Off: sign-up is closed (log-in still works).", public: true },
  { path: "features.wrongInfo", group: "features", unit: "switch", en: "“Wrong info?” reports", fa: "گزارش اطلاعات اشتباه", public: true },
  { path: "features.houseAds", group: "features", unit: "switch", en: "Remixt's own ads in empty spots", fa: "تبلیغ خودِ ریمیکست در جای خالی", help: "Off: a picture spot no paying ad takes stays empty. Each ad is managed in Admin → Remixt ads.", public: true },
  { path: "features.houseRadio", group: "features", unit: "switch", en: "Remixt station IDs in radio breaks", fa: "معرفی ایستگاه ریمیکست در وقفهٔ رادیو", help: "A radio break no paying audio ad takes plays Remixt's own short sound instead of being skipped.", public: true },
  { path: "features.housePreroll", group: "features", unit: "switch", en: "Remixt's own audio before remixes", fa: "صدای ریمیکست پیش از ریمیکس", help: "Pays nobody and makes listeners wait, so it's off unless you want it. The same how-often rules as paying audio ads.", public: true },
  { path: "features.analytics", group: "features", unit: "switch", en: "Analytics", fa: "آمار بازدید", help: "Page views, visits, sources and devices, kept on this site (no Google, no cookies; addresses never stored). Off: nothing new is recorded.", public: true },

  { path: "mining.base", group: "mining", unit: "count", en: "XP per song split for someone", fa: "امتیاز برای هر آهنگ", min: 0, max: 10_000, int: true, public: true },
  { path: "mining.longSong", group: "mining", unit: "count", en: "Extra XP for a long song", fa: "امتیاز اضافهٔ آهنگ بلند", min: 0, max: 10_000, int: true, public: true },
  { path: "mining.longSongMinutes", group: "mining", unit: "minutes", en: "A song is long from", fa: "آهنگ بلند از", min: 1, max: 60, int: true, public: true },
  { path: "mining.firstToday", group: "mining", unit: "count", en: "Extra XP for the first song each day", fa: "امتیاز اولین آهنگِ هر روز", min: 0, max: 10_000, int: true, public: true },
  { path: "mining.rushMultiplier", group: "mining", unit: "times", en: "Songs waiting long pay ×", fa: "ضریب آهنگ‌های منتظر", min: 1, max: 10, public: true },
  { path: "mining.rushAfterMinutes", group: "mining", unit: "minutes", en: "A song is waiting long after", fa: "آهنگ منتظر پس از", min: 1, max: 1_440, int: true, public: true },

  ...(
    [
      ["signupsPerHour", "Sign-ups per address per hour", "ثبت‌نام برای هر آدرس در ساعت"],
      ["wrongPasswordsPerAccount", "Wrong passwords per account per 15 min", "رمز اشتباه برای هر حساب در ۱۵ دقیقه"],
      ["loginsPerAddress", "Log-in tries per address per 15 min", "تلاش ورود برای هر آدرس در ۱۵ دقیقه"],
      ["takedownsPerHour", "Takedown requests per address per hour", "درخواست حذف برای هر آدرس در ساعت"],
      ["claimsPerDay", "Song claims per member per day", "ادعای آهنگ برای هر عضو در روز"],
      ["jamInvitesPerHour", "Remix-together invites per member per hour", "دعوت همکاری برای هر عضو در ساعت"],
      ["adsPerDay", "New ads per advertiser per day", "تبلیغ تازه برای هر تبلیغ‌دهنده در روز"],
      ["adPaymentsPerDay", "Payments reported per advertiser per day", "اعلام پرداخت برای هر تبلیغ‌دهنده در روز"],
      ["wrongInfoPerHour", "“Wrong info?” reports per address per hour", "گزارش اطلاعات اشتباه برای هر آدرس در ساعت"],
    ] as const
  ).map(([key, en, fa]): Field => ({ path: `limits.${key}`, group: "limits", unit: "count", en, fa, min: 1, max: 100_000, int: true, public: false })),

  { path: "security.captchaWork", group: "security", unit: "count", en: "Captcha work (answers to try)", fa: "سختی کپچا", help: "Higher stops more bots but takes phones longer (50,000 ≈ 1.5 s on a laptop).", min: 1_000, max: 2_000_000, int: true, public: false },

  { path: "payTo.en", group: "payTo", unit: "text", en: "On the English page", fa: "در صفحهٔ انگلیسی", max: 2_000, public: true },
  { path: "payTo.fa", group: "payTo", unit: "text", en: "On the Persian page", fa: "در صفحهٔ فارسی", max: 2_000, public: true },

  { path: "features.requireVerifiedEmail", group: "features", unit: "switch", en: "A confirmed email for publishing, payouts and Plus", fa: "ایمیل تأییدشده برای انتشار، برداشت و پلاس", help: "Sign-up sends a link (needs RESEND_API_KEY). Off: nobody is asked.", public: true },

  { path: "plans.enabled", group: "plans", unit: "switch", en: "Plans on (Free and Plus)", fa: "اشتراک فعال است", help: "Off: one plan, everyone has everything. On: Free has ads and no server features; Plus has everything and no ads.", public: true },
  { path: "plans.monthlyMicros", group: "plans", unit: "usd", en: "Plus — a month", fa: "پلاس — ماهانه", min: 500_000, max: 1_000_000_000, int: true, public: true },
  { path: "plans.yearlyMicros", group: "plans", unit: "usd", en: "Plus — a year", fa: "پلاس — سالانه", min: 500_000, max: 10_000_000_000, int: true, public: true },
  { path: "plans.tomanMonthly", group: "plans", unit: "toman", en: "Plus — a month, paying by hand (Toman)", fa: "پلاس — ماهانه، پرداخت دستی (تومان)", help: "0 = the monthly dollar price at the Toman rate.", min: 0, max: 1_000_000_000, int: true, public: true },
  { path: "plans.plusOnlyLinkImport", group: "plans", unit: "switch", en: "Only Plus: add a song from a link", fa: "فقط پلاس: افزودن آهنگ از لینک", help: "The server downloads it (yt-dlp).", public: true },
  { path: "plans.plusOnlyQueue", group: "plans", unit: "switch", en: "Only Plus: split from a phone (the queue)", fa: "فقط پلاس: جداسازی از گوشی", help: "The song is stored on the server until a helper's computer splits it.", public: true },
  { path: "plans.plusOnlyAi", group: "plans", unit: "switch", en: "Only Plus: the site's AI", fa: "فقط پلاس: هوش مصنوعیِ سایت", help: "Off: Free gets the free tokens below. Anyone can still use their own key.", public: true },
  { path: "plans.plusOnlyLyricsWeb", group: "plans", unit: "switch", en: "Only Plus: lyrics from web pages", fa: "فقط پلاس: متن آهنگ از صفحه‌های وب", help: "The server fetches the page.", public: true },
  { path: "plans.plusNoAds", group: "plans", unit: "switch", en: "Plus has no ads", fa: "پلاس بدون تبلیغ", public: true },
  { path: "plans.stripe", group: "plans", unit: "switch", en: "Offer Stripe (cards, Apple Pay, Google Pay)", fa: "استرایپ", public: true },
  { path: "plans.paypal", group: "plans", unit: "switch", en: "Offer PayPal", fa: "پی‌پل", public: true },
  { path: "plans.manual", group: "plans", unit: "switch", en: "Offer paying by hand (you confirm it)", fa: "پرداخت دستی (شما تأیید می‌کنید)", help: "Card to card, bank, USDT — for places the gateways don't serve.", public: true },
  { path: "plans.manualHowEn", group: "plans", unit: "text", en: "Paying by hand — how (English)", fa: "پرداخت دستی — روش (انگلیسی)", max: 2_000, public: true },
  { path: "plans.manualHowFa", group: "plans", unit: "text", en: "Paying by hand — how (Persian)", fa: "پرداخت دستی — روش (فارسی)", max: 2_000, public: true },

  { path: "ai.model", group: "ai", unit: "text", en: "Model (OpenRouter id)", fa: "مدل", help: "Any tool-using model on openrouter.ai/models, e.g. anthropic/claude-sonnet-5.5 or openai/gpt-5.", max: 120, public: true },
  { path: "ai.freeTokensPerDay", group: "ai", unit: "count", en: "Tokens a day — Free", fa: "توکن روزانه — رایگان", help: "0 = none on Free.", min: 0, max: 100_000_000, int: true, public: true },
  { path: "ai.plusTokensPerDay", group: "ai", unit: "count", en: "Tokens a day — Plus", fa: "توکن روزانه — پلاس", min: 0, max: 100_000_000, int: true, public: true },
];

// ——— reading and checking ———

/** The value at "a.b.c". */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** A copy of `obj` with "a.b.c" set to `value`. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const o = obj as Record<string, unknown>;
  return { ...o, [head]: rest.length ? setPath(o[head] ?? {}, rest.join("."), value) : value } as T;
}

export const FIELD_BY_PATH = new Map(FIELDS.map((f) => [f.path, f]));

/** One value checked against its field: the cleaned value, or why it can't be. */
export function checkValue(field: Field, value: unknown): { value: unknown } | { error: string } {
  if (field.unit === "switch") return typeof value === "boolean" ? { value } : { error: "Choose on or off" };
  if (field.unit === "text") {
    if (typeof value !== "string") return { error: "Text, please" };
    return value.length > (field.max ?? 2_000) ? { error: `${field.max} characters at most` } : { value };
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return { error: "A number, please" };
  if (field.int && !Number.isInteger(n)) return { error: "A whole number, please" };
  if (field.min !== undefined && n < field.min) return { error: `At least ${show(field, field.min)}` };
  if (field.max !== undefined && n > field.max) return { error: `At most ${show(field, field.max)}` };
  return { value: n };
}

/** A stored value as people read it: 3000 bp → "30%", 500000 micros → "$0.50". */
export function show(field: Field, v: number): string {
  if (field.unit === "percent") return `${v / 100}%`;
  if (field.unit === "usd") return `$${(v / 1_000_000).toFixed(2)}`;
  return v.toLocaleString("en-US");
}

/** The rules between settings: every message, keyed by the path it's about. Empty when all is well. */
export function crossCheck(s: AppSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  const sum = (x: Split) => x.platform + x.artists + x.remixers;
  if (sum(s.shares.remix) !== 10_000) errors["shares.remix.platform"] = `A remix's shares add up to ${sum(s.shares.remix) / 100}% — they must make 100%`;
  if (sum(s.shares.song) !== 10_000) errors["shares.song.platform"] = `A song's shares add up to ${sum(s.shares.song) / 100}% — they must make 100%`;
  if (s.shares.remix.artists <= 0) errors["shares.remix.artists"] = "Artists always get a share of a remix";
  if (s.shares.remix.remixers <= 0) errors["shares.remix.remixers"] = "Remixers always get a share of a remix";
  if (s.shares.song.artists <= 0) errors["shares.song.artists"] = "A song's artist always gets a share";
  const helpers = s.shares.uploader + s.shares.miner;
  if (helpers >= s.shares.remix.platform) errors["shares.uploader"] = "Uploader + miner come out of Remixt's part of a remix, so they must be less than it";
  else if (helpers >= s.shares.song.platform) errors["shares.uploader"] = "Uploader + miner come out of Remixt's part of a song, so they must be less than it";
  if (s.audio.skipAfter > s.audio.maxSeconds) errors["audio.skipAfter"] = "Can't be longer than the ad";
  if (s.audio.paidAfter > s.audio.maxSeconds) errors["audio.paidAfter"] = "Can't be longer than the ad";
  return errors;
}

/**
 * The settings in force: the defaults, with every stored value that's still
 * valid on top (one that isn't — a field's limits changed since — is left
 * out). If the stored values break a rule between settings, that group goes
 * back to its defaults: the site never runs on shares that don't add up.
 */
export function resolveSettings(stored: Record<string, unknown>): AppSettings {
  let s = DEFAULTS;
  for (const [path, value] of Object.entries(stored)) {
    const field = FIELD_BY_PATH.get(path);
    if (!field) continue;
    const checked = checkValue(field, value);
    if ("value" in checked) s = setPath(s, path, checked.value);
  }
  const broken = new Set(Object.keys(crossCheck(s)).map((p) => p.split(".")[0] as keyof AppSettings));
  for (const group of broken) s = { ...s, [group]: DEFAULTS[group] };
  return s;
}

/** A change asked for in Admin: the settings it makes, or what's wrong with it (by path). */
export function applyChange(current: AppSettings, patch: Record<string, unknown>): { settings: AppSettings; changed: string[] } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let next = current;
  const changed: string[] = [];
  for (const [path, value] of Object.entries(patch)) {
    const field = FIELD_BY_PATH.get(path);
    if (!field) {
      errors[path] = "No such setting";
      continue;
    }
    const checked = checkValue(field, value);
    if ("error" in checked) errors[path] = checked.error;
    else if (getPath(current, path) !== checked.value) {
      next = setPath(next, path, checked.value);
      changed.push(path);
    }
  }
  Object.assign(errors, crossCheck(next));
  return Object.keys(errors).length ? { errors } : { settings: next, changed };
}

/** What every browser gets: all but the limits and security. */
export type PublicSettings = Omit<AppSettings, "limits" | "security">;
export function publicSettings(s: AppSettings): PublicSettings {
  const { limits: _limits, security: _security, ...rest } = s;
  void _limits;
  void _security;
  return rest;
}
