import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getJob, isWorkerOf, MAX_SOURCE_BYTES, SESSION_HEADER, stillUploading } from "@/lib/splitQueue";
import { serveObject, writeStorageStream } from "@/lib/storage";
import { finishRelay, relaySession, takeRelayPart } from "@/lib/uploadRelay";

// Joining a relayed upload's slices reads and writes the whole file.
export const maxDuration = 300;

// The queued song itself: the helper splitting it downloads it from here
// (and only while it's theirs to split); on the local-disk storage backend
// the phone also uploads it here.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  // In the query rather than a header: this may redirect to the storage's
  // CDN, and a custom header would make that a request it has to approve.
  const session = req.nextUrl.searchParams.get("session") ?? req.headers.get(SESSION_HEADER);
  if (!isWorkerOf(job, user.id, session)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return serveObject(job.source_key, req.headers.get("range"));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "uploading") return NextResponse.json({ error: "Already uploaded" }, { status: 409 });
  // A browser that can't reach the store sends the song here a slice at a time.
  const session = relaySession(req.nextUrl);
  if (session) {
    const { status, body } = await takeRelayPart(req, session, MAX_SOURCE_BYTES);
    if (status === 200) await stillUploading(job);
    return NextResponse.json(body, { status });
  }
  if (!req.body) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  const bytes = await writeStorageStream(job.source_key, req.body, MAX_SOURCE_BYTES);
  if (bytes > MAX_SOURCE_BYTES) return NextResponse.json({ error: "That file is too big" }, { status: 413 });
  if (bytes === 0) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** The last request of a relayed upload: join its slices into the queued song. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "uploading") return NextResponse.json({ error: "Already uploaded" }, { status: 409 });
  const session = relaySession(req.nextUrl);
  if (!session) return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  const { status, body } = await finishRelay(req, session, job.source_key, MAX_SOURCE_BYTES);
  return NextResponse.json(body, { status });
}
