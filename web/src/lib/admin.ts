import { getCurrentUser, type User } from "./auth";
import sql from "./db";
import { deleteStemFile } from "./storage";

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
  const deleted = await sql`DELETE FROM tracks WHERE id IN ${sql(trackIds)} RETURNING id`;
  return deleted.length;
}
