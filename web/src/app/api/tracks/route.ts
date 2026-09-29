import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { getTracksByOwner, getStemsByTrack } from "@/lib/models";
import { createUploadTarget, storageProblem } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";
import { normaliseTags } from "@/lib/tags";
import { STEM_KINDS, type StemKind } from "@/lib/stemKinds";

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
  /** Missing for a vocal recorded in the Studio, which has no beat. */
  beatPeaks: peaksSchema.optional(),
  /** A vocal recorded in the Studio rather than a song split into stems. */
  recording: z.boolean().default(false),
  /** The beat's drums, bass and other parts, when the browser split them out too. */
  partPeaks: z
    .object({ drums: peaksSchema.optional(), bass: peaksSchema.optional(), other: peaksSchema.optional() })
    .default({}),
  tags: z.array(z.string().max(40)).max(20).default([]),
  // The uploader's statement that they're allowed to share this song.
  rightsConfirmed: z.literal(true, {
    error: "Confirm you have the right to upload this song",
  }),
});

// Songs are split in the browser (see lib/client/separator.ts), so a track
// arrives here already analysed. This creates its rows and hands back one
// upload target per stem; the browser PUTs the MP3s there and then calls
// /api/tracks/<id>/complete. Until then the track stays "processing" —
// and an abandoned upload gets swept to "failed" like any stuck track.
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
  const { title, filename, duration, bpm, vocalsPeaks, beatPeaks } = parsed.data;
  await ensureSchema();
  const tags = normaliseTags(parsed.data.tags);

  const trackId = randomUUID();
  if (!parsed.data.recording && !beatPeaks) {
    return NextResponse.json({ error: "A split song needs its beat" }, { status: 400 });
  }
  const peaks: Partial<Record<StemKind, number[]>> = parsed.data.recording
    ? { vocals: vocalsPeaks }
    : { vocals: vocalsPeaks, beat: beatPeaks, ...parsed.data.partPeaks };
  const kinds = STEM_KINDS.filter((kind) => peaks[kind]);

  await sql.begin(async (tx) => {
    // original_url stays empty: the original never leaves the browser.
    await tx`
      INSERT INTO tracks (id, owner_id, title, original_filename, status, duration, bpm, original_url,
                          tags, rights_confirmed_at)
      VALUES (${trackId}, ${user.id}, ${title}, ${filename}, 'processing', ${duration}, ${bpm}, '',
              ${tags}, now())
    `;
    for (const kind of kinds) {
      await tx`
        INSERT INTO stems (id, track_id, kind, file_url, peaks_json)
        VALUES (${randomUUID()}, ${trackId}, ${kind}, ${`stems/${trackId}/${kind}.mp3`}, ${JSON.stringify(peaks[kind])})
      `;
    }
  });

  const targets = await Promise.all(
    kinds.map((kind) => createUploadTarget(`stems/${trackId}/${kind}.mp3`, `/api/tracks/${trackId}/stems/${kind}`))
  );
  const uploads = Object.fromEntries(kinds.map((kind, i) => [kind, targets[i]]));

  return NextResponse.json({ id: trackId, uploads });
}
