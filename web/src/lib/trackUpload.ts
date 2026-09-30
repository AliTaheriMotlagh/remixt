import { randomUUID } from "crypto";
import { z } from "zod";
import sql from "./db";
import { getStemsByTrack } from "./models";
import { ensureSchema } from "./schema";
import { createUploadTarget, storedObject, type UploadTarget } from "./storage";
import { normaliseTags } from "./tags";
import { STEM_KINDS, type StemKind } from "./stemKinds";

// Songs are split in a browser — the uploader's own, or a helper's for a
// song queued from a phone (see splitQueue.ts) — so a track arrives
// already analysed. These create its rows, hand back one upload target per
// stem, and flip it to "ready" once the stems are really there.

const peaksSchema = z.array(z.number().min(0).max(1)).max(2000);

/** What the browser that split a song sends about it. */
export const splitTrackSchema = z.object({
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
});

export type SplitTrack = z.infer<typeof splitTrackSchema>;

/**
 * Creates a "processing" track owned by `ownerId` and returns where each
 * stem goes. Until /complete (finishTrackUpload) it stays processing — and
 * an abandoned upload gets swept to "failed" like any stuck track.
 */
export async function createTrackForUpload(
  ownerId: string,
  data: SplitTrack
): Promise<{ id: string; uploads: Record<string, UploadTarget> } | { error: string }> {
  if (!data.recording && !data.beatPeaks) return { error: "A split song needs its beat" };
  await ensureSchema();
  const tags = normaliseTags(data.tags);
  const trackId = randomUUID();
  const peaks: Partial<Record<StemKind, number[]>> = data.recording
    ? { vocals: data.vocalsPeaks }
    : { vocals: data.vocalsPeaks, beat: data.beatPeaks, ...data.partPeaks };
  const kinds = STEM_KINDS.filter((kind) => peaks[kind]);

  await sql.begin(async (tx) => {
    // original_url stays empty: the original isn't kept.
    await tx`
      INSERT INTO tracks (id, owner_id, title, original_filename, status, duration, bpm, original_url,
                          tags, rights_confirmed_at)
      VALUES (${trackId}, ${ownerId}, ${data.title}, ${data.filename}, 'processing', ${data.duration}, ${data.bpm}, '',
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
  return { id: trackId, uploads: Object.fromEntries(kinds.map((kind, i) => [kind, targets[i]])) };
}

/**
 * Marks a track ready once every stem made for it is really in storage —
 * two or five for a split song, one for a vocal recorded in the Studio.
 * Returns false (and changes nothing) while any is missing.
 */
export async function finishTrackUpload(trackId: string): Promise<boolean> {
  const stems = await getStemsByTrack(trackId);
  const stored = await Promise.all(stems.map((s) => storedObject(s.file_url)));
  if (stems.length === 0 || stored.some((object) => !object?.size)) return false;

  await sql.begin(async (tx) => {
    // Blob gives each file its own public URL; keep it, so playback can
    // redirect straight there (see /api/audio/stem/[id]).
    for (let i = 0; i < stems.length; i++) {
      const url = stored[i]?.url;
      if (url) await tx`UPDATE stems SET file_url = ${url} WHERE id = ${stems[i].id}`;
    }
    await tx`UPDATE tracks SET status = 'ready', error = NULL WHERE id = ${trackId}`;
  });
  return true;
}
