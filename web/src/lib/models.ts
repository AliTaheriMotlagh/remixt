import { cache } from "react";
import sql from "./db";
import type { StemKind } from "./stemKinds";
import { ensureSchema } from "./schema";

export type TrackRow = {
  id: string;
  owner_id: string;
  title: string;
  original_filename: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  duration: number | null;
  bpm: number | null;
  original_url: string;
  created_at: Date;
  /** Added by lib/schema.ts; missing on a database that predates it. */
  tags?: string[];
};

export type StemRow = {
  id: string;
  track_id: string;
  kind: StemKind;
  file_url: string;
  peaks_json: string;
};

export type StemWithTrack = StemRow & {
  track_title: string;
  track_tags: string[];
  track_duration: number | null;
  track_bpm: number | null;
  artist_name: string;
  artist_id: string;
};

export async function getTrackById(id: string): Promise<TrackRow | undefined> {
  const rows = await sql<TrackRow[]>`SELECT * FROM tracks WHERE id = ${id}`;
  return rows[0];
}

export async function getTracksByOwner(ownerId: string): Promise<TrackRow[]> {
  // A track sits in 'processing' from the moment the browser creates it
  // until both stems are uploaded (POST /api/tracks → .../complete). If the
  // tab is closed half-way, nothing is left to flip it, so sweep those out
  // here on every read rather than running a background job.
  await sql`
    UPDATE tracks
    SET status = 'failed',
        error = 'Splitting timed out or was interrupted — please try uploading again.'
    WHERE owner_id = ${ownerId} AND status = 'processing'
      AND created_at < now() - interval '20 minutes'
  `;
  return sql<TrackRow[]>`
    SELECT * FROM tracks WHERE owner_id = ${ownerId} ORDER BY created_at DESC
  `;
}

export async function getStemsByTrack(trackId: string): Promise<StemRow[]> {
  return sql<StemRow[]>`SELECT * FROM stems WHERE track_id = ${trackId}`;
}

export async function getStemsByKindWithArtist(
  kind: StemKind
): Promise<StemWithTrack[]> {
  await ensureSchema();
  return sql<StemWithTrack[]>`
    SELECT stems.*, tracks.title as track_title, tracks.tags as track_tags, tracks.duration as track_duration,
           tracks.bpm as track_bpm, users.artist_name, users.id as artist_id
    FROM stems
    JOIN tracks ON tracks.id = stems.track_id
    JOIN users ON users.id = tracks.owner_id
    WHERE stems.kind = ${kind} AND tracks.status = 'ready'
    ORDER BY tracks.created_at DESC
  `;
}

/** Every stem of every ready song, for the Library. */
export async function getLibraryStems(): Promise<StemWithTrack[]> {
  await ensureSchema();
  return sql<StemWithTrack[]>`
    SELECT stems.*, tracks.title as track_title, tracks.tags as track_tags, tracks.duration as track_duration,
           tracks.bpm as track_bpm, users.artist_name, users.id as artist_id
    FROM stems
    JOIN tracks ON tracks.id = stems.track_id
    JOIN users ON users.id = tracks.owner_id
    WHERE tracks.status = 'ready'
    ORDER BY tracks.created_at DESC
  `;
}

export async function getStemById(id: string): Promise<StemWithTrack | undefined> {
  const rows = await sql<StemWithTrack[]>`
    SELECT stems.*, tracks.title as track_title, '{}'::text[] as track_tags, tracks.duration as track_duration,
           tracks.bpm as track_bpm, users.artist_name, users.id as artist_id
    FROM stems
    JOIN tracks ON tracks.id = stems.track_id
    JOIN users ON users.id = tracks.owner_id
    WHERE stems.id = ${id}
  `;
  return rows[0];
}

// --- Remix listening stats ---------------------------------------------------

let statsSchema: Promise<void> | null = null;

/**
 * Creates the play-count column and likes table if this database predates
 * them (the same statements as scripts/schema.sql, which are idempotent).
 * Hosted databases don't get schema.sql re-run on deploy, so this saves a
 * manual migration; it runs once per server instance.
 */
export function ensureRemixStats(): Promise<void> {
  statsSchema ??= (async () => {
    await sql`ALTER TABLE remixes ADD COLUMN IF NOT EXISTS play_count INTEGER NOT NULL DEFAULT 0`;
    await sql`
      CREATE TABLE IF NOT EXISTS remix_likes (
        remix_id TEXT NOT NULL REFERENCES remixes(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (remix_id, user_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_remix_likes_user ON remix_likes(user_id)`;
  })();
  statsSchema.catch(() => (statsSchema = null));
  return statsSchema;
}

export type RemixStats = { plays: number; likes: number; liked: boolean };

export async function getRemixStats(remixId: string, userId: string | null): Promise<RemixStats> {
  await ensureRemixStats();
  const rows = await sql<RemixStats[]>`
    SELECT remixes.play_count AS plays,
           (SELECT COUNT(*) FROM remix_likes WHERE remix_id = remixes.id)::int AS likes,
           EXISTS (
             SELECT 1 FROM remix_likes WHERE remix_id = remixes.id AND user_id = ${userId ?? ""}
           ) AS liked
    FROM remixes WHERE remixes.id = ${remixId}
  `;
  return rows[0] ?? { plays: 0, likes: 0, liked: false };
}

export type RemixCard = {
  id: string;
  title: string;
  published: boolean;
  owner_id: string;
  artist_name: string;
  source_titles: string[];
  plays: number;
  likes: number;
};

/**
 * What a shared link needs to describe a remix — its title, artist, the
 * songs it's built from and its numbers. Cached per request, since the
 * page, its metadata and its share image all ask.
 */
export const getRemixCard = cache(async (id: string): Promise<RemixCard | undefined> => {
  await ensureRemixStats();
  const rows = await sql<(Omit<RemixCard, "source_titles"> & { source_titles: string | null })[]>`
    SELECT remixes.id, remixes.title, remixes.published, remixes.owner_id, users.artist_name,
           remixes.play_count AS plays,
           (SELECT COUNT(*) FROM remix_likes WHERE remix_likes.remix_id = remixes.id)::int AS likes,
           (SELECT STRING_AGG(DISTINCT tracks.title, '\u0001') FROM remix_lanes
              JOIN stems ON stems.id = remix_lanes.stem_id
              JOIN tracks ON tracks.id = stems.track_id
             WHERE remix_lanes.remix_id = remixes.id) AS source_titles
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.id = ${id}
  `;
  const row = rows[0];
  return row && { ...row, source_titles: row.source_titles ? row.source_titles.split("\u0001") : [] };
});
