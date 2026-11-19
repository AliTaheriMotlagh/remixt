import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import sql from "@/lib/db";
import { imageExtension } from "@/lib/imageType";
import { deleteObject, putObject } from "@/lib/storage";
import { closeFieldReports, ensureSongFixSchema } from "@/lib/songFixes";

// Admin → Fix songs: a cover picture uploaded by hand (JPEG/PNG, squared in the browser, 1 MB).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > 1024 * 1024) return NextResponse.json({ error: "Too big (1 MB at most)" }, { status: 413 });
  const ext = imageExtension(body);
  if (!ext) return NextResponse.json({ error: "Use a JPEG or PNG picture" }, { status: 400 });
  await ensureSongFixSchema();
  const [track] = await sql<{ cover_key: string | null }[]>`SELECT cover_key FROM tracks WHERE id = ${id}`;
  if (!track) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  const key = `track-covers/${id}/${Date.now().toString(36)}${ext}`;
  await putObject(key, body);
  await sql`UPDATE tracks SET cover_key = ${key}, cover_searched_at = now() WHERE id = ${id}`;
  if (track.cover_key) await deleteObject(track.cover_key).catch(() => {});
  await closeFieldReports(id, ["cover"]);
  return NextResponse.json({ ok: true });
}
