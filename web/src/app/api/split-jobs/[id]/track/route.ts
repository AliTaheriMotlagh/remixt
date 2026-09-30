import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { attachTrack, getJob, isWorkerOf, SESSION_HEADER } from "@/lib/splitQueue";
import { createTrackForUpload, splitTrackSchema } from "@/lib/trackUpload";

/**
 * The helper has split the song: create its track — owned by whoever
 * queued it, under the title and tags they gave it — and hand back where
 * each stem goes. The helper uploads them, then calls .../complete.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!isWorkerOf(job, user.id, req.headers.get(SESSION_HEADER))) {
    return NextResponse.json({ error: "This song isn't yours to split any more" }, { status: 409 });
  }
  const parsed = splitTrackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await createTrackForUpload(job.owner_id, {
    ...parsed.data,
    title: job.title,
    filename: job.filename,
    tags: job.tags,
    recording: false,
  });
  if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
  await attachTrack(job.id, created.id);
  return NextResponse.json(created);
}
