import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureRemixStats, getRemixStats } from "@/lib/models";
import { notify } from "@/lib/notifications";

// Like (POST) or unlike (DELETE) a remix — one like per signed-in user.
async function setLiked(id: string, liked: boolean) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to like remixes" }, { status: 401 });
  await ensureRemixStats();

  const rows = await sql<{ owner_id: string }[]>`
    SELECT owner_id FROM remixes WHERE id = ${id} AND (published OR owner_id = ${user.id})
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (liked) {
    await sql`
      INSERT INTO remix_likes (remix_id, user_id) VALUES (${id}, ${user.id})
      ON CONFLICT DO NOTHING
    `;
    await notify({ userId: rows[0].owner_id, actorId: user.id, type: "like", remixId: id });
  } else {
    await sql`DELETE FROM remix_likes WHERE remix_id = ${id} AND user_id = ${user.id}`;
  }
  return NextResponse.json(await getRemixStats(id, user.id));
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setLiked((await params).id, true);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setLiked((await params).id, false);
}
