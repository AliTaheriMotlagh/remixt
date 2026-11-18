import sql from "./db";
import { ensureSchema } from "./schema";
import { keyOfFileUrl, listStoredFiles, storageBackend, storageLimitBytes, type StoredFile } from "./storage";

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

export type StorageReport = Awaited<ReturnType<typeof storageReport>>;

export async function storageReport() {
  const [files, used] = await Promise.all([listStoredFiles(), referencedKeys()]);
  const now = Date.now();
  const size = new Map(files.map((f) => [f.key, f.size]));

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
    const bytes = size.get(keyOfFileUrl(s.file_url));
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
  };
}
