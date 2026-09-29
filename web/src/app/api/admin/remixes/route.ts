import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import sql from "@/lib/db";
import { ensureRemixStats } from "@/lib/models";

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureRemixStats();
  const q = `%${(req.nextUrl.searchParams.get("q") ?? "").trim()}%`;
  const remixes = await sql`
    SELECT remixes.id, remixes.title, remixes.published, remixes.created_at, remixes.play_count,
           users.id AS owner_id, users.artist_name, users.email,
           (SELECT COUNT(*) FROM remix_likes WHERE remix_likes.remix_id = remixes.id)::int AS likes,
           (SELECT COUNT(*) FROM remix_lanes WHERE remix_lanes.remix_id = remixes.id)::int AS lanes
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.title ILIKE ${q} OR users.artist_name ILIKE ${q} OR users.email ILIKE ${q}
    ORDER BY remixes.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ remixes });
}
