import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// The other half of a stem's song: a vocal's beat, or a beat's vocal. The
// Studio's AI Match reads a vocal's original beat to find exactly where
// the singer's bars fall — the voice alone doesn't say. Stems are playable
// by anyone (see /api/audio/stem), so this reveals nothing new.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await sql<{ id: string }[]>`
    SELECT partner.id
    FROM stems
    JOIN stems partner ON partner.track_id = stems.track_id AND partner.kind <> stems.kind
    WHERE stems.id = ${id}
    LIMIT 1
  `;
  return NextResponse.json({ id: rows[0]?.id ?? null });
}
