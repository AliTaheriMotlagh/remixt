import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { getStemsByTrack, getTrackById } from "@/lib/models";
import { storedObject } from "@/lib/storage";

// The browser calls this once both stems are uploaded. The track only goes
// "ready" — and into everyone's library — if both files really exist.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;
  const track = await getTrackById(id);
  if (!track || track.owner_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stems = await getStemsByTrack(id);
  const stored = await Promise.all(stems.map((s) => storedObject(s.file_url)));
  if (stems.length !== 2 || stored.some((object) => !object?.size)) {
    return NextResponse.json({ error: "The stems haven't finished uploading" }, { status: 409 });
  }

  await sql.begin(async (tx) => {
    // Blob gives each file its own public URL; keep it, so playback can
    // redirect straight there (see /api/audio/stem/[id]).
    for (let i = 0; i < stems.length; i++) {
      const url = stored[i]?.url;
      if (url) await tx`UPDATE stems SET file_url = ${url} WHERE id = ${stems[i].id}`;
    }
    await tx`UPDATE tracks SET status = 'ready', error = NULL WHERE id = ${id}`;
  });
  return NextResponse.json({ id, status: "ready" });
}
