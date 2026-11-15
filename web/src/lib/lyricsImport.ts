// Lyrics from a web page someone points the Studio at: a Genius song page
// (or its embed code), AZLyrics, a Persian lyrics blog ("متن آهنگ …"), or
// any page with the words on it — and LRC, SRT or plain text files. Pure
// string work, no network: api/lyrics/import fetches the page and hands
// the HTML here, and the tests feed it pages directly.

import { looksLikeSubtitles, splitSongTitle, subtitlesToLrc } from "./lyrics";

export type ImportedLyrics = {
  title: string;
  artist: string;
  /** LRC text: timed lines stamped, the rest plain. */
  text: string;
  /** Where they came from, to show: "genius.com". */
  source: string;
};

const MAX_TEXT = 20_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", mdash: "—", ndash: "–", zwnj: "‌" };

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** HTML to lines of text: <br> and block ends are line breaks, every other tag goes. */
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|button|form|iframe)\b[\s\S]*?<\/\1>/gi, "")
      // A <br> and the page source's own line break after it are one break.
      .replace(/(<br\s*\/?>)[ \t]*\r?\n/gi, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
      .replace(/<(p|div|li|h[1-6]|blockquote|pre|tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The element whose opening tag starts at `at`: its inner HTML and where it ends (tags of the same name counted, so nesting works). */
function elementAt(html: string, at: number): { inner: string; end: number } {
  const open = /^<([a-z][a-z0-9]*)\b[^>]*>/i.exec(html.slice(at, at + 4000));
  if (!open) return { inner: "", end: at };
  const tag = open[1].toLowerCase();
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  const begin = at + open[0].length;
  re.lastIndex = begin;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { inner: html.slice(begin, m.index), end: m.index + m[0].length };
  }
  return { inner: html.slice(begin), end: html.length };
}

/** The HTML inside the element whose opening tag starts at `at`. */
export function innerHtmlAt(html: string, at: number): string {
  return elementAt(html, at).inner;
}

/** Removes every element whose opening tag matches `marker`, children and all. */
function dropElements(html: string, marker: RegExp) {
  let out = html;
  for (let guard = 0; guard < 200; guard++) {
    const m = marker.exec(out);
    if (!m) break;
    const tagStart = out.lastIndexOf("<", m.index);
    out = out.slice(0, tagStart) + out.slice(elementAt(out, tagStart).end);
  }
  return out;
}

function meta(html: string, name: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  return tag ? decodeEntities(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? "").trim() : "";
}

/** Lines a lyrics site adds that aren't lyrics. */
const JUNK = [
  /^\d*\s*embed$/i,
  /^you might also like$/i,
  /^see .{1,60} live$/i,
  /^get tickets as low as/i,
  /^\d+\s+contributors?/i,
  /^translations?$/i,
  /^(submit corrections|writer\(s\):|thanks to .{1,80} for (adding|correcting))/i,
  /^(lyrics|متن آهنگ)$/i,
  // A Persian page's heading over the words: "متن آهنگ شایعه حامد همایون".
  /^(متن( کامل)?|دانلود|تکست) (آهنگ|اهنگ|ترانه|موزیک) .{1,80}$/,
  // A music site's facts about the song: "نام آهنگ : …", "زمان : 4:21", "ترانه سرا: …".
  /^(نام (آهنگ|اهنگ|خواننده|ترانه|آلبوم)|خواننده|زمان|مدت( زمان)?|فرمت|حجم|کیفیت|ترانه ?سرا|آهنگ ?ساز|تنظیم( کننده)?|میکس( و مستر)?|مستر(ینگ)?|سبک|ژانر|تاریخ انتشار)\s*[:：]/,
  /^دانلود .{0,40}(با بهترین کیفیت|لینک (دانلود )?مستقیم|کیفیت عالی)/,
];

function tidy(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !JUNK.some((re) => re.test(l)))
    // Genius ends the last line with "…Embed" glued on.
    .map((l) => l.replace(/\d*Embed$/, "").trim());
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

/** Genius: the words are in one or more `data-lyrics-container` blocks; headers inside are left out. */
function fromGenius(html: string) {
  const parts: string[] = [];
  const re = /<div[^>]+data-lyrics-container=["']true["'][^>]*>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const inner = dropElements(innerHtmlAt(html, m.index), /data-exclude-from-selection=["']true["']/i);
    parts.push(htmlToText(inner));
  }
  return parts.join("\n").trim();
}

/** AZLyrics: the div after its "Usage of azlyrics.com content" comment. */
function fromAzLyrics(html: string) {
  const at = html.search(/<!--\s*Usage of azlyrics\.com content/i);
  if (at < 0) return "";
  const div = html.indexOf("<div", at);
  return div < 0 ? "" : htmlToText(innerHtmlAt(html, div));
}

/** An element marked as the lyrics by its class or id, as most lyrics sites and blogs do. */
function fromMarkedBlock(html: string, accept: (text: string) => boolean = () => true) {
  const re = /<(div|section|article|pre|p|span)\b[^>]*(?:class|id)=["'][^"']*(lyric|song-?text|songtext|matn|mtn|poem|she3r|entry-content|post-content|article-content|single-content)[^"']*["'][^>]*>/gi;
  let best = "";
  let bestScore = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const text = htmlToText(innerHtmlAt(html, m.index));
    const lines = text.split("\n").filter(Boolean);
    if (lines.length < 4 || !accept(text)) continue;
    // Lyrics are many short lines; an article is a few long ones. A "lyrics" class counts extra.
    const short = lines.filter((l) => l.length <= 90).length / lines.length;
    const score = lines.length * short * (/lyric|song-?text|matn/i.test(m[2]) ? 2 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return bestScore >= 4 ? best : "";
}

/**
 * Any page: the longest run of short lines broken by <br> (paragraphs next
 * to each other count as one run, a verse each) — how lyrics sit on a page.
 */
function fromLineRuns(html: string, accept: (text: string) => boolean = () => true) {
  const body = html
    .replace(/<head\b[\s\S]*?<\/head>/i, "")
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, "")
    // Inline tags don't break a line.
    .replace(/<\/?(a|b|i|em|strong|span|font|u|small|mark)\b[^>]*>/gi, "")
    // Verses in paragraphs one after another: one run, a blank line between.
    .replace(/<\/p>\s*<p\b[^>]*>/gi, "<br><br>");
  let best: string[] = [];
  let run: string[] = [];
  let breaks = 0;
  const close = () => {
    if (breaks >= 3 && run.filter(Boolean).length > best.filter(Boolean).length && accept(run.join("\n"))) best = run;
    run = [];
    breaks = 0;
  };
  // Whether the last thing seen was a <br>, with no words since: a second one is a break between verses.
  let afterBreak = false;
  for (const token of body.split(/(<[^>]*>)/)) {
    if (!token) continue;
    if (token[0] === "<") {
      if (/^<br\b/i.test(token)) {
        if (afterBreak && run.length) run.push("");
        afterBreak = true;
        breaks++;
      } else {
        close();
        afterBreak = false;
      }
      continue;
    }
    const text = decodeEntities(token).replace(/\u00a0/g, " ").trim();
    if (!text) continue;
    afterBreak = false;
    if (text.length > 160) {
      close();
      continue;
    }
    run.push(text.replace(/\s+/g, " "));
  }
  close();
  const text = best.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return best.filter(Boolean).length >= 4 ? text : "";
}

/**
 * A music page's title as the song and who sings it. Iranian sites title
 * their pages "دانلود آهنگ <singer> به نام <song>", "<song> از <singer>",
 * "<song> » <singer>", or "Singer – Song", with extras around them (+ کیفیت
 * عالی, با متن, MP3, the site's name) that are dropped.
 */
export function pageTitleParts(raw: string): { title: string; artist: string } {
  // A remix or an album says so in front; it stays with the title, not the singer.
  let kind = "";
  let text = decodeEntities(raw)
    .replace(/\u200c/g, " ")
    .replace(/\s*[|]\s*[^|]*$/, "")
    // The site's name after a dash: "… - رزموزیک".
    .replace(/\s+[-–—]\s+(رز ?موزیک|آپ ?موزیک|نیک ?موزیک|موزیک ?فید|نکس ?وان ?موزیک|[\w.-]+\.(?:com|ir|net|org))\s*$/i, "")
    .replace(/^\s*(دانلود\s+)?(آهنگ|موزیک|ترانه|ریمیکس|آلبوم)?\s*(جدید\s+)?/, (all, dl, k) => {
      if (k === "ریمیکس" || k === "آلبوم") kind = k;
      return "";
    })
    .replace(/\s*\+\s*.*$/, "")
    // A second name after a slash: "… / Sanam Ahang", "… / کیفیت اصلی".
    .replace(/\s+\/\s+.*$/, "")
    .replace(/\s+(با|همراه)\s+(متن|کیفیت|لینک).*$/, "")
    .replace(/\s+(mp3|MP3|ام پی تری)\s*$/, "")
    .replace(/\s*[(（][^)）]*[)）]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^["«“]|["»”]$/g, "").trim();
  const named = (title: string, artist: string) => ({ title: kind ? `${kind} ${title.trim()}` : title.trim(), artist: artist.trim() });
  let m = /^(.+?)\s+(?:به\s*نام|بنام)\s+(.+)$/.exec(text);
  if (m) return named(m[2], m[1]);
  m = /^(.+?)\s*[»›]\s*(.+)$/.exec(text);
  if (m) return named(m[1], m[2]);
  m = /^(.+?)\s+از\s+(.+)$/.exec(text);
  if (m) return named(m[1], m[2]);
  const split = splitSongTitle(text);
  return named(split.song || text, split.artist);
}

/** The song and artist a page is about, from its title tags, without the site's own words. */
function titleOf(html: string, host: string): { title: string; artist: string } {
  const raw =
    meta(html, "og:title") ||
    meta(html, "twitter:title") ||
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim();
  let title = raw
    .replace(/\s*[|–—-]\s*(genius( lyrics)?|azlyrics.*|musixmatch|lyrics\.com|songlyrics.*|lyricstranslate.*)$/i, "")
    .replace(/\s+lyrics(\s+\|.*)?$/i, "")
    .replace(/^(متن( کامل)?( آهنگ)?|دانلود آهنگ)\s+/, "")
    .trim();
  // AZLyrics: "Artist - Song Lyrics | AZLyrics.com"; Genius: "Artist – Song Lyrics | Genius Lyrics".
  if (/genius\.com$/.test(host)) {
    const m = /^(.*?)\s+[–-]\s+(.*)$/.exec(title);
    if (m) return { artist: m[1].trim(), title: m[2].trim() };
  }
  title = title.replace(/\s*\|\s*.*$/, "").trim();
  // Persian music and lyrics sites: "<singer> به نام <song>", "<song> از <singer>"…
  if (/[\u0600-\u06ff]/.test(raw)) return pageTitleParts(raw.replace(/^متن( کامل)?( آهنگ)?\s+/, ""));
  const split = splitSongTitle(title);
  return { title: split.song || title, artist: split.artist };
}

/** The lyrics on a page, or null when none could be told apart from the rest of it. */
export function lyricsFromHtml(html: string, url: string): ImportedLyrics | null {
  const host = safeHost(url);
  // A Persian song's page often has an English translation by the words — or only the
  // translation: the lyrics are the lines in Persian.
  const persianPage = PERSIAN_LETTER.test(meta(html, "og:title") || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "");
  // A block of the song's facts and download links isn't its words: what's left once those go has to be a few lines.
  const accept = (text: string) => tidy(text).split("\n").filter(Boolean).length >= 4 && (!persianPage || mostlyPersian(text));
  const text =
    (/genius\.com$/.test(host) || /data-lyrics-container/.test(html) ? fromGenius(html) : "") ||
    (/azlyrics\.com$/.test(host) ? fromAzLyrics(html) : "") ||
    fromMarkedBlock(html, accept) ||
    fromLineRuns(html, accept);
  const words = tidy(text);
  if (words.split("\n").filter(Boolean).length < 2) return null;
  return { ...titleOf(html, host), text: words, source: host };
}

const PERSIAN_LETTER = /[\u0600-\u06ff]/;

/** Most of the lines are in Persian (Arabic script) letters. */
function mostlyPersian(text: string) {
  const lines = text.split("\n").filter((l) => /\p{L}/u.test(l));
  return lines.length > 0 && lines.filter((l) => PERSIAN_LETTER.test(l)).length / lines.length >= 0.5;
}

/** A lyrics file's text (LRC, SRT, WebVTT or plain) as an LRC sheet. */
export function lyricsFromFile(text: string): string {
  const clean = text.replace(/^﻿/, "");
  return (looksLikeSubtitles(clean) ? subtitlesToLrc(clean) : clean).slice(0, MAX_TEXT).trim();
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The page to read from what was pasted: a link, or embed code — Genius's
 * `<div class='rg_embed_link' data-song-id='…'>` snippet, an iframe, or
 * any HTML with a link in it. Null when there's no link.
 */
export function lyricsLinkFrom(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const genius = /genius\.com\/songs\/(\d+)/i.exec(text) ?? /data-song-id=["'](\d+)["']/i.exec(text) ?? /rg_embed_link_(\d+)/i.exec(text);
  const href = /<a\b[^>]*href=["']([^"']+)["']/i.exec(text)?.[1];
  const src = /<iframe\b[^>]*src=["']([^"']+)["']/i.exec(text)?.[1];
  // A Genius embed links its lyrics page; the song id is the fallback.
  if (href && /genius\.com\/.+-lyrics/i.test(href)) return normalizeLink(href);
  if (genius) return `https://genius.com/songs/${genius[1]}`;
  if (src) return normalizeLink(src);
  if (href) return normalizeLink(href);
  if (/^(https?:)?\/\/\S+$/i.test(text) || /^[\w-]+(\.[\w-]+)+\/\S*$/.test(text)) return normalizeLink(text);
  return null;
}

function normalizeLink(link: string) {
  const full = link.startsWith("//") ? `https:${link}` : /^https?:\/\//i.test(link) ? link : `https://${link}`;
  try {
    return new URL(full).href;
  } catch {
    return null;
  }
}

/** Whether pasted text is a link or embed code rather than lyrics themselves. */
export function isLyricsLink(input: string) {
  const text = input.trim();
  if (text.length > 4000) return false;
  if (/^<(div|iframe|a|script)\b/i.test(text)) return lyricsLinkFrom(text) !== null;
  return !/\n/.test(text) && /^(https?:)?\/\/\S+$/i.test(text);
}

/** Text that is a web page's HTML (copied source), not lyrics. */
export function looksLikeHtml(text: string) {
  return /<(html|body|div|p|br)\b[^>]*>/i.test(text.slice(0, 5000)) && (text.match(/<[a-z][^>]*>/gi)?.length ?? 0) > 5;
}

// ── Genius embeds ────────────────────────────────────────────────────────
//
// Genius turns servers away (Cloudflare answers 403 to anything that isn't
// a browser), but it offers every song as an embed for other sites to show:
// genius.com/songs/<id>/embed.js writes the lyrics into the page. The
// Studio loads that in a sandboxed frame in the singer's own browser (see
// lyricsSources.geniusFromBrowser) and reads the words out of what it
// wrote; the server tries the same script first, in case it's let through.

/** A Genius song's id from a link or embed code: genius.com/songs/123, data-song-id="123", rg_embed_link_123. */
export function geniusSongId(input: string): number | null {
  const m = /genius\.com\/songs\/(\d+)/i.exec(input) ?? /data-song-id=["']?(\d+)/i.exec(input) ?? /rg_embed_link_(\d+)/i.exec(input);
  const id = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The lyrics from what a Genius embed writes into a page: the words in its body, the song and artist from its link ("“Song” by Artist"). */
export function lyricsFromGeniusEmbed(html: string): ImportedLyrics | null {
  const at = html.search(/<div[^>]+class=["'][^"']*\brg_embed_body\b[^"']*["'][^>]*>/i);
  if (at < 0) return null;
  const body = dropElements(innerHtmlAt(html, at), /class=["'][^"']*\brg_embed_(footer|header|analytics)\b/i);
  const words = tidy(htmlToText(body));
  if (words.split("\n").filter(Boolean).length < 2) return null;
  const link = /<div[^>]+class=["'][^"']*\brg_embed_link\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? "";
  const label = decodeEntities(link.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  const named = /[“"]([^”"]+)[”"]\s+by\s+(.+?)(?:\s+on\s+Genius)?$/i.exec(label.replace(/^Read\s+/i, ""));
  return { title: named?.[1].trim() ?? "", artist: named?.[2].trim() ?? "", text: words, source: "genius.com" };
}

/** A JavaScript string literal's text: the escapes Genius's embed script uses (\\uXXXX, \\', \\", \\/, \\n …). */
function unescapeJs(literal: string): string {
  return literal.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e: string) => {
    if (e[0] === "u" && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === "x" && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\n": "" } as Record<string, string>)[e] ?? e;
  });
}

/** The HTML Genius's embed.js writes: its `document.write(JSON.parse('…'))` calls, unpacked and joined. */
export function geniusEmbedHtml(js: string): string {
  const out: string[] = [];
  const re = /JSON\.parse\('((?:[^'\\]|\\[\s\S])*)'\)/g;
  for (let m = re.exec(js); m; m = re.exec(js)) {
    try {
      const value = JSON.parse(unescapeJs(m[1]));
      if (typeof value === "string") out.push(value);
    } catch {
      // Not a string of HTML: skipped.
    }
  }
  return out.join("\n");
}
