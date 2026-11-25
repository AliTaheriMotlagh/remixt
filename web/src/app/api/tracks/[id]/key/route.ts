import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { allow, clientKey, TOO_MANY } from "@/lib/rateLimit";
import { ensureSchema } from "@/lib/schema";

// PUT { tonic, mode }: a song's key, as a browser measured it (the examples
// lab, from its beat). Kept the first time only — after that the song has
// one, and nobody can overwrite it — so every visitor's suggestions can rank
// the whole library, not just the songs measured on their own device.
const schema = z.object({ tonic: z.number().int().min(0).max(11), mode: z.enum(["major", "minor"]) });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{1,80}$/.test(id)) return NextResponse.json({ error: "Bad song" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad key" }, { status: 400 });
  if (!(await allow(`song-key:${clientKey(req)}`, 120, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  await ensureSchema();
  const rows = await sql`
    UPDATE tracks SET music_key = ${`${parsed.data.tonic}:${parsed.data.mode}`}
    WHERE id = ${id} AND music_key IS NULL AND status = 'ready' AND visibility = 'public'
    RETURNING id
  `;
  return NextResponse.json({ kept: rows.length === 1 });
}
