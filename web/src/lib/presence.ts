import sql from "./db";
import { ensureSchema } from "./schema";

// Who's on the site right now, and what's been happening — the live side
// of the home page. Every open tab sends a heartbeat every
// HEARTBEAT_SECONDS while it's visible (components/PresenceHeartbeat);
// anyone heard from in the last ONLINE_SECONDS counts as online. A guest is
// a random id their browser keeps, so two tabs are one visitor; a signed-in
// artist is counted once however many devices they're on.
//
// The activity feed isn't stored anywhere: it's read back from the tables
// that already record each thing (remixes, tracks, likes, comments, follows).

export const HEARTBEAT_SECONDS = 30;
const ONLINE_SECONDS = 75;

/** Where on the site someone is, from the page they're on. */
export const AREAS = ["studio", "library", "upload", "listening", "challenges", "browsing"] as const;
export type Area = (typeof AREAS)[number];

export function areaFor(pathname: string): Area {
  if (pathname.startsWith("/studio")) return "studio";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/upload")) return "upload";
  if (pathname.startsWith("/remixes") || pathname.startsWith("/artist")) return "listening";
  if (pathname.startsWith("/challenges") || pathname.startsWith("/leaderboard")) return "challenges";
  return "browsing";
}

let schema: Promise<void> | null = null;

/** Creates the table on first use, so a database that missed the migration still works. */
export function ensurePresenceSchema(): Promise<void> {
  schema ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS presence (
        session_id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        area TEXT NOT NULL DEFAULT 'browsing',
        last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen)`;
  })();
  schema.catch(() => (schema = null));
  return schema;
}

/** Records that a visitor is here, and where. */
export async function heartbeat(sessionId: string, userId: string | null, area: Area) {
  await ensurePresenceSchema();
  await sql`
    INSERT INTO presence (session_id, user_id, area, last_seen)
    VALUES (${sessionId}, ${userId}, ${area}, now())
    ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, area = EXCLUDED.area, last_seen = now()
  `;
  // Long-gone visitors are only clutter; sweep them now and then.
  if (Math.random() < 0.02) await sql`DELETE FROM presence WHERE last_seen < now() - interval '1 hour'`;
}

export type OnlineArtist = { id: string; artist_name: string; avatar_color: string; area: Area };

export type PresenceSnapshot = {
  /** Everyone online: guests and signed-in artists. */
  online: number;
  /** Online, broken down by where they are. */
  areas: Partial<Record<Area, number>>;
  /** Some of the signed-in artists online, most recently active first. */
  artists: OnlineArtist[];
  /** How many signed-in artists are online in all (`artists` is capped). */
  artistCount: number;
};

export async function presenceSnapshot(limit = 16): Promise<PresenceSnapshot> {
  await ensurePresenceSchema();
  const since = sql`now() - make_interval(secs => ${ONLINE_SECONDS})`;
  // One row per person: a signed-in artist's latest tab, or a guest's id.
  const [areaRows, artists] = await Promise.all([
    sql<{ area: Area; n: number }[]>`
      SELECT area, COUNT(*)::int AS n FROM (
        SELECT DISTINCT ON (COALESCE(user_id, session_id)) area
        FROM presence WHERE last_seen > ${since}
        ORDER BY COALESCE(user_id, session_id), last_seen DESC
      ) people
      GROUP BY area
    `,
    sql<(OnlineArtist & { total: number })[]>`
      SELECT users.id, users.artist_name, users.avatar_color, latest.area, COUNT(*) OVER ()::int AS total
      FROM (
        SELECT DISTINCT ON (user_id) user_id, area, last_seen
        FROM presence WHERE user_id IS NOT NULL AND last_seen > ${since}
        ORDER BY user_id, last_seen DESC
      ) latest
      JOIN users ON users.id = latest.user_id
      ORDER BY latest.last_seen DESC
      LIMIT ${limit}
    `,
  ]);
  const areas: PresenceSnapshot["areas"] = {};
  for (const row of areaRows) areas[row.area] = row.n;
  return {
    online: areaRows.reduce((sum, row) => sum + row.n, 0),
    areas,
    artists: artists.map((a) => ({ id: a.id, artist_name: a.artist_name, avatar_color: a.avatar_color, area: a.area })),
    artistCount: artists[0]?.total ?? 0,
  };
}

// --- Activity feed ----------------------------------------------------------------

export type ActivityType = "remix" | "track" | "like" | "comment" | "follow" | "join";

export type Activity = {
  type: ActivityType;
  at: string;
  actor_id: string;
  actor_name: string;
  actor_color: string;
  /** The remix it was about (remix, like, comment). */
  remix_id: string | null;
  /** The remix's or song's title. */
  title: string | null;
  /** The other artist involved: whose remix was liked, who was followed. */
  target_id: string | null;
  target_name: string | null;
};

/** The latest things that happened on the site, newest first. */
export async function recentActivity(limit = 14): Promise<Activity[]> {
  await Promise.all([ensureSchema(), ensurePresenceSchema()]);
  // Each source is cut to `limit` first, so this stays quick however big
  // the tables get. Only published remixes, and nothing done to your own.
  // Sign-ups are capped at a few, so a burst of them can't crowd out the music.
  return sql<Activity[]>`
    SELECT * FROM (
      (SELECT 'remix' AS type, r.created_at AS at, u.id AS actor_id, u.artist_name AS actor_name,
              u.avatar_color AS actor_color, r.id AS remix_id, r.title, NULL AS target_id, NULL AS target_name
       FROM remixes r JOIN users u ON u.id = r.owner_id
       WHERE r.published ORDER BY r.created_at DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'track', t.created_at, u.id, u.artist_name, u.avatar_color, NULL, t.title, NULL, NULL
       FROM tracks t JOIN users u ON u.id = t.owner_id
       WHERE t.status = 'ready' ORDER BY t.created_at DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'like', l.created_at, u.id, u.artist_name, u.avatar_color, r.id, r.title, o.id, o.artist_name
       FROM remix_likes l JOIN users u ON u.id = l.user_id
       JOIN remixes r ON r.id = l.remix_id JOIN users o ON o.id = r.owner_id
       WHERE r.published AND l.user_id <> r.owner_id ORDER BY l.created_at DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'comment', c.created_at, u.id, u.artist_name, u.avatar_color, r.id, r.title, o.id, o.artist_name
       FROM remix_comments c JOIN users u ON u.id = c.user_id
       JOIN remixes r ON r.id = c.remix_id JOIN users o ON o.id = r.owner_id
       WHERE r.published AND c.user_id <> r.owner_id ORDER BY c.created_at DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'follow', f.created_at, u.id, u.artist_name, u.avatar_color, NULL, NULL, o.id, o.artist_name
       FROM follows f JOIN users u ON u.id = f.follower_id JOIN users o ON o.id = f.followee_id
       ORDER BY f.created_at DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'join', u.created_at, u.id, u.artist_name, u.avatar_color, NULL, NULL, NULL, NULL
       FROM users u ORDER BY u.created_at DESC LIMIT 3)
    ) feed
    ORDER BY at DESC
    LIMIT ${limit}
  `;
}
