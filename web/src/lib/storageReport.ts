import sql from "./db";
import { ensureSchema } from "./schema";
import {
  hasLegacyBlob,
  keyOfFileUrl,
  listLegacyBlobFiles,
  listStoredFiles,
  storageBackend,
  storageLimitBytes,
  type StoredFile,
} from "./storage";

// What's in storage and what it's for, for the admin's Storage tab: each
// file is either pointed at by a row (a song's stem, a cover, a shared
// result, a queued song) or left over — a song deleted while its file
// stayed, a cover since replaced, a link download nobody came back for.
// Leftovers can go without breaking anything.

export const STORAGE_GROUPS = {
  stems: "Song stems (vocals, beats, takes)",
  covers: "Remix covers",
  "track-covers": "Song covers",
  "job-covers": "Queued songs' covers",
  queue: "Songs waiting to be split",
  results: "Shared beats and analysis",
  imports: "Songs fetched from links",
  relay: "Uploads in pieces",
  system: "App's own files",
  other: "Other",
} as const;
export type StorageGroup = keyof typeof STORAGE_GROUPS;

/** A file this new may be mid-upload, its row not written yet: never called a leftover. */
const GRACE_MS = 60 * 60 * 1000;

function groupOf(key: string): StorageGroup {
  if (key.startsWith(".remixt/")) return "system";
  const head = key.split("/")[0];
  return head in STORAGE_GROUPS && head !== "system" && head !== "other" ? (head as StorageGroup) : "other";
}

/** Every key a row points at. */
async function referencedKeys(): Promise<Set<string>> {
  await ensureSchema();
  const keys = new Set<string>();
  const add = (rows: { key: string | null }[]) => rows.forEach((r) => r.key && keys.add(keyOfFileUrl(r.key)));
  add(await sql<{ key: string }[]>`SELECT file_url AS key FROM stems`);
  add(await sql<{ key: string | null }[]>`SELECT cover_key AS key FROM tracks WHERE cover_key IS NOT NULL`);
  add(await sql<{ key: string | null }[]>`SELECT cover_key AS key FROM remixes WHERE cover_key IS NOT NULL`.catch(() => []));
  add(await sql<{ key: string }[]>`SELECT storage_key AS key FROM stem_results`.catch(() => []));
  add(
    await sql<{ key: string | null }[]>`
      SELECT source_key AS key FROM split_jobs UNION ALL SELECT cover_key FROM split_jobs WHERE cover_key IS NOT NULL
    `.catch(() => [])
  );
  return keys;
}

function isLeftover(file: StoredFile, used: Set<string>, now: number) {
  const group = groupOf(file.key);
  if (group === "system" || used.has(file.key)) return false;
  return now - file.uploadedAt.getTime() > GRACE_MS;
}

/** Files nobody points at any more (checked afresh, so a delete never takes one that's in use). */
export async function findLeftovers(): Promise<StoredFile[]> {
  const [files, used] = await Promise.all([listStoredFiles(), referencedKeys()]);
  const now = Date.now();
  return files.filter((f) => isLeftover(f, used, now));
}

/**
 * Moving from Blob to R2: the old store's files, and which aren't in R2
 * yet (at the same size). Null without an old store; `error` when it
 * refuses — Vercel suspends a Hobby store that goes over its limits.
 */
export type LegacyStore =
  | { ok: true; files: number; bytes: number; moved: number; movedBytes: number; left: StoredFile[]; leftBytes: number }
  | { ok: false; error: string };

async function legacyStore(inR2: Map<string, number>): Promise<LegacyStore | null> {
  if (!hasLegacyBlob()) return null;
  let files: StoredFile[];
  try {
    files = await listLegacyBlobFiles();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.replace(/^Vercel Blob:\s*/, "") : "It didn't answer" };
  }
  const left = files.filter((f) => !f.key.startsWith(".remixt/") && inR2.get(f.key) !== f.size);
  const sum = (list: StoredFile[]) => list.reduce((n, f) => n + f.size, 0);
  return {
    ok: true,
    files: files.length,
    bytes: sum(files),
    moved: files.length - left.length,
    movedBytes: sum(files) - sum(left),
    left,
    leftBytes: sum(left),
  };
}

/** Files in the old Blob store that R2 holds at the same size: safe to delete from Blob. */
export async function legacyMovedKeys(): Promise<string[]> {
  const [inBlob, inR2] = await Promise.all([listLegacyBlobFiles(), listStoredFiles()]);
  const r2Size = new Map(inR2.map((f) => [f.key, f.size]));
  return inBlob.filter((f) => r2Size.get(f.key) === f.size).map((f) => f.key);
}

/** What's still only in the old Blob store (checked afresh). */
export async function legacyLeft(): Promise<LegacyStore | null> {
  const files = await listStoredFiles();
  return legacyStore(new Map(files.map((f) => [f.key, f.size])));
}

export type StorageReport = Awaited<ReturnType<typeof storageReport>>;

export async function storageReport() {
  const [files, used] = await Promise.all([listStoredFiles(), referencedKeys()]);
  const now = Date.now();
  const size = new Map(files.map((f) => [f.key, f.size]));
  const legacy = await legacyStore(size);
  const onlyInBlob = new Map(legacy?.ok ? legacy.left.map((f) => [f.key, f.size]) : []);

  const groups = new Map<StorageGroup, { files: number; bytes: number; leftoverFiles: number; leftoverBytes: number }>();
  const leftovers: { key: string; size: number; uploadedAt: string; group: StorageGroup }[] = [];
  let total = 0;
  for (const f of files) {
    const group = groupOf(f.key);
    const g = groups.get(group) ?? { files: 0, bytes: 0, leftoverFiles: 0, leftoverBytes: 0 };
    g.files++;
    g.bytes += f.size;
    total += f.size;
    if (isLeftover(f, used, now)) {
      g.leftoverFiles++;
      g.leftoverBytes += f.size;
      leftovers.push({ key: f.key, size: f.size, uploadedAt: f.uploadedAt.toISOString(), group });
    }
    groups.set(group, g);
  }
  leftovers.sort((a, b) => b.size - a.size);

  // The songs taking the most room: their stems' files added up.
  const stems = await sql<
    { track_id: string; file_url: string; title: string; status: string; created_at: string; artist_name: string | null; used_in_remixes: number }[]
  >`
    SELECT stems.track_id, stems.file_url, tracks.title, tracks.status, tracks.created_at, users.artist_name,
      (SELECT COUNT(DISTINCT rl.remix_id) FROM remix_lanes rl JOIN stems s2 ON s2.id = rl.stem_id WHERE s2.track_id = tracks.id)::int AS used_in_remixes
    FROM stems JOIN tracks ON tracks.id = stems.track_id LEFT JOIN users ON users.id = tracks.owner_id
  `;
  const songs = new Map<string, { id: string; title: string; status: string; createdAt: string; artist: string; usedInRemixes: number; bytes: number; files: number; missing: number }>();
  for (const s of stems) {
    const song = songs.get(s.track_id) ?? {
      id: s.track_id,
      title: s.title,
      status: s.status,
      createdAt: new Date(s.created_at).toISOString(),
      artist: s.artist_name ?? "—",
      usedInRemixes: s.used_in_remixes,
      bytes: 0,
      files: 0,
      missing: 0,
    };
    const key = keyOfFileUrl(s.file_url);
    const bytes = size.get(key) ?? onlyInBlob.get(key);
    if (bytes === undefined) song.missing++;
    else {
      song.bytes += bytes;
      song.files++;
    }
    songs.set(s.track_id, song);
  }
  const bySize = [...songs.values()].sort((a, b) => b.bytes - a.bytes);

  return {
    backend: storageBackend(),
    limit: storageLimitBytes(),
    total,
    files: files.length,
    groups: [...groups.entries()]
      .map(([id, g]) => ({ id, label: STORAGE_GROUPS[id], ...g }))
      .sort((a, b) => b.bytes - a.bytes),
    leftovers: leftovers.slice(0, 300),
    leftoverCount: leftovers.length,
    leftoverBytes: leftovers.reduce((n, f) => n + f.size, 0),
    songs: bySize.filter((s) => s.bytes > 0).slice(0, 100),
    /** Songs whose stems aren't in storage at all: they can't play. */
    brokenSongs: bySize.filter((s) => s.missing > 0 && s.status === "ready").length,
    /** The old Blob store while moving to R2 (its `left` trimmed to a count for the page). */
    legacy: legacy?.ok ? { ...legacy, left: undefined, leftCount: legacy.left.length } : legacy,
  };
}

// --- Starting over in storage (e.g. the old Blob store is gone) -----------------

/** Rows whose files aren't in storage, worked out afresh. */
export type MissingFiles = {
  /** Songs (and recorded takes) with a stem whose file isn't there: they can't play. */
  songIds: string[];
  /** Remixes that use one of those songs; `emptied` of them use nothing else and go too. */
  remixes: number;
  emptied: number;
  /** Covers (songs', remixes', queued songs') whose picture isn't there: they're drawn instead. */
  covers: number;
  /** Shared beats and analysis whose file isn't there: browsers work them out again. */
  results: number;
  /** Songs waiting to be split whose upload isn't there: they can never be split. */
  jobs: number;
};

/**
 * The listing has to be whole: a key missing from a cut-off one would
 * look like a file that's gone.
 */
const LIST_MAX = 50_000;

async function missingRows() {
  await ensureSchema();
  const files = await listStoredFiles(LIST_MAX);
  if (files.length >= LIST_MAX) throw new Error(`Storage holds over ${LIST_MAX} files: too many to check in one go`);
  const there = new Set(files.map((f) => f.key));
  const gone = (key: string | null) => !!key && !there.has(keyOfFileUrl(key));
  // Anything under an hour old may still be uploading (its row comes before its file).
  const stems = await sql<{ track_id: string; file_url: string }[]>`
    SELECT stems.track_id, stems.file_url FROM stems JOIN tracks ON tracks.id = stems.track_id
    WHERE tracks.created_at < now() - interval '1 hour'
  `;
  const songIds = [...new Set(stems.filter((s) => gone(s.file_url)).map((s) => s.track_id))];
  const trackCovers = await sql<{ id: string; cover_key: string }[]>`SELECT id, cover_key FROM tracks WHERE cover_key IS NOT NULL`;
  const remixCovers = await sql<{ id: string; cover_key: string }[]>`
    SELECT id, cover_key FROM remixes WHERE cover_key IS NOT NULL
  `.catch(() => []);
  const results = await sql<{ storage_key: string }[]>`SELECT storage_key FROM stem_results WHERE created_at < now() - interval '1 hour'`.catch(() => []);
  const jobs = await sql<{ id: string; source_key: string; cover_key: string | null; status: string }[]>`
    SELECT id, source_key, cover_key, status FROM split_jobs WHERE created_at < now() - interval '1 hour'
  `.catch(() => []);
  return {
    songIds,
    trackCovers: trackCovers.filter((r) => gone(r.cover_key)).map((r) => r.id),
    remixCovers: remixCovers.filter((r) => gone(r.cover_key)).map((r) => r.id),
    results: results.filter((r) => gone(r.storage_key)).map((r) => r.storage_key),
    // A finished job's upload is deleted once split: only waiting ones need theirs.
    jobs: jobs.filter((j) => j.status !== "done" && j.status !== "failed" && gone(j.source_key)).map((j) => j.id),
    jobCovers: jobs.filter((j) => gone(j.cover_key)).map((j) => j.id),
  };
}

async function remixesUsing(songIds: string[]) {
  if (!songIds.length) return { remixes: 0, emptied: 0 };
  const [row] = await sql<{ remixes: number; emptied: number }[]>`
    WITH hit AS (
      SELECT DISTINCT rl.remix_id FROM remix_lanes rl JOIN stems s ON s.id = rl.stem_id WHERE s.track_id IN ${sql(songIds)}
    )
    SELECT
      (SELECT COUNT(*) FROM hit)::int AS remixes,
      (SELECT COUNT(*) FROM hit WHERE NOT EXISTS (
        SELECT 1 FROM remix_lanes rl JOIN stems s ON s.id = rl.stem_id
        WHERE rl.remix_id = hit.remix_id AND s.track_id NOT IN ${sql(songIds)}
      ))::int AS emptied
  `;
  return row ?? { remixes: 0, emptied: 0 };
}

/** What starting over would remove — nothing is changed. */
export async function findMissing(): Promise<MissingFiles> {
  const rows = await missingRows();
  return {
    songIds: rows.songIds,
    ...(await remixesUsing(rows.songIds)),
    covers: rows.trackCovers.length + rows.remixCovers.length + rows.jobCovers.length,
    results: rows.results.length,
    jobs: rows.jobs.length,
  };
}

/**
 * Starts over with what storage really holds: deletes the songs whose
 * audio isn't there (remixes lose those lanes, and a remix left with none
 * goes), forgets covers and shared results whose files are gone, and drops
 * queued songs whose upload is gone. Everything that still has its files
 * stays exactly as it is. Checked afresh, so it only ever takes rows whose
 * files are missing right now.
 */
export async function removeMissing(): Promise<{ songs: number; remixes: number; covers: number; results: number; jobs: number }> {
  const rows = await missingRows();
  const { deleteTracks } = await import("./admin");
  const songs = await deleteTracks(rows.songIds);
  const remixes = await sql<{ id: string }[]>`
    DELETE FROM remixes WHERE NOT EXISTS (SELECT 1 FROM remix_lanes WHERE remix_lanes.remix_id = remixes.id) RETURNING id
  `;
  let covers = 0;
  if (rows.trackCovers.length) covers += (await sql`UPDATE tracks SET cover_key = NULL WHERE id IN ${sql(rows.trackCovers)} RETURNING id`).length;
  if (rows.remixCovers.length) covers += (await sql`UPDATE remixes SET cover_key = NULL WHERE id IN ${sql(rows.remixCovers)} RETURNING id`).length;
  if (rows.jobCovers.length) covers += (await sql`UPDATE split_jobs SET cover_key = NULL WHERE id IN ${sql(rows.jobCovers)} RETURNING id`).length;
  const results = rows.results.length
    ? (await sql`DELETE FROM stem_results WHERE storage_key IN ${sql(rows.results)} RETURNING stem_id`).length
    : 0;
  const jobs = rows.jobs.length ? (await sql`DELETE FROM split_jobs WHERE id IN ${sql(rows.jobs)} RETURNING id`).length : 0;
  return { songs, remixes: remixes.length, covers, results, jobs };
}
