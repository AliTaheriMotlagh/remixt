// What each tool page's working tool does (components/tools/ToolWorkbench):
// which parts of the split song it gives, which one first, what a download is
// called — so every page does its one job. Pure, shared with the tests.
//
// Every tool splits in the browser that opened it: the song never leaves the
// device (the split is the same one the Upload page uses).

import type { ToolLocale } from "./tools";
import { ALL_KEYS, camelotCode, keyFit, keyLabel, bestKeyShift, type MusicalKey } from "./client/musicKey";

export const PARTS = ["vocals", "beat", "drums", "bass", "other"] as const;
export type Part = (typeof PARTS)[number];

/** Each part's name and colour (hex: the waveforms are drawn on a canvas, which can't read CSS variables). */
export const PART_TEXT: Record<Part, { en: string; fa: string; color: string }> = {
  vocals: { en: "Vocals (acapella)", fa: "صدای خواننده (آکاپلا)", color: "#ec4899" },
  beat: { en: "Instrumental", fa: "بی‌کلام", color: "#06b6d4" },
  drums: { en: "Drums", fa: "درامز", color: "#f59e0b" },
  bass: { en: "Bass", fa: "بیس", color: "#84cc16" },
  other: { en: "Melody & the rest", fa: "ملودی و بقیه", color: "#60a5fa" },
};

export type Workbench = {
  /** Two songs (a vocal from one, a beat from the other) or one. */
  songs: 1 | 2;
  /** The parts shown, the first being what the tool is for. */
  parts: Part[];
  /** Parts playing when the result first appears. */
  playing: Part[];
  /** What the mix download is called while exactly `playing` is on ("No drums"); otherwise the parts' names. */
  mixName?: string;
  /** Measures the song instead of splitting it (the BPM and key finder): no splitter, works on phones. */
  analyze?: true;
};

export const WORKBENCH: Record<string, Workbench> = {
  "vocal-remover": { songs: 1, parts: ["beat", "vocals"], playing: ["beat"] },
  "acapella-extractor": { songs: 1, parts: ["vocals", "beat"], playing: ["vocals"] },
  "karaoke-maker": { songs: 1, parts: ["beat", "vocals"], playing: ["beat"] },
  "stem-splitter": { songs: 1, parts: ["vocals", "drums", "bass", "other", "beat"], playing: ["vocals", "drums", "bass", "other"] },
  "drum-extractor": { songs: 1, parts: ["drums", "bass", "other", "vocals"], playing: ["drums"] },
  "bass-extractor": { songs: 1, parts: ["bass", "drums", "other", "vocals"], playing: ["bass"] },
  "mashup-maker": { songs: 2, parts: ["vocals", "beat"], playing: ["vocals", "beat"] },
  "drum-remover": { songs: 1, parts: ["drums", "vocals", "bass", "other"], playing: ["vocals", "bass", "other"], mixName: "No drums" },
  "remix-maker": { songs: 1, parts: ["vocals", "drums", "bass", "other", "beat"], playing: ["vocals", "drums", "bass", "other"] },
  // Its parts are unused (nothing is split); `playing` keeps the shape every workbench has.
  "bpm-key-finder": { songs: 2, parts: ["beat"], playing: ["beat"], analyze: true },
};

export function workbenchFor(slug: string): Workbench {
  return WORKBENCH[slug] ?? WORKBENCH["stem-splitter"];
}

/**
 * The parts to show from what the split gave (an older or lighter split has
 * vocals and beat only): the tool's list, minus what's missing. A tool whose
 * own part is missing falls back to the beat it lives in.
 */
export function shownParts(w: Workbench, got: readonly string[]): Part[] {
  const have = w.parts.filter((p) => got.includes(p));
  return have.length ? have : (["beat", "vocals"] as Part[]).filter((p) => got.includes(p));
}

/** "Blinding Lights (Instrumental).mp3" — the song's name, what it is, safe as a file name. */
export function downloadName(file: string, what: string, ext = "mp3"): string {
  const base = file.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "Song";
  return `${base} (${what.replace(/[\\/:*?"<>|()]+/g, " ").trim()}).${ext}`;
}

/**
 * The mashup's beat speed so it sits under the vocal's tempo: vocal ÷ beat
 * tempo (half/double time when closer), kept within ±20% — further and it's
 * better left as it is.
 */
export function mashupRate(vocalBpm: number | null, beatBpm: number | null): number {
  if (!(vocalBpm && beatBpm && vocalBpm > 0 && beatBpm > 0)) return 1;
  const rate = [1, 2, 0.5].map((m) => (vocalBpm * m) / beatBpm).sort((a, b) => Math.abs(Math.log(a)) - Math.abs(Math.log(b)))[0];
  return rate >= 0.8 && rate <= 1.25 ? Math.round(rate * 1000) / 1000 : 1;
}

/**
 * What a tool page offers first. A phone or tablet (not enough memory to
 * split comfortably) is offered the split queue: a computer helping out
 * splits it and the parts land in the person's library — which needs an
 * account, so someone signed out is asked to sign in first (or still to
 * try it here). Asked to try anyway, or on a computer: split right here.
 */
export type Workflow = "here" | "queue" | "sign-in";
export function workflowFor({ phone, tryHere, signedIn }: { phone: boolean; tryHere: boolean; signedIn: boolean | null }): Workflow {
  if (!phone || tryHere) return "here";
  return signedIn ? "queue" : "sign-in";
}

/** The sign-in and sign-up links that come back to this tool page. */
export function signInLinks(path: string): { login: string; signup: string } {
  const next = encodeURIComponent(path);
  return { login: `/login?next=${next}`, signup: `/signup?next=${next}` };
}

// ——— the BPM and key finder ———

/**
 * How to bring `other`'s tempo to `bpm`: the speed change, allowing for
 * half and double time (a 70 and a 140 BPM song already line up), as a
 * factor and a signed percentage.
 */
export function tempoFit(bpm: number, other: number): { factor: number; percent: number; multiple: 1 | 2 | 0.5 } {
  const options = ([1, 2, 0.5] as const).map((multiple) => ({ multiple, factor: (bpm * multiple) / other }));
  options.sort((a, b) => Math.abs(Math.log(a.factor)) - Math.abs(Math.log(b.factor)));
  const best = options[0];
  return { factor: best.factor, percent: Math.round((best.factor - 1) * 1000) / 10, multiple: best.multiple };
}

/** The keys a song in `key` mixes with (same notes, or a fifth away on the Camelot wheel), itself first. */
export function mixesWith(key: MusicalKey): { label: string; camelot: string; fit: "same" | "relative" | "neighbour" }[] {
  const order = { same: 0, relative: 1, neighbour: 2 } as const;
  return ALL_KEYS.map((k) => ({ k, fit: keyFit(k, key) }))
    .filter((x): x is { k: MusicalKey; fit: "same" | "relative" | "neighbour" } => x.fit === "same" || x.fit === "relative" || x.fit === "neighbour")
    .sort((a, b) => order[a.fit] - order[b.fit] || camelotCode(a.k).localeCompare(camelotCode(b.k), "en", { numeric: true }))
    .map(({ k, fit }) => ({ label: keyLabel(k), camelot: camelotCode(k), fit }));
}

/** The semitones that put the second song's key with the first's (0: already fits), as the Studio would shift it. */
export function keyShift(first: MusicalKey, second: MusicalKey): number {
  return bestKeyShift(second, first).semitones;
}

/** "+2", "−3", "0": a signed number as a person writes it. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/** The workbench's words. */
export const WB_TEXT: Record<ToolLocale, Record<string, string>> = {
  en: {
    drop: "Drop a song here, or tap to choose",
    dropA: "The song with the vocal",
    dropB: "The song with the beat",
    formats: "MP3, M4A, WAV, FLAC or OGG · split on this device, never uploaded",
    model: "Getting the splitter ready (once — then it's on this device)",
    decoding: "Reading the song",
    splitting: "Splitting",
    encoding: "Finishing the files",
    waiting: "Waiting for the other song to finish",
    play: "Play",
    pause: "Pause",
    download: "Download",
    downloadMix: "Download this mix",
    rendering: "Making the file…",
    again: "Another song",
    studio: "Remix it in the Studio",
    keep: "Keep it in your library",
    matchTempo: "Match the beat to the vocal's tempo",
    offset: "Vocal starts",
    phone: "On a phone this can take a few minutes and needs a lot of memory — a computer is quicker.",
    failed: "That song couldn't be split",
    private: "Your song stays on this device.",
    queueTitle: "On a phone, let a computer split it",
    queueBody: "Splitting needs more memory than a phone gives a page and can take many minutes. Send the song to the split queue instead: a computer helping out splits it, and the parts land in your library — only you can see them.",
    queueChoose: "Choose a song to send",
    queueSent: "Sent to the split queue",
    queueFollow: "Follow it on the Upload page",
    queueMashup: "When both are split, open them in the Studio to put the vocal on the beat.",
    queueNeedsAccount: "The queue keeps your song in your own library, so it needs a free account.",
    signUp: "Sign up free",
    logIn: "Log in",
    tryHere: "Try it on this phone anyway",
    findDrop: "Drop a song to find its BPM and key",
    compareDrop: "Add a second song to compare (optional)",
    findFormats: "MP3, M4A, WAV, FLAC or OGG · read on this device, nothing uploaded or kept",
    listening: "Listening",
    tempo: "Tempo",
    key: "Key",
    camelot: "Camelot",
    sure: "sure",
    mixesWith: "Mixes well with",
    toMatch: "To put the second song with the first",
    speedBy: "Change its speed by",
    halfTime: "(at half time)",
    doubleTime: "(at double time)",
    shiftBy: "Shift its pitch by",
    semitones: "semitones",
    alreadyFits: "Already fits",
    noTempo: "No steady beat found",
    openMashup: "Make a mashup of the two",
  },
  fa: {
    drop: "آهنگ را این‌جا رها کن، یا بزن تا انتخاب کنی",
    dropA: "آهنگی که صدایش را می‌خواهی",
    dropB: "آهنگی که بیتش را می‌خواهی",
    formats: "MP3، M4A، WAV، FLAC یا OGG · روی همین دستگاه جدا می‌شود، آپلود نمی‌شود",
    model: "آماده‌کردنِ جداکننده (فقط بار اول — بعد روی دستگاهت می‌ماند)",
    decoding: "خواندن آهنگ",
    splitting: "جدا کردن",
    encoding: "ساختن فایل‌ها",
    waiting: "منتظرِ تمام‌شدنِ آهنگ دیگر",
    play: "پخش",
    pause: "توقف",
    download: "دانلود",
    downloadMix: "دانلودِ همین میکس",
    rendering: "در حال ساخت فایل…",
    again: "آهنگ دیگر",
    studio: "در استودیو ریمیکسش کن",
    keep: "در کتابخانه‌ات نگه‌دار",
    matchTempo: "هم‌سرعت کردنِ بیت با صدا",
    offset: "شروعِ صدا",
    phone: "روی گوشی ممکن است چند دقیقه طول بکشد و حافظهٔ زیادی می‌خواهد — کامپیوتر سریع‌تر است.",
    failed: "این آهنگ جدا نشد",
    private: "آهنگت روی همین دستگاه می‌ماند.",
    queueTitle: "روی گوشی، بگذار یک کامپیوتر جدایش کند",
    queueBody: "جدا کردن بیشتر از حافظه‌ای که گوشی به یک صفحه می‌دهد لازم دارد و ممکن است چند دقیقه طول بکشد. به‌جایش آهنگ را به صفِ جداسازی بفرست: کامپیوتری که کمک می‌کند جدایش می‌کند و بخش‌ها در کتابخانه‌ات می‌نشیند — فقط خودت می‌بینی‌شان.",
    queueChoose: "یک آهنگ برای فرستادن انتخاب کن",
    queueSent: "به صفِ جداسازی فرستاده شد",
    queueFollow: "در صفحهٔ آپلود دنبالش کن",
    queueMashup: "وقتی هر دو جدا شدند، در استودیو بازشان کن تا صدا را روی بیت بگذاری.",
    queueNeedsAccount: "صف، آهنگت را در کتابخانهٔ خودت نگه می‌دارد، پس یک حساب رایگان لازم است.",
    signUp: "ثبت‌نام رایگان",
    logIn: "ورود",
    tryHere: "با همین گوشی امتحان کن",
    findDrop: "آهنگ را رها کن تا تمپو و گامش را پیدا کنیم",
    compareDrop: "آهنگ دوم برای مقایسه (اختیاری)",
    findFormats: "MP3، M4A، WAV، FLAC یا OGG · روی همین دستگاه خوانده می‌شود، چیزی آپلود یا نگه داشته نمی‌شود",
    listening: "در حال گوش دادن",
    tempo: "تمپو",
    key: "گام",
    camelot: "کملوت",
    sure: "اطمینان",
    mixesWith: "با این گام‌ها جور است",
    toMatch: "برای جور کردن آهنگ دوم با اولی",
    speedBy: "سرعتش را عوض کن به اندازه‌ی",
    halfTime: "(در نصفِ تمپو)",
    doubleTime: "(در دو برابرِ تمپو)",
    shiftBy: "گامش را جابه‌جا کن به اندازه‌ی",
    semitones: "نیم‌پرده",
    alreadyFits: "همین حالا جور است",
    noTempo: "ضرب ثابتی پیدا نشد",
    openMashup: "از این دو ماشاپ بساز",
  },
};
