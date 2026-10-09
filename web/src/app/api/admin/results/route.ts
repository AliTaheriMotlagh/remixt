import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin, deleteStemResults } from "@/lib/admin";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { RESULT_KINDS } from "@/lib/stemResults";

// Results browsers shared about stems (lib/stemResults.ts), newest first,
// with who sent each — so one that's wrong, or everything from someone
// sending junk, can be deleted.

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureSchema();
  const q = `%${(req.nextUrl.searchParams.get("q") ?? "").trim()}%`;
  const results = await sql`
    SELECT stem_results.stem_id, stem_results.kind, stem_results.version, stem_results.bytes, stem_results.created_at,
           stems.kind AS stem_kind, tracks.title AS track_title,
           users.id AS sender_id, users.artist_name AS sender_name, users.email AS sender_email
    FROM stem_results
    JOIN stems ON stems.id = stem_results.stem_id
    JOIN tracks ON tracks.id = stems.track_id
    LEFT JOIN users ON users.id = stem_results.created_by
    WHERE tracks.title ILIKE ${q} OR users.artist_name ILIKE ${q} OR users.email ILIKE ${q}
    ORDER BY stem_results.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ results });
}

const deleteSchema = z.union([
  z.object({ stemId: z.string().min(1), kind: z.enum(RESULT_KINDS) }),
  z.object({ userId: z.string().min(1) }),
]);

export async function DELETE(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say which results" }, { status: 400 });
  await ensureSchema();
  return NextResponse.json({ deleted: await deleteStemResults(parsed.data) });
}
