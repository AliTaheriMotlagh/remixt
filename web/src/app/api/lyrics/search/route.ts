import { NextRequest, NextResponse } from "next/server";
import type { LyricsPage, LyricsResult } from "@/lib/lyrics";
import { hasSureMatch, libraryQueries, rankCandidates, type LibraryQuery } from "@/lib/lyricsSearch";
import { askerOf, searchMusicSites } from "@/lib/musicSites";

// Finds a song's lyrics to sing along to in the Studio, from LRCLIB
// (lrclib.net): a free, open database of lyrics, many of them timed line
// by line (LRC). Fetched here rather than in the browser so the Studio
// doesn't depend on that site's CORS, and answers can be cached.
//
// One search here is several there (see lyricsSearch.ts): the library
// only matches whole words spelled its way, and keeps Persian songs under
// Finglish names, so "هیچکس فیروز" is also asked as "Hichkas Firooz" and
// as "Hichkas" — and everything that comes back is ranked together.
//
//   ?q=<song and/or artist>        a free search, in any script
//   ?track=<title>&artist=<name>   a song from the mix: its title (and the
//                                  artist its title names)
//   &duration=<seconds>            the mix's song length: the same
//                                  recording comes first
//
// Alongside: the song's page on Genius (words only), and on Iranian music
// sites (lib/musicSites.ts) — the words most Persian songs are missing from
// the library, and the song's MP3 itself.

const BASE = "https://lrclib.net/api";
const MAX_RESULTS = 12;
const CACHE_MS = 60 * 60 * 1000;
const MAX_CACHED = 400;

type LrclibResult = {
  id: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

// The same searches come up again and again (a mix's song, a popular
// artist): kept for an hour, so the library isn't asked twice.
const cache = new Map<string, { at: number; found: LrclibResult[] }>();

async function lookup(search: LibraryQuery): Promise<LrclibResult[]> {
  const params = new URLSearchParams(search as Record<string, string>);
  const key = params.toString();
  const kept = cache.get(key);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.found;
  const res = await fetch(`${BASE}/search?${params}`, {
    headers: { "User-Agent": "Remixt Studio (lyrics for singing along)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const found = (await res.json()) as LrclibResult[];
  if (!Array.isArray(found)) throw new Error("unexpected answer");
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), found });
  return found;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim().slice(0, 200) ?? "";
  const track = params.get("track")?.trim().slice(0, 200) ?? "";
  const artist = params.get("artist")?.trim().slice(0, 200) ?? "";
  const duration = Number(params.get("duration")) || null;
  if (!q && !track) return NextResponse.json({ error: "Type a song to look for" }, { status: 400 });

  const wanted = [artist, track, q].filter(Boolean).join(" ");
  // Asked while the library is: they don't wait on each other.
  const web = geniusPages(wanted);
  const sites = searchMusicSites(wanted, askerOf(req.headers)).catch(() => []);
  const queries = libraryQueries(q, { track: track || undefined, artist: artist || undefined });
  // Two at a time, best first, stopping once the song is surely found: the
  // library limits how often one server may ask.
  const found: LrclibResult[] = [];
  let failed = 0;
  for (let i = 0; i < queries.length; i += 2) {
    const answers = await Promise.allSettled(queries.slice(i, i + 2).map(lookup));
    for (const answer of answers) {
      if (answer.status === "fulfilled") found.push(...answer.value);
      else failed++;
    }
    if (hasSureMatch(found.map(toResult), wanted)) break;
  }
  const candidates = found.filter((r) => r && typeof r.id === "number" && (r.plainLyrics || r.syncedLyrics || r.instrumental)).map(toResult);
  const results = rankCandidates(candidates, wanted, duration).slice(0, MAX_RESULTS);
  const [webPages, sitePages] = await Promise.all([web, sites]);
  if (found.length === 0 && failed > 0 && !webPages.length && !sitePages.length) {
    return NextResponse.json({ error: "The lyrics library couldn't be reached — try again in a moment, or paste the words in yourself" }, { status: 502 });
  }

  // Whether the library surely has the song: if not, the sites' pages are likelier the one.
  const sure = hasSureMatch(results, wanted);
  return NextResponse.json({ results, web: webPages, sites: sitePages, sure }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" } });
}

/**
 * Songs on Genius matching the search — their pages, to import the words
 * from (api/lyrics/import). Genius's API needs a token (GENIUS_ACCESS_TOKEN,
 * free from genius.com/api-clients); without one this finds nothing and
 * the Studio offers a link to search Genius instead.
 */
async function geniusPages(query: string): Promise<LyricsPage[]> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token || !query) return [];
  const key = `genius:${query.toLowerCase()}`;
  const kept = webCache.get(key);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.found;
  try {
    const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { response?: { hits?: { type?: string; result?: GeniusSong }[] } };
    const found = (data.response?.hits ?? [])
      .filter((h) => h.type === "song" && h.result?.url)
      .slice(0, 6)
      .map(({ result }) => ({
        title: result!.title ?? "Untitled",
        artist: result!.primary_artist?.name ?? "",
        url: result!.url!,
        image: result!.song_art_image_thumbnail_url ?? null,
        source: "genius" as const,
        ...(typeof result!.id === "number" ? { id: result!.id } : {}),
        // Who else sings on it (Genius's credits): names the voices "Remove a singer" hears, even when the words can't be read.
        featured: (result!.featured_artists ?? []).map((a) => a.name ?? "").filter(Boolean).slice(0, 6),
      }));
    if (webCache.size >= MAX_CACHED) webCache.delete(webCache.keys().next().value!);
    webCache.set(key, { at: Date.now(), found });
    return found;
  } catch {
    return [];
  }
}

type GeniusSong = { id?: number; title?: string; url?: string; song_art_image_thumbnail_url?: string; primary_artist?: { name?: string }; featured_artists?: { name?: string }[] };
const webCache = new Map<string, { at: number; found: LyricsPage[] }>();

function toResult(r: LrclibResult): LyricsResult {
  return {
    id: r.id,
    title: r.trackName ?? "Untitled",
    artist: r.artistName ?? "",
    album: r.albumName ?? "",
    duration: typeof r.duration === "number" ? r.duration : null,
    instrumental: !!r.instrumental,
    plain: r.plainLyrics ?? null,
    synced: r.syncedLyrics ?? null,
  };
}
