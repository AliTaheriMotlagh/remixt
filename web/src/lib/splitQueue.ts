import { randomUUID } from "crypto";
import sql from "./db";
import { notify } from "./notifications";
import { deleteObject, deleteStemFile, storedObject } from "./storage";
import { normaliseTags } from "./tags";
import { finishTrackUpload } from "./trackUpload";

// The split queue: phones can't split a song themselves (the model needs
// more memory than a phone gives a web page), so they upload the song
// here instead, and a computer that has opted in to help ("Help split" on
// the Upload page) picks it up, splits it in its own browser and uploads
// the stems — as a track owned by whoever queued it.
//
//   uploading → queued → working → done
//                  ↑        │
//                  └────────┘  helper gave up or went quiet (up to 3 tries)
//                           └→ failed
//
// A working job has a heartbeat from its helper every few seconds; one
// that goes quiet (tab closed, laptop asleep) goes back in the queue. The
// song itself is deleted as soon as the job ends either way.

/** Biggest song that can be queued: ~12 minutes of WAV, or hours of MP3. */
export const MAX_SOURCE_BYTES = 120 * 1024 * 1024;
/** Tries before a song is given up on. */
const MAX_ATTEMPTS = 3;
/** Helpers check in every ~15s (background tabs can stretch that to a minute); this long without one and the job is handed on. */
const STALE_AFTER = "3 minutes";

export type SplitJobStatus = "uploading" | "queued" | "working" | "done" | "failed";

export type SplitJob = {
  id: string;
  owner_id: string;
  title: string;
  filename: string;
  source_key: string;
  tags: string[];
  status: SplitJobStatus;
  worker_id: string | null;
  heartbeat_at: Date | null;
  progress: number;
  stage: string | null;
  attempts: number;
  failed_by: string[];
  track_id: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

let schema: Promise<void> | null = null;

/** Creates the table on first use, so a database that missed the migration still works. */
export function ensureSplitQueueSchema(): Promise<void> {
  schema ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS split_jobs (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        source_key TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'uploading',
        worker_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        heartbeat_at TIMESTAMPTZ,
        progress REAL NOT NULL DEFAULT 0,
        stage TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        failed_by TEXT[] NOT NULL DEFAULT '{}',
        track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_split_jobs_status ON split_jobs(status, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_split_jobs_owner ON split_jobs(owner_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_split_jobs_worker ON split_jobs(worker_id) WHERE status = 'done'`;
  })();
  schema.catch(() => (schema = null));
  return schema;
}

/** Audio types a queued song can be, by extension (what storage can serve them as). */
const SOURCE_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "aac", "webm", "opus", "mp4"];

export function sourceExtension(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return SOURCE_EXTENSIONS.includes(ext) ? ext : null;
}

export async function createJob(
  ownerId: string,
  { title, filename, tags, ext, status = "uploading" }: {
    title: string;
    filename: string;
    tags: string[];
    ext: string;
    status?: "uploading" | "queued";
  }
): Promise<SplitJob> {
  await ensureSplitQueueSchema();
  const id = randomUUID();
  const [job] = await sql<SplitJob[]>`
    INSERT INTO split_jobs (id, owner_id, title, filename, source_key, tags, status)
    VALUES (${id}, ${ownerId}, ${title}, ${filename}, ${`queue/${ownerId}/${id}.${ext}`}, ${normaliseTags(tags)}, ${status})
    RETURNING *
  `;
  return job;
}

export async function getJob(id: string): Promise<SplitJob | undefined> {
  await ensureSplitQueueSchema();
  const [job] = await sql<SplitJob[]>`SELECT * FROM split_jobs WHERE id = ${id}`;
  return job;
}

/** The phone finished uploading the song: it joins the queue if the file is really there. */
export async function markQueued(job: SplitJob): Promise<string | null> {
  const stored = await storedObject(job.source_key);
  if (!stored?.size) return "The song hasn't finished uploading";
  if (stored.size > MAX_SOURCE_BYTES) {
    await deleteObject(job.source_key).catch(() => {});
    await sql`DELETE FROM split_jobs WHERE id = ${job.id}`;
    return "That file is too big to queue — try an MP3 or M4A of the song";
  }
  await sql`
    UPDATE split_jobs SET status = 'queued', updated_at = now()
    WHERE id = ${job.id} AND status = 'uploading'
  `;
  return null;
}

/** Deletes a half-made track (a helper that stopped mid-upload), files included. */
async function dropTrack(trackId: string | null) {
  if (!trackId) return;
  const stems = await sql<{ file_url: string }[]>`
    DELETE FROM stems WHERE track_id = ${trackId}
      AND EXISTS (SELECT 1 FROM tracks WHERE id = ${trackId} AND status = 'processing')
    RETURNING file_url
  `;
  await sql`DELETE FROM tracks WHERE id = ${trackId} AND status = 'processing'`;
  await Promise.all(stems.map((s) => deleteStemFile(s.file_url).catch(() => {})));
}

/** Hands jobs whose helper went quiet back to the queue (or gives up on them). */
async function reapStale() {
  const stale = await sql<SplitJob[]>`
    SELECT * FROM split_jobs
    WHERE status = 'working' AND heartbeat_at < now() - ${STALE_AFTER}::interval
  `;
  for (const job of stale) {
    await failJob(job, job.worker_id, "The computer splitting it went offline");
  }
}

/**
 * Gives `workerId` the oldest waiting song, if there is one — never one it
 * has already failed on. Safe with many helpers asking at once.
 */
export async function claimNext(workerId: string): Promise<SplitJob | null> {
  await ensureSplitQueueSchema();
  await reapStale();
  const [job] = await sql<SplitJob[]>`
    UPDATE split_jobs
    SET status = 'working', worker_id = ${workerId}, heartbeat_at = now(), progress = 0,
        stage = 'starting', attempts = attempts + 1, track_id = NULL, error = NULL, updated_at = now()
    WHERE id = (
      SELECT id FROM split_jobs
      WHERE status = 'queued' AND NOT (${workerId} = ANY(failed_by))
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return job ?? null;
}

/** A helper checking in. False when the job isn't its any more (cancelled, or handed on). */
export async function heartbeat(jobId: string, workerId: string, progress: number, stage: string): Promise<boolean> {
  const rows = await sql`
    UPDATE split_jobs
    SET heartbeat_at = now(), progress = ${Math.max(0, Math.min(1, progress))}, stage = ${stage.slice(0, 40)},
        updated_at = now()
    WHERE id = ${jobId} AND worker_id = ${workerId} AND status = 'working'
    RETURNING id
  `;
  return rows.length > 0;
}

export async function attachTrack(jobId: string, trackId: string) {
  await sql`UPDATE split_jobs SET track_id = ${trackId}, updated_at = now() WHERE id = ${jobId}`;
}

/** Whether `userId` is the helper currently uploading `trackId`'s stems. */
export async function isTrackWorker(trackId: string, userId: string): Promise<boolean> {
  await ensureSplitQueueSchema();
  const rows = await sql`
    SELECT 1 FROM split_jobs WHERE track_id = ${trackId} AND worker_id = ${userId} AND status = 'working'
  `;
  return rows.length > 0;
}

/** The helper has uploaded every stem: the track goes ready and the song is thrown away. */
export async function completeJob(job: SplitJob): Promise<boolean> {
  if (!job.track_id || !(await finishTrackUpload(job.track_id))) return false;
  await sql`
    UPDATE split_jobs SET status = 'done', progress = 1, stage = 'done', updated_at = now()
    WHERE id = ${job.id}
  `;
  await deleteObject(job.source_key).catch(() => {});
  await notify({ userId: job.owner_id, actorId: job.worker_id, type: "split", trackId: job.track_id, body: job.title });
  return true;
}

/**
 * A helper couldn't finish: back in the queue for someone else, or — after
 * MAX_ATTEMPTS — failed for good, with the reason shown to the owner.
 */
export async function failJob(job: SplitJob, workerId: string | null, error: string) {
  await dropTrack(job.track_id);
  const giveUp = job.attempts >= MAX_ATTEMPTS;
  await sql`
    UPDATE split_jobs
    SET status = ${giveUp ? "failed" : "queued"},
        worker_id = ${giveUp ? workerId : null},
        failed_by = CASE WHEN ${workerId}::text IS NULL THEN failed_by ELSE array_append(failed_by, ${workerId}::text) END,
        error = ${error.slice(0, 300)}, track_id = NULL, progress = 0, stage = NULL, heartbeat_at = NULL,
        updated_at = now()
    WHERE id = ${job.id} AND status = 'working'
  `;
  if (giveUp) await deleteObject(job.source_key).catch(() => {});
}

/** The owner changed their mind: the song is deleted, whatever stage it's at. */
export async function cancelJob(job: SplitJob) {
  await sql`DELETE FROM split_jobs WHERE id = ${job.id}`;
  await dropTrack(job.track_id);
  await deleteObject(job.source_key).catch(() => {});
}

export type OwnerJob = Pick<SplitJob, "id" | "title" | "status" | "progress" | "stage" | "error" | "attempts"> & {
  created_at: string;
  /** 1 = next in line (queued only). */
  position: number | null;
  helper_name: string | null;
};

/** The songs someone has queued that aren't in their library yet. */
export async function jobsForOwner(ownerId: string): Promise<OwnerJob[]> {
  await ensureSplitQueueSchema();
  await reapStale();
  // A phone that never finished uploading (closed mid-way) leaves a job behind.
  const abandoned = await sql<SplitJob[]>`
    SELECT * FROM split_jobs WHERE owner_id = ${ownerId} AND status = 'uploading'
      AND created_at < now() - interval '1 hour'
  `;
  for (const job of abandoned) await cancelJob(job);

  return sql<OwnerJob[]>`
    SELECT j.id, j.title, j.status, j.progress, j.stage, j.error, j.attempts, j.created_at,
      CASE WHEN j.status = 'queued' THEN (
        SELECT COUNT(*) FROM split_jobs q WHERE q.status = 'queued' AND q.created_at <= j.created_at
      )::int END AS position,
      CASE WHEN j.status = 'working' THEN u.artist_name END AS helper_name
    FROM split_jobs j
    LEFT JOIN users u ON u.id = j.worker_id
    WHERE j.owner_id = ${ownerId} AND j.status <> 'done'
    ORDER BY j.created_at DESC
  `;
}

export type QueueStats = {
  /** Songs waiting for a helper. */
  waiting: number;
  /** Songs being split right now. */
  working: number;
  /** Songs this user has split for other people. */
  helped: number;
};

export async function queueStats(userId: string): Promise<QueueStats> {
  await ensureSplitQueueSchema();
  const [row] = await sql<QueueStats[]>`
    SELECT
      (SELECT COUNT(*) FROM split_jobs WHERE status = 'queued')::int AS waiting,
      (SELECT COUNT(*) FROM split_jobs WHERE status = 'working')::int AS working,
      (SELECT COUNT(*) FROM split_jobs WHERE status = 'done' AND worker_id = ${userId} AND owner_id <> ${userId})::int AS helped
  `;
  return row;
}
