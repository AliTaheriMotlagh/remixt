import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { serveObject } from "@/lib/storage";
import { canHearStem } from "@/lib/trackAccess";

// A song's cover picture, by one of its stems — all a Studio lane, a
// library preview or a DJ deck knows of the song. 204 (nothing, and no
// error in the console for every song without one) when it has none
// (the page then draws one from the song's waveform, see SongArt), kept
// a while either way so a lane doesn't ask again on every render.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureSchema();
  const [row] = await sql<{ cover_key: string | null }[]>`
    SELECT tracks.cover_key FROM stems JOIN tracks ON tracks.id = stems.track_id WHERE stems.id = ${id}
  `;
  const none = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, max-age=600" } });
  if (!row?.cover_key) return none();
  if (!(await canHearStem(id, await getCurrentUser()))) return none();
  const res = await serveObject(row.cover_key, req.headers.get("range"));
  // A replaced cover shows within the hour.
  if (res.ok && !res.headers.has("location")) res.headers.set("Cache-Control", "private, max-age=3600");
  return res;
}
