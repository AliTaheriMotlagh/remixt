import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cancelJob, getJob } from "@/lib/splitQueue";

/** The owner takes a song out of the queue (or clears a failed one); the file is deleted. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status === "done") return NextResponse.json({ error: "It's already in your library" }, { status: 409 });
  await cancelJob(job);
  return new NextResponse(null, { status: 204 });
}
