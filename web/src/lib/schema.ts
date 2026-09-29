import sql from "./db";
import { ensureSocialSchema } from "./social";

// Tables and columns added after the first release: moderation reports,
// notifications, tags, remix credits, timed comments, challenges and
// shared projects. The same statements are in scripts/schema.sql; this
// applies them on first use (once per server instance), because hosted
// databases don't get schema.sql re-run on deploy. All idempotent.

let applied: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  applied ??= (async () => {
    await ensureSocialSchema();
    // Already set up (the usual case): one quick look instead of twenty
    // statements on every cold start. project_members is created last.
    const [ready] = await sql<{ ok: boolean }[]>`SELECT to_regclass('project_members') IS NOT NULL AS ok`;
    if (ready?.ok) return;

    // Rights and moderation.
    await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMPTZ`;
    await sql`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        target_id TEXT,
        reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        reporter_email TEXT,
        reason TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at)`;

    // Notifications.
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        remix_id TEXT REFERENCES remixes(id) ON DELETE CASCADE,
        track_id TEXT REFERENCES tracks(id) ON DELETE CASCADE,
        body TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        read_at TIMESTAMPTZ
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`;

    // Tags, credits and timed comments.
    await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`;
    await sql`ALTER TABLE remixes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`;
    await sql`ALTER TABLE remixes ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES remixes(id) ON DELETE SET NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_remixes_parent ON remixes(parent_id)`;
    await sql`ALTER TABLE remix_comments ADD COLUMN IF NOT EXISTS at_seconds DOUBLE PRECISION`;

    // Challenges.
    await sql`
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
      )
    `;
    await sql`ALTER TABLE remixes ADD COLUMN IF NOT EXISTS challenge_id TEXT REFERENCES challenges(id) ON DELETE SET NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_remixes_challenge ON remixes(challenge_id)`;

    // Shared projects (remixing together).
    await sql`
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
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, user_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id)`;
  })();
  applied.catch(() => (applied = null));
  return applied;
}
