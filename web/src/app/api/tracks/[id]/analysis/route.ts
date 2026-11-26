import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { allow, clientKey, TOO_MANY } from "@/lib/rateLimit";
import { ensureSchema } from "@/lib/schema";
import { parseTrackAnalysis } from "@/lib/trackAnalysis";

// PUT a song's analysis (lib/trackAnalysis.ts), as a browser measured it —
// on the decks, in the set planner, or a miner with nothing to split. Kept
// when the song has none yet, or one measured the old way (a lower
// version); after that nobody can overwrite it. The key goes to
// tracks.music_key too when it has none, for everything that reads that.
// Public songs, and a private one by its owner.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{1,80}$/.test(id)) return NextResponse.json({ error: "Bad song" }, { status: 400 });
  const analysis = parseTrackAnalysis(await req.json().catch(() => null));
  if (!analysis) return NextResponse.json({ error: "Bad analysis" }, { status: 400 });
  if (!(await allow(`song-analysis:${clientKey(req)}`, 240, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  await ensureSchema();
  const user = await getCurrentUser();
  const rows = await sql`
    UPDATE tracks SET analysis_json = ${sql.json(analysis as never)}, music_key = COALESCE(music_key, ${analysis.key})
    WHERE id = ${id} AND status = 'ready'
      AND (visibility = 'public' OR owner_id = ${user?.id ?? ""})
      AND (analysis_json IS NULL OR COALESCE((analysis_json->>'v')::int, 0) < ${analysis.v})
      -- A song this long can't have been measured from a beat this long: someone else's audio.
      AND (duration IS NULL OR abs(duration - ${analysis.duration}) < 3)
    RETURNING id
  `;
  return NextResponse.json({ kept: rows.length === 1 });
}
