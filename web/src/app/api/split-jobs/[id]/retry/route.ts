import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getJob, retryJob } from "@/lib/splitQueue";

/** The owner puts a song that couldn't be split back in the queue for another go. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "failed") return NextResponse.json({ error: "It's already in the queue" }, { status: 409 });
  if (!(await retryJob(job))) {
    return NextResponse.json({ error: "The song is gone from the queue — upload it again" }, { status: 410 });
  }
  return NextResponse.json({ id: job.id, status: "queued" });
}
