import sql from "./db";
import { ensureSchema } from "./schema";
import type { Listen } from "./listens";

// Listens on the server (see lib/listens.ts): one row per song heard.
// Rows are small; past a few million, roll them up by day (PLAN.md).

let ready: Promise<void> | null = null;

export function ensureListenSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS listens (
        id BIGSERIAL PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT now(),
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        source TEXT NOT NULL,
        station TEXT,
        seconds REAL NOT NULL,
        duration REAL,
        completed BOOLEAN NOT NULL DEFAULT false,
        skipped BOOLEAN NOT NULL DEFAULT false,
        user_id TEXT,
        visitor TEXT NOT NULL,
        country TEXT NOT NULL DEFAULT ''
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS listens_item ON listens (kind, item_id, at)`;
    await sql`CREATE INDEX IF NOT EXISTS listens_at ON listens (at)`;
    await sql`CREATE INDEX IF NOT EXISTS listens_user ON listens (user_id, at) WHERE user_id IS NOT NULL`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export async function recordListens(listens: Listen[], who: { visitor: string; userId: string | null; country: string }) {
  if (!listens.length) return;
  await ensureListenSchema();
  await sql`
    INSERT INTO listens ${sql(
      listens.map((l) => ({
        kind: l.kind,
        item_id: l.id,
        source: l.source,
        station: l.station ?? null,
        seconds: l.seconds,
        duration: l.duration,
        completed: l.completed,
        skipped: l.skipped,
        user_id: who.userId,
        visitor: who.visitor,
        country: who.country,
      }))
    )}
  `;
}

export type ListenTotals = { listens: number; hours: number; completed: number; skipped: number; listeners: number };

/** Listening over the last `days`, for Admin: how much, and how much of it to the end. */
export async function listenTotals(days = 7): Promise<ListenTotals & { bySource: { source: string; listens: number; hours: number }[] }> {
  await ensureListenSchema();
  const [all] = await sql<ListenTotals[]>`
    SELECT count(*)::int AS listens, COALESCE(sum(seconds), 0)::float / 3600 AS hours,
           count(*) FILTER (WHERE completed)::int AS completed, count(*) FILTER (WHERE skipped)::int AS skipped,
           count(DISTINCT visitor)::int AS listeners
    FROM listens WHERE at > now() - make_interval(days => ${days})
  `;
  const bySource = await sql<{ source: string; listens: number; hours: number }[]>`
    SELECT source, count(*)::int AS listens, COALESCE(sum(seconds), 0)::float / 3600 AS hours
    FROM listens WHERE at > now() - make_interval(days => ${days})
    GROUP BY source ORDER BY listens DESC
  `;
  return { ...all, bySource };
}
