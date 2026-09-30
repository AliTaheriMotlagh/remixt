import { randomUUID } from "crypto";
import sql from "./db";
import { ensureSchema } from "./schema";

// "X liked / commented on / remixed your …" — written when it happens,
// read from the bell in the nav bar. Nobody is told about their own
// actions, and toggling a like on and off doesn't send a pile of them.

export type NotificationType = "like" | "comment" | "follow" | "remix" | "challenge" | "split";

export type Notification = {
  id: string;
  type: NotificationType;
  created_at: string;
  read_at: string | null;
  body: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_color: string | null;
  remix_id: string | null;
  remix_title: string | null;
  track_title: string | null;
};

export async function notify({
  userId,
  actorId,
  type,
  remixId = null,
  trackId = null,
  body = null,
}: {
  userId: string;
  actorId: string | null;
  type: NotificationType;
  remixId?: string | null;
  trackId?: string | null;
  body?: string | null;
}) {
  if (actorId && userId === actorId) return;
  try {
    await ensureSchema();
    await sql`
      INSERT INTO notifications (id, user_id, actor_id, type, remix_id, track_id, body)
      SELECT ${randomUUID()}, ${userId}, ${actorId}, ${type}, ${remixId}, ${trackId}, ${body}
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE user_id = ${userId} AND type = ${type}
          AND actor_id IS NOT DISTINCT FROM ${actorId}
          AND remix_id IS NOT DISTINCT FROM ${remixId}
          AND track_id IS NOT DISTINCT FROM ${trackId}
          AND ${type} <> 'comment'
          AND created_at > now() - interval '1 day'
      )
    `;
  } catch (err) {
    // A notification that didn't go out must never fail the like/comment itself.
    console.error("notify failed", err);
  }
}

/** Tells the owners of every song a new remix uses (and of the remix it came from). */
export async function notifyRemixCreated(remixId: string, actorId: string) {
  await ensureSchema();
  const owners = await sql<{ owner_id: string; track_id: string }[]>`
    SELECT DISTINCT ON (tracks.owner_id) tracks.owner_id, tracks.id AS track_id
    FROM remix_lanes
    JOIN stems ON stems.id = remix_lanes.stem_id
    JOIN tracks ON tracks.id = stems.track_id
    WHERE remix_lanes.remix_id = ${remixId}
  `;
  const [parent] = await sql<{ owner_id: string; title: string }[]>`
    SELECT parent.owner_id, parent.title FROM remixes
    JOIN remixes parent ON parent.id = remixes.parent_id
    WHERE remixes.id = ${remixId}
  `;
  const told = new Set<string>();
  if (parent) {
    told.add(parent.owner_id);
    await notify({ userId: parent.owner_id, actorId, type: "remix", remixId, body: `your remix “${parent.title}”` });
  }
  for (const owner of owners) {
    if (told.has(owner.owner_id)) continue;
    told.add(owner.owner_id);
    await notify({ userId: owner.owner_id, actorId, type: "remix", remixId, trackId: owner.track_id });
  }
}

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  await ensureSchema();
  return sql<Notification[]>`
    SELECT n.id, n.type, n.created_at, n.read_at, n.body,
           actor.id AS actor_id, actor.artist_name AS actor_name, actor.avatar_color AS actor_color,
           remixes.id AS remix_id, remixes.title AS remix_title, tracks.title AS track_title
    FROM notifications n
    LEFT JOIN users actor ON actor.id = n.actor_id
    LEFT JOIN remixes ON remixes.id = n.remix_id
    LEFT JOIN tracks ON tracks.id = n.track_id
    WHERE n.user_id = ${userId}
    ORDER BY n.created_at DESC
    LIMIT ${limit}
  `;
}

export async function unreadCount(userId: string): Promise<number> {
  await ensureSchema();
  const [row] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ${userId} AND read_at IS NULL
  `;
  return row.n;
}

export async function markAllRead(userId: string) {
  await ensureSchema();
  await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL`;
}
