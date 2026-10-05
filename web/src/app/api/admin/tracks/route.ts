import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureSchema();
  const q = `%${(req.nextUrl.searchParams.get("q") ?? "").trim()}%`;
  const status = req.nextUrl.searchParams.get("status");
  const tracks = await sql`
    SELECT tracks.id, tracks.title, tracks.status, tracks.error, tracks.duration, tracks.bpm,
           tracks.created_at, tracks.featured_example, tracks.example_credit, users.id AS owner_id, users.artist_name, users.email,
           (SELECT COUNT(DISTINCT remix_lanes.remix_id) FROM remix_lanes
              JOIN stems ON stems.id = remix_lanes.stem_id
             WHERE stems.track_id = tracks.id)::int AS used_in_remixes
    FROM tracks JOIN users ON users.id = tracks.owner_id
    WHERE (tracks.title ILIKE ${q} OR users.artist_name ILIKE ${q} OR users.email ILIKE ${q})
      AND (${status ?? ""} = '' OR tracks.status = ${status ?? ""})
    ORDER BY tracks.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ tracks });
}
