import { NextRequest, NextResponse } from "next/server";
import { askerOf, searchMusicSites } from "@/lib/musicSites";

// Finds a song on Iranian music sites, to bring into the Studio:
//
//   GET ?q=<song and/or artist, in Persian or Finglish>
//   → { pages: [{ title, artist, url, site }] }
//
// Each page is a song's page with its MP3 on it; the Studio hands the page
// to /api/import (as the Upload page does with a pasted link), which
// downloads the MP3 from it.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return NextResponse.json({ error: "Type a song to look for" }, { status: 400 });
  const pages = await searchMusicSites(q, askerOf(req.headers)).catch(() => []);
  return NextResponse.json({ pages }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" } });
}
