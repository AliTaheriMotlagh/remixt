import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { deleteObject, putObject } from "@/lib/storage";
import { imageExtension } from "@/lib/imageType";

// A song's cover picture: set by the browser right after an upload (from
// the file's own tags, see lib/client/audioCover.ts) or by the owner later.
// Shrunk to a square JPEG in the browser before it's sent. Served by any of
// the song's stems (app/api/stems/[id]/cover).

const MAX_BYTES = 1024 * 1024;

async function ownTrack(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  await ensureSchema();
  const [track] = await sql<{ owner_id: string; cover_key: string | null }[]>`SELECT owner_id, cover_key FROM tracks WHERE id = ${id}`;
  if (!track) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (track.owner_id !== user.id) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { track };
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { track, error } = await ownTrack(id);
  if (error) return error;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "That picture is too big (1 MB at most)" }, { status: 413 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "That picture is too big (1 MB at most)" }, { status: 413 });
  const ext = imageExtension(body);
  if (!ext) return NextResponse.json({ error: "Use a JPEG or PNG picture" }, { status: 400 });
  const key = `track-covers/${id}/${Date.now().toString(36)}${ext}`;
  await putObject(key, body);
  await sql`UPDATE tracks SET cover_key = ${key} WHERE id = ${id}`;
  if (track.cover_key) await deleteObject(track.cover_key).catch(() => {});
  return NextResponse.json({ ok: true, key });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { track, error } = await ownTrack(id);
  if (error) return error;
  await sql`UPDATE tracks SET cover_key = NULL WHERE id = ${id}`;
  if (track.cover_key) await deleteObject(track.cover_key).catch(() => {});
  return NextResponse.json({ ok: true });
}
