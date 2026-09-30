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
