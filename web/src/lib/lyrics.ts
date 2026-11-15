// Lyrics for singing over the Studio mix: a sheet is plain text, one lyric
// line per line, where a line may start with a time stamp in the LRC way
// ("[01:23.45] words"). Timed lines follow the playhead; untimed ones are
// shown in order. Everything here is pure (no DOM, no store), so the server
// routes, the Studio and the tests share it.

/** A song found in the lyrics library (see api/lyrics/search). */
export type LyricsResult = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number | null;
  instrumental: boolean;
  plain: string | null;
  /** LRC, when every line has its time. */
  synced: string | null;
};

/** A song's lyrics page elsewhere (Genius), to import the words from. */
export type LyricsPage = {
  title: string;
  artist: string;
  url: string;
  image: string | null;
  source: "genius";
};

export type LyricLine = {
  /** Where on the timeline the line is sung, in seconds; null when it isn't timed yet. */
  time: number | null;
  text: string;
};

/**
 * The song's name — and the artist, when the title names one — from a
 * track title, for looking its lyrics up. Titles come from file names and
 * video titles, so they carry noise the lyrics library doesn't know:
 * "(Official Video)", "[HD]", "feat. …", ".mp3", a download site's name
 * and bitrate ("Music-Fa.com", "320"), and often the artist in front
 * ("Artist - Song"). The artist only ever comes from the title itself,
 * never from whoever uploaded it.
 */
export function splitSongTitle(trackTitle: string): { song: string; artist: string } {
  let title = trackTitle
    .replace(/\.(mp3|wav|m4a|aac|flac|ogg|opus|webm|mp4)$/i, "")
    .replace(/_/g, " ")
    // Bracketed extras: (Official Video), [Lyrics], {HD}, (feat. X), (320).
    .replace(/\s*[[({][^\])}]*[\])}]/g, " ")
    // Download sites and channels: www.site.com, Site.ir, @channel.
    .replace(/(^|\s)(www\.)?[\w-]+\.(com|ir|net|org|io|co|me)(?=\s|$)/gi, " ")
    .replace(/(^|\s)@[\w.]+/g, " ")
    // A bitrate left at the end: "Song 320", "Song 128kbps".
    .replace(/\s+(64|96|128|192|256|320)\s?(kbps|k)?$/i, "")
    // Persian download-page words: "آهنگ", "دانلود", "جدید".
    .replace(/(^|\s)(دانلود|آهنگ|جدید|با متن|موزیک)(?=\s|$)/g, " ")
    // Featured artists left outside brackets.
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  // A trailing " - Official Video" / " - Remastered 2011" / " - Live" goes.
  title = title.replace(/\s+[-–—|]\s+(official|lyrics?|audio|video|visuali[sz]er|remaster(ed)?|hd|hq|4k|live|radio edit|explicit|clean)\b.*$/i, "");
  // "Artist - Song": the song is the last part, the artist the first.
  const parts = title.split(/\s+[-–—|]\s+/).map((p) => p.trim()).filter(Boolean);
  let artist = "";
  if (parts.length > 1) {
    title = parts[parts.length - 1];
    artist = parts[0];
  }
  // Quotes around the name, as video titles do: Artist "Song".
  const quoted = title.match(/^(.*?)["“”«»]([^"“”«»]{2,})["“”«»]/);
  if (quoted) {
    title = quoted[2];
    if (!artist && quoted[1].trim()) artist = quoted[1].trim();
  }
  const unquote = (s: string) => s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return { song: unquote(title), artist: unquote(artist) };
}

/** Just the song's name from a track title (see splitSongTitle). */
export function songNameOf(trackTitle: string): string {
  return splitSongTitle(trackTitle).song;
}

const STAMP = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/;
const TAG = /^\[([a-z#]+):(.*)\]\s*$/i;
/** LRC's own header tags. Anything else in brackets — "[Chorus: Someone]" — is a section of the song. */
const LRC_TAGS = new Set(["ar", "ti", "al", "au", "by", "offset", "length", "re", "ve", "tool", "la", "lang", "id", "lr", "kana", "#"]);
/** Enhanced LRC's word-by-word times ("<00:12.34>word"): the words stay, the times go. */
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>\s?/g;
const SECTION = /^\s*\[[^\]\n]{1,80}\]\s*$/;

/**
 * A section heading rather than words to sing — "[Chorus]", "[Verse 2:
 * Artist]", "[Intro]" — as lyrics sites and writers mark a song's parts.
 */
export function isSection(text: string) {
  return SECTION.test(text) && !STAMP.test(text.trim());
}

/** The heading's name without its brackets: "Chorus: Artist". */
export function sectionName(text: string) {
  return text.trim().replace(/^\[|\]$/g, "").trim();
}

/** A line with words to sing: not a blank break, not a section heading. */
export function isSung(line: LyricLine) {
  return !!line.text && !isSection(line.text);
}

/** The section heading line `index` falls under, if the sheet has headings. */
export function sectionAt(lines: LyricLine[], index: number): string | null {
  for (let i = Math.min(index, lines.length - 1); i >= 0; i--) if (lines[i].text && isSection(lines[i].text)) return sectionName(lines[i].text);
  return null;
}

function stampSeconds(minutes: string, seconds: string) {
  return Number(minutes) * 60 + Number(seconds.replace(":", "."));
}

/** Reads a sheet: LRC (one or more stamps a line, metadata tags, an [offset:]) or plain text. */
export function parseLyrics(source: string): LyricLine[] {
  // Subtitles (SRT, WebVTT) are timed lyrics too: read as LRC.
  if (looksLikeSubtitles(source)) source = subtitlesToLrc(source);
  const out: LyricLine[] = [];
  // LRC's [offset:+n] is in ms; positive shows the words earlier.
  let offset = 0;
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    let rest = raw.replace(WORD_STAMP, "").trim();
    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = STAMP.exec(rest))) {
      times.push(stampSeconds(match[1], match[2]));
      rest = rest.slice(match[0].length);
    }
    if (times.length === 0) {
      const tag = TAG.exec(rest);
      // [ar:Artist], [ti:Title], [length:…] and the like: not words to sing.
      if (tag && LRC_TAGS.has(tag[1].toLowerCase())) {
        if (tag[1].toLowerCase() === "offset" && Number.isFinite(Number(tag[2]))) offset = Number(tag[2]) / 1000;
        continue;
      }
      out.push({ time: null, text: rest });
      continue;
    }
    for (const time of times) out.push({ time, text: rest.trim() });
  }
  // A line used more than once (a chorus stamped twice) has to be put in time order.
  const timed = out.filter((l) => l.time !== null);
  if (timed.length > 0 && timed.length === out.filter((l) => l.text || l.time !== null).length) {
    out.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  }
  // Blank lines at either end are noise.
  while (out.length && !out[0].text && out[0].time === null) out.shift();
  while (out.length && !out[out.length - 1].text && out[out.length - 1].time === null) out.pop();
  return offset ? out.map((l) => (l.time === null ? l : { ...l, time: Math.max(0, round(l.time - offset)) })) : out;
}

function round(seconds: number) {
  return Math.round(seconds * 1000) / 1000;
}

/** "[01:23.45]" for 83.45 s. */
export function formatStamp(seconds: number) {
  const centis = Math.round(Math.max(0, seconds) * 100);
  const m = Math.floor(centis / 6000);
  const s = Math.floor((centis % 6000) / 100);
  const c = centis % 100;
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}]`;
}

/** "1:23" for 83.45 s, for showing a line's time. */
export function formatClock(seconds: number) {
  const whole = Math.floor(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Back to text: timed lines get their stamp, the rest stay as they are. */
export function serializeLyrics(lines: LyricLine[]): string {
  return lines.map((l) => (l.time === null ? l.text : `${formatStamp(l.time)}${l.text}`)).join("\n");
}

export function isSynced(lines: LyricLine[]) {
  return lines.some((l) => l.time !== null);
}

/** The words with no times, e.g. to hand to the AI. */
export function plainText(lines: LyricLine[]) {
  return lines.map((l) => l.text).join("\n");
}

/** The line being sung at `seconds`: the last timed line at or before it, or -1 before the first. */
export function lineAt(lines: LyricLine[], seconds: number): number {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i].time;
    if (time === null) continue;
    // A little early: the line shows just before it's due, so it can be read in time.
    if (time <= seconds + 0.15) found = i;
    else break;
  }
  return found;
}

/** Every timed line moved by `delta` seconds (none before the start). */
export function shiftLines(lines: LyricLine[], delta: number): LyricLine[] {
  return lines.map((l) => (l.time === null ? l : { ...l, time: Math.max(0, round(l.time + delta)) }));
}

/**
 * Lyrics timed to a recording, put where that recording plays in the mix:
 * a lane starting at `offset` seconds, sped up by `tempo` (1 = as recorded).
 */
export function placeOnLane(lines: LyricLine[], offset: number, tempo = 1): LyricLine[] {
  const speed = tempo > 0 ? tempo : 1;
  return lines.map((l) => (l.time === null ? l : { ...l, time: round(Math.max(0, offset + l.time / speed)) }));
}

/** The whole sheet moved so its first timed line starts at `seconds`. */
export function startAt(lines: LyricLine[], seconds: number): LyricLine[] {
  const first = lines.find((l) => l.time !== null)?.time;
  return first === undefined || first === null ? lines : shiftLines(lines, seconds - first);
}

export function beatSeconds(bpm: number) {
  return 60 / (bpm > 0 ? bpm : 120);
}

/** Each timed line onto the nearest beat (`beats` = 1) or bar (`beats` = 4) of the project grid. */
export function snapLines(lines: LyricLine[], bpm: number, beats = 1): LyricLine[] {
  const grid = beatSeconds(bpm) * Math.max(0.25, beats);
  return lines.map((l) => (l.time === null ? l : { ...l, time: round(Math.max(0, Math.round(l.time / grid) * grid)) }));
}

/**
 * Lays the lines out on the beat: the first sung line on bar `startBar`
 * (counted from 1), each next one `barsPerLine` bars on. A blank line (a
 * break between verses) keeps a bar's rest when `restAtBreaks` is set.
 */
export function spreadOverBars(
  lines: LyricLine[],
  bpm: number,
  { startBar = 1, barsPerLine = 1, beatsPerBar = 4, restAtBreaks = true }: { startBar?: number; barsPerLine?: number; beatsPerBar?: number; restAtBreaks?: boolean } = {}
): LyricLine[] {
  const bar = beatSeconds(bpm) * beatsPerBar;
  let at = Math.max(0, startBar - 1) * bar;
  let started = false;
  // A break is a blank line, or a section heading straight after words: one bar's rest either way.
  let rested = true;
  return lines.map((l) => {
    if (!isSung(l)) {
      if (started && restAtBreaks && !rested) at += bar;
      rested = true;
      return { ...l, time: null };
    }
    started = true;
    rested = false;
    const line = { ...l, time: round(at) };
    at += bar * Math.max(0.25, barsPerLine);
    return line;
  });
}

/** Times taken off every line. */
export function clearTimes(lines: LyricLine[]): LyricLine[] {
  return lines.map((l) => ({ ...l, time: null }));
}

/** The bar (from 1) that `seconds` falls in. */
export function barAt(seconds: number, bpm: number, beatsPerBar = 4) {
  return Math.floor(Math.max(0, seconds) / (beatSeconds(bpm) * beatsPerBar) + 1e-6) + 1;
}

const LATIN_VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœ]+/gi;

/**
 * Roughly how many syllables a line has — near enough to tell whether it
 * fits the room the beat gives it. English-like words by their vowel
 * groups (a silent final e left out); Persian, Arabic and other scripts
 * that don't write every vowel, by their letters.
 */
export function countSyllables(text: string): number {
  let total = 0;
  for (const word of text.toLowerCase().split(/[\s\-–—/]+/)) {
    const latin = word.replace(/[^a-zà-ÿœ']/g, "");
    if (latin) {
      let n = (latin.match(LATIN_VOWELS) ?? []).length;
      if (n > 1 && /[^aeiouy]e$/.test(latin) && !/[^aeiouy]le$/.test(latin)) n--;
      if (n > 1 && /[^aeiouy]es$|[^aeiouy]ed$/.test(latin) && !/(t|d)ed$|(s|z|x|ch|sh)es$/.test(latin)) n--;
      total += Math.max(1, n);
      continue;
    }
    const letters = (word.match(/\p{L}/gu) ?? []).length;
    if (!letters) continue;
    // Abjads (Persian, Arabic, Hebrew) leave short vowels out: about a syllable per two letters.
    if (/[֐-ࣿיִ-ﻼ]/.test(word)) total += Math.max(1, Math.round(letters / 2));
    // Syllabic and logographic scripts: a character is about a syllable.
    else if (/[぀-ヿ一-鿿가-힯]/.test(word)) total += letters;
    else total += Math.max(1, Math.round(letters / 3));
  }
  return total;
}

export type SingStyle = "rap" | "sing";

/** Syllables a second that sit comfortably: rap packs them, singing holds notes. */
const COMFORT: Record<SingStyle, { low: number; high: number }> = {
  rap: { low: 2, high: 7.5 },
  sing: { low: 0.8, high: 4.5 },
};

/** How many syllables to aim for in a line `barsPerLine` bars long. */
export function syllableTarget(bpm: number, style: SingStyle, barsPerLine = 1, beatsPerBar = 4) {
  const seconds = beatSeconds(bpm) * beatsPerBar * barsPerLine;
  const { low, high } = COMFORT[style];
  return Math.max(2, Math.round(seconds * (low + high) * 0.5));
}

export type LineFit = {
  syllables: number;
  /** Time until the next timed line (or the end of the song), when the line is timed. */
  seconds: number | null;
  beats: number | null;
  verdict: "tight" | "ok" | "roomy" | null;
};

/** Whether line `index` fits the room it has before the next one. */
export function fitOf(lines: LyricLine[], index: number, bpm: number, style: SingStyle = "rap", end?: number): LineFit {
  const line = lines[index];
  if (!isSung(line)) return { syllables: 0, seconds: null, beats: null, verdict: null };
  const syllables = countSyllables(line.text);
  if (line.time === null) return { syllables, seconds: null, beats: null, verdict: null };
  let next: number | null = null;
  for (let i = index + 1; i < lines.length; i++) {
    const time = lines[i].time;
    if (time !== null && time > line.time) {
      next = time;
      break;
    }
  }
  if (next === null && end !== undefined && end > line.time) next = Math.min(end, line.time + beatSeconds(bpm) * 8);
  if (next === null) return { syllables, seconds: null, beats: null, verdict: null };
  const seconds = next - line.time;
  const rate = syllables / seconds;
  const { low, high } = COMFORT[style];
  return {
    syllables,
    seconds: round(seconds),
    beats: Math.round((seconds / beatSeconds(bpm)) * 10) / 10,
    verdict: rate > high ? "tight" : rate < low ? "roomy" : "ok",
  };
}

/** New words onto the old sung lines' times, line for line while both last; extra new lines come untimed. */
export function keepTimes(old: LyricLine[], texts: string[]): LyricLine[] {
  const sung = old.filter((l) => l.text);
  const out: LyricLine[] = [];
  for (let i = 0; i < texts.length; i++) out.push({ time: sung[i]?.time ?? null, text: texts[i] });
  return out;
}

/** The text of new lines from the AI with list marks, quotes and code fences taken off. */
export function cleanAiLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*```/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*•]\s+|\d{1,2}[.)]\s+)/, "").replace(/^\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*/, "").trim())
    .map((l) => l.replace(/^["“”]+|["“”]+$/g, "").trim())
    .reduce<string[]>((acc, l) => (l || (acc.length && acc[acc.length - 1]) ? [...acc, l] : acc), [])
    .join("\n")
    .trim()
    .split("\n")
    .filter((l, _, all) => all.length > 1 || l);
}

/** New words for the sung lines, in order; blank lines and section headings stay where they are. */
export function replaceSung(old: LyricLine[], texts: string[]): LyricLine[] {
  const out: LyricLine[] = [];
  let k = 0;
  for (const line of old) {
    if (!isSung(line)) out.push(line);
    else if (k < texts.length) out.push({ time: line.time, text: texts[k++] });
  }
  for (; k < texts.length; k++) out.push({ time: null, text: texts[k] });
  return out;
}

// ── Subtitles ────────────────────────────────────────────────────────────

const CUE_TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

/** SRT or WebVTT: cues with "00:00:12,500 --> 00:00:15,000" times. */
export function looksLikeSubtitles(source: string) {
  return /^﻿?WEBVTT/.test(source.trimStart()) || CUE_TIME.test(source.slice(0, 2000));
}

/**
 * Subtitles as LRC: each cue a timed line (a cue over two lines is one
 * line of lyrics), with a blank line where the singing stops for a while.
 */
export function subtitlesToLrc(source: string): string {
  const seconds = (h: string | undefined, m: string, s: string, ms: string) => Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
  const out: string[] = [];
  let lastEnd: number | null = null;
  for (const block of source.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const rows = block.split("\n");
    const at = rows.findIndex((r) => CUE_TIME.test(r));
    if (at < 0) continue;
    const t = CUE_TIME.exec(rows[at])!;
    const start = seconds(t[1], t[2], t[3], t[4]);
    const end = seconds(t[5], t[6], t[7], t[8]);
    const text = rows
      .slice(at + 1)
      .map((r) => r.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim())
      .filter(Boolean)
      .join(" ")
      // Music notes subtitles put around sung words.
      .replace(/^[♪♫\s]+|[♪♫\s]+$/g, "")
      .trim();
    if (!text) continue;
    if (lastEnd !== null && start - lastEnd > 3.5) out.push("");
    out.push(`${formatStamp(start)}${text}`);
    lastEnd = end;
  }
  return out.join("\n");
}

// ── Borrowing times from another copy of the same lyrics ────────────────

function normalizeLine(text: string) {
  return text
    .toLowerCase()
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[ً-ٰٟ‌‍]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(text: string) {
  const s = ` ${text} `;
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** How alike two lyric lines are, 0..1 (Dice over letter pairs — works in any script). */
export function lineSimilarity(a: string, b: string) {
  const x = normalizeLine(a);
  const y = normalizeLine(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let shared = 0;
  let total = 0;
  for (const [g, n] of gx) {
    shared += Math.min(n, gy.get(g) ?? 0);
    total += n;
  }
  for (const n of gy.values()) total += n;
  return total ? (2 * shared) / total : 0;
}

/**
 * Times for `words` (lyrics copied from a site, untimed) from `timed` (the
 * same song's timed lyrics from elsewhere): the lines are matched up in
 * order, even where one copy has lines the other doesn't, and a sung line
 * with no match gets a time between its neighbours'. Null when too few
 * lines match to trust it.
 */
export function borrowTimes(words: LyricLine[], timed: LyricLine[]): { lines: LyricLine[]; matched: number; total: number } | null {
  const a = words.map((l, i) => ({ l, i })).filter(({ l }) => isSung(l));
  const b = timed.filter((l) => isSung(l) && l.time !== null);
  if (a.length === 0 || b.length === 0) return null;
  const MIN = 0.55;
  // Best order-keeping matching (like a diff), scored by how alike matched lines are.
  const score: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  const sim = (i: number, j: number) => lineSimilarity(a[i].l.text, b[j].text);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const s = sim(i, j);
      score[i][j] = Math.max(score[i + 1][j], score[i][j + 1], s >= MIN ? s + score[i + 1][j + 1] : 0);
    }
  }
  const times: (number | null)[] = new Array(a.length).fill(null);
  let matched = 0;
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    const s = sim(i, j);
    if (s >= MIN && Math.abs(score[i][j] - (s + score[i + 1][j + 1])) < 1e-9) {
      times[i] = b[j].time;
      matched++;
      i++;
      j++;
    } else if (score[i + 1][j] >= score[i][j + 1]) i++;
    else j++;
  }
  if (matched < Math.max(2, Math.ceil(a.length * 0.5))) return null;
  // Unmatched lines between two matched ones share the time between them evenly.
  for (let i = 0; i < a.length; i++) {
    if (times[i] !== null) continue;
    let k = i;
    while (k < a.length && times[k] === null) k++;
    const before = i > 0 ? times[i - 1] : null;
    const after = k < a.length ? times[k] : null;
    if (before !== null && after !== null && after > before) {
      for (let m = i; m < k; m++) times[m] = round(before + ((after - before) * (m - i + 1)) / (k - i + 1));
    }
    i = k;
  }
  const out = words.map((l) => ({ ...l, time: null as number | null }));
  a.forEach(({ i }, k) => (out[i].time = times[k]));
  return { lines: out, matched, total: a.length };
}

// ── Timing lines from a vocal recording ─────────────────────────────────

/** A loudness curve on the timeline: `values[i]` is the level at `start + i * step` seconds. */
export type Envelope = { values: ArrayLike<number>; start: number; step: number };

/** The stretches where someone is singing, from a loudness curve: [start, end] in seconds. */
export function voicedRuns(env: Envelope, { from = -Infinity, to = Infinity } = {}): [number, number][] {
  const values = Array.from(env.values);
  if (values.length === 0) return [];
  const sorted = [...values].sort((x, y) => x - y);
  const floor = sorted[Math.floor(sorted.length * 0.2)];
  const loud = sorted[Math.floor(sorted.length * 0.9)];
  if (loud <= floor) return [];
  const threshold = floor + (loud - floor) * 0.2;
  const runs: [number, number][] = [];
  let open: number | null = null;
  for (let i = 0; i <= values.length; i++) {
    const t = env.start + i * env.step;
    const on = i < values.length && values[i] > threshold && t >= from && t < to;
    if (on && open === null) open = t;
    if (!on && open !== null) {
      runs.push([open, t]);
      open = null;
    }
  }
  // Breaths inside a phrase aren't breaks; blips aren't singing.
  const merged: [number, number][] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] < 0.12) last[1] = run[1];
    else merged.push([...run]);
  }
  return merged.filter(([s, e]) => e - s >= 0.1);
}

/**
 * A first guess at each sung line's time from a vocal recording: the
 * singing is cut into as many phrases as there are lines — at its longest
 * pauses, weighed against how long each line is — and each line starts
 * where its phrase does. Sections and blank lines stay untimed. Null when
 * the recording has no singing in it.
 */
export function autoTime(lines: LyricLine[], env: Envelope, range: { from?: number; to?: number } = {}): LyricLine[] | null {
  const sung = lines.map((l, i) => ({ l, i })).filter(({ l }) => isSung(l));
  const n = sung.length;
  const runs = voicedRuns(env, range);
  if (n === 0 || runs.length === 0) return null;
  const weights = sung.map(({ l }) => Math.max(1, countSyllables(l.text)));
  const totalWeight = weights.reduce((x, y) => x + y, 0);

  // Places a line can start: each run's start. Keep the ones after the longest pauses if there are very many.
  let starts = runs.map(([s], k) => ({ at: s, pause: k === 0 ? Infinity : s - runs[k - 1][1], k }));
  const LIMIT = 360;
  if (starts.length > LIMIT) starts = [...starts].sort((x, y) => y.pause - x.pause).slice(0, LIMIT).sort((x, y) => x.at - y.at);
  // Singing time (not pauses) up to each run, for weighing lines against phrases.
  const sungBefore: number[] = [0];
  for (const [s, e] of runs) sungBefore.push(sungBefore[sungBefore.length - 1] + (e - s));
  const totalSung = sungBefore[sungBefore.length - 1];
  const sungFrom = (k: number) => sungBefore[k];
  const m = starts.length;
  // Where on the timeline a moment of singing time falls (pauses skipped).
  const atSung = (x: number) => {
    for (let k = 0; k < runs.length; k++) if (sungBefore[k + 1] >= x) return runs[k][0] + (x - sungBefore[k]);
    return runs[runs.length - 1][1];
  };
  /** Lines spread over the singing in proportion to their length. */
  const spread = () => {
    let acc = 0;
    return weights.map((w) => {
      const t = round(atSung((acc / totalWeight) * totalSung));
      acc += w;
      return t;
    });
  };
  let times: number[];
  if (m < n) {
    // Fewer phrases than lines: no pauses to go by.
    times = spread();
  } else {
    // Choose n of the m phrase starts (the first always included) that best fit
    // the lines' lengths, preferring long pauses before a new line.
    const pauseScore = (p: number) => (p === 0 ? 0 : Math.log1p(Math.min(3, starts[p].pause) / 0.2));
    const cost = (line: number, p: number, q: number) => {
      // Line `line` runs from start p to start q (or the end).
      const sungTime = (q < m ? sungFrom(starts[q].k) : totalSung) - sungFrom(starts[p].k);
      const expected = (weights[line] / totalWeight) * totalSung;
      const miss = (sungTime - expected) / Math.max(expected, 0.6);
      return miss * miss - pauseScore(p) * 0.6;
    };
    const INF = Number.POSITIVE_INFINITY;
    // best[line][p]: the cheapest way to start lines 0..line with line `line` at start p.
    const best: Float64Array[] = Array.from({ length: n }, () => new Float64Array(m).fill(INF));
    const from: Int32Array[] = Array.from({ length: n }, () => new Int32Array(m).fill(-1));
    // Each next line starts within a window after the previous one, which keeps this quick.
    const reach = Math.max(8, Math.ceil((m / n) * 4));
    best[0][0] = 0;
    for (let line = 1; line < n; line++) {
      for (let q = line; q <= m - (n - line); q++) {
        let top = INF;
        let arg = -1;
        for (let p = Math.max(line - 1, q - reach); p < q; p++) {
          if (best[line - 1][p] === INF) continue;
          const c = best[line - 1][p] + cost(line - 1, p, q);
          if (c < top) {
            top = c;
            arg = p;
          }
        }
        best[line][q] = top;
        from[line][q] = arg;
      }
    }
    let end = -1;
    let top = INF;
    for (let q = n - 1; q < m; q++) {
      if (best[n - 1][q] === INF) continue;
      const c = best[n - 1][q] + cost(n - 1, q, m);
      if (c < top) {
        top = c;
        end = q;
      }
    }
    if (end < 0) return lines.map((l, i) => ({ ...l, time: isSung(l) ? spread()[sung.findIndex((x) => x.i === i)] : null }));
    const picks: number[] = new Array(n);
    for (let line = n - 1, q = end; line >= 0; line--) {
      picks[line] = q;
      q = from[line][q];
    }
    times = picks.map((p) => round(starts[p].at));
  }
  const out = lines.map((l) => ({ ...l, time: null as number | null }));
  sung.forEach(({ i }, k) => (out[i].time = times[k] ?? null));
  return out;
}
