import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getJob, MAX_SOURCE_BYTES } from "@/lib/splitQueue";
import { serveObject, writeStorageStream } from "@/lib/storage";

// The queued song itself: the helper splitting it downloads it from here
// (and only while it's theirs to split); on the local-disk storage backend
// the phone also uploads it here.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  const allowed = job && job.status === "working" && job.worker_id === user.id;
  if (!job || !allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return serveObject(job.source_key, req.headers.get("range"));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "uploading") return NextResponse.json({ error: "Already uploaded" }, { status: 409 });
  if (!req.body) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  const bytes = await writeStorageStream(job.source_key, req.body, MAX_SOURCE_BYTES);
  if (bytes > MAX_SOURCE_BYTES) return NextResponse.json({ error: "That file is too big" }, { status: 413 });
  if (bytes === 0) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
