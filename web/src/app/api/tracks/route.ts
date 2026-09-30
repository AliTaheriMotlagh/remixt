import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getTracksByOwner, getStemsByTrack } from "@/lib/models";
import { storageProblem } from "@/lib/storage";
import { createTrackForUpload, splitTrackSchema } from "@/lib/trackUpload";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const ownedTracks = await getTracksByOwner(user.id);
  const tracks = await Promise.all(
    ownedTracks.map(async (t) => ({
      ...t,
      stems: t.status === "ready" ? await getStemsByTrack(t.id) : [],
    }))
  );

  return NextResponse.json({ tracks });
}

// The uploader's statement that they're allowed to share this song.
const createSchema = splitTrackSchema.extend({
  rightsConfirmed: z.literal(true, {
    error: "Confirm you have the right to upload this song",
  }),
});

// Songs are split in the browser (see lib/client/splitter.ts), so a track
// arrives here already analysed. This creates its rows and hands back one
// upload target per stem; the browser PUTs the MP3s there and then calls
// /api/tracks/<id>/complete (see lib/trackUpload.ts).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const problem = storageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const created = await createTrackForUpload(user.id, parsed.data);
  if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
  return NextResponse.json(created);
}
