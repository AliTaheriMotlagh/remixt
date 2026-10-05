CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '#7c3aed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- processing | ready | failed
  error TEXT,
  duration DOUBLE PRECISION,
  bpm DOUBLE PRECISION,
  original_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stems (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'vocals' | 'beat'
  file_url TEXT NOT NULL,
  peaks_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(track_id, kind)
);

CREATE TABLE IF NOT EXISTS remixes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remix_lanes (
  id TEXT PRIMARY KEY,
  remix_id TEXT NOT NULL REFERENCES remixes(id) ON DELETE CASCADE,
  stem_id TEXT NOT NULL REFERENCES stems(id) ON DELETE CASCADE,
  lane_order INTEGER NOT NULL DEFAULT 0,
  volume DOUBLE PRECISION NOT NULL DEFAULT 1,
  muted BOOLEAN NOT NULL DEFAULT false,
  offset_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  pitch_semitones DOUBLE PRECISION NOT NULL DEFAULT 0,
  tempo_ratio DOUBLE PRECISION NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_tracks_owner ON tracks(owner_id);
CREATE INDEX IF NOT EXISTS idx_stems_track ON stems(track_id);
CREATE INDEX IF NOT EXISTS idx_remixes_owner ON remixes(owner_id);
CREATE INDEX IF NOT EXISTS idx_lanes_remix ON remix_lanes(remix_id);

-- Added with the Studio mixing/FX update: lanes carry an effect rack and a
-- BPM override, and a remix carries its project tempo, master level and
-- loop region. Stored as JSON so the mixer can grow without a migration
-- per knob. These ALTERs are idempotent, so re-running this file is safe.
ALTER TABLE remix_lanes ADD COLUMN IF NOT EXISTS settings_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE remixes ADD COLUMN IF NOT EXISTS project_json TEXT NOT NULL DEFAULT '{}';

-- Listening stats: a remix page counts a play after a few seconds of
-- listening, and signed-in listeners can like a remix (once each).
-- lib/models.ts also applies these on first use, so a database that
-- missed this migration still works.
ALTER TABLE remixes ADD COLUMN IF NOT EXISTS play_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS remix_likes (
  remix_id TEXT NOT NULL REFERENCES remixes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (remix_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_remix_likes_user ON remix_likes(user_id);

-- Social: following artists and commenting on remixes. XP, levels, badges
-- and leaderboards are worked out from these and the tables above (see
-- lib/social.ts, which also creates these on first use).
CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
CREATE TABLE IF NOT EXISTS remix_comments (
  id TEXT PRIMARY KEY,
  remix_id TEXT NOT NULL REFERENCES remixes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_remix ON remix_comments(remix_id, created_at);

-- Rights and moderation: uploaders confirm they may share a song, and
-- anyone can report a remix, comment or song, or file a takedown request.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL, -- 'remix' | 'comment' | 'track' | 'takedown'
  target_id TEXT,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reporter_email TEXT,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved | dismissed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);

-- Notifications: likes, comments, follows and remixes of your work.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- like | comment | follow | remix | challenge
  remix_id TEXT REFERENCES remixes(id) ON DELETE CASCADE,
  track_id TEXT REFERENCES tracks(id) ON DELETE CASCADE,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- Genres/moods as tags, remix credits (what a remix was remixed from) and
-- comments pinned to a moment in the song.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE remixes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE remixes ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES remixes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_remixes_parent ON remixes(parent_id);
ALTER TABLE remix_comments ADD COLUMN IF NOT EXISTS at_seconds DOUBLE PRECISION;

-- Remix challenges: one vocal and one beat, everyone remixes the pair.
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  vocal_stem_id TEXT REFERENCES stems(id) ON DELETE SET NULL,
  beat_stem_id TEXT REFERENCES stems(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE remixes ADD COLUMN IF NOT EXISTS challenge_id TEXT REFERENCES challenges(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_remixes_challenge ON remixes(challenge_id);

-- Shared projects: a Studio mix several artists edit together.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

-- The split queue: songs queued from a phone, split by a helper's computer
-- (see src/lib/splitQueue.ts).
CREATE TABLE IF NOT EXISTS split_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  source_key TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'uploading', -- uploading | queued | working | done | failed
  worker_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  heartbeat_at TIMESTAMPTZ,
  progress REAL NOT NULL DEFAULT 0,
  stage TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  failed_by TEXT[] NOT NULL DEFAULT '{}',
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_split_jobs_status ON split_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_split_jobs_owner ON split_jobs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_jobs_worker ON split_jobs(worker_id) WHERE status = 'done';

-- Who's online right now, for the live counts on the home page (see
-- src/lib/presence.ts, which also creates this on first use). One row per
-- browser; a row older than a minute or so means they've gone.
CREATE TABLE IF NOT EXISTS presence (
  session_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  area TEXT NOT NULL DEFAULT 'browsing',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen);

-- Remix covers (a picture the owner uploads) and referrals (who invited whom).
ALTER TABLE remixes ADD COLUMN IF NOT EXISTS cover_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Live sessions: an artist performs a published remix and listeners (guests
-- too) hear it in step, chat and send reactions. lib/live.ts also creates
-- these on first use.
CREATE TABLE IF NOT EXISTS live_streams (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'live', -- scheduled | live | ended
  remix_id TEXT REFERENCES remixes(id) ON DELETE SET NULL,
  chat_mode TEXT NOT NULL DEFAULT 'open', -- open | followers | off
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
);
CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_streams_host ON live_streams(host_id, created_at DESC);
CREATE TABLE IF NOT EXISTS live_events (
  id BIGSERIAL PRIMARY KEY,
  stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  guest_name TEXT,
  kind TEXT NOT NULL, -- chat | reaction
  body TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_events_stream ON live_events(stream_id, id);
CREATE TABLE IF NOT EXISTS live_viewers (
  stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stream_id, session_id)
);
CREATE TABLE IF NOT EXISTS live_reactions (
  stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stream_id, emoji)
);
CREATE TABLE IF NOT EXISTS live_bans (
  stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  who TEXT NOT NULL, -- user:<id> or sid:<browser id>
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stream_id, who)
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS live_id TEXT REFERENCES live_streams(id) ON DELETE CASCADE;
-- Featured example songs: real songs an admin picks for the /examples page.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS featured_example BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS example_credit TEXT;

-- Studio sessions: the host makes a remix live in the Studio, and the whole
-- mix travels with the session (see lib/live.ts).
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'perform'; -- perform | studio
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS mix_json TEXT NOT NULL DEFAULT '';
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS mix_version INTEGER NOT NULL DEFAULT 0;
