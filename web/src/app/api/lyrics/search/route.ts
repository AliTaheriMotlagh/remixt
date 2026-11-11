import { NextRequest, NextResponse } from "next/server";
import type { LyricsResult } from "@/lib/lyrics";
import { hasSureMatch, libraryQueries, rankCandidates, type LibraryQuery } from "@/lib/lyricsSearch";

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
  if (found.length === 0 && failed > 0) {
    return NextResponse.json({ error: "The lyrics library couldn't be reached — try again in a moment, or paste the words in yourself" }, { status: 502 });
  }

  const candidates = found.filter((r) => r && typeof r.id === "number" && (r.plainLyrics || r.syncedLyrics || r.instrumental)).map(toResult);
  const results = rankCandidates(candidates, wanted, duration).slice(0, MAX_RESULTS);

  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" } });
}

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
