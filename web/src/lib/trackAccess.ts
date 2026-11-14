import sql from "./db";
import { ensureSchema } from "./schema";
import { isAdmin } from "./admin";
import type { User } from "./auth";

// Who can see and hear a track. Songs are public: they're uploaded to be
// remixed. A take recorded in the Studio's booth is private to whoever
// sang it, until they share it — with chosen people, or with everyone
// (see app/api/tracks/[id]/sharing).

export type Visibility = "public" | "private";

/**
 * SQL condition: `tracks` (as joined in the query) is in `userId`'s
 * library — public, theirs, or shared with them.
 */
export function visibleTo(userId: string | null | undefined) {
  const me = userId ?? "";
  return sql`(
    tracks.visibility = 'public'
    OR tracks.owner_id = ${me}
    OR EXISTS (SELECT 1 FROM track_shares ts WHERE ts.track_id = tracks.id AND ts.user_id = ${me})
  )`;
}

/**
 * Whether `user` may play this stem. Beyond the library (visibleTo),
 * a private take plays wherever its owner put it to be heard: in a remix
 * (published remixes and live sessions play their lanes for everyone), a
 * challenge, or a shared project the listener belongs to.
 */
export async function canHearStem(stemId: string, user: User | null): Promise<boolean> {
  if (isAdmin(user)) return true;
  await ensureSchema();
  const me = user?.id ?? "";
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT (
      ${visibleTo(me)}
      OR EXISTS (SELECT 1 FROM remix_lanes rl WHERE rl.stem_id = stems.id)
      OR EXISTS (SELECT 1 FROM challenges c WHERE c.vocal_stem_id = stems.id OR c.beat_stem_id = stems.id)
      OR (${me} <> '' AND EXISTS (
        SELECT 1 FROM projects p
        WHERE position(stems.id IN p.state_json) > 0
          AND (p.owner_id = ${me} OR EXISTS (
            SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${me}
          ))
      ))
    ) AS ok
    FROM stems JOIN tracks ON tracks.id = stems.track_id
    WHERE stems.id = ${stemId}
  `;
  return !!row?.ok;
}
