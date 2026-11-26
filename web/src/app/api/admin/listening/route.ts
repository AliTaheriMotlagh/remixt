import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentAdmin } from "@/lib/admin";
import { ensureSchema } from "@/lib/schema";
import { listenTotals } from "@/lib/listenStore";

// Admin → Analytics → Listening (admin only): songs heard over ?days, and
// how many library songs have been measured (tempo, key, energy).
export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asked = Number(req.nextUrl.searchParams.get("days"));
  const days = [1, 7, 28, 90, 365].includes(asked) ? asked : 28;
  await ensureSchema();
  const [listening, [songs]] = await Promise.all([
    listenTotals(days),
    sql<{ songs: number; measured: number; keyed: number }[]>`
      SELECT count(*)::int AS songs, count(analysis_json)::int AS measured, count(music_key)::int AS keyed
      FROM tracks WHERE status = 'ready' AND visibility = 'public'
    `,
  ]);
  return NextResponse.json({ days, listening, songs }, { headers: { "Cache-Control": "no-store" } });
}
