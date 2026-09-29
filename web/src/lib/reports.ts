import { randomUUID } from "crypto";
import sql from "./db";
import { deleteTracks } from "./admin";
import { ensureSchema } from "./schema";

// Reports from listeners ("this remix is spam") and takedown requests from
// rights holders, both landing in the admin panel's Reports tab.

export const REPORT_KINDS = ["remix", "comment", "track", "takedown"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_REASONS = {
  spam: "Spam or misleading",
  abuse: "Harassment or hate",
  explicit: "Sexual or violent content",
  copyright: "Copyright — I own this and didn't allow it",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export type Report = {
  id: string;
  kind: ReportKind;
  target_id: string | null;
  reason: ReportReason;
  details: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  /** What was reported, for the admin list: a title or the comment text. */
  target_label: string | null;
  /** Where to look at it. */
  target_href: string | null;
};

/** Whether the thing being reported exists (and so can be reported). */
async function targetExists(kind: ReportKind, id: string) {
  const rows =
    kind === "remix"
      ? await sql`SELECT 1 FROM remixes WHERE id = ${id}`
      : kind === "comment"
        ? await sql`SELECT 1 FROM remix_comments WHERE id = ${id}`
        : await sql`SELECT 1 FROM tracks WHERE id = ${id}`;
  return rows.length > 0;
}

export async function createReport(input: {
  kind: ReportKind;
  targetId: string | null;
  reason: ReportReason;
  details: string;
  reporterId: string | null;
  reporterEmail: string | null;
}): Promise<{ error: string } | { id: string }> {
  await ensureSchema();
  if (input.kind !== "takedown") {
    if (!input.targetId || !(await targetExists(input.kind, input.targetId))) return { error: "Not found" };
  }
  // Ten an hour per person (or per email, for takedowns filed signed out).
  const [recent] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM reports
    WHERE created_at > now() - interval '1 hour'
      AND (reporter_id = ${input.reporterId ?? ""} OR reporter_email = ${input.reporterEmail ?? ""})
  `;
  if (recent.n >= 10) return { error: "Too many reports — try again in an hour" };

  // One open report per person per thing is enough.
  if (input.reporterId && input.targetId) {
    const [existing] = await sql`
      SELECT 1 FROM reports
      WHERE reporter_id = ${input.reporterId} AND target_id = ${input.targetId} AND status = 'open'
    `;
    if (existing) return { id: "duplicate" };
  }

  const id = randomUUID();
  await sql`
    INSERT INTO reports (id, kind, target_id, reporter_id, reporter_email, reason, details)
    VALUES (${id}, ${input.kind}, ${input.targetId}, ${input.reporterId}, ${input.reporterEmail},
            ${input.reason}, ${input.details})
  `;
  return { id };
}

export async function listReports(status: Report["status"] | "all" = "open"): Promise<Report[]> {
  await ensureSchema();
  return sql<Report[]>`
    SELECT r.id, r.kind, r.target_id, r.reason, r.details, r.status, r.created_at,
           r.reporter_id, reporter.artist_name AS reporter_name,
           COALESCE(r.reporter_email, reporter.email) AS reporter_email,
           COALESCE(remixes.title, tracks.title, comments.body) AS target_label,
           CASE
             WHEN remixes.id IS NOT NULL THEN '/remixes/' || remixes.id
             WHEN comments.id IS NOT NULL THEN '/remixes/' || comments.remix_id
             WHEN tracks.id IS NOT NULL THEN '/library?q=' || tracks.title
           END AS target_href
    FROM reports r
    LEFT JOIN users reporter ON reporter.id = r.reporter_id
    LEFT JOIN remixes ON r.kind IN ('remix', 'takedown') AND remixes.id = r.target_id
    LEFT JOIN tracks ON r.kind IN ('track', 'takedown') AND tracks.id = r.target_id
    LEFT JOIN remix_comments comments ON r.kind = 'comment' AND comments.id = r.target_id
    ${status === "all" ? sql`` : sql`WHERE r.status = ${status}`}
    ORDER BY r.created_at DESC
    LIMIT 200
  `;
}

/**
 * Closes a report. "remove" also deletes what was reported — the remix,
 * the comment, or the song with its stems — and closes every other open
 * report about the same thing.
 */
export async function closeReport(id: string, action: "resolve" | "dismiss" | "remove") {
  await ensureSchema();
  const [report] = await sql<{ kind: ReportKind; target_id: string | null }[]>`
    SELECT kind, target_id FROM reports WHERE id = ${id}
  `;
  if (!report) return false;

  if (action === "remove" && report.target_id) {
    const target = report.target_id;
    if (report.kind === "comment") {
      await sql`DELETE FROM remix_comments WHERE id = ${target}`;
    } else if (report.kind === "track") {
      await deleteTracks([target]);
    } else {
      // A remix, or a takedown naming a remix or a song.
      const removed = await sql`DELETE FROM remixes WHERE id = ${target} RETURNING id`;
      if (removed.length === 0) await deleteTracks([target]);
    }
    await sql`
      UPDATE reports SET status = 'resolved', resolved_at = now()
      WHERE target_id = ${target} AND status = 'open'
    `;
  }
  await sql`
    UPDATE reports SET status = ${action === "dismiss" ? "dismissed" : "resolved"}, resolved_at = now()
    WHERE id = ${id}
  `;
  return true;
}

/** Pulls a remix or track id out of a pasted Remixt link, for takedown requests. */
export async function targetFromLink(link: string): Promise<string | null> {
  await ensureSchema();
  const ids = link.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
  for (const candidate of ids) {
    const [row] = await sql`
      SELECT id FROM remixes WHERE id = ${candidate}
      UNION ALL SELECT id FROM tracks WHERE id = ${candidate}
      UNION ALL SELECT tracks.id FROM stems JOIN tracks ON tracks.id = stems.track_id WHERE stems.id = ${candidate}
      LIMIT 1
    `;
    if (row) return row.id as string;
  }
  // A short link (/r/<code>).
  const code = link.match(/\/r\/([0-9a-f]{8})\b/i)?.[1];
  if (code) {
    const rows = await sql<{ id: string }[]>`SELECT id FROM remixes WHERE id LIKE ${code.toLowerCase() + "%"} LIMIT 2`;
    if (rows.length === 1) return rows[0].id;
  }
  return null;
}
