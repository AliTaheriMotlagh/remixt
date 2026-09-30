import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTrackById } from "@/lib/models";
import { finishTrackUpload } from "@/lib/trackUpload";

// The browser calls this once every stem is uploaded (vocals and beat, and
// on newer splits the drums, bass and other parts). The track only goes
// "ready" — and into everyone's library — if all the files really exist.
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
  if (!(await finishTrackUpload(id))) {
    return NextResponse.json({ error: "The stems haven't finished uploading" }, { status: 409 });
  }
  return NextResponse.json({ id, status: "ready" });
}
