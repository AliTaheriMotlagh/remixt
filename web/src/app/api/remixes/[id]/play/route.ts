import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import { ensureRemixStats } from "@/lib/models";

// Counts one play. The remix page calls this once someone has listened
// for a few seconds (see RemixStatsBar); anyone who can see the remix can
// play it, signed in or not.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureRemixStats();
  const user = await getCurrentUser();
  const rows = await sql<{ play_count: number }[]>`
    UPDATE remixes SET play_count = play_count + 1
    WHERE id = ${id} AND (published OR owner_id = ${user?.id ?? ""})
    RETURNING play_count
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ plays: rows[0].play_count });
}
