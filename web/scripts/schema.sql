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
