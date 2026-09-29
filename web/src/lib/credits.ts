import sql from "./db";
import { ensureSchema } from "./schema";

// Who and what a remix is built from — the songs (and their artists) its
// lanes come from, the remix it was remixed from — and what was remixed
// from it in turn.

export type RemixCredits = {
  sources: { kind: string; track_title: string; artist_id: string; artist_name: string }[];
  parent: { id: string; title: string; artist_name: string; published: boolean } | null;
  children: { id: string; title: string; artist_name: string }[];
  tags: string[];
  challenge: { id: string; title: string } | null;
};

export async function getRemixCredits(remixId: string): Promise<RemixCredits> {
  await ensureSchema();
  const [sources, [remix], children] = await Promise.all([
    sql<RemixCredits["sources"]>`
      SELECT DISTINCT stems.kind, tracks.title AS track_title, users.id AS artist_id, users.artist_name
      FROM remix_lanes
      JOIN stems ON stems.id = remix_lanes.stem_id
      JOIN tracks ON tracks.id = stems.track_id
      JOIN users ON users.id = tracks.owner_id
      WHERE remix_lanes.remix_id = ${remixId}
      ORDER BY stems.kind DESC, tracks.title
    `,
    sql<
      {
        tags: string[];
        parent_id: string | null;
        parent_title: string | null;
        parent_artist: string | null;
        parent_published: boolean | null;
        challenge_id: string | null;
        challenge_title: string | null;
      }[]
    >`
      SELECT remixes.tags, parent.id AS parent_id, parent.title AS parent_title,
             parent_owner.artist_name AS parent_artist, parent.published AS parent_published,
             challenges.id AS challenge_id, challenges.title AS challenge_title
      FROM remixes
      LEFT JOIN remixes parent ON parent.id = remixes.parent_id
      LEFT JOIN users parent_owner ON parent_owner.id = parent.owner_id
      LEFT JOIN challenges ON challenges.id = remixes.challenge_id
      WHERE remixes.id = ${remixId}
    `,
    sql<RemixCredits["children"]>`
      SELECT remixes.id, remixes.title, users.artist_name
      FROM remixes JOIN users ON users.id = remixes.owner_id
      WHERE remixes.parent_id = ${remixId} AND remixes.published
      ORDER BY remixes.created_at DESC
      LIMIT 24
    `,
  ]);
  return {
    sources,
    parent:
      remix?.parent_id && remix.parent_title
        ? {
            id: remix.parent_id,
            title: remix.parent_title,
            artist_name: remix.parent_artist ?? "",
            published: !!remix.parent_published,
          }
        : null,
    children,
    tags: remix?.tags ?? [],
    challenge: remix?.challenge_id ? { id: remix.challenge_id, title: remix.challenge_title ?? "" } : null,
  };
}
