import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { deleteTracks, isAdmin } from "@/lib/admin";
import sql from "@/lib/db";
import { getTrackById, getStemsByTrack } from "@/lib/models";
import { ensureSchema } from "@/lib/schema";
import { normaliseTags } from "@/lib/tags";
import { dropUnfinishedTrack } from "@/lib/trackUpload";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const track = await getTrackById(id);
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (track.visibility === "private") {
    const user = await getCurrentUser();
    const [shared] = user
      ? await sql`SELECT 1 FROM track_shares WHERE track_id = ${id} AND user_id = ${user.id}`
      : [];
    if (track.owner_id !== user?.id && !shared && !isAdmin(user)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const stems = track.status === "ready" ? await getStemsByTrack(id) : [];
  return NextResponse.json({ track, stems });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

/** The uploader can rename a song and change its tags. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const track = await getTrackById(id);
  if (!track || track.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await ensureSchema();
  const tags = parsed.data.tags ? normaliseTags(parsed.data.tags) : null;
  const [row] = await sql<{ title: string; tags: string[] }[]>`
    UPDATE tracks SET title = COALESCE(${parsed.data.title ?? null}, title), tags = COALESCE(${tags}, tags)
    WHERE id = ${id}
    RETURNING title, tags
  `;
  return NextResponse.json(row);
}

/**
 * The uploader deletes a song (or a take) of theirs. An unfinished one —
 * its browser gave up half-way — is simply dropped. A finished one goes
 * with its stem files; remixes that used it lose those lanes, so the
 * browser asks first (GET /api/tracks says how many remixes use each).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const track = await getTrackById(id);
  if (!track || track.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (track.status === "processing") {
    await dropUnfinishedTrack(id);
    return NextResponse.json({ id, dropped: true });
  }
  // A browser cleaning up after an upload it thinks failed: if the song
  // finished after all (the answer was lost on the way back), it stays.
  if (req.nextUrl.searchParams.get("unfinished")) {
    return NextResponse.json({ error: "Only an unfinished upload can be dropped" }, { status: 409 });
  }
  await deleteTracks([id]);
  return NextResponse.json({ id, deleted: true });
}
