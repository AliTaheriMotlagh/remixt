import { NextRequest, NextResponse } from "next/server";
import { findCoverOnline } from "@/lib/coverLookup";

// A song's cover found online by its name (and artist), for an upload
// whose file has no picture inside (see lib/client/songCovers.ts).
//
//   ?title=<the file's name or the song's title>&artist=<optional>
//
// → { url, title, artist } — the picture (600 px, from Apple's catalogue,
//   which lets a page draw it) and the song it's of; 204 when there's none
//   surely of this song; 503 when the catalogue couldn't be asked just now.

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const title = params.get("title")?.trim().slice(0, 200) ?? "";
  const artist = params.get("artist")?.trim().slice(0, 200) ?? "";
  if (!title) return NextResponse.json({ error: "Which song?" }, { status: 400 });
  const cover = await findCoverOnline(title, artist);
  if (cover === undefined) return NextResponse.json({ error: "Try again in a minute" }, { status: 503, headers: { "Retry-After": "60" } });
  if (!cover) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "public, max-age=3600" } });
  return NextResponse.json(cover, { headers: { "Cache-Control": "public, max-age=86400" } });
}
