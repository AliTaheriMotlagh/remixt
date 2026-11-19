import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { ensureMonetizeSchema } from "@/lib/monetize/store";

// The songs a published remix uses that an artist could claim (not booth
// takes — those pay their singer already), and whether one is verified.
export async function GET(req: NextRequest) {
  const remixId = req.nextUrl.searchParams.get("remix") ?? "";
  await ensureMonetizeSchema();
  const songs = await sql<{ id: string; title: string; verified: boolean }[]>`
    SELECT DISTINCT tracks.id, tracks.title,
           EXISTS (SELECT 1 FROM rights_claims rc WHERE rc.track_id = tracks.id AND rc.status = 'verified') AS verified
    FROM remix_lanes
    JOIN remixes ON remixes.id = remix_lanes.remix_id AND remixes.published
    JOIN stems ON stems.id = remix_lanes.stem_id
    JOIN tracks ON tracks.id = stems.track_id
    WHERE remix_lanes.remix_id = ${remixId} AND NOT ('studio recording' = ANY(tracks.tags))
  `;
  return NextResponse.json({ songs });
}
