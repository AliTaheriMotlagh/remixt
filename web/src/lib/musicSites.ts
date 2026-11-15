import { decodeEntities } from "./lyricsImport";
import { matchScore, normalizePersian, persianArtistQuery } from "./lyricsSearch";
import { pageTitleParts, type MusicPage } from "./musicPages";

// Searching Iranian music sites for a song: most of them are WordPress
// sites, and WordPress answers a search as JSON (/wp-json/wp/v2/posts) —
// no page scraping to find the posts. Each post is a song's page, with its
// MP3s (320 and 128) and, usually, its lyrics ("متن آهنگ"); what's on it is
// read when the singer picks it (api/lyrics/import for the words,
// api/import for the song).
//
// The sites asked are MUSIC_SITES (comma-separated hosts) when set, else
// the list below. A site that's down, slow or blocks this server just
// adds nothing.

const DEFAULT_SITES = ["beatmastering.ir", "rozmusic.com", "upmusics.com", "musicfeed.ir", "nicmusic.net", "nex1music.ir"];
const PER_SITE = 4;
const MAX_PAGES = 8;
// Some sites take a few seconds on a search nobody's made before (then about one).
const TIMEOUT_MS = 8_000;
/** Once some sites have answered, the slow ones get this much longer. */
const SOFT_DEADLINE_MS = 2_500;
/** How well a page's title has to match the search to be shown at all (see matchScore). */
const MIN_SCORE = 0.3;
const CACHE_MS = 60 * 60 * 1000;
const MAX_CACHED = 300;

export function musicSites(): string[] {
  const set = process.env.MUSIC_SITES?.split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s));
  return set?.length ? set : DEFAULT_SITES;
}

const cache = new Map<string, { at: number; found: MusicPage[] }>();

// Each search asks every site (twice, for a Finglish artist): one visitor
// gets SEARCHES_PER_MINUTE fresh ones, so the sites aren't hammered through
// this server. Answers already kept are free.
const SEARCHES_PER_MINUTE = 30;
const recent = new Map<string, number[]>();

function allowed(who: string): boolean {
  const now = Date.now();
  const times = (recent.get(who) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= SEARCHES_PER_MINUTE) {
    recent.set(who, times);
    return false;
  }
  times.push(now);
  recent.set(who, times);
  if (recent.size > 5000) {
    for (const [key, list] of recent) if (!list.some((t) => now - t < 60_000)) recent.delete(key);
  }
  return true;
}

/** Who's asking, for the limit above: the visitor's address as the proxy in front reports it. */
export function askerOf(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

type WpPost = { link?: unknown; title?: { rendered?: unknown } };

async function searchSite(site: string, query: string): Promise<MusicPage[]> {
  const params = new URLSearchParams({ search: query, per_page: String(PER_SITE), _fields: "link,title" });
  const res = await fetch(`https://${site}/wp-json/wp/v2/posts?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RemixtStudio/1.0)", Accept: "application/json" },
  });
  if (!res.ok) return [];
  const posts = (await res.json().catch(() => [])) as WpPost[];
  if (!Array.isArray(posts)) return [];
  const out: MusicPage[] = [];
  for (const post of posts) {
    const link = typeof post?.link === "string" ? post.link : "";
    const raw = typeof post?.title?.rendered === "string" ? post.title.rendered : "";
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    // Only the site's own pages.
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (url.hostname.replace(/^www\./, "") !== site.replace(/^www\./, "")) continue;
    const { title, artist } = pageTitleParts(decodeEntities(raw.replace(/<[^>]+>/g, "")));
    if (title) out.push({ title: title.slice(0, 200), artist: artist.slice(0, 200), url: url.href, site });
  }
  return out;
}

/**
 * Every site's pages, without waiting on a site that doesn't answer: all
 * of them, or what's in once SOFT_DEADLINE_MS has passed with the song
 * surely found (`good`) or all but one site answered (`oneSite`: its searches).
 */
function gather(searches: Promise<MusicPage[]>[], good: (page: MusicPage) => boolean, oneSite: number): Promise<MusicPage[]> {
  return new Promise((resolve) => {
    const found: MusicPage[] = [];
    let left = searches.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(soft);
      resolve(found);
    };
    // By then most sites have answered: something found, or most of them saying "nothing", is the answer.
    const soft = setTimeout(() => {
      // Waiting on one site (one that's down, usually) isn't worth it.
      if (found.some(good) || left <= oneSite) finish();
    }, SOFT_DEADLINE_MS);
    if (!left) finish();
    for (const search of searches) {
      search
        .then((pages) => found.push(...pages), () => {})
        .finally(() => {
          if (--left === 0) finish();
        });
    }
  });
}

/** Song pages on the music sites for a search, the best matches first. `who`: see askerOf — none when over the limit. */
export async function searchMusicSites(query: string, who = "server"): Promise<MusicPage[]> {
  const q = normalizePersian(query).slice(0, 120);
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const kept = cache.get(key);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.found;
  if (!allowed(who)) return [];

  // Typed in Finglish with a known artist: their pages are titled in Persian.
  const queries = [q, persianArtistQuery(q)].filter((s): s is string => !!s);
  const sites = musicSites();
  const scoreOf = (page: MusicPage) => Math.max(...queries.map((text) => matchScore(text, page.title, page.artist)));
  const pages = await gather(
    queries.flatMap((text) => sites.map((site) => searchSite(site, text))),
    (page) => scoreOf(page) >= 0.85,
    queries.length
  );
  const seen = new Set<string>();
  const scored: { page: MusicPage; score: number }[] = [];
  for (const page of pages) {
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    scored.push({ page, score: scoreOf(page) });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  // Once one matches well, the ones that barely do are noise.
  const found = scored
    .filter((s) => s.score >= Math.max(MIN_SCORE, Math.min(0.5, best * 0.6)))
    .slice(0, MAX_PAGES)
    .map((s) => s.page);
  // Nothing found may be a site hiccup: not kept.
  if (found.length) {
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), found });
  }
  return found;
}
