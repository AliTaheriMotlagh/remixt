import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import sql from "@/lib/db";
import { ensureRemixStats } from "@/lib/models";

export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureRemixStats();
  const [row] = await sql`
    SELECT
      (SELECT COUNT(*) FROM users)::int AS users,
      (SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7 days')::int AS new_users,
      (SELECT COUNT(*) FROM tracks WHERE status = 'ready')::int AS songs,
      (SELECT COUNT(*) FROM tracks WHERE status = 'failed')::int AS failed_songs,
      (SELECT COUNT(*) FROM tracks WHERE status = 'processing')::int AS processing_songs,
      (SELECT COUNT(*) FROM remixes)::int AS remixes,
      (SELECT COUNT(*) FROM remixes WHERE published)::int AS published_remixes,
      (SELECT COALESCE(SUM(play_count), 0) FROM remixes)::int AS plays,
      (SELECT COUNT(*) FROM remix_likes)::int AS likes
  `;
  return NextResponse.json(row);
}
