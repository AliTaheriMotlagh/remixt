"use client";

import { availableFixes, ideaFits, type FixId, type Idea } from "./aiIdeas";
import { diffMix } from "./aiExplain";
import { addFix, useAiTrial } from "./aiTrial";
import { runCoproducerTool, type CoproducerContext } from "./coproducerTools";
import { audioEngine } from "./audioEngine";
import { useStudioStore } from "./studioStore";

// Quick help: the AI co-producer's "Ask" box without an AI model behind
// it — so anyone can use it, with no key and nothing sent anywhere. It
// understands the common requests (in English and Persian): make it sound
// good, why it sounds off, the chorus on the drop, a style, a harmony, the
// vocal louder, faster or slower… and carries them out with the very same
// tools the co-producer uses — every change tried with its own switch, to
// compare, keep or undo. Anything it doesn't understand, it says so and
// offers what it can do.

export type QuickReply = { text: string; did: string[] };

type Lang = "en" | "fa";

/** One thing it understands: the words that point to it, and what it does. */
type Intent = {
  id: string;
  /** Only one of a group runs (one style, one level change…). */
  group: string;
  match: RegExp;
  run: (help: Helper) => Promise<string | null>;
};

/** Lower case, Arabic letter forms as Persian ones, no zero-width joiners — so the words match however they were typed. */
function normalise(text: string) {
  return text.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌‍]/g, "").replace(/\s+/g, " ");
}

const persian = (text: string) => /[؀-ۿ]/.test(text);

/** What a reply says, in the language asked in. */
const SAY = {
  noMix: {
    en: "First add a vocal and a beat (or every line of a song) from the library — then I can listen and help.",
    fa: "اول یک وکال و یک بیت (یا همه‌ی خط‌های یک آهنگ) از کتابخانه اضافه کن تا بتونم گوش بدم و کمک کنم.",
  },
  trying: { en: "Trying", fa: "امتحانش می‌کنم:" },
  couldNot: { en: "Couldn't fit", fa: "جا نشد:" },
  score: { en: (a: number, b: number) => `Mix score ${a} → ${b}.`, fa: (a: number, b: number) => `امتیاز میکس از ${a} به ${b} رسید.` },
  playing: {
    en: "It's playing now. Switch any change off on its tab, flip Before/After, or press Keep it.",
    fa: "الان داره پخش می‌شه. هر تغییری رو می‌تونی از تب خودش خاموش کنی، قبل و بعد رو مقایسه کنی، یا «Keep it» رو بزنی.",
  },
  heard: { en: "Here's what I hear:", fa: "این‌ها رو شنیدم:" },
  allGood: { en: (s: number) => `Everything sounds right — the mix scores ${s} out of 100.`, fa: (s: number) => `همه‌چیز درست به نظر می‌رسه — امتیاز میکس ${s} از 100.` },
  fixTip: {
    en: "Say “make it sound good” and I'll fix all of it at once.",
    fa: "بگو «بهترش کن» تا همه‌ش رو یکجا درست کنم.",
  },
  kept: { en: "Kept — ⌘Z (undo) takes it back.", fa: "نگه داشته شد — با ⌘Z (undo) برمی‌گرده." },
  nothingToKeep: { en: "Nothing is being tried right now.", fa: "الان چیزی در حال امتحان نیست." },
  undone: { en: "Took everything off — the mix is back as it was.", fa: "همه‌ی تغییرها برداشته شد — میکس مثل قبل شد." },
  playingFrom: { en: "Playing.", fa: "پخش شد." },
  noDrop: { en: "This beat has no clear drop — I'll build up to the vocal instead.", fa: "این بیت دراپ مشخصی نداره — به جاش یک بیلدآپ تا ورود وکال می‌سازم." },
  noChange: { en: "That's already how it is.", fa: "همین الان هم همین‌طوره." },
  changed: { en: "What changed:", fa: "چی تغییر کرد:" },
  nothingChanged: { en: "Nothing is being tried — the mix is as you left it.", fa: "الان تغییری در حال امتحان نیست — میکس همون‌طوریه که گذاشتی." },
  unknown: {
    en: "I didn't catch that. I can: make it sound good · say why it sounds off · put the chorus on the drop · add a build-up · try a style (club, lo-fi, radio, chill, hard, slowed, sped up) · add a harmony · make the vocal or beat louder or quieter · make it faster or slower · add space · keep or undo. For a real conversation, connect Claude below.",
    fa: "متوجه نشدم. این کارها رو بلدم: بهترش کنم · بگم چرا بد به نظر می‌رسه · کورس رو روی دراپ بذارم · بیلدآپ اضافه کنم · یک استایل (کلاب، لوفای، رادیو، چیل، هارد، اسلو، تند) · هارمونی اضافه کنم · صدای خواننده یا بیت رو بلندتر یا آروم‌تر کنم · تندتر یا کندتر کنم · فضا (ریورب) اضافه کنم · نگه دارم یا برگردونم. برای گفتگوی واقعی، پایین Claude رو وصل کن.",
  },
} as const;

/** What an intent works with: the session, ideas, and how to try things — and what it did, for the reply. */
class Helper {
  did: string[] = [];
  scoreBefore: number | null = null;
  scoreAfter: number | null = null;
  played = false;

  readonly ctx: CoproducerContext;
  readonly lang: Lang;
  /** The words it was asked with. */
  readonly text: string;

  constructor(ctx: CoproducerContext, lang: Lang, text: string) {
    this.ctx = ctx;
    this.lang = lang;
    this.text = text;
  }

  get session() {
    return this.ctx.session();
  }

  idea(id: string): Idea | undefined {
    const lanes = useAiTrial.getState().trial?.baseline.lanes ?? useStudioStore.getState().lanes;
    return this.ctx.ideas().find((i) => i.id === id && ideaFits(i, lanes));
  }

  /** The first of `ids` there is (and fits). */
  first(...ids: string[]) {
    for (const id of ids) {
      const found = this.idea(id);
      if (found) return found;
    }
    return undefined;
  }

  private noteScore(result: string) {
    try {
      const parsed = JSON.parse(result) as { score?: number };
      if (typeof parsed.score === "number") this.scoreAfter = parsed.score;
    } catch {}
  }

  /** Tries ideas the way the co-producer does — each with its own switch in the panel. */
  async tryIdeas(ideas: Idea[]) {
    if (!ideas.length) return null;
    const result = await runCoproducerTool("try_ideas", { ids: ideas.map((i) => i.id) }, this.ctx);
    if (result.isError) return null;
    this.noteScore(result.content);
    const parsed = JSON.parse(result.content) as { tried?: string[]; could_not_apply?: string[] };
    const tried = ideas.filter((i) => parsed.tried?.includes(i.title));
    for (const i of tried) this.did.push(`${SAY.trying[this.lang]} “${i.title}” — ${i.short}`);
    for (const t of parsed.could_not_apply ?? []) this.did.push(`${SAY.couldNot[this.lang]} “${t}”`);
    return tried.length ? tried : null;
  }

  /** One of the Mix check's fixes, on top of the fixes already on. */
  fix(fix: FixId) {
    const session = this.session;
    if (!session) return false;
    return !!addFix(session, fix, availableFixes(session));
  }

  async tool(name: string, input: Record<string, unknown> = {}) {
    const result = await runCoproducerTool(name, input, this.ctx);
    if (!result.isError) this.noteScore(result.content);
    return result;
  }

  vocalId() {
    return this.session?.vocal?.laneId ?? null;
  }

  beatId() {
    return this.session?.beat?.laneId ?? null;
  }
}

const levelOf = (laneId: string | null) => useStudioStore.getState().lanes.find((l) => l.laneId === laneId)?.volume ?? 1;

/** A style, by name. */
function style(id: string, words: RegExp): Intent {
  return { id: `style-${id}`, group: "style", match: words, run: async (h) => ((await h.tryIdeas([h.idea(`full-${id}`)].filter((i): i is Idea => !!i))) ? "" : null) };
}

const VOCAL = /vocal|voice|singer|singing|\brap|خواننده|وکال|آواز/;
const BEAT = /\bbeat\b|music|instrumental|drums?|بیت|موزیک|موسیقی|درام/;
const LOUDER = /louder|more volume|volume up|turn (it )?up|بلندتر|بلند کن|صداش رو زیاد|زیادتر/;
const QUIETER = /quieter|softer|less loud|volume down|turn (it )?down|آرومتر|آروم‌تر|کمترش|کم کن|یواشتر/;

const INTENTS: Intent[] = [
  // --- Control -------------------------------------------------------------------------------
  {
    id: "keep",
    group: "control",
    match: /\bkeep\b|i like it|save (it|this)|نگه ?دار|نگهش|قبوله|خوبه همین|ذخیره/,
    run: async (h) => {
      const kept = await h.tool("keep_changes");
      const parsed = JSON.parse(kept.content) as { kept?: string[] };
      return parsed.kept?.length ? SAY.kept[h.lang] : SAY.nothingToKeep[h.lang];
    },
  },
  {
    id: "undo",
    group: "control",
    match: /\bundo\b|take (it|everything) off|go back|remove (it|that|all)|reset|برگرد|برگردون|لغو کن|پاک کن|حذف کن/,
    run: async (h) => {
      await h.tool("undo_try");
      return SAY.undone[h.lang];
    },
  },
  // --- What's going on ------------------------------------------------------------------------
  {
    id: "changed",
    group: "info",
    match: /what (changed|happened|did you)|explain|چی تغییر|چیکار کردی|چه تغییری|توضیح/,
    run: async (h) => {
      const trial = useAiTrial.getState().trial;
      if (!trial?.ideas.length) return SAY.nothingChanged[h.lang];
      const diff = diffMix(trial.baseline, trial.result);
      return [SAY.changed[h.lang], ...diff.summary.slice(0, 6).map((s) => `• ${s}`)].join("\n");
    },
  },
  {
    id: "why",
    group: "info",
    match: /why|what'?s wrong|sounds? (off|bad|weird|wrong)|problem|check|چرا|مشکل|ایراد|خراب|بد شده|بد صدا|چک کن|بررسی/,
    run: async (h) => {
      const result = await h.tool("get_mix");
      const parsed = JSON.parse(result.content) as { score?: number; mix_check?: { check: string; status: string; text: string }[] };
      const wrong = (parsed.mix_check ?? []).filter((c) => c.status !== "good");
      if (!wrong.length) return SAY.allGood[h.lang](parsed.score ?? 100);
      return [SAY.heard[h.lang], ...wrong.map((c) => `• ${c.check}: ${c.text}`), SAY.fixTip[h.lang]].join("\n");
    },
  },
  // --- Fix it -----------------------------------------------------------------------------------
  {
    id: "good",
    group: "fix",
    match: /sound good|sound better|make it better|\bfix\b|improve|clean (it )?up|match (them|it|everything)|in sync|sync|on the beat|بهتر|درست کن|درستش|خوبش کن|قشنگ|حرفه‌?ای|سینک|هماهنگ|روی بیت|میکس کن/,
    run: async (h) => ((await h.tryIdeas([h.idea("auto-good")].filter((i): i is Idea => !!i))) ? "" : null),
  },
  {
    id: "key",
    group: "key",
    match: /\bkey\b|in tune|out of tune|off key|pitch match|harmonic|کلید|گام|کوک|فالش|خارج می‌?خونه/,
    run: async (h) => {
      if (!h.fix("key")) return SAY.noChange[h.lang];
      h.did.push(`${SAY.trying[h.lang]} “Key match” — ${h.lang === "fa" ? "وکال به گام بیت می‌ره" : "the vocal moved into the beat's key"}`);
      return "";
    },
  },
  // --- The drop ---------------------------------------------------------------------------------
  {
    id: "drop",
    group: "drop",
    match: /drop|chorus on|hook (on|lands)|big moment|climax|دراپ|اوج/,
    run: async (h) => {
      const big = /big|bigger|hard|slam|stronger|قوی|بزرگ|محکم/.test(normalise(h.text));
      const idea = big ? h.first("moment-big-drop", "moment-chorus-drop", "moment-build") : h.first("moment-chorus-drop", "moment-big-drop", "moment-build");
      if (!idea) return null;
      if (idea.id === "moment-build" && !h.session?.drop) h.did.push(SAY.noDrop[h.lang]);
      return (await h.tryIdeas([idea])) ? "" : null;
    },
  },
  {
    id: "build",
    group: "build",
    match: /build ?up|build-up|tension|riser|بیلد|اوج گرفتن|هیجان/,
    run: async (h) => ((await h.tryIdeas([h.first("moment-build", "moment-gate")].filter((i): i is Idea => !!i))) ? "" : null),
  },
  {
    id: "breakdown",
    group: "energy",
    match: /breakdown|break down|drums? (out|drop)|strip|بریک|بدون درام/,
    run: async (h) => ((await h.tryIdeas([h.first("parts-breakdown", "parts-drop", "moment-acapella")].filter((i): i is Idea => !!i))) ? "" : null),
  },
  // --- Styles ----------------------------------------------------------------------------------
  style("slowed", /slowed|slow ?\+ ?reverb|slow reverb|اسلو|اسلوِد/),
  style("sped-up", /sped ?up|nightcore|speed ?up version|اسپید آپ|نایت‌?کور/),
  style("club", /club|dance|party|house|edm|کلاب|رقص|پارتی|دنس/),
  style("festival", /festival|stadium|فستیوال/),
  style("lofi", /lo-?fi|لوفای|لو‌?فای/),
  style("chill", /chill|relax|calm|چیل|ملایم|ریلکس/),
  style("hard", /\bhard\b|trap|bootleg|aggressive|هارد|ترپ|سنگین|خشن/),
  style("short", /tiktok|reels?|shorts?|short version|تیک ?تاک|ریلز|کوتاه/),
  style("radio", /radio|pop|mainstream|رادیو|پاپ/),
  {
    id: "surprise",
    group: "style",
    match: /surprise|random|anything|سورپرایز|تصادفی|هرچی/,
    run: async (h) => {
      const styles = h.ctx.ideas().filter((i) => i.kind === "full" && h.idea(i.id));
      if (!styles.length) return null;
      return (await h.tryIdeas([styles[Math.floor(Math.random() * styles.length)]])) ? "" : null;
    },
  },
  // --- Harmonies -------------------------------------------------------------------------------
  {
    id: "harmony",
    group: "harmony",
    match: /harmon|double|choir|octave|backing vocal|stack|هارمونی|دابل|گروه کر|اکتاو|صدای دوم|بک ?وکال/,
    run: async (h) => {
      const t = normalise(h.text);
      const idea = /choir|گروه کر/.test(t)
        ? h.first("layer-choir", "layer-fifth")
        : /double|دابل|stack/.test(t)
          ? h.first("layer-double")
          : /octave|اکتاو/.test(t)
            ? h.first(/up|high|بالا/.test(t) ? "layer-octave-up" : "layer-octave-down", "layer-octave-up")
            : h.first("layer-fifth", "layer-double");
      return idea && (await h.tryIdeas([idea])) ? "" : null;
    },
  },
  // --- Levels, speed, space ---------------------------------------------------------------------
  {
    id: "level",
    group: "level",
    match: new RegExp(`(${LOUDER.source}|${QUIETER.source})`),
    run: async (h) => {
      const t = normalise(h.text);
      const louder = LOUDER.test(t) && !QUIETER.test(t);
      const beat = BEAT.test(t) && !VOCAL.test(t);
      const laneId = beat ? h.beatId() : h.vocalId();
      if (!laneId) return null;
      const volume = Math.round(Math.min(1.5, Math.max(0.05, levelOf(laneId) * (louder ? 1.19 : 0.84))) * 100) / 100;
      const result = await h.tool("adjust_lane", { lane_id: laneId, volume });
      if (result.isError) return null;
      h.did.push(`${SAY.trying[h.lang]} “${beat ? "Beat" : "Vocal"} ${louder ? "louder" : "quieter"}” — ${Math.round(volume * 100)}%`);
      return "";
    },
  },
  {
    id: "speed",
    group: "speed",
    match: /faster|slower|speed (it )?up|slow (it )?down|tempo|تندتر|سریع‌?تر|کندتر|آهسته‌?تر|سرعت/,
    run: async (h) => {
      const t = normalise(h.text);
      const faster = /faster|speed (it )?up|تندتر|سریع/.test(t);
      const slower = /slower|slow (it )?down|کندتر|آهسته/.test(t);
      if (faster === slower) return null;
      const result = await h.tool("change_speed", { factor: faster ? 1.05 : 0.95 });
      if (result.isError) return null;
      h.did.push(`${SAY.trying[h.lang]} “${faster ? "5% faster" : "5% slower"}” — ${h.lang === "fa" ? "همه‌ی خط‌ها با هم، بدون تغییر کوک" : "every line together, pitch unchanged"}`);
      return "";
    },
  },
  {
    id: "space",
    group: "space",
    match: /reverb|echo|space|room|wet|dry|ریورب|اکو|فضا|پژواک/,
    run: async (h) => {
      const t = normalise(h.text);
      const dry = /dry|less|no reverb|بدون|کمتر|خشک/.test(t);
      const laneId = h.vocalId();
      if (!laneId) return null;
      const effects = dry ? { reverb: 0, delay: 0 } : /echo|اکو|delay/.test(t) ? { delay: 0.25, reverb: 0.15 } : { reverb: 0.28 };
      const result = await h.tool("adjust_lane", { lane_id: laneId, effects });
      if (result.isError) return null;
      h.did.push(`${SAY.trying[h.lang]} “${dry ? "Dry vocal" : "More space on the vocal"}”`);
      return "";
    },
  },
  {
    id: "play",
    group: "control",
    match: /\bplay\b|listen|hear it|پخش|گوش/,
    run: async (h) => {
      await h.tool("play");
      h.played = true;
      return SAY.playingFrom[h.lang];
    },
  },
];

/** What the request asks for: the intents it names, one per group, in the order of the list above. */
export function intentsOf(text: string): string[] {
  const t = normalise(text);
  const groups = new Set<string>();
  const found: string[] = [];
  for (const intent of INTENTS) {
    if (!intent.match.test(t) || groups.has(intent.group)) continue;
    // Asking why, or what changed, is a question: nothing else is done with it.
    groups.add(intent.group);
    found.push(intent.id);
  }
  if (found.includes("why") || found.includes("changed")) return found.filter((id) => id === "why" || id === "changed");
  // A style brings its own sound ("slowed + reverb" is one thing, not a style and then more reverb).
  if (found.some((id) => id.startsWith("style-") || id === "surprise")) return found.filter((id) => id !== "space").slice(0, 4);
  // Keeping or undoing is the whole request.
  if (found.includes("keep")) return ["keep"];
  if (found.includes("undo")) return ["undo"];
  return found.slice(0, 4);
}

/** Answers a request: does what it asks with the Studio's own tools, and says what it did. */
export async function quickHelp(text: string, ctx: CoproducerContext): Promise<QuickReply> {
  const lang: Lang = persian(text) ? "fa" : "en";
  const ids = intentsOf(text);
  if (!ids.length) return { text: SAY.unknown[lang], did: [] };
  const session = await ctx.listen();
  if (!session) return { text: SAY.noMix[lang], did: [] };
  const helper = new Helper(ctx, lang, text);
  const before = await runCoproducerTool("get_mix", {}, ctx);
  try {
    const parsed = JSON.parse(before.content) as { score?: number };
    if (typeof parsed.score === "number") helper.scoreBefore = parsed.score;
  } catch {}
  const said: string[] = [];
  let acted = false;
  for (const id of ids) {
    const intent = INTENTS.find((i) => i.id === id)!;
    const reply = await intent.run(helper).catch(() => null);
    if (reply === null) continue;
    acted = true;
    if (reply) said.push(reply);
  }
  if (!acted) return { text: SAY.unknown[lang], did: [] };
  const changedSomething = helper.did.some((d) => d.startsWith(SAY.trying[lang]));
  if (changedSomething && !helper.played && !useStudioStore.getState().isPlaying) void audioEngine.play({ join: true }).catch(() => {});
  const lines = [
    ...helper.did,
    ...said,
    ...(changedSomething && helper.scoreBefore !== null && helper.scoreAfter !== null && helper.scoreAfter !== helper.scoreBefore ? [SAY.score[lang](helper.scoreBefore, helper.scoreAfter)] : []),
    ...(changedSomething ? [SAY.playing[lang]] : []),
  ];
  return { text: lines.join("\n"), did: helper.did };
}
