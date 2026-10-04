import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { completeJob, getJob, isWorkerOf, SESSION_HEADER } from "@/lib/splitQueue";

/** The helper has uploaded every stem: the song lands in its owner's library, and the helper is paid. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!isWorkerOf(job, user.id, req.headers.get(SESSION_HEADER))) {
    return NextResponse.json({ error: "This song isn't yours to split any more" }, { status: 409 });
  }
  const reward = await completeJob(job);
  if (!reward) {
    return NextResponse.json({ error: "The stems haven't finished uploading" }, { status: 409 });
  }
  return NextResponse.json({ id: job.id, trackId: job.track_id, status: "done", reward });
}
