import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStemsByTrack, getTrackById } from "@/lib/models";
import { isTrackWorker } from "@/lib/splitQueue";
import { MAX_STEM_BYTES as MAX_BYTES, writeStorageStream } from "@/lib/storage";
import { finishRelay, relaySession, takeRelayPart } from "@/lib/uploadRelay";

// Joining a relayed upload's slices reads and writes the whole file.
export const maxDuration = 300;

// Upload target for the local-disk storage backend. (With Blob or R2 the
// browser uploads straight to the store — unless it can't reach it, when
// it sends the stem here a slice at a time instead: ?relay=…, see
// lib/uploadRelay.ts.) Only the track's owner (or its helper) can write,
// only while the track is still being created.

type Params = { params: Promise<{ id: string; kind: string }> };

/** The stem being uploaded, if this user may write it now; else the answer to give. */
async function writableStem(params: Params["params"]) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };

  const { id, kind } = await params;
  const track = await getTrackById(id);
  // Its owner — or the helper splitting it for them (see lib/splitQueue.ts).
  if (!track || (track.owner_id !== user.id && !(await isTrackWorker(id, user.id)))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (track.status !== "processing") {
    return { error: NextResponse.json({ error: "This track is already finished" }, { status: 409 }) };
  }
  const stem = (await getStemsByTrack(id)).find((s) => s.kind === kind);
  if (!stem) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { stem };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const found = await writableStem(params);
  if (found.error) return found.error;
  const { stem } = found;

  const session = relaySession(req.nextUrl);
  if (session) {
    const { status, body } = await takeRelayPart(req, session, MAX_BYTES);
    return NextResponse.json(body, { status });
  }
  if (!req.body) return NextResponse.json({ error: "Empty upload" }, { status: 400 });

  const bytes = await writeStorageStream(stem.file_url, req.body, MAX_BYTES);
  if (bytes > MAX_BYTES) {
    return NextResponse.json({ error: "Stem is too large" }, { status: 413 });
  }
  if (bytes === 0) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** The last request of a relayed upload: join its slices into the stem. */
export async function POST(req: NextRequest, { params }: Params) {
  const found = await writableStem(params);
  if (found.error) return found.error;
  const session = relaySession(req.nextUrl);
  if (!session) return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  const { status, body } = await finishRelay(req, session, found.stem.file_url, MAX_BYTES);
  return NextResponse.json(body, { status });
}
