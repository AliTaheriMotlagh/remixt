import { getCurrentUser, type User } from "./auth";
import sql from "./db";
import { deleteObject, deleteStemFile } from "./storage";

// Admins are the accounts whose email is listed in ADMIN_EMAILS
// (comma-separated). Set it in the host's environment variables and
// redeploy; nobody is an admin without it.

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdmin(user: Pick<User, "email"> | null | undefined): boolean {
  return !!user && adminEmails().has(user.email.toLowerCase());
}

/** The signed-in admin, or null for anyone else. */
export async function currentAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return isAdmin(user) ? user : null;
}

/**
 * Deletes tracks and their stem files. Remix lanes that used the stems go
 * with them (the database cascades), so remixes built on these songs lose
 * those lanes.
 */
export async function deleteTracks(trackIds: string[]): Promise<number> {
  if (trackIds.length === 0) return 0;
  const stems = await sql<{ file_url: string }[]>`
    SELECT file_url FROM stems WHERE track_id IN ${sql(trackIds)}
  `;
  await Promise.all(stems.map((s) => deleteStemFile(s.file_url).catch(() => {})));
  // Results shared from the stems (lib/stemResults.ts) — their rows go with the stems.
  const results = await sql<{ storage_key: string }[]>`
    SELECT storage_key FROM stem_results
    WHERE stem_id IN (SELECT id FROM stems WHERE track_id IN ${sql(trackIds)})
  `.catch(() => []);
  await Promise.all(results.map((r) => deleteObject(r.storage_key).catch(() => {})));
  const deleted = await sql`DELETE FROM tracks WHERE id IN ${sql(trackIds)} RETURNING id`;
  return deleted.length;
}

/**
 * Deletes shared stem results (lib/stemResults.ts) and their files: one
 * (a stem's result of a kind), everything a person sent (a bad actor), or
 * every result made by code that's since changed (an older version). The
 * next browser to open the stem works it out again and sends a new one.
 */
export async function deleteStemResults(
  which: { stemId: string; kind: string } | { userId: string } | { outdated: Record<string, number> }
): Promise<number> {
  const rows =
    "stemId" in which
      ? await sql<{ storage_key: string }[]>`
          DELETE FROM stem_results WHERE stem_id = ${which.stemId} AND kind = ${which.kind} RETURNING storage_key
        `
      : "userId" in which
        ? await sql<{ storage_key: string }[]>`
            DELETE FROM stem_results WHERE created_by = ${which.userId} RETURNING storage_key
          `
        : await sql<{ storage_key: string }[]>`
            DELETE FROM stem_results
            WHERE version < COALESCE((${JSON.stringify(which.outdated)}::jsonb ->> kind)::int, 2147483647)
            RETURNING storage_key
          `;
  await Promise.all(rows.map((r) => deleteObject(r.storage_key).catch(() => {})));
  return rows.length;
}
