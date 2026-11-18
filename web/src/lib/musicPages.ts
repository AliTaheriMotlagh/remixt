// Song pages on Iranian music sites (and any page with a song on it): what
// the page is called, split into the song and its singer, and the audio
// files it links to — the MP3 in 320 and 128, usually, with the lyrics
// under them ("متن آهنگ"). Pure string work, shared by the server (link
// import, the music-site search) and the tests.

import { decodeEntities, pageTitleParts } from "./lyricsImport";

export { pageTitleParts };

/** A song's page on a music site, found by a search. */
export type MusicPage = {
  title: string;
  artist: string;
  url: string;
  /** The site's name: "rozmusic.com". */
  site: string;
};

/** An audio file linked from a page, with its bitrate when the link says it. */
export type AudioLink = { url: string; kbps: number | null };

const AUDIO_PATH = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

/** Ringtone cuts, teasers and samples: a few seconds, not the song. */
const NOT_THE_SONG = /pishvaz|پیشواز|teaser|تیزر|demo|sample|ringtone|preview/i;

/** Whether a link is an audio file itself (by its path), not a page. */
export function isAudioUrl(link: string): boolean {
  try {
    return AUDIO_PATH.test(decodeURIComponent(new URL(link).pathname));
  } catch {
    return false;
  }
}

function bitrateOf(path: string): number | null {
  const m = /[\s(_[-](64|96|128|160|192|256|320)\s?(?:kbps|k)?[)\]]?\.\w+$/i.exec(path) ?? /\b(64|96|128|160|192|256|320)\s?kbps\b/i.exec(path);
  return m ? Number(m[1]) : null;
}

/**
 * The audio files a page links to (anchors, <audio>/<source>, og:audio,
 * player data attributes), best first: the page's first song in its best
 * quality, then the rest. A file with no bitrate in its name is usually
 * the full-quality one, so it ranks just under a labelled 320.
 */
export function audioLinksFrom(html: string, pageUrl: string): AudioLink[] {
  const seen = new Set<string>();
  const found: (AudioLink & { order: number; name: string })[] = [];
  const re = /(?:href|src|content|data-src|data-url|data-file|data-mp3)\s*=\s*["']([^"'<>]+)["']/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1]).trim(), pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = url.pathname;
    }
    if (!AUDIO_PATH.test(path) || NOT_THE_SONG.test(path)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const file = path.split("/").pop() ?? "";
    // The same song in other qualities shares its name, less the bitrate.
    const name = file
      .replace(AUDIO_PATH, "")
      .replace(/[\s(_[-]*(64|96|128|160|192|256|320)\s?(kbps|k)?[)\]]?$/i, "")
      .toLowerCase()
      .trim();
    found.push({ url: url.href, kbps: bitrateOf(path), order: found.length, name });
  }
  if (!found.length) return [];
  const firstSong = found[0].name;
  const rank = (a: (typeof found)[number]) => (a.kbps === null ? 300 : a.kbps);
  return found
    .sort((a, b) => Number(b.name === firstSong) - Number(a.name === firstSong) || rank(b) - rank(a) || a.order - b.order)
    .map(({ url, kbps }) => ({ url, kbps }));
}

/** The page's picture (Open Graph's, else Twitter's) as an absolute address — on a song's page, its cover. */
export function pageImageOf(html: string, pageUrl: string): string | null {
  for (const name of ["og:image", "og:image:url", "og:image:secure_url", "twitter:image"]) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name.replace(/:/g, "\\:")}["'][^>]*>`, "i").exec(html)?.[0];
    const content = tag && /content=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!content) continue;
    try {
      const url = new URL(decodeEntities(content.trim()), pageUrl);
      if (/^https?:$/.test(url.protocol)) return url.href;
    } catch {
      // not an address
    }
  }
  return null;
}

/** The page's own title: Open Graph's, else <title>. */
export function pageTitleOf(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]*>/i.exec(html)?.[0];
  const content = og && /content=["']([^"']*)["']/i.exec(og)?.[1];
  return decodeEntities(content || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
}
