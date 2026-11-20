import sql from "./db";
import { ensureSchema } from "./schema";
import { isAdmin } from "./admin";
import type { User } from "./auth";

// Who can see and hear a track. A song is public (uploaded to be remixed)
// or private to its owner and the people they share it with — a take
// recorded in the booth always starts private, and any upload can (see
// app/api/tracks/[id]/sharing). A public song can hold some of its parts
// back from the public library. The rules are in lib/songPrivacy.ts.

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
 * SQL condition: the stem (`stems`, joined to its `tracks`) is in
 * `userId`'s library — a public song's part that isn't held back, their
 * own, or shared with them (lib/songPrivacy.ts inLibraryOf).
 */
export function stemVisibleTo(userId: string | null | undefined) {
  const me = userId ?? "";
  return sql`(
    (tracks.visibility = 'public' AND NOT stems.held_back)
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
  // live.ts imports models.ts, which imports this file: loaded here, not at the top.
  await (await import("./live")).ensureLiveSchema();
  const me = user?.id ?? "";
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT (
      ${stemVisibleTo(me)}
      -- In a remix that can be heard: published, the listener's own, or on air in a live session.
      OR EXISTS (
        SELECT 1 FROM remix_lanes rl JOIN remixes r ON r.id = rl.remix_id
        WHERE rl.stem_id = stems.id
          AND (r.published OR r.owner_id = ${me}
               -- Asked to agree to publishing it: listens first.
               OR EXISTS (SELECT 1 FROM remix_consents rc WHERE rc.remix_id = r.id AND rc.owner_id = ${me})
               OR EXISTS (SELECT 1 FROM live_streams ls WHERE ls.remix_id = r.id AND ls.status = 'live'))
      )
      -- Played live by a host right now (their Studio's lanes).
      OR EXISTS (SELECT 1 FROM live_streams ls WHERE ls.status = 'live' AND position(stems.id IN ls.mix_json) > 0)
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
