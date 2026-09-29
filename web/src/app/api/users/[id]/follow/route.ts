import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { getFollowState, setFollowing } from "@/lib/social";
import { notify } from "@/lib/notifications";

// Follow (POST) or unfollow (DELETE) an artist.
async function handle(id: string, follow: boolean) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to follow artists" }, { status: 401 });
  if (user.id === id) return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
  const [artist] = await sql`SELECT 1 FROM users WHERE id = ${id}`;
  if (!artist) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await setFollowing(user.id, id, follow);
  if (follow) await notify({ userId: id, actorId: user.id, type: "follow" });
  return NextResponse.json(await getFollowState(id, user.id));
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle((await params).id, true);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle((await params).id, false);
}
