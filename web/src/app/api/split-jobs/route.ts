import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkLink, downloadSong, ImportError } from "@/lib/linkImport";
import {
  cancelJob,
  createJob,
  jobsForOwner,
  markQueued,
  MAX_SOURCE_BYTES,
  miningStats,
  queueStats,
  sourceExtension,
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
  }),
  // A link: fetched here, straight into the queue.
  z.object({ link: z.string().trim().min(1).max(2000), tags, rightsConfirmed: rights }),
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
  const body = parsed.data;

  if ("link" in body) {
    let song;
    try {
      song = await downloadSong(await checkLink(body.link), AbortSignal.timeout((maxDuration - 30) * 1000));
    } catch (err) {
      if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 422 });
      console.error("queue link import failed", err);
      return NextResponse.json({ error: "Couldn't import that link" }, { status: 500 });
    }
    const title = song.title.slice(0, 200) || "Untitled";
    const job = await createJob(user.id, { title, filename: `${title}.${song.ext}`, tags: body.tags, ext: song.ext });
    try {
      await putObject(job.source_key, song.bytes);
    } catch (err) {
      await cancelJob(job);
      throw err;
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
  const job = await createJob(user.id, { title: body.title, filename: body.filename, tags: body.tags, ext });
  const upload = await createUploadTarget(job.source_key, `/api/split-jobs/${job.id}/source`, MAX_SOURCE_BYTES);
  return NextResponse.json({ id: job.id, upload });
}
