import sql from "./db";
import { ensureRemixStats } from "./models";
import { ensureSchema } from "./schema";
import { REWARD } from "./mining";
import { ensureSplitQueueSchema } from "./splitQueue";

// The social side of Remixt: following artists, commenting on remixes,
// and the game layer on top — XP, levels, badges and leaderboards.
//
// XP isn't stored: it's worked out from what an artist has actually done
// (and what others did with it), so it can never drift from the real
// numbers, and deleting a remix takes its XP with it. Nothing an artist
// does to their own work counts — liking or commenting on your own remix
// earns nothing — and plays count for little, since anyone can replay.

let schema: Promise<void> | null = null;

/** Creates the tables on first use, so a database that missed the migration still works. */
export function ensureSocialSchema(): Promise<void> {
  schema ??= (async () => {
    await ensureRemixStats();
    await ensureSplitQueueSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (follower_id, followee_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS remix_comments (
        id TEXT PRIMARY KEY,
        remix_id TEXT NOT NULL REFERENCES remixes(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_comments_remix ON remix_comments(remix_id, created_at)`;
  })();
  schema.catch(() => (schema = null));
  return schema;
}

// --- Following ----------------------------------------------------------------

export type FollowState = { followers: number; following: number; isFollowing: boolean };

export async function getFollowState(userId: string, viewerId: string | null): Promise<FollowState> {
  await ensureSocialSchema();
  const [row] = await sql<FollowState[]>`
    SELECT
      (SELECT COUNT(*) FROM follows WHERE followee_id = ${userId})::int AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ${userId})::int AS following,
      EXISTS (SELECT 1 FROM follows WHERE follower_id = ${viewerId ?? ""} AND followee_id = ${userId}) AS "isFollowing"
  `;
  return row;
}

export async function setFollowing(followerId: string, followeeId: string, follow: boolean) {
  await ensureSocialSchema();
  if (follow) {
    await sql`
      INSERT INTO follows (follower_id, followee_id) VALUES (${followerId}, ${followeeId})
      ON CONFLICT DO NOTHING
    `;
  } else {
    await sql`DELETE FROM follows WHERE follower_id = ${followerId} AND followee_id = ${followeeId}`;
  }
}

// --- Comments -------------------------------------------------------------------

export const COMMENT_MAX = 500;

export type RemixComment = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  artist_name: string;
  avatar_color: string;
  /** Where in the song it was left, for comments pinned to a moment. */
  at_seconds: number | null;
};

export async function getComments(remixId: string): Promise<RemixComment[]> {
  await ensureSchema();
  return sql<RemixComment[]>`
    SELECT remix_comments.id, remix_comments.body, remix_comments.created_at, remix_comments.at_seconds,
           users.id AS user_id, users.artist_name, users.avatar_color
    FROM remix_comments JOIN users ON users.id = remix_comments.user_id
    WHERE remix_comments.remix_id = ${remixId}
    ORDER BY remix_comments.created_at ASC
    LIMIT 500
  `;
}

// --- XP, levels and badges ------------------------------------------------------------

/** What an artist has done, and what others did with it. */
export type ArtistNumbers = {
  published: number;
  tracks: number;
  /** Likes on their remixes from other people. */
  likes: number;
  plays: number;
  followers: number;
  /** Other people's remixes they've liked. */
  likesGiven: number;
  /** Other people's remixes they've commented on. */
  commentedOn: number;
  /** Songs they split on their computer for someone on a phone. */
  splitsForOthers: number;
  /** XP those splits paid, bonuses and all (see lib/mining.ts). */
  splitXp: number;
  /** Most likes and most plays on any one of their remixes. */
  bestLikes: number;
  bestPlays: number;
  /** Friends who joined from their invite link and have made something (so empty sign-ups don't count). */
  referrals: number;
};

/** XP per thing done — kept in one place so the leaderboard's SQL agrees with it. */
export const XP = {
  published: 100,
  track: 25,
  like: 15,
  followers: 20,
  likeGiven: 2,
  commentedOn: 5,
  /** The base pay; each split's actual reward (with bonuses) is stored with it. */
  splitForOthers: REWARD.base,
  playsPer: 5,
  referral: 75,
};

export function xpFor(n: ArtistNumbers) {
  return (
    n.published * XP.published +
    n.tracks * XP.track +
    n.likes * XP.like +
    n.followers * XP.followers +
    n.likesGiven * XP.likeGiven +
    n.commentedOn * XP.commentedOn +
    n.splitXp +
    (n.referrals ?? 0) * XP.referral +
    Math.floor(n.plays / XP.playsPer)
  );
}

/** XP where each level starts. */
const LEVELS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500];
const TITLES = [
  "Newcomer",
  "Bedroom Producer",
  "Beatmaker",
  "Remix Artist",
  "Crowd Mover",
  "Club Favourite",
  "Headliner",
  "Hitmaker",
  "Star",
  "Legend",
  "Icon",
];

/** Every level and where it starts, for showing the whole ladder. */
export function levelLadder(): { level: number; title: string; from: number }[] {
  return LEVELS.map((from, i) => ({ level: i + 1, title: TITLES[i], from }));
}

export type Level = { level: number; title: string; xp: number; from: number; to: number | null };

export function levelFor(xp: number): Level {
  let index = 0;
  while (index + 1 < LEVELS.length && xp >= LEVELS[index + 1]) index++;
  return { level: index + 1, title: TITLES[index], xp, from: LEVELS[index], to: LEVELS[index + 1] ?? null };
}

export type Badge = {
  id: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
  /** How far along, e.g. "3 / 10", while not yet earned. */
  progress: string | null;
};

function badge(id: string, emoji: string, label: string, description: string, value: number, goal: number): Badge {
  const earned = value >= goal;
  return { id, emoji, label, description, earned, progress: earned || goal === 1 ? null : `${value} / ${goal}` };
}

export function badgesFor(n: ArtistNumbers): Badge[] {
  return [
    badge("first-remix", "🎛️", "First Remix", "Publish a remix", n.published, 1),
    badge("prolific", "🔥", "Prolific", "Publish 10 remixes", n.published, 10),
    badge("crate-digger", "🎤", "Crate Digger", "Upload 5 songs", n.tracks, 5),
    badge("first-fan", "❤️", "First Fan", "Get a like from someone", n.likes, 1),
    badge("hit-maker", "💎", "Hit Maker", "Get 10 likes on one remix", n.bestLikes, 10),
    badge("crowd-pleaser", "🎧", "Crowd Pleaser", "Reach 100 plays in total", n.plays, 100),
    badge("viral", "🚀", "Viral", "Reach 1,000 plays on one remix", n.bestPlays, 1000),
    badge("scene-builder", "🤝", "Scene Builder", "Have 10 followers", n.followers, 10),
    badge("tastemaker", "👍", "Tastemaker", "Like 20 remixes by others", n.likesGiven, 20),
    badge("in-the-mix", "💬", "In the Mix", "Comment on 10 remixes by others", n.commentedOn, 10),
    badge("helping-hand", "⛏️", "Helping Hand", "Split 5 songs for people on phones", n.splitsForOthers, 5),
    badge("rig-runner", "🖥️", "Rig Runner", "Split 25 songs for people on phones", n.splitsForOthers, 25),
    badge("talent-scout", "📣", "Talent Scout", "Bring 3 friends who make something", n.referrals ?? 0, 3),
    badge("mining-legend", "💎", "Mining Legend", "Split 100 songs for people on phones", n.splitsForOthers, 100),
  ];
}

/** Per-user numbers, as SQL — shared by one artist's page and the leaderboard. */
function numbersQuery(userFilter: ReturnType<typeof sql>) {
  return sql<(ArtistNumbers & { id: string; artist_name: string; avatar_color: string })[]>`
    SELECT users.id, users.artist_name, users.avatar_color,
      (SELECT COUNT(*) FROM remixes r WHERE r.owner_id = users.id AND r.published)::int AS published,
      (SELECT COUNT(*) FROM tracks t WHERE t.owner_id = users.id AND t.status = 'ready')::int AS tracks,
      (SELECT COUNT(*) FROM remix_likes l JOIN remixes r ON r.id = l.remix_id
        WHERE r.owner_id = users.id AND r.published AND l.user_id <> users.id)::int AS likes,
      (SELECT COALESCE(SUM(r.play_count), 0) FROM remixes r WHERE r.owner_id = users.id AND r.published)::int AS plays,
      (SELECT COUNT(*) FROM follows f WHERE f.followee_id = users.id)::int AS followers,
      (SELECT COUNT(*) FROM remix_likes l JOIN remixes r ON r.id = l.remix_id
        WHERE l.user_id = users.id AND r.owner_id <> users.id)::int AS "likesGiven",
      (SELECT COUNT(DISTINCT c.remix_id) FROM remix_comments c JOIN remixes r ON r.id = c.remix_id
        WHERE c.user_id = users.id AND r.owner_id <> users.id)::int AS "commentedOn",
      (SELECT COUNT(*) FROM split_jobs j WHERE j.worker_id = users.id AND j.owner_id <> users.id
        AND j.status = 'done')::int AS "splitsForOthers",
      (SELECT COALESCE(SUM(j.reward), 0) FROM split_jobs j WHERE j.worker_id = users.id AND j.owner_id <> users.id
        AND j.status = 'done')::int AS "splitXp",
      (SELECT COALESCE(MAX(n), 0) FROM (
         SELECT COUNT(*) AS n FROM remix_likes l JOIN remixes r ON r.id = l.remix_id
         WHERE r.owner_id = users.id AND r.published AND l.user_id <> users.id GROUP BY r.id
       ) best)::int AS "bestLikes",
      (SELECT COALESCE(MAX(r.play_count), 0) FROM remixes r WHERE r.owner_id = users.id AND r.published)::int AS "bestPlays",
      (SELECT COUNT(*) FROM users friend WHERE friend.referred_by = users.id AND (
         EXISTS (SELECT 1 FROM remixes r WHERE r.owner_id = friend.id AND r.published)
         OR EXISTS (SELECT 1 FROM tracks t WHERE t.owner_id = friend.id AND t.status = 'ready')
       ))::int AS referrals
    FROM users
    ${userFilter}
  `;
}

export type ArtistProgress = { numbers: ArtistNumbers; level: Level; badges: Badge[] };

export async function getArtistProgress(userId: string): Promise<ArtistProgress | null> {
  await ensureSocialSchema();
  const [row] = await numbersQuery(sql`WHERE users.id = ${userId}`);
  if (!row) return null;
  return { numbers: row, level: levelFor(xpFor(row)), badges: badgesFor(row) };
}

// --- Leaderboards ---------------------------------------------------------------------

export type LeaderboardArtist = {
  id: string;
  artist_name: string;
  avatar_color: string;
  level: Level;
  badges: number;
  published: number;
  likes: number;
  followers: number;
};

/** Artists by XP — everyone who has published or uploaded something. */
export async function topArtists(limit = 20): Promise<LeaderboardArtist[]> {
  await ensureSocialSchema();
  const rows = await numbersQuery(sql`
    WHERE EXISTS (SELECT 1 FROM remixes r WHERE r.owner_id = users.id AND r.published)
       OR EXISTS (SELECT 1 FROM tracks t WHERE t.owner_id = users.id AND t.status = 'ready')
  `);
  return rows
    .map((r) => ({
      id: r.id,
      artist_name: r.artist_name,
      avatar_color: r.avatar_color,
      level: levelFor(xpFor(r)),
      badges: badgesFor(r).filter((b) => b.earned).length,
      published: r.published,
      likes: r.likes,
      followers: r.followers,
    }))
    .sort((a, b) => b.level.xp - a.level.xp)
    .slice(0, limit);
}

export type RankedRemix = {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  plays: number;
  likes: number;
  comments: number;
  /** Likes and comments from others in the last 7 days. */
  recent: number;
};

/**
 * Published remixes ranked two ways: "trending" by what others did with
 * them this week (a like counts 2, a comment 1), or "played" by all-time plays.
 */
export async function rankedRemixes(by: "trending" | "played", limit = 10): Promise<RankedRemix[]> {
  await ensureSocialSchema();
  const rows = await sql<RankedRemix[]>`
    SELECT * FROM (
      SELECT remixes.id, remixes.title, users.id AS artist_id, users.artist_name,
             remixes.play_count AS plays,
             (SELECT COUNT(*) FROM remix_likes l WHERE l.remix_id = remixes.id)::int AS likes,
             (SELECT COUNT(*) FROM remix_comments c WHERE c.remix_id = remixes.id)::int AS comments,
             (2 * (SELECT COUNT(*) FROM remix_likes l WHERE l.remix_id = remixes.id
                     AND l.user_id <> remixes.owner_id AND l.created_at > now() - interval '7 days')
              + (SELECT COUNT(*) FROM remix_comments c WHERE c.remix_id = remixes.id
                     AND c.user_id <> remixes.owner_id AND c.created_at > now() - interval '7 days'))::int AS recent
      FROM remixes JOIN users ON users.id = remixes.owner_id
      WHERE remixes.published
    ) ranked
    WHERE ${by === "trending" ? sql`recent > 0` : sql`plays > 0`}
    ORDER BY ${by === "trending" ? sql`recent DESC, likes DESC` : sql`plays DESC`}
    LIMIT ${limit}
  `;
  return rows;
}

// --- Remix of the day ----------------------------------------------------------------

export type FeaturedRemix = { id: string; title: string; artist_id: string; artist_name: string; cover_key: string | null; plays: number; likes: number };

/**
 * One remix to put in the spotlight today: the week's most liked and
 * commented, or — on a quiet week — a published one picked by the date,
 * so everyone sees the same one all day and it changes tomorrow.
 */
export async function remixOfTheDay(): Promise<FeaturedRemix | null> {
  await ensureSocialSchema();
  const [top] = await rankedRemixes("trending", 1);
  const [row] = await sql<FeaturedRemix[]>`
    SELECT remixes.id, remixes.title, users.id AS artist_id, users.artist_name, remixes.cover_key,
           remixes.play_count AS plays,
           (SELECT COUNT(*) FROM remix_likes l WHERE l.remix_id = remixes.id)::int AS likes
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.published ${top ? sql`AND remixes.id = ${top.id}` : sql``}
    ORDER BY md5(remixes.id || current_date::text)
    LIMIT 1
  `;
  return row ?? null;
}
