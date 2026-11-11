import { NextRequest, NextResponse } from "next/server";
import type { LyricsResult } from "@/lib/lyrics";

// Finds a song's lyrics to sing along to in the Studio, from LRCLIB
// (lrclib.net): a free, open database of lyrics, many of them timed line
// by line (LRC). Fetched here rather than in the browser so the Studio
// doesn't depend on that site's CORS, and answers can be cached.
//
//   ?q=<song and/or artist>        a free search
//   ?track=<title>&artist=<name>   a search by title (and artist); a free
//                                  search on the title when that finds nothing

const BASE = "https://lrclib.net/api";
const MAX_RESULTS = 12;

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

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim().slice(0, 200) ?? "";
  const track = params.get("track")?.trim().slice(0, 200) ?? "";
  const artist = params.get("artist")?.trim().slice(0, 200) ?? "";
  if (!q && !track) return NextResponse.json({ error: "Type a song to look for" }, { status: 400 });

  const lookup = async (search: URLSearchParams) => {
    const res = await fetch(`${BASE}/search?${search}`, {
      headers: { "User-Agent": "Remixt Studio (lyrics for singing along)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const found = (await res.json()) as LrclibResult[];
    if (!Array.isArray(found)) throw new Error("unexpected answer");
    return found;
  };
  let found: LrclibResult[];
  try {
    found = await lookup(new URLSearchParams(track ? { track_name: track, ...(artist ? { artist_name: artist } : {}) } : { q }));
    // A title search wants the name exactly; when that misses, look for
    // the name anywhere instead (still the song's name, nothing else).
    if (found.length === 0 && track) found = await lookup(new URLSearchParams({ q: track }));
  } catch {
    return NextResponse.json({ error: "The lyrics library couldn't be reached — try again in a moment, or paste the words in yourself" }, { status: 502 });
  }

  const results: LyricsResult[] = found
    .filter((r) => r && typeof r.id === "number" && (r.plainLyrics || r.syncedLyrics || r.instrumental))
    // Timed lyrics first: they follow the song by themselves.
    .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics))
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      id: r.id,
      title: r.trackName ?? "Untitled",
      artist: r.artistName ?? "",
      album: r.albumName ?? "",
      duration: typeof r.duration === "number" ? r.duration : null,
      instrumental: !!r.instrumental,
      plain: r.plainLyrics ?? null,
      synced: r.syncedLyrics ?? null,
    }));

  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" } });
}
