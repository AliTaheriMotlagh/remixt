// Feedback and problems on the server (lib/feedback.ts has the rules).
//
// - feedback: what people send from the Feedback box, with the page, device
//   and the problems their browser had just before; the owner marks it seen /
//   done and can answer a member (the answer arrives in their bell).
// - problems: one row per kind of problem (kind + page + message, ids taken
//   out), with how often and for how many people; problem_hits keeps each
//   time for 30 days, so the owner can see who ran into it and what they did.

import sql from "./db";
import { ensureSchema } from "./schema";
import { notify } from "./notifications";
import { groupMessage, groupPath, problemKey, type FeedbackKind, type FeedbackStatus, type ProblemKind, type ProblemReport } from "./feedback";

let ready: Promise<void> | null = null;

export function ensureFeedbackSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS feedback (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        email TEXT,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        visitor TEXT,
        path TEXT NOT NULL DEFAULT '',
        device TEXT NOT NULL DEFAULT '',
        recent JSONB NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'new',
        answer TEXT,
        answered_at TIMESTAMPTZ
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS feedback_status ON feedback (status, at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS problems (
        key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        message TEXT NOT NULL,
        sample TEXT,
        count BIGINT NOT NULL DEFAULT 0,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        fixed_at TIMESTAMPTZ
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS problem_hits (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        key TEXT NOT NULL,
        visitor TEXT NOT NULL,
        user_id TEXT,
        path TEXT NOT NULL,
        device TEXT NOT NULL DEFAULT ''
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS problem_hits_key ON problem_hits (key, at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS problem_hits_user ON problem_hits (user_id, at DESC) WHERE user_id IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS problem_hits_at ON problem_hits (at)`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

// ——— collecting ———

export async function saveFeedback(f: {
  kind: FeedbackKind; message: string; email: string | null; userId: string | null; visitor: string | null; path: string; device: string; recent: ProblemReport[];
}): Promise<string> {
  await ensureFeedbackSchema();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO feedback (kind, message, email, user_id, visitor, path, device, recent)
    VALUES (${f.kind}, ${f.message}, ${f.email}, ${f.userId}, ${f.visitor}, ${f.path}, ${f.device}, ${sql.json(f.recent.slice(-10))})
    RETURNING id
  `;
  return row.id;
}

/** A browser's problems (already checked): counted per kind, each time kept for 30 days. */
export async function recordProblems(reports: ProblemReport[], who: { visitor: string; userId: string | null; device: string }): Promise<void> {
  if (!reports.length) return;
  await ensureFeedbackSchema();
  for (const r of reports) {
    const key = problemKey(r);
    // A problem marked fixed that comes back is open again (fixed_at cleared).
    await sql`
      INSERT INTO problems (key, kind, path, message, sample, count)
      VALUES (${key}, ${r.kind}, ${groupPath(r.path)}, ${groupMessage(r.message)}, ${r.detail ?? null}, 1)
      ON CONFLICT (key) DO UPDATE SET count = problems.count + 1, last_seen = now(), sample = COALESCE(EXCLUDED.sample, problems.sample), fixed_at = NULL
    `;
    await sql`INSERT INTO problem_hits (key, visitor, user_id, path, device) VALUES (${key}, ${who.visitor}, ${who.userId}, ${r.path}, ${who.device})`;
  }
  if (Math.random() < 0.02) void sql`DELETE FROM problem_hits WHERE at < now() - interval '30 days'`.catch(() => {});
}

// ——— the owner's view ———

const num = (x: unknown) => Number(x ?? 0);

export type FeedbackRow = {
  id: string; at: string; kind: FeedbackKind; message: string; email: string | null; user_id: string | null; artist_name: string | null;
  user_email: string | null; path: string; device: string; recent: ProblemReport[]; status: FeedbackStatus; answer: string | null;
};

export type ProblemRow = {
  key: string; kind: ProblemKind; path: string; message: string; sample: string | null; count: number; first_seen: string; last_seen: string;
  fixed_at: string | null; people: number; members: number; week: number;
};

export async function feedbackReport(days = 30) {
  await ensureFeedbackSchema();
  const [feedback, problems, daily, byPage, counts] = await Promise.all([
    sql<FeedbackRow[]>`
      SELECT f.id, f.at, f.kind, f.message, f.email, f.user_id, u.artist_name, u.email AS user_email, f.path, f.device, f.recent, f.status, f.answer
      FROM feedback f LEFT JOIN users u ON u.id = f.user_id
      ORDER BY (f.status = 'new') DESC, f.at DESC LIMIT 200
    `,
    sql<(Omit<ProblemRow, "count" | "people" | "members" | "week"> & { count: string; people: string; members: string; week: string })[]>`
      SELECT p.key, p.kind, p.path, p.message, p.sample, p.count, p.first_seen, p.last_seen, p.fixed_at,
             COUNT(DISTINCT h.visitor) AS people, COUNT(DISTINCT h.user_id) AS members,
             COUNT(h.id) FILTER (WHERE h.at > now() - interval '7 days') AS week
      FROM problems p LEFT JOIN problem_hits h ON h.key = p.key AND h.at > now() - make_interval(days => ${days})
      WHERE p.last_seen > now() - make_interval(days => ${days})
      GROUP BY p.key ORDER BY (p.fixed_at IS NULL) DESC, COUNT(DISTINCT h.visitor) DESC, p.count DESC LIMIT 200
    `,
    sql<{ day: string; kind: ProblemKind; hits: string; people: string }[]>`
      SELECT to_char(h.at::date, 'YYYY-MM-DD') AS day, p.kind, COUNT(*) AS hits, COUNT(DISTINCT h.visitor) AS people
      FROM problem_hits h JOIN problems p ON p.key = h.key
      WHERE h.at > now() - make_interval(days => ${Math.min(days, 30)})
      GROUP BY 1, 2 ORDER BY 1
    `,
    // Where people have the most trouble: pages by people with any problem.
    sql<{ path: string; people: string; hits: string }[]>`
      SELECT p.path, COUNT(DISTINCT h.visitor) AS people, COUNT(*) AS hits
      FROM problem_hits h JOIN problems p ON p.key = h.key
      WHERE h.at > now() - make_interval(days => ${Math.min(days, 30)})
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    `,
    sql<{ fresh: string; total: string }[]>`SELECT COUNT(*) FILTER (WHERE status = 'new') AS fresh, COUNT(*) AS total FROM feedback`,
  ]);
  return {
    feedback,
    problems: problems.map((p) => ({ ...p, count: num(p.count), people: num(p.people), members: num(p.members), week: num(p.week) })),
    daily: daily.map((d) => ({ day: d.day, kind: d.kind, hits: num(d.hits), people: num(d.people) })),
    byPage: byPage.map((p) => ({ path: p.path, people: num(p.people), hits: num(p.hits) })),
    counts: { newFeedback: num(counts[0]?.fresh), feedback: num(counts[0]?.total) },
  };
}

/** Who ran into one problem lately, and where (the newest 50). */
export async function problemHits(key: string) {
  await ensureFeedbackSchema();
  return sql<{ at: string; visitor: string; user_id: string | null; artist_name: string | null; path: string; device: string }[]>`
    SELECT h.at, h.visitor, h.user_id, u.artist_name, h.path, h.device
    FROM problem_hits h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.key = ${key} ORDER BY h.at DESC LIMIT 50
  `;
}

/** One member's problems lately (Admin → Users → Details). */
export async function problemsOfUser(userId: string) {
  await ensureFeedbackSchema();
  const [hits, feedback] = await Promise.all([
    sql<{ at: string; kind: ProblemKind; message: string; path: string }[]>`
      SELECT h.at, p.kind, p.message, h.path FROM problem_hits h JOIN problems p ON p.key = h.key
      WHERE h.user_id = ${userId} ORDER BY h.at DESC LIMIT 30
    `,
    sql<{ at: string; kind: FeedbackKind; message: string; status: FeedbackStatus }[]>`
      SELECT at, kind, message, status FROM feedback WHERE user_id = ${userId} ORDER BY at DESC LIMIT 20
    `,
  ]);
  return { hits, feedback };
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus) {
  await ensureFeedbackSchema();
  await sql`UPDATE feedback SET status = ${status} WHERE id = ${id}`;
}

/** The owner's answer: kept with the feedback and sent to the member's bell. */
export async function answerFeedback(id: string, answer: string, adminId: string): Promise<{ error: string } | null> {
  await ensureFeedbackSchema();
  const [row] = await sql<{ user_id: string | null }[]>`
    UPDATE feedback SET answer = ${answer}, answered_at = now(), status = 'done' WHERE id = ${id} RETURNING user_id
  `;
  if (!row) return { error: "Not found" };
  if (row.user_id) await notify({ userId: row.user_id, actorId: adminId, type: "feedback", body: answer.slice(0, 500) });
  return null;
}

export async function setProblemFixed(key: string, fixed: boolean) {
  await ensureFeedbackSchema();
  await sql`UPDATE problems SET fixed_at = ${fixed ? new Date() : null} WHERE key = ${key}`;
}
