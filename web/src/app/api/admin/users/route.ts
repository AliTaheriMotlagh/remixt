import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, isAdmin } from "@/lib/admin";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = `%${(req.nextUrl.searchParams.get("q") ?? "").trim()}%`;
  const users = await sql<{ email: string }[]>`
    SELECT users.id, users.email, users.artist_name, users.created_at,
           (SELECT COUNT(*) FROM tracks WHERE tracks.owner_id = users.id)::int AS songs,
           (SELECT COUNT(*) FROM remixes WHERE remixes.owner_id = users.id)::int AS remixes
    FROM users
    WHERE users.email ILIKE ${q} OR users.artist_name ILIKE ${q}
    ORDER BY users.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ users: users.map((u) => ({ ...u, admin: isAdmin(u) })) });
}
