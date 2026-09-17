import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { startSeparation } from "@/lib/separation";

const schema = z.object({
  url: z.string().url(),
  filename: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
});

// Called by the browser right after a client-side Blob upload finishes
// (see /api/tracks/upload). Creates the track row and kicks off separation.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { url, filename, title } = parsed.data;

  const trackId = randomUUID();
  const resolvedTitle = title?.trim() || path.basename(filename, path.extname(filename));

  await sql`
    INSERT INTO tracks (id, owner_id, title, original_filename, status, original_url)
    VALUES (${trackId}, ${user.id}, ${resolvedTitle}, ${filename}, 'processing', ${url})
  `;

  startSeparation(trackId, url);

  return NextResponse.json({ id: trackId, title: resolvedTitle, status: "processing" });
}
