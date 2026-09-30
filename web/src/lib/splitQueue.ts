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
//                  └────────┘  helper gave up or went quiet (up to 4 tries)
//                           └→ failed ──(owner retries)──→ queued
//
// A working job has a heartbeat from its helper every few seconds; one
// that goes quiet (tab closed, laptop asleep) goes back in the queue, and
// a helper tab that reloads mid-song picks the same song straight back up.
// The song itself is deleted once it's in the library, or when its owner
// dismisses it (a failed one is kept until then, so it can be retried).

/** Biggest song that can be queued: ~12 minutes of WAV, or hours of MP3. */
export const MAX_SOURCE_BYTES = 120 * 1024 * 1024;
/** Tries before a song is given up on (its owner can still retry it). */
const MAX_ATTEMPTS = 4;
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
  /** Which of the helper's tabs has it (a tab that reloads gets it straight back). */
  worker_session: string | null;
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
    await sql`ALTER TABLE split_jobs ADD COLUMN IF NOT EXISTS worker_session TEXT`;
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
  // Not the helper's fault (a closed lid, a lost connection), so it isn't
  // held against it — it may be the only computer helping.
  for (const job of stale) await failJob(job, null, "The computer splitting it went offline");
}

/**
 * Gives a helper's tab (`session`) a song to split. First the one it was
 * already on, if it reloaded mid-way — rather than leaving that stuck
 * until it's reaped — otherwise the oldest waiting song. Songs this helper
 * has failed on go last, but aren't barred: when it's the only computer
 * helping, it's the only one who can finish them. Safe with many helpers
 * asking at once.
 */
export async function claimNext(workerId: string, session: string): Promise<SplitJob | null> {
  await ensureSplitQueueSchema();
  const resumed = await sql<SplitJob[]>`
    SELECT * FROM split_jobs
    WHERE status = 'working' AND worker_id = ${workerId} AND worker_session = ${session}
  `;
  for (const job of resumed) await failJob(job, null, "The page reloaded while splitting it");
  await reapStale();
  const [job] = await sql<SplitJob[]>`
    UPDATE split_jobs
    SET status = 'working', worker_id = ${workerId}, worker_session = ${session}, heartbeat_at = now(),
        progress = 0, stage = 'starting', attempts = attempts + 1, track_id = NULL, error = NULL, updated_at = now()
    WHERE id = (
      SELECT id FROM split_jobs
      WHERE status = 'queued'
      ORDER BY (${workerId} = ANY(failed_by)), (id = ANY(${resumed.map((j) => j.id)}::text[])) DESC, created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return job ?? null;
}

/** The header a helper's tab sends its session in (see claimNext). */
export const SESSION_HEADER = "x-split-session";

/**
 * Whether `job` is being split by this helper, in this tab. (A request
 * without a session — from a tab older than sessions — is taken on trust.)
 */
export function isWorkerOf(job: SplitJob | undefined, workerId: string, session: string | null): job is SplitJob {
  return (
    !!job &&
    job.status === "working" &&
    job.worker_id === workerId &&
    (session === null || job.worker_session === session)
  );
}

/** A helper checking in. False when the job isn't its any more (cancelled, or handed on). */
export async function heartbeat(
  jobId: string,
  workerId: string,
  session: string | null,
  progress: number,
  stage: string
): Promise<boolean> {
  const rows = await sql`
    UPDATE split_jobs
    SET heartbeat_at = now(), progress = ${Math.max(0, Math.min(1, progress))}, stage = ${stage.slice(0, 40)},
        updated_at = now()
    WHERE id = ${jobId} AND worker_id = ${workerId} AND status = 'working'
      AND (${session}::text IS NULL OR worker_session = ${session})
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
 * A helper couldn't finish: back in the queue for the next helper, or —
 * after MAX_ATTEMPTS — failed, with the reason shown to the owner. The
 * song is kept, so the owner can try again.
 */
export async function failJob(job: SplitJob, workerId: string | null, error: string) {
  await dropTrack(job.track_id);
  const giveUp = job.attempts >= MAX_ATTEMPTS;
  await sql`
    UPDATE split_jobs
    SET status = ${giveUp ? "failed" : "queued"},
        worker_id = ${giveUp ? job.worker_id : null}, worker_session = NULL,
        failed_by = CASE WHEN ${workerId}::text IS NULL THEN failed_by ELSE array_append(failed_by, ${workerId}::text) END,
        error = ${error.slice(0, 300)}, track_id = NULL, progress = 0, stage = NULL, heartbeat_at = NULL,
        updated_at = now()
    WHERE id = ${job.id} AND status = 'working'
  `;
}

/** The owner tries a failed song again, from a clean slate. False if the song is gone. */
export async function retryJob(job: SplitJob): Promise<boolean> {
  if (!(await storedObject(job.source_key))?.size) return false;
  await sql`
    UPDATE split_jobs
    SET status = 'queued', attempts = 0, failed_by = '{}', worker_id = NULL, worker_session = NULL,
        error = NULL, progress = 0, stage = NULL, created_at = now(), updated_at = now()
    WHERE id = ${job.id} AND status = 'failed'
  `;
  return true;
}

/** The owner changed their mind: the song is deleted, whatever stage it's at. */
export async function cancelJob(job: SplitJob) {
  await sql`DELETE FROM split_jobs WHERE id = ${job.id}`;
  await dropTrack(job.track_id);
  await deleteObject(job.source_key).catch(() => {});
}

export type OwnerJob = Pick<SplitJob, "id" | "title" | "status" | "progress" | "stage" | "error" | "attempts"> & {
  created_at: string;
  updated_at: string;
  /** 1 = next in line (queued only). */
  position: number | null;
  helper_name: string | null;
};

/** The songs someone has queued that aren't in their library yet. */
export async function jobsForOwner(ownerId: string): Promise<OwnerJob[]> {
  await ensureSplitQueueSchema();
  await reapStale();
  // A phone that never finished uploading (closed mid-way) leaves a job
  // behind, and a failed song left undismissed for a week has been forgotten.
  const abandoned = await sql<SplitJob[]>`
    SELECT * FROM split_jobs WHERE owner_id = ${ownerId} AND (
      (status = 'uploading' AND created_at < now() - interval '1 hour') OR
      (status = 'failed' AND updated_at < now() - interval '7 days')
    )
  `;
  for (const job of abandoned) await cancelJob(job);

  return sql<OwnerJob[]>`
    SELECT j.id, j.title, j.status, j.progress, j.stage, j.error, j.attempts, j.created_at, j.updated_at,
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
