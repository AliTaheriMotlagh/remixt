import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStemsByTrack, getTrackById } from "@/lib/models";
import { MAX_STEM_BYTES as MAX_BYTES, writeStorageStream } from "@/lib/storage";

// Upload target for the local-disk storage backend. (With Blob or R2 the
// browser uploads straight to the store and never calls this.) Only the
// track's owner can write, only while the track is still being created.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { id, kind } = await params;
  const track = await getTrackById(id);
  if (!track || track.owner_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (track.status !== "processing") {
    return NextResponse.json({ error: "This track is already finished" }, { status: 409 });
  }
  const stem = (await getStemsByTrack(id)).find((s) => s.kind === kind);
  if (!stem) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!req.body) return NextResponse.json({ error: "Empty upload" }, { status: 400 });

  const bytes = await writeStorageStream(stem.file_url, req.body, MAX_BYTES);
  if (bytes > MAX_BYTES) {
    return NextResponse.json({ error: "Stem is too large" }, { status: 413 });
  }
  if (bytes === 0) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
