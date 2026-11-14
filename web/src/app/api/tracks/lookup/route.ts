import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { visibleTo } from "@/lib/trackAccess";

// Before a song is split, the browser asks whether that exact file (by its
// SHA-256) is already in the library — uploaded before by this user (a
// retry, a second try after a reload) or by anyone else. Splitting takes
// minutes; this answer takes milliseconds, and the stems are the same.

const bodySchema = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await ensureSchema();
  const [track] = await sql<{ id: string; title: string; artist_name: string; mine: boolean }[]>`
    SELECT tracks.id, tracks.title, users.artist_name, tracks.owner_id = ${user.id} AS mine
    FROM tracks JOIN users ON users.id = tracks.owner_id
    WHERE tracks.source_hash = ${parsed.data.hash} AND tracks.status = 'ready' AND ${visibleTo(user.id)}
    ORDER BY (tracks.owner_id = ${user.id}) DESC, tracks.created_at
    LIMIT 1
  `;
  return NextResponse.json({ track: track ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
