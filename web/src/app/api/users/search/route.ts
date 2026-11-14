import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";

// Artists by name, for picking whom to share a take with. Signed-in only,
// and only what's on everyone's public profile anyway (name and colour).
// People you follow or who follow you come first.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (q.length < 2) return NextResponse.json({ users: [] });
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const users = await sql<{ id: string; artist_name: string; avatar_color: string }[]>`
    SELECT users.id, users.artist_name, users.avatar_color
    FROM users
    WHERE users.id <> ${user.id} AND users.artist_name ILIKE ${pattern}
    ORDER BY
      EXISTS (SELECT 1 FROM follows f WHERE (f.follower_id = ${user.id} AND f.followee_id = users.id)
                                          OR (f.followee_id = ${user.id} AND f.follower_id = users.id)) DESC,
      lower(users.artist_name) = lower(${q}) DESC,
      users.artist_name
    LIMIT 8
  `.catch(() =>
    sql<{ id: string; artist_name: string; avatar_color: string }[]>`
      SELECT id, artist_name, avatar_color FROM users
      WHERE id <> ${user.id} AND artist_name ILIKE ${pattern}
      ORDER BY artist_name LIMIT 8
    `
  );
  return NextResponse.json({ users }, { headers: { "Cache-Control": "private, no-store" } });
}
