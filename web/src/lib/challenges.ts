import { randomUUID } from "crypto";
import sql from "./db";
import { ensureSchema } from "./schema";
import type { StemKind } from "./stemKinds";

// Remix challenges: an admin picks one vocal and one beat and a window of
// time; everyone remixes the same pair, and entries (published remixes
// saved from the challenge) are ranked by likes, then plays.

export type ChallengeStem = {
  id: string;
  kind: StemKind;
  peaks_json: string;
  track_title: string;
  track_duration: number | null;
  track_bpm: number | null;
  artist_name: string;
  artist_id: string;
};

export type Challenge = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  status: "upcoming" | "running" | "ended";
  entries: number;
  vocal: ChallengeStem | null;
  beat: ChallengeStem | null;
};

export type ChallengeEntry = {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  likes: number;
  plays: number;
};

type Row = Omit<Challenge, "vocal" | "beat" | "status"> & { vocal_stem_id: string | null; beat_stem_id: string | null };

async function stemsById(ids: string[]): Promise<Map<string, ChallengeStem>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<ChallengeStem[]>`
    SELECT stems.id, stems.kind, stems.peaks_json, tracks.title AS track_title, tracks.duration AS track_duration,
           tracks.bpm AS track_bpm, users.artist_name, users.id AS artist_id
    FROM stems JOIN tracks ON tracks.id = stems.track_id JOIN users ON users.id = tracks.owner_id
    WHERE stems.id IN ${sql(ids)}
  `;
  return new Map(rows.map((r) => [r.id, r]));
}

function statusOf(row: Pick<Row, "starts_at" | "ends_at">): Challenge["status"] {
  const now = Date.now();
  if (new Date(row.starts_at).getTime() > now) return "upcoming";
  return new Date(row.ends_at).getTime() > now ? "running" : "ended";
}

async function hydrate(rows: Row[]): Promise<Challenge[]> {
  const stems = await stemsById(
    rows.flatMap((r) => [r.vocal_stem_id, r.beat_stem_id]).filter((id): id is string => !!id)
  );
  return rows.map(({ vocal_stem_id, beat_stem_id, ...row }) => ({
    ...row,
    status: statusOf(row),
    vocal: vocal_stem_id ? (stems.get(vocal_stem_id) ?? null) : null,
    beat: beat_stem_id ? (stems.get(beat_stem_id) ?? null) : null,
  }));
}

export async function listChallenges(): Promise<Challenge[]> {
  await ensureSchema();
  const rows = await sql<Row[]>`
    SELECT challenges.*,
           (SELECT COUNT(*) FROM remixes WHERE remixes.challenge_id = challenges.id AND remixes.published)::int AS entries
    FROM challenges
    ORDER BY (ends_at > now()) DESC, starts_at DESC
    LIMIT 50
  `;
  return hydrate(rows);
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  await ensureSchema();
  const rows = await sql<Row[]>`
    SELECT challenges.*,
           (SELECT COUNT(*) FROM remixes WHERE remixes.challenge_id = challenges.id AND remixes.published)::int AS entries
    FROM challenges WHERE id = ${id}
  `;
  return (await hydrate(rows))[0] ?? null;
}

export async function challengeEntries(id: string, limit = 50): Promise<ChallengeEntry[]> {
  await ensureSchema();
  return sql<ChallengeEntry[]>`
    SELECT remixes.id, remixes.title, users.id AS artist_id, users.artist_name,
           (SELECT COUNT(*) FROM remix_likes l WHERE l.remix_id = remixes.id AND l.user_id <> remixes.owner_id)::int AS likes,
           remixes.play_count AS plays
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.challenge_id = ${id} AND remixes.published
    ORDER BY likes DESC, plays DESC, remixes.created_at ASC
    LIMIT ${limit}
  `;
}

export async function createChallenge(input: {
  title: string;
  description: string;
  vocalStemId: string;
  beatStemId: string;
  startsAt: Date;
  endsAt: Date;
  createdBy: string;
}): Promise<string> {
  await ensureSchema();
  const id = randomUUID();
  await sql`
    INSERT INTO challenges (id, title, description, vocal_stem_id, beat_stem_id, starts_at, ends_at, created_by)
    VALUES (${id}, ${input.title}, ${input.description}, ${input.vocalStemId}, ${input.beatStemId},
            ${input.startsAt}, ${input.endsAt}, ${input.createdBy})
  `;
  return id;
}

export async function deleteChallenge(id: string) {
  await ensureSchema();
  await sql`DELETE FROM challenges WHERE id = ${id}`;
}
