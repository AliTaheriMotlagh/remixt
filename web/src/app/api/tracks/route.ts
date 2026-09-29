import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { getTracksByOwner, getStemsByTrack } from "@/lib/models";
import { createUploadTarget } from "@/lib/storage";

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

const peaksSchema = z.array(z.number().min(0).max(1)).max(2000);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  filename: z.string().min(1).max(300),
  duration: z.number().positive().max(20 * 60),
  bpm: z.number().min(20).max(300).nullable(),
  vocalsPeaks: peaksSchema,
  beatPeaks: peaksSchema,
});

// Songs are split in the browser (see lib/client/separator.ts), so a track
// arrives here already analysed. This creates its rows and hands back one
// upload target per stem; the browser PUTs the MP3s there and then calls
// /api/tracks/<id>/complete. Until then the track stays "processing" —
// and an abandoned upload gets swept to "failed" like any stuck track.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { title, filename, duration, bpm, vocalsPeaks, beatPeaks } = parsed.data;

  const trackId = randomUUID();
  const keys = {
    vocals: `stems/${trackId}/vocals.mp3`,
    beat: `stems/${trackId}/beat.mp3`,
  };

  await sql.begin(async (tx) => {
    // original_url stays empty: the original never leaves the browser.
    await tx`
      INSERT INTO tracks (id, owner_id, title, original_filename, status, duration, bpm, original_url)
      VALUES (${trackId}, ${user.id}, ${title}, ${filename}, 'processing', ${duration}, ${bpm}, '')
    `;
    await tx`
      INSERT INTO stems (id, track_id, kind, file_url, peaks_json) VALUES
        (${randomUUID()}, ${trackId}, 'vocals', ${keys.vocals}, ${JSON.stringify(vocalsPeaks)}),
        (${randomUUID()}, ${trackId}, 'beat', ${keys.beat}, ${JSON.stringify(beatPeaks)})
    `;
  });

  const [vocals, beat] = await Promise.all([
    createUploadTarget(keys.vocals, `/api/tracks/${trackId}/stems/vocals`),
    createUploadTarget(keys.beat, `/api/tracks/${trackId}/stems/beat`),
  ]);

  return NextResponse.json({ id: trackId, uploads: { vocals, beat } });
}
