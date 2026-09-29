import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { getTrackById, getStemsByTrack } from "@/lib/models";
import { ensureSchema } from "@/lib/schema";
import { normaliseTags } from "@/lib/tags";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const track = await getTrackById(id);
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
