import { randomBytes, randomUUID } from "crypto";
import sql from "./db";
import { ensureSchema } from "./schema";

// Shared projects: a Studio mix that several artists edit together. The
// whole mix is one JSON document with a version number; a save names the
// version it was based on, and is refused (with the newer copy) if someone
// else saved in between — the browser merges and tries again (see
// lib/client/collab.ts). No websockets, so it runs on serverless hosting:
// browsers poll, cheaply, asking only "anything newer than version N?".

/** Members seen this recently count as "here now". */
const ONLINE_SECONDS = 15;
/** A shared mix can't grow past this (peaks included). */
export const MAX_STATE_BYTES = 1_500_000;

export type ProjectMember = { id: string; artist_name: string; avatar_color: string; online: boolean; owner: boolean };

export type ProjectInfo = {
  id: string;
  title: string;
  owner_id: string;
  version: number;
  invite_code: string;
  updated_at: string;
  updated_by_name: string | null;
};

function inviteCode() {
  return randomBytes(8).toString("base64url");
}

export async function createProject(ownerId: string, title: string, state: string) {
  await ensureSchema();
  const id = randomUUID();
  const code = inviteCode();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO projects (id, owner_id, title, state_json, updated_by, invite_code)
      VALUES (${id}, ${ownerId}, ${title}, ${state}, ${ownerId}, ${code})
    `;
    await tx`INSERT INTO project_members (project_id, user_id) VALUES (${id}, ${ownerId})`;
  });
  return { id, inviteCode: code, version: 1 };
}

/** The project, if `userId` is a member (and marks them as here now). */
export async function projectForMember(id: string, userId: string): Promise<ProjectInfo | null> {
  await ensureSchema();
  const seen = await sql`
    UPDATE project_members SET last_seen_at = now()
    WHERE project_id = ${id} AND user_id = ${userId}
    RETURNING 1
  `;
  if (seen.length === 0) return null;
  const [project] = await sql<ProjectInfo[]>`
    SELECT projects.id, projects.title, projects.owner_id, projects.version, projects.invite_code, projects.updated_at,
           users.artist_name AS updated_by_name
    FROM projects LEFT JOIN users ON users.id = projects.updated_by
    WHERE projects.id = ${id}
  `;
  return project ?? null;
}

export async function projectState(id: string): Promise<string> {
  const [row] = await sql<{ state_json: string }[]>`SELECT state_json FROM projects WHERE id = ${id}`;
  return row?.state_json ?? "{}";
}

export async function projectMembers(id: string): Promise<ProjectMember[]> {
  return sql<ProjectMember[]>`
    SELECT users.id, users.artist_name, users.avatar_color,
           (project_members.last_seen_at > now() - make_interval(secs => ${ONLINE_SECONDS})) AS online,
           (projects.owner_id = users.id) AS owner
    FROM project_members
    JOIN users ON users.id = project_members.user_id
    JOIN projects ON projects.id = project_members.project_id
    WHERE project_members.project_id = ${id}
    ORDER BY project_members.joined_at
  `;
}

/**
 * Saves a new version if `baseVersion` is still the latest. Returns the new
 * version, or null if someone else got there first.
 */
export async function saveProject(id: string, userId: string, baseVersion: number, state: string) {
  const rows = await sql<{ version: number }[]>`
    UPDATE projects SET state_json = ${state}, version = version + 1, updated_by = ${userId}, updated_at = now()
    WHERE id = ${id} AND version = ${baseVersion}
    RETURNING version
  `;
  return rows[0]?.version ?? null;
}

export async function joinProject(code: string, userId: string): Promise<string | null> {
  await ensureSchema();
  const [project] = await sql<{ id: string }[]>`SELECT id FROM projects WHERE invite_code = ${code}`;
  if (!project) return null;
  const [count] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM project_members WHERE project_id = ${project.id}`;
  if (count.n >= 8) {
    const [already] = await sql`SELECT 1 FROM project_members WHERE project_id = ${project.id} AND user_id = ${userId}`;
    if (!already) throw new Error("This session is full (8 people)");
  }
  await sql`
    INSERT INTO project_members (project_id, user_id) VALUES (${project.id}, ${userId})
    ON CONFLICT (project_id, user_id) DO UPDATE SET last_seen_at = now()
  `;
  return project.id;
}

/** Leaves a project; the owner leaving deletes it for everyone. */
export async function leaveProject(id: string, userId: string) {
  await ensureSchema();
  const [project] = await sql<{ owner_id: string }[]>`SELECT owner_id FROM projects WHERE id = ${id}`;
  if (!project) return;
  if (project.owner_id === userId) await sql`DELETE FROM projects WHERE id = ${id}`;
  else await sql`DELETE FROM project_members WHERE project_id = ${id} AND user_id = ${userId}`;
}

export async function myProjects(userId: string) {
  await ensureSchema();
  return sql<{ id: string; title: string; updated_at: string; members: number; owner: boolean }[]>`
    SELECT projects.id, projects.title, projects.updated_at,
           (SELECT COUNT(*) FROM project_members m WHERE m.project_id = projects.id)::int AS members,
           (projects.owner_id = ${userId}) AS owner
    FROM projects JOIN project_members ON project_members.project_id = projects.id
    WHERE project_members.user_id = ${userId}
    ORDER BY projects.updated_at DESC
    LIMIT 30
  `;
}
