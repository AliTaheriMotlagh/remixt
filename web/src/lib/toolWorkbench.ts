// What each tool page's working tool does (components/tools/ToolWorkbench):
// which parts of the split song it gives, which one first, what a download is
// called — so every page does its one job. Pure, shared with the tests.
//
// Every tool splits in the browser that opened it: the song never leaves the
// device (the split is the same one the Upload page uses).

import type { ToolLocale } from "./tools";

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
};

export const WORKBENCH: Record<string, Workbench> = {
  "vocal-remover": { songs: 1, parts: ["beat", "vocals"], playing: ["beat"] },
  "acapella-extractor": { songs: 1, parts: ["vocals", "beat"], playing: ["vocals"] },
  "karaoke-maker": { songs: 1, parts: ["beat", "vocals"], playing: ["beat"] },
  "stem-splitter": { songs: 1, parts: ["vocals", "drums", "bass", "other", "beat"], playing: ["vocals", "drums", "bass", "other"] },
  "drum-extractor": { songs: 1, parts: ["drums", "bass", "other", "vocals"], playing: ["drums"] },
  "bass-extractor": { songs: 1, parts: ["bass", "drums", "other", "vocals"], playing: ["bass"] },
  "mashup-maker": { songs: 2, parts: ["vocals", "beat"], playing: ["vocals", "beat"] },
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
  },
};
