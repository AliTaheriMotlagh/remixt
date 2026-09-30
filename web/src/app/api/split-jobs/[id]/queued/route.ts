import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getJob, markQueued } from "@/lib/splitQueue";

/** The phone has finished uploading the song: it joins the queue. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const error = await markQueued(job);
  if (error) return NextResponse.json({ error }, { status: 409 });
  return NextResponse.json({ id: job.id, status: "queued" });
}
