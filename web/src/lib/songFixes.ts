// Keeping songs right: their names, artists, covers and lyrics. Anyone can
// say something's wrong ("Wrong info?" — into the admin's queue); the admin
// panel lists the songs most likely to be wrong first, with suggestions to
// approve in one click (see components/admin/SongFixTab.tsx).

import { randomUUID } from "crypto";
import sql from "./db";
import { ensureSchema } from "./schema";
import { doubts, tidyName } from "./songFixRules";
import { ensureLyricsSchema } from "./itemLyrics";

export { doubts, INFO_FIELDS, tidyName, type InfoField } from "./songFixRules";
import type { InfoField } from "./songFixRules";

let ready: Promise<void> | null = null;

export function ensureSongFixSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await ensureLyricsSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS info_reports (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        fields TEXT[] NOT NULL,
        suggestion TEXT NOT NULL DEFAULT '',
        reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS info_reports_open ON info_reports (kind, item_id) WHERE status = 'open'`;
    // When the admin last looked at a song and found it right (it drops down the list).
    await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS info_checked_at TIMESTAMPTZ`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function reportWrongInfo(input: { kind: "track" | "remix"; itemId: string; fields: InfoField[]; suggestion: string; reporterId: string | null }) {
  await ensureSongFixSchema();
  const [exists] =
    input.kind === "track"
      ? await sql`SELECT 1 FROM tracks WHERE id = ${input.itemId}`
      : await sql`SELECT 1 FROM remixes WHERE id = ${input.itemId} AND published`;
  if (!exists) return { error: "Not found" };
  await sql`
    INSERT INTO info_reports (id, kind, item_id, fields, suggestion, reporter_id)
    VALUES (${randomUUID()}, ${input.kind}, ${input.itemId}, ${input.fields}, ${input.suggestion}, ${input.reporterId})
  `;
  return { ok: true };
}

export type FixRow = {
  id: string; title: string; owner: string; created_at: string; duration: number | null;
  hasCover: boolean; hasLyrics: boolean; coverStem: string | null; usedIn: number; checkedAt: string | null;
  reports: { id: string; fields: string[]; suggestion: string; created_at: string; reporter: string | null }[];
  doubts: string[]; suggestedName: string;
};

/** Songs for the panel: reported ones first, then the most doubtful; `q` searches names. */
export async function songsToFix({ q = "", only = "doubtful" }: { q?: string; only?: "doubtful" | "reported" | "all" } = {}): Promise<FixRow[]> {
  await ensureSongFixSchema();
  const rows = await sql<{
    id: string; title: string; artist_name: string; created_at: string; duration: number | null; cover_key: string | null; lyrics: boolean;
    stem: string | null; used: number; checked: string | null; reports: FixRow["reports"] | null;
  }[]>`
    SELECT t.id, t.title, u.artist_name, t.created_at, t.duration, t.cover_key, t.info_checked_at AS checked,
      EXISTS (SELECT 1 FROM item_lyrics il WHERE il.kind = 'track' AND il.item_id = t.id) AS lyrics,
      (SELECT s.id FROM stems s WHERE s.track_id = t.id ORDER BY s.kind LIMIT 1) AS stem,
      (SELECT COUNT(DISTINCT l.remix_id)::int FROM remix_lanes l JOIN stems s ON s.id = l.stem_id WHERE s.track_id = t.id) AS used,
      (SELECT json_agg(json_build_object('id', r.id, 'fields', r.fields, 'suggestion', r.suggestion, 'created_at', r.created_at, 'reporter', ru.artist_name) ORDER BY r.created_at DESC)
         FROM info_reports r LEFT JOIN users ru ON ru.id = r.reporter_id WHERE r.kind = 'track' AND r.item_id = t.id AND r.status = 'open') AS reports
    FROM tracks t JOIN users u ON u.id = t.owner_id
    WHERE t.status = 'ready' AND NOT ('studio recording' = ANY(t.tags)) AND t.title ILIKE ${`%${q}%`}
    ORDER BY t.created_at DESC LIMIT 500
  `;
  const list = rows.map((r) => {
    const reports = r.reports ?? [];
    const d = doubts({ title: r.title, hasCover: !!r.cover_key, hasLyrics: r.lyrics, reports: reports.length });
    return {
      id: r.id, title: r.title, owner: r.artist_name, created_at: r.created_at, duration: r.duration,
      hasCover: !!r.cover_key, hasLyrics: r.lyrics, coverStem: r.stem, usedIn: r.used, checkedAt: r.checked,
      reports, doubts: d, suggestedName: tidyName(r.title),
    } satisfies FixRow;
  });
  const filtered = list.filter((r) => (only === "reported" ? r.reports.length > 0 : only === "doubtful" ? r.doubts.length > 0 : true));
  // Reported first, then by how many doubts (one checked lately sinks), then the most used.
  const score = (r: FixRow) => r.reports.length * 100 + r.doubts.length * 10 - (r.checkedAt ? 50 : 0) + Math.min(9, r.usedIn);
  return filtered.sort((a, b) => score(b) - score(a)).slice(0, 200);
}

/** Remix reports (a remix's own title or its credits) for the same queue. */
export async function remixReports() {
  await ensureSongFixSchema();
  return sql<{ id: string; item_id: string; title: string; fields: string[]; suggestion: string; created_at: string; reporter: string | null }[]>`
    SELECT r.id, r.item_id, x.title, r.fields, r.suggestion, r.created_at, u.artist_name AS reporter
    FROM info_reports r JOIN remixes x ON x.id = r.item_id LEFT JOIN users u ON u.id = r.reporter_id
    WHERE r.kind = 'remix' AND r.status = 'open' ORDER BY r.created_at DESC LIMIT 100
  `;
}

export async function closeReports(ids: string[], status: "done" | "dismissed") {
  if (!ids.length) return;
  await ensureSongFixSchema();
  await sql`UPDATE info_reports SET status = ${status}, decided_at = now() WHERE id IN ${sql(ids)} AND status = 'open'`;
}

/** A song's name approved: renamed, marked checked, its open reports about the name closed. */
export async function renameSong(id: string, title: string) {
  await ensureSongFixSchema();
  await sql`UPDATE tracks SET title = ${title}, info_checked_at = now() WHERE id = ${id}`;
  await sql`UPDATE info_reports SET status = 'done', decided_at = now()
            WHERE kind = 'track' AND item_id = ${id} AND status = 'open' AND fields && ARRAY['name', 'artist']::text[]`;
}

export async function markChecked(id: string) {
  await ensureSongFixSchema();
  await sql`UPDATE tracks SET info_checked_at = now() WHERE id = ${id}`;
  await sql`UPDATE info_reports SET status = 'done', decided_at = now() WHERE kind = 'track' AND item_id = ${id} AND status = 'open'`;
}

export async function closeFieldReports(id: string, fields: InfoField[]) {
  await ensureSongFixSchema();
  await sql`UPDATE info_reports SET status = 'done', decided_at = now()
            WHERE kind = 'track' AND item_id = ${id} AND status = 'open' AND fields && ${fields}::text[]`;
}

export async function openReportCount(): Promise<number> {
  await ensureSongFixSchema();
  const [r] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM info_reports WHERE status = 'open'`;
  return r?.n ?? 0;
}
