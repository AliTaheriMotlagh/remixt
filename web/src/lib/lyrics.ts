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
const TAG = /^\[([a-z]+):(.*)\]\s*$/i;

function stampSeconds(minutes: string, seconds: string) {
  return Number(minutes) * 60 + Number(seconds.replace(":", "."));
}

/** Reads a sheet: LRC (one or more stamps a line, metadata tags, an [offset:]) or plain text. */
export function parseLyrics(source: string): LyricLine[] {
  const out: LyricLine[] = [];
  // LRC's [offset:+n] is in ms; positive shows the words earlier.
  let offset = 0;
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    let rest = raw.trim();
    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = STAMP.exec(rest))) {
      times.push(stampSeconds(match[1], match[2]));
      rest = rest.slice(match[0].length);
    }
    if (times.length === 0) {
      const tag = TAG.exec(rest);
      // [ar:Artist], [ti:Title], [length:…] and the like: not words to sing.
      if (tag && !/\s/.test(tag[1])) {
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
  return lines.map((l) => {
    if (!l.text) {
      if (started && restAtBreaks) at += bar;
      return { ...l, time: null };
    }
    started = true;
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
  const syllables = countSyllables(line.text);
  if (line.time === null || !line.text) return { syllables, seconds: null, beats: null, verdict: null };
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
