import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { ANALYSIS_VERSION } from "@/lib/trackAnalysis";

// A few public songs nobody has measured yet (or measured the old way),
// newest first, with their beat stems: what a miner with nothing to split
// measures meanwhile (see lib/client/splitQueue.ts), so every song in the
// library — the old ones too — gets its tempo, key and energy. Random among
// the oldest-waiting few, so two miners rarely pick the same one.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await ensureSchema();
  const songs = await sql<{ id: string; bpm: number | null; duration: number | null; beat_stem_id: string }[]>`
    SELECT * FROM (
      SELECT tracks.id, tracks.bpm, tracks.duration, stems.id AS beat_stem_id
      FROM tracks JOIN stems ON stems.track_id = tracks.id AND stems.kind = 'beat'
      WHERE tracks.status = 'ready' AND tracks.visibility = 'public'
        AND (tracks.analysis_json IS NULL OR COALESCE((tracks.analysis_json->>'v')::int, 0) < ${ANALYSIS_VERSION})
      ORDER BY tracks.created_at DESC
      LIMIT 20
    ) waiting
    ORDER BY random()
    LIMIT 3
  `;
  return NextResponse.json(
    { songs: songs.map((s) => ({ trackId: s.id, bpm: s.bpm === null ? null : Number(s.bpm), duration: s.duration === null ? null : Number(s.duration), beatStemId: s.beat_stem_id })) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
