import { NextRequest, NextResponse } from "next/server";
import { mayUse } from "@/lib/billing/store";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { visibleTo } from "@/lib/trackAccess";
import { embeddedCover, ImportError, importSong } from "@/lib/linkImport";
import {
  cancelJob,
  createJob,
  getJob,
  jobsForOwner,
  markQueued,
  MAX_SOURCE_BYTES,
  miningStats,
  openJobWithHash,
  queueStats,
  retryJob,
  sourceExtension,
  stillUploading,
  topMiners,
} from "@/lib/splitQueue";
import { createUploadTarget, putObject, storageProblem } from "@/lib/storage";

// Fetching a song from a link can take a while on a slow site.
export const maxDuration = 300;

/** Your songs waiting in the split queue, how busy the queue is, and what you've mined. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const [jobs, stats, mining, miners] = await Promise.all([
    jobsForOwner(user.id),
    queueStats(user.id),
    miningStats(user.id),
    topMiners(5),
  ]);
  return NextResponse.json({ jobs, stats, mining, miners });
}

const rights = z.literal(true, { error: "Confirm you have the right to upload this song" });
const tags = z.array(z.string().max(40)).max(20).default([]);

const bodySchema = z.union([
  // A file on the phone: it uploads the song to the target this returns,
  // then calls /api/split-jobs/<id>/queued.
  z.object({
    title: z.string().trim().min(1).max(200),
    filename: z.string().min(1).max(300),
    size: z.number().int().positive(),
    tags,
    rightsConfirmed: rights,
    /** Kept to its owner when split (they share or publish it later). */
    private: z.boolean().default(false),
    // The job an earlier try at this same file was going into: carried on, if it's still there.
    resume: z.string().uuid().optional(),
    /** SHA-256 of the file: the same song isn't queued twice, nor split again when it's in the library. */
    sourceHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  }),
  // A link: fetched here, straight into the queue.
  z.object({ link: z.string().trim().min(1).max(2000), tags, rightsConfirmed: rights, private: z.boolean().default(false) }),
]);

/** Puts a song in the queue for a helper's computer to split. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const problem = storageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Splitting from a phone keeps the song on Remixt's storage; a link is fetched by its server: Plus, when the owner says so.
  const gate = await mayUse(user, "link" in parsed.data ? "linkImport" : "queue");
  if (!gate.ok) return NextResponse.json(gate, { status: 402 });
  const body = parsed.data;

  if ("link" in body) {
    let song;
    try {
      song = await importSong(body.link, AbortSignal.timeout((maxDuration - 30) * 1000));
    } catch (err) {
      if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 422 });
      console.error("queue link import failed", err);
      return NextResponse.json({ error: "Couldn't import that link" }, { status: 500 });
    }
    const title = song.title.slice(0, 200) || "Untitled";
    const job = await createJob(user.id, { title, filename: `${title}.${song.ext}`, tags: body.tags, ext: song.ext, keepPrivate: body.private });
    try {
      await putObject(job.source_key, song.bytes);
    } catch (err) {
      await cancelJob(job);
      throw err;
    }
    // Its cover: from the file's own tags, else the page it was on.
    const cover = (await embeddedCover(song.bytes)) ?? song.cover ?? null;
    if (cover) {
      const key = `job-covers/${job.id}${cover.ext}`;
      await putObject(key, cover.data)
        .then(() => sql`UPDATE split_jobs SET cover_key = ${key} WHERE id = ${job.id}`)
        .catch(() => {});
    }
    const error = await markQueued(job);
    if (error) return NextResponse.json({ error }, { status: 409 });
    return NextResponse.json({ id: job.id, title });
  }

  const ext = sourceExtension(body.filename);
  if (!ext) {
    return NextResponse.json({ error: "That file type can't be queued — use MP3, M4A, WAV, FLAC, OGG or AAC" }, { status: 400 });
  }
  if (body.size > MAX_SOURCE_BYTES) {
    return NextResponse.json(
      { error: `That file is too big to queue (the limit is ${MAX_SOURCE_BYTES / 1024 / 1024} MB) — try an MP3 or M4A` },
      { status: 413 }
    );
  }
  if (body.sourceHash) {
    // This very file is in the library already (theirs, or anyone's they can see): nothing to split.
    await ensureSchema();
    const [track] = await sql<{ id: string; title: string; artist_name: string; mine: boolean }[]>`
      SELECT tracks.id, tracks.title, users.artist_name, tracks.owner_id = ${user.id} AS mine
      FROM tracks JOIN users ON users.id = tracks.owner_id
      WHERE tracks.source_hash = ${body.sourceHash} AND tracks.status = 'ready' AND ${visibleTo(user.id)}
      ORDER BY (tracks.owner_id = ${user.id}) DESC, tracks.created_at
      LIMIT 1
    `;
    if (track) return NextResponse.json({ existing: track });
    // Already on its way into their queue (a second tap, the same song picked twice): that one, not another.
    const open = await openJobWithHash(user.id, body.sourceHash);
    if (open && open.status !== "uploading") {
      // One that couldn't be split goes round again rather than sit beside a copy.
      if (open.status === "failed") await retryJob(open);
      return NextResponse.json({ id: open.id, alreadyQueued: true, title: open.title });
    }
    if (open && !body.resume) body.resume = open.id;
  }
  // A try that was interrupted (a reload, the line going away) carries on
  // into the same job, where the relay kept what it had been sent.
  const earlier = body.resume ? await getJob(body.resume) : undefined;
  const resumed = !!earlier && earlier.owner_id === user.id && earlier.status === "uploading" && earlier.filename === body.filename;
  const job = resumed
    ? earlier
    : await createJob(user.id, { title: body.title, filename: body.filename, tags: body.tags, ext, keepPrivate: body.private, sourceHash: body.sourceHash ?? null });
  if (resumed) await stillUploading(job);
  const upload = await createUploadTarget(job.source_key, `/api/split-jobs/${job.id}/source`, MAX_SOURCE_BYTES);
  return NextResponse.json({ id: job.id, upload, resumed });
}
