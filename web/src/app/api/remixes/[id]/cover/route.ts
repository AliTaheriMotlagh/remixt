import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureRemixStats } from "@/lib/models";
import { deleteObject, putObject, serveObject } from "@/lib/storage";

// A remix's cover picture. The Studio/remix page shrinks it in the browser
// (a square JPEG or PNG, well under the limit) before it's sent here.

const MAX_BYTES = 2 * 1024 * 1024;

type Row = { owner_id: string; published: boolean; cover_key: string | null };

async function remixRow(id: string): Promise<Row | undefined> {
  await ensureRemixStats();
  const [row] = await sql<Row[]>`SELECT owner_id, published, cover_key FROM remixes WHERE id = ${id}`;
  return row;
}

/** JPEG or PNG, told by the file's first bytes rather than what the browser claims. */
function imageExtension(bytes: Buffer): ".jpg" | ".png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const remix = await remixRow(id);
  if (!remix?.cover_key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!remix.published) {
    const user = await getCurrentUser();
    if (user?.id !== remix.owner_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const res = await serveObject(remix.cover_key, req.headers.get("range"));
  // The URL carries the key (?v=…), so a replaced cover gets a new URL.
  if (res.ok && !res.headers.has("location")) res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return res;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const remix = await remixRow(id);
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (remix.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "That picture is too big (2 MB at most)" }, { status: 413 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "That picture is too big (2 MB at most)" }, { status: 413 });
  const ext = imageExtension(body);
  if (!ext) return NextResponse.json({ error: "Use a JPEG or PNG picture" }, { status: 400 });

  const key = `covers/${id}/${Date.now().toString(36)}${ext}`;
  await putObject(key, body);
  await sql`UPDATE remixes SET cover_key = ${key}, updated_at = now() WHERE id = ${id}`;
  if (remix.cover_key) await deleteObject(remix.cover_key).catch(() => {});
  return NextResponse.json({ ok: true, key });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const remix = await remixRow(id);
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (remix.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await sql`UPDATE remixes SET cover_key = NULL, updated_at = now() WHERE id = ${id}`;
  if (remix.cover_key) await deleteObject(remix.cover_key).catch(() => {});
  return NextResponse.json({ ok: true });
}
