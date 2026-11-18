import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { imageExtension } from "@/lib/imageType";
import { getJob } from "@/lib/splitQueue";
import { putObject } from "@/lib/storage";

// The cover of a song queued from a phone: read from the file's tags in
// the browser (lib/audioCover.ts) before the file is shrunk for the queue,
// and given to the track once a helper has split it (see ../track).

const MAX_BYTES = 1024 * 1024;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "That picture is too big (1 MB at most)" }, { status: 413 });
  const ext = imageExtension(body);
  if (!ext) return NextResponse.json({ error: "Use a JPEG or PNG picture" }, { status: 400 });
  const key = `job-covers/${job.id}${ext}`;
  await putObject(key, body);
  await sql`UPDATE split_jobs SET cover_key = ${key} WHERE id = ${job.id}`;
  // Split already: the track gets it now.
  if (job.track_id) await sql`UPDATE tracks SET cover_key = ${key} WHERE id = ${job.track_id} AND cover_key IS NULL`;
  return NextResponse.json({ ok: true });
}
