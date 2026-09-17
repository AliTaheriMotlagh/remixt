import sql from "./db";

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
};

export type StemRow = {
  id: string;
  track_id: string;
  kind: "vocals" | "beat";
  file_url: string;
  peaks_json: string;
};

export type StemWithTrack = StemRow & {
  track_title: string;
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
  return sql<TrackRow[]>`
    SELECT * FROM tracks WHERE owner_id = ${ownerId} ORDER BY created_at DESC
  `;
}

export async function getStemsByTrack(trackId: string): Promise<StemRow[]> {
  return sql<StemRow[]>`SELECT * FROM stems WHERE track_id = ${trackId}`;
}

export async function getStemsByKindWithArtist(
  kind: "vocals" | "beat"
): Promise<StemWithTrack[]> {
  return sql<StemWithTrack[]>`
    SELECT stems.*, tracks.title as track_title, tracks.duration as track_duration,
           tracks.bpm as track_bpm, users.artist_name, users.id as artist_id
    FROM stems
    JOIN tracks ON tracks.id = stems.track_id
    JOIN users ON users.id = tracks.owner_id
    WHERE stems.kind = ${kind} AND tracks.status = 'ready'
    ORDER BY tracks.created_at DESC
  `;
}

export async function getStemById(id: string): Promise<StemWithTrack | undefined> {
  const rows = await sql<StemWithTrack[]>`
    SELECT stems.*, tracks.title as track_title, tracks.duration as track_duration,
           tracks.bpm as track_bpm, users.artist_name, users.id as artist_id
    FROM stems
    JOIN tracks ON tracks.id = stems.track_id
    JOIN users ON users.id = tracks.owner_id
    WHERE stems.id = ${id}
  `;
  return rows[0];
}
