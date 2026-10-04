import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// The other stems Demucs split out of the same song as this one — its
// vocals, drums, bass and melody ("other") — so the Studio can use them
// straight away instead of splitting the stem again: the beat swapped for
// its parts (for drops and breakdowns), a beat's original vocal, and so
// on. Stems are playable by anyone (see /api/audio/stem), so this reveals
// nothing new.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parts = await sql<
    {
      id: string;
      kind: string;
      track_title: string;
      artist_name: string;
      peaks_json: string;
      track_duration: number | null;
      track_bpm: number | null;
    }[]
  >`
    SELECT part.id, part.kind, tracks.title AS track_title, users.artist_name, part.peaks_json,
           tracks.duration AS track_duration, tracks.bpm AS track_bpm
    FROM stems
    JOIN stems part ON part.track_id = stems.track_id AND part.id <> stems.id
                   AND part.kind IN ('vocals', 'drums', 'bass', 'other')
    JOIN tracks ON tracks.id = part.track_id AND tracks.status = 'ready'
    JOIN users ON users.id = tracks.owner_id
    WHERE stems.id = ${id}
    ORDER BY array_position(ARRAY['vocals', 'drums', 'bass', 'other'], part.kind)
  `;
  return NextResponse.json({ parts });
}
