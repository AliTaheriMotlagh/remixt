import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { completeJob, getJob } from "@/lib/splitQueue";

/** The helper has uploaded every stem: the song lands in its owner's library. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.status !== "working" || job.worker_id !== user.id) {
    return NextResponse.json({ error: "This song isn't yours to split any more" }, { status: 409 });
  }
  if (!(await completeJob(job))) {
    return NextResponse.json({ error: "The stems haven't finished uploading" }, { status: 409 });
  }
  return NextResponse.json({ id: job.id, trackId: job.track_id, status: "done" });
}
