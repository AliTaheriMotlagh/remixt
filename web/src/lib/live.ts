import { randomUUID } from "crypto";
import sql from "./db";
import { ensureSchema } from "./schema";
import { ensureSocialSchema } from "./social";
import { ensureRemixStats } from "./models";
import { normaliseTags } from "./tags";

// Live sessions: an artist goes live with one of their published remixes,
// performs it (play, pause, mute and solo stems, move the faders) and
// everyone watching hears the same performance in step while chatting and
// sending reactions. Guests can watch, react and chat too.
//
// There's no media server: the artist's *performance* is what's broadcast —
// the remix being played, the playhead and the state of each stem — and each
// listener's browser plays the same stems in sync (see
// lib/client/liveSync.ts). Chat, reactions and that state travel as small
// polled requests (the feed), so it runs on the same Postgres as the rest
// of the app, on any host, however many server instances there are.

export { CHAT_MAX, DESCRIPTION_MAX, LIVE_REACTIONS, TITLE_MAX, type LiveReaction } from "./liveShared";
import { CHAT_MAX, LIVE_REACTIONS } from "./liveShared";
/** The host's tab reports in at least this often; silent for twice as long and they've "stepped away". */
export const HOST_AWAY_SECONDS = 45;
/** A viewer's tab reports in at least this often. */
export const VIEWER_SECONDS = 10;
const VIEWER_ONLINE_SECONDS = 30;
/** A live session whose host has been gone this long is ended for them. */
const ABANDONED_MINUTES = 15;

export type LiveStatus = "scheduled" | "live" | "ended";
export type ChatMode = "open" | "followers" | "off";

/** What the host is doing on stage, as the listeners need it. Lanes are in the remix's lane order. */
export type LiveStageState = {
  playing: boolean;
  /** Seconds into the remix when the state was sent. */
  position: number;
  lanes: { muted: boolean; solo: boolean; volume: number }[];
  /** A line the host puts up ("Drop incoming…"). */
  note?: string;
};

export const IDLE_STATE: LiveStageState = { playing: false, position: 0, lanes: [] };

export type LiveStream = {
  id: string;
  host_id: string;
  host_name: string;
  host_color: string;
  title: string;
  description: string;
  tags: string[];
  status: LiveStatus;
  remix_id: string | null;
  remix_title: string | null;
  remix_cover_key: string | null;
  chat_mode: ChatMode;
  slow_mode: number;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  peak_viewers: number;
  viewers: number;
};

let schema: Promise<void> | null = null;

/** Creates the tables on first use, so a database that missed the migration still works. */
export function ensureLiveSchema(): Promise<void> {
  schema ??= (async () => {
    await ensureSchema();
    await ensureSocialSchema();
    await ensureRemixStats();
    await sql`
      CREATE TABLE IF NOT EXISTS live_streams (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tags TEXT[] NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'live',
        remix_id TEXT REFERENCES remixes(id) ON DELETE SET NULL,
        chat_mode TEXT NOT NULL DEFAULT 'open',
        slow_mode INTEGER NOT NULL DEFAULT 0,
        state_json TEXT NOT NULL DEFAULT '{}',
        state_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        state_version INTEGER NOT NULL DEFAULT 0,
        mod_version INTEGER NOT NULL DEFAULT 0,
        pinned_event_id BIGINT,
        peak_viewers INTEGER NOT NULL DEFAULT 0,
        host_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        scheduled_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status, started_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_live_streams_host ON live_streams(host_id, created_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS live_events (
        id BIGSERIAL PRIMARY KEY,
        stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        session_id TEXT NOT NULL,
        guest_name TEXT,
        kind TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        hidden BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_live_events_stream ON live_events(stream_id, id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS live_viewers (
        stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (stream_id, session_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS live_reactions (
        stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (stream_id, emoji)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS live_bans (
        stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
        who TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (stream_id, who)
      )
    `;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS live_id TEXT REFERENCES live_streams(id) ON DELETE CASCADE`;
  })();
  schema.catch(() => (schema = null));
  return schema;
}

// --- Reading streams ---------------------------------------------------------------

const viewersNow = () => sql`
  (SELECT COUNT(DISTINCT COALESCE(v.user_id, v.session_id))::int FROM live_viewers v
   WHERE v.stream_id = s.id AND v.last_seen > now() - make_interval(secs => ${VIEWER_ONLINE_SECONDS}))
`;

function streamSelect() {
  return sql`
    SELECT s.id, s.host_id, u.artist_name AS host_name, u.avatar_color AS host_color, s.title, s.description, s.tags,
           s.status, s.remix_id, r.title AS remix_title, r.cover_key AS remix_cover_key, s.chat_mode, s.slow_mode,
           s.scheduled_at, s.started_at, s.ended_at, s.created_at, s.peak_viewers, ${viewersNow()} AS viewers
    FROM live_streams s
    JOIN users u ON u.id = s.host_id
    LEFT JOIN remixes r ON r.id = s.remix_id
  `;
}

/** Ends live sessions whose host disappeared without pressing "End". */
async function endAbandoned() {
  await sql`
    UPDATE live_streams SET status = 'ended', ended_at = now()
    WHERE status = 'live' AND host_seen_at < now() - make_interval(mins => ${ABANDONED_MINUTES})
  `;
}

export async function getStream(id: string): Promise<LiveStream | null> {
  await ensureLiveSchema();
  const [row] = await sql<LiveStream[]>`${streamSelect()} WHERE s.id = ${id}`;
  return row ?? null;
}

export type LiveDirectory = { live: LiveStream[]; upcoming: LiveStream[]; recent: LiveStream[] };

export async function liveDirectory(): Promise<LiveDirectory> {
  await ensureLiveSchema();
  await endAbandoned();
  const [live, upcoming, recent] = await Promise.all([
    sql<LiveStream[]>`${streamSelect()} WHERE s.status = 'live' ORDER BY ${viewersNow()} DESC, s.started_at DESC LIMIT 60`,
    sql<LiveStream[]>`
      ${streamSelect()}
      WHERE s.status = 'scheduled' AND s.scheduled_at IS NOT NULL AND s.scheduled_at > now() - interval '2 hours'
      ORDER BY s.scheduled_at LIMIT 30
    `,
    sql<LiveStream[]>`
      ${streamSelect()}
      WHERE s.status = 'ended' AND s.started_at IS NOT NULL AND s.ended_at > now() - interval '14 days'
        AND s.ended_at - s.started_at > interval '1 minute'
      ORDER BY s.ended_at DESC LIMIT 12
    `,
  ]);
  return { live, upcoming, recent };
}

/** How many sessions are live right now (for the nav and the home page). */
export async function liveNowCount(): Promise<number> {
  await ensureLiveSchema();
  const [row] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM live_streams WHERE status = 'live'`;
  return row.n;
}

export async function currentStreamOf(hostId: string): Promise<LiveStream | null> {
  await ensureLiveSchema();
  const [row] = await sql<LiveStream[]>`
    ${streamSelect()} WHERE s.host_id = ${hostId} AND s.status = 'live' ORDER BY s.started_at DESC LIMIT 1
  `;
  return row ?? null;
}

export async function hostStreams(hostId: string, limit = 10): Promise<LiveStream[]> {
  await ensureLiveSchema();
  return sql<LiveStream[]>`
    ${streamSelect()} WHERE s.host_id = ${hostId} ORDER BY s.created_at DESC LIMIT ${limit}
  `;
}

// --- Creating and running a session ---------------------------------------------------

export type NewStream = {
  title: string;
  description: string;
  tags: string[];
  remixId: string | null;
  chatMode: ChatMode;
  slowMode: number;
  scheduledAt: Date | null;
};

/** Whether `userId` owns this remix and it's published (so listeners can open it). */
export async function ownsPublishedRemix(userId: string, remixId: string) {
  const [row] = await sql`SELECT 1 FROM remixes WHERE id = ${remixId} AND owner_id = ${userId} AND published`;
  return !!row;
}

export async function createStream(hostId: string, input: NewStream): Promise<string> {
  await ensureLiveSchema();
  const id = randomUUID();
  const goLiveNow = !input.scheduledAt;
  await sql`
    INSERT INTO live_streams (id, host_id, title, description, tags, status, remix_id, chat_mode, slow_mode,
                              scheduled_at, started_at)
    VALUES (${id}, ${hostId}, ${input.title}, ${input.description}, ${normaliseTags(input.tags)},
            ${goLiveNow ? "live" : "scheduled"}, ${input.remixId}, ${input.chatMode}, ${input.slowMode},
            ${input.scheduledAt}, ${goLiveNow ? sql`now()` : null})
  `;
  if (goLiveNow) await announceLive(id, hostId);
  return id;
}

/** Tells the host's followers they're live. */
async function announceLive(streamId: string, hostId: string) {
  const [stream] = await sql<{ title: string }[]>`SELECT title FROM live_streams WHERE id = ${streamId}`;
  if (!stream) return;
  const followers = await sql<{ follower_id: string }[]>`
    SELECT follower_id FROM follows WHERE followee_id = ${hostId} ORDER BY created_at DESC LIMIT 500
  `;
  await Promise.all(
    followers.map((f) =>
      sql`
        INSERT INTO notifications (id, user_id, actor_id, type, live_id, body)
        VALUES (${randomUUID()}, ${f.follower_id}, ${hostId}, 'live', ${streamId}, ${stream.title})
      `.catch(() => {})
    )
  );
}

export async function startStream(id: string) {
  await ensureLiveSchema();
  const [row] = await sql<{ host_id: string }[]>`
    UPDATE live_streams SET status = 'live', started_at = now(), host_seen_at = now(), state_at = now()
    WHERE id = ${id} AND status = 'scheduled' RETURNING host_id
  `;
  if (row) await announceLive(id, row.host_id);
  return !!row;
}

export async function endStream(id: string) {
  await ensureLiveSchema();
  await sql`
    UPDATE live_streams SET status = 'ended', ended_at = now(),
      state_json = ${JSON.stringify({ ...IDLE_STATE })}, state_version = state_version + 1
    WHERE id = ${id} AND status IN ('live', 'scheduled')
  `;
}

export type StreamPatch = Partial<{
  title: string;
  description: string;
  tags: string[];
  chatMode: ChatMode;
  slowMode: number;
  remixId: string | null;
  scheduledAt: Date;
}>;

export async function updateStream(id: string, patch: StreamPatch) {
  await ensureLiveSchema();
  if (patch.title !== undefined) await sql`UPDATE live_streams SET title = ${patch.title} WHERE id = ${id}`;
  if (patch.description !== undefined) await sql`UPDATE live_streams SET description = ${patch.description} WHERE id = ${id}`;
  if (patch.tags !== undefined) await sql`UPDATE live_streams SET tags = ${normaliseTags(patch.tags)} WHERE id = ${id}`;
  if (patch.chatMode !== undefined) await sql`UPDATE live_streams SET chat_mode = ${patch.chatMode}, mod_version = mod_version + 1 WHERE id = ${id}`;
  if (patch.slowMode !== undefined) await sql`UPDATE live_streams SET slow_mode = ${patch.slowMode}, mod_version = mod_version + 1 WHERE id = ${id}`;
  if (patch.scheduledAt !== undefined) await sql`UPDATE live_streams SET scheduled_at = ${patch.scheduledAt} WHERE id = ${id} AND status = 'scheduled'`;
  if (patch.remixId !== undefined) {
    // A different remix: listeners reload the stage, starting from the top.
    await sql`
      UPDATE live_streams SET remix_id = ${patch.remixId}, state_json = ${JSON.stringify(IDLE_STATE)},
        state_at = now(), state_version = state_version + 1
      WHERE id = ${id}
    `;
  }
}

export async function publishState(id: string, state: LiveStageState) {
  await sql`
    UPDATE live_streams SET state_json = ${JSON.stringify(state)}, state_at = now(),
      state_version = state_version + 1, host_seen_at = now()
    WHERE id = ${id} AND status = 'live'
  `;
}

// --- The feed ----------------------------------------------------------------------------

export type LiveEvent = {
  id: number;
  kind: "chat" | "reaction" | "system";
  user_id: string | null;
  name: string;
  color: string;
  /** The host's own messages carry a badge. */
  is_host: boolean;
  /** Sent from this browser (so its own reactions aren't played twice). */
  mine: boolean;
  body: string;
  count: number;
  at: string;
};

export type FeedStream = {
  status: LiveStatus;
  title: string;
  remixId: string | null;
  state: LiveStageState;
  /** The DB clock when the state was sent, in ms since the epoch. */
  stateAt: number;
  stateVersion: number;
  modVersion: number;
  chatMode: ChatMode;
  slowMode: number;
  pinned: LiveEvent | null;
  viewers: number;
  peak: number;
  hostAway: boolean;
  reactions: Record<string, number>;
};

export type Audience = { signedIn: { id: string; name: string; color: string }[]; guests: number };

export type Feed = {
  /** The DB clock now, in ms since the epoch. */
  now: number;
  stream: FeedStream;
  events: LiveEvent[];
  /** Messages the host has hidden lately, so listeners drop them. */
  hidden: number[];
  /** Only for the host. */
  audience?: Audience;
  you: { banned: boolean };
};

type StreamRow = {
  id: string;
  host_id: string;
  status: LiveStatus;
  title: string;
  remix_id: string | null;
  state_json: string;
  state_at: number;
  state_version: number;
  mod_version: number;
  chat_mode: ChatMode;
  slow_mode: number;
  pinned_event_id: number | null;
  peak_viewers: number;
  away: boolean;
  now: number;
};

function parseState(raw: string): LiveStageState {
  try {
    const value = JSON.parse(raw) as Partial<LiveStageState>;
    return {
      playing: !!value.playing,
      position: typeof value.position === "number" && value.position >= 0 ? value.position : 0,
      lanes: Array.isArray(value.lanes) ? value.lanes : [],
      ...(typeof value.note === "string" && value.note ? { note: value.note } : {}),
    };
  } catch {
    return { ...IDLE_STATE };
  }
}

const eventColumns = (sessionId = "") => sql`
  e.id::float8 AS id, e.kind, e.user_id, e.body, e.count, e.created_at AS at, (e.session_id = ${sessionId}) AS mine,
  COALESCE(u.artist_name, e.guest_name, 'Guest') AS name,
  COALESCE(u.avatar_color, '#52525b') AS color,
  (e.user_id IS NOT NULL AND e.user_id = s.host_id) AS is_host
`;

/**
 * Everything a tab needs to stay in step: the stage state, the counts, and
 * the chat and reactions since `after` (the id of the last event it has).
 * Reporting in as a viewer, or as the host, happens here too.
 */
export async function readFeed(
  streamId: string,
  opts: { after: number; sessionId: string; userId: string | null; modVersion: number; heartbeat: boolean }
): Promise<Feed | null> {
  await ensureLiveSchema();
  const [row] = await sql<StreamRow[]>`
    SELECT s.id, s.host_id, s.status, s.title, s.remix_id, s.state_json,
           (extract(epoch FROM s.state_at) * 1000)::float8 AS state_at, s.state_version, s.mod_version,
           s.chat_mode, s.slow_mode, s.pinned_event_id::float8 AS pinned_event_id, s.peak_viewers,
           (s.status = 'live' AND s.host_seen_at < now() - make_interval(secs => ${HOST_AWAY_SECONDS})) AS away,
           (extract(epoch FROM now()) * 1000)::float8 AS now
    FROM live_streams s WHERE s.id = ${streamId}
  `;
  if (!row) return null;
  const isHost = !!opts.userId && opts.userId === row.host_id;
  const live = row.status === "live";

  if (live && isHost) {
    await sql`UPDATE live_streams SET host_seen_at = now() WHERE id = ${streamId}`;
  } else if (live && opts.heartbeat) {
    await sql`
      INSERT INTO live_viewers (stream_id, session_id, user_id)
      VALUES (${streamId}, ${opts.sessionId}, ${opts.userId})
      ON CONFLICT (stream_id, session_id) DO UPDATE SET last_seen = now(), user_id = COALESCE(EXCLUDED.user_id, live_viewers.user_id)
    `;
  }

  // A fresh tab gets the recent chat; one that's following along gets what's new.
  const fresh = opts.after <= 0;
  const [events, hiddenRows, reactionRows, viewerRow, bans] = await Promise.all([
    fresh
      ? sql<LiveEvent[]>`
          SELECT * FROM (
            SELECT ${eventColumns(opts.sessionId)} FROM live_events e
            JOIN live_streams s ON s.id = e.stream_id LEFT JOIN users u ON u.id = e.user_id
            WHERE e.stream_id = ${streamId} AND e.kind <> 'reaction' AND NOT e.hidden
            ORDER BY e.id DESC LIMIT 60
          ) recent ORDER BY id
        `
      : sql<LiveEvent[]>`
          SELECT ${eventColumns(opts.sessionId)} FROM live_events e
          JOIN live_streams s ON s.id = e.stream_id LEFT JOIN users u ON u.id = e.user_id
          WHERE e.stream_id = ${streamId} AND e.id > ${opts.after} AND NOT e.hidden
          ORDER BY e.id LIMIT 120
        `,
    row.mod_version !== opts.modVersion
      ? sql<{ id: number }[]>`
          SELECT id::float8 AS id FROM live_events
          WHERE stream_id = ${streamId} AND hidden AND kind = 'chat' ORDER BY id DESC LIMIT 300
        `
      : Promise.resolve([] as { id: number }[]),
    sql<{ emoji: string; total: number }[]>`SELECT emoji, total FROM live_reactions WHERE stream_id = ${streamId}`,
    sql<{ viewers: number }[]>`
      SELECT COUNT(DISTINCT COALESCE(user_id, session_id))::int AS viewers FROM live_viewers
      WHERE stream_id = ${streamId} AND last_seen > now() - make_interval(secs => ${VIEWER_ONLINE_SECONDS})
    `,
    sql<{ who: string }[]>`
      SELECT who FROM live_bans WHERE stream_id = ${streamId}
        AND who IN (${opts.userId ? `user:${opts.userId}` : "-"}, ${`sid:${opts.sessionId}`})
    `,
  ]);

  const viewers = viewerRow[0]?.viewers ?? 0;
  let peak = row.peak_viewers;
  if (live && viewers > peak) {
    peak = viewers;
    await sql`UPDATE live_streams SET peak_viewers = GREATEST(peak_viewers, ${viewers}) WHERE id = ${streamId}`;
  }

  let pinned: LiveEvent | null = null;
  if (row.pinned_event_id) {
    const [p] = await sql<LiveEvent[]>`
      SELECT ${eventColumns(opts.sessionId)} FROM live_events e
      JOIN live_streams s ON s.id = e.stream_id LEFT JOIN users u ON u.id = e.user_id
      WHERE e.id = ${row.pinned_event_id} AND NOT e.hidden
    `;
    pinned = p ?? null;
  }

  let audience: Audience | undefined;
  if (isHost) {
    const [members, guests] = await Promise.all([
      sql<{ id: string; name: string; color: string }[]>`
        SELECT DISTINCT ON (u.id) u.id, u.artist_name AS name, u.avatar_color AS color
        FROM live_viewers v JOIN users u ON u.id = v.user_id
        WHERE v.stream_id = ${streamId} AND v.last_seen > now() - make_interval(secs => ${VIEWER_ONLINE_SECONDS})
        ORDER BY u.id LIMIT 60
      `,
      sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM live_viewers
        WHERE stream_id = ${streamId} AND user_id IS NULL
          AND last_seen > now() - make_interval(secs => ${VIEWER_ONLINE_SECONDS})
      `,
    ]);
    audience = { signedIn: members, guests: guests[0]?.n ?? 0 };
  }

  return {
    now: row.now,
    stream: {
      status: row.status,
      title: row.title,
      remixId: row.remix_id,
      state: parseState(row.state_json),
      stateAt: row.state_at,
      stateVersion: row.state_version,
      modVersion: row.mod_version,
      chatMode: row.chat_mode,
      slowMode: row.slow_mode,
      pinned,
      viewers,
      peak,
      hostAway: row.away,
      reactions: Object.fromEntries(reactionRows.map((r) => [r.emoji, r.total])),
    },
    events,
    hidden: hiddenRows.map((h) => h.id),
    audience,
    you: { banned: bans.length > 0 },
  };
}

// --- Chat and reactions ------------------------------------------------------------------

/** "Guest 4821", the same for a given browser every time. */
export function guestName(sessionId: string) {
  let hash = 0;
  for (const ch of sessionId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `Guest ${String(hash % 10000).padStart(4, "0")}`;
}

/** A guest's chosen name: letters, numbers and a few marks, 2–20 of them. */
export function cleanGuestName(raw: string | undefined, sessionId: string) {
  const name = (raw ?? "").replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
  return name.length >= 2 ? name : guestName(sessionId);
}

/** Message text with control characters gone and spaces tidied. */
export function cleanChat(raw: string) {
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
}

const LINK = /(https?:\/\/|www\.)\S+/gi;

export type SendResult = { ok: true; id: number } | { ok: false; error: string; status: number };

export async function sendChat(
  stream: Pick<LiveStream, "id" | "host_id" | "chat_mode" | "slow_mode" | "status">,
  who: { userId: string | null; sessionId: string; guestName?: string },
  rawBody: string
): Promise<SendResult> {
  if (stream.status !== "live") return { ok: false, error: "This session isn't live", status: 409 };
  const isHost = who.userId === stream.host_id;
  let body = cleanChat(rawBody);
  if (!body) return { ok: false, error: "Write something first", status: 400 };

  if (!isHost) {
    if (stream.chat_mode === "off") return { ok: false, error: "The host turned chat off", status: 403 };
    if (await isBanned(stream.id, who.userId, who.sessionId)) {
      return { ok: false, error: "You can't chat in this session", status: 403 };
    }
    if (stream.chat_mode === "followers") {
      if (!who.userId) return { ok: false, error: "Chat is for followers — sign in and follow to join in", status: 403 };
      const [follows] = await sql`SELECT 1 FROM follows WHERE follower_id = ${who.userId} AND followee_id = ${stream.host_id}`;
      if (!follows) return { ok: false, error: "Chat is for followers — follow the host to join in", status: 403 };
    }
    // No links from guests (they're how spam arrives).
    if (!who.userId) body = body.replace(LINK, "•••");

    // Flood protection, and the host's slow mode (guests wait at least 3 s).
    const gap = Math.max(stream.slow_mode, who.userId ? 0 : 3);
    const [recent] = await sql<{ last: number | null; n: number }[]>`
      SELECT (extract(epoch FROM now() - MAX(created_at)))::float8 AS last, COUNT(*)::int AS n FROM live_events
      WHERE stream_id = ${stream.id} AND kind = 'chat' AND created_at > now() - interval '30 seconds'
        AND (${who.userId ? sql`user_id = ${who.userId}` : sql`session_id = ${who.sessionId}`})
    `;
    if (gap > 0 && recent.last !== null && recent.last < gap) {
      return { ok: false, error: `Slow mode — wait ${Math.ceil(gap - recent.last)}s`, status: 429 };
    }
    if (recent.n >= 8) return { ok: false, error: "Slow down a little", status: 429 };
  }

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO live_events (stream_id, user_id, session_id, guest_name, kind, body)
    VALUES (${stream.id}, ${who.userId}, ${who.sessionId}, ${who.userId ? null : cleanGuestName(who.guestName, who.sessionId)}, 'chat', ${body})
    RETURNING id::float8 AS id
  `;
  return { ok: true, id: row.id };
}

export async function sendReaction(
  stream: Pick<LiveStream, "id" | "status">,
  who: { userId: string | null; sessionId: string },
  emoji: string,
  count: number
): Promise<SendResult> {
  if (stream.status !== "live") return { ok: false, error: "This session isn't live", status: 409 };
  if (!(LIVE_REACTIONS as readonly string[]).includes(emoji)) return { ok: false, error: "Unknown reaction", status: 400 };
  if (await isBanned(stream.id, who.userId, who.sessionId)) return { ok: false, error: "You can't react here", status: 403 };
  const n = Math.max(1, Math.min(10, Math.round(count)));
  const [recent] = await sql<{ n: number }[]>`
    SELECT COALESCE(SUM(count), 0)::int AS n FROM live_events
    WHERE stream_id = ${stream.id} AND kind = 'reaction' AND created_at > now() - interval '10 seconds'
      AND (${who.userId ? sql`user_id = ${who.userId}` : sql`session_id = ${who.sessionId}`})
  `;
  if (recent.n + n > 40) return { ok: false, error: "Easy — that's a lot of reactions", status: 429 };
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO live_events (stream_id, user_id, session_id, kind, body, count)
    VALUES (${stream.id}, ${who.userId}, ${who.sessionId}, 'reaction', ${emoji}, ${n})
    RETURNING id::float8 AS id
  `;
  await sql`
    INSERT INTO live_reactions (stream_id, emoji, total) VALUES (${stream.id}, ${emoji}, ${n})
    ON CONFLICT (stream_id, emoji) DO UPDATE SET total = live_reactions.total + ${n}
  `;
  return { ok: true, id: row.id };
}

async function isBanned(streamId: string, userId: string | null, sessionId: string) {
  const [row] = await sql`
    SELECT 1 FROM live_bans WHERE stream_id = ${streamId}
      AND who IN (${userId ? `user:${userId}` : "-"}, ${`sid:${sessionId}`})
  `;
  return !!row;
}

// --- Moderation (host only) ---------------------------------------------------------------

export async function hideMessage(streamId: string, eventId: number, ban: boolean) {
  const [event] = await sql<{ user_id: string | null; session_id: string }[]>`
    UPDATE live_events SET hidden = true WHERE id = ${eventId} AND stream_id = ${streamId} AND kind = 'chat'
    RETURNING user_id, session_id
  `;
  if (!event) return false;
  if (ban) {
    const who = event.user_id ? `user:${event.user_id}` : `sid:${event.session_id}`;
    await sql`INSERT INTO live_bans (stream_id, who) VALUES (${streamId}, ${who}) ON CONFLICT DO NOTHING`;
    // Everything they said goes with them.
    await sql`
      UPDATE live_events SET hidden = true
      WHERE stream_id = ${streamId} AND kind = 'chat'
        AND (${event.user_id ? sql`user_id = ${event.user_id}` : sql`session_id = ${event.session_id}`})
    `;
  }
  await sql`
    UPDATE live_streams SET mod_version = mod_version + 1,
      pinned_event_id = CASE WHEN pinned_event_id = ${eventId} THEN NULL ELSE pinned_event_id END
    WHERE id = ${streamId}
  `;
  return true;
}

export async function pinMessage(streamId: string, eventId: number | null) {
  if (eventId !== null) {
    const [ok] = await sql`SELECT 1 FROM live_events WHERE id = ${eventId} AND stream_id = ${streamId} AND kind = 'chat' AND NOT hidden`;
    if (!ok) return false;
  }
  await sql`UPDATE live_streams SET pinned_event_id = ${eventId}, mod_version = mod_version + 1 WHERE id = ${streamId}`;
  return true;
}

// --- After the show --------------------------------------------------------------------------

export type Recap = {
  durationSeconds: number;
  peak: number;
  unique: number;
  messages: number;
  reactions: number;
  topReaction: string | null;
  newFollowers: number;
  chatters: number;
};

export async function recap(stream: Pick<LiveStream, "id" | "host_id" | "started_at" | "ended_at" | "peak_viewers">): Promise<Recap> {
  await ensureLiveSchema();
  const [stats] = await sql<
    { unique: number; messages: number; chatters: number; reactions: number; top: string | null; followers: number }[]
  >`
    SELECT
      (SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) FROM live_viewers WHERE stream_id = ${stream.id})::int AS unique,
      (SELECT COUNT(*) FROM live_events WHERE stream_id = ${stream.id} AND kind = 'chat')::int AS messages,
      (SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) FROM live_events WHERE stream_id = ${stream.id} AND kind = 'chat')::int AS chatters,
      (SELECT COALESCE(SUM(total), 0) FROM live_reactions WHERE stream_id = ${stream.id})::int AS reactions,
      (SELECT emoji FROM live_reactions WHERE stream_id = ${stream.id} ORDER BY total DESC LIMIT 1) AS top,
      (SELECT COUNT(*) FROM follows WHERE followee_id = ${stream.host_id}
         AND created_at >= ${stream.started_at ?? new Date(0)} AND created_at <= ${stream.ended_at ?? new Date()})::int AS followers
  `;
  const start = stream.started_at ? new Date(stream.started_at).getTime() : 0;
  const end = stream.ended_at ? new Date(stream.ended_at).getTime() : Date.now();
  return {
    durationSeconds: start ? Math.max(0, Math.round((end - start) / 1000)) : 0,
    peak: stream.peak_viewers,
    unique: stats.unique,
    messages: stats.messages,
    reactions: stats.reactions,
    topReaction: stats.top,
    newFollowers: stats.followers,
    chatters: stats.chatters,
  };
}

/** The host's published remixes, to choose what to perform. */
export async function performableRemixes(hostId: string) {
  await ensureLiveSchema();
  return sql<{ id: string; title: string; cover_key: string | null; lanes: number }[]>`
    SELECT r.id, r.title, r.cover_key, (SELECT COUNT(*)::int FROM remix_lanes WHERE remix_id = r.id) AS lanes
    FROM remixes r WHERE r.owner_id = ${hostId} AND r.published
    ORDER BY r.updated_at DESC LIMIT 100
  `;
}
