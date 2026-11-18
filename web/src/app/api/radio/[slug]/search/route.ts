import { NextRequest, NextResponse } from "next/server";
import { searchCatalogue } from "@/lib/radio";
import { stationFor } from "@/lib/radioRequest";

// Songs and remixes this station can play, for requests and the playlist.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await stationFor(slug);
  if ("error" in found) return found.error;
  const items = await searchCatalogue(req.nextUrl.searchParams.get("q") ?? "", found.station.settings, 40);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, max-age=10" } });
}
