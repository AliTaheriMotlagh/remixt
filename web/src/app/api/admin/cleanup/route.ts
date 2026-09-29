import { NextResponse } from "next/server";
import { currentAdmin, deleteTracks } from "@/lib/admin";
import sql from "@/lib/db";
import { sweepOld } from "@/lib/storage";

export const maxDuration = 120;

// What "Clean up" removes:
// - songs whose split failed,
// - songs stuck uploading for over an hour (the tab was closed mid-way),
// - remixes left with no lanes (every song they used was deleted),
// - songs fetched from links that the browser never came back for.
async function findJunk() {
  const tracks = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM tracks
    WHERE status = 'failed'
       OR (status = 'processing' AND created_at < now() - interval '1 hour')
  `;
  const emptyRemixes = await sql<{ id: string }[]>`
    SELECT remixes.id FROM remixes
    WHERE NOT EXISTS (SELECT 1 FROM remix_lanes WHERE remix_lanes.remix_id = remixes.id)
  `;
  return { tracks, emptyRemixes };
}

/** A dry run: how much would go. */
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { tracks, emptyRemixes } = await findJunk();
  return NextResponse.json({
    failedSongs: tracks.filter((t) => t.status === "failed").length,
    stuckSongs: tracks.filter((t) => t.status === "processing").length,
    emptyRemixes: emptyRemixes.length,
  });
}

export async function POST() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { tracks } = await findJunk();
  const songs = await deleteTracks(tracks.map((t) => t.id));
  // After the songs, since deleting them can leave more remixes empty.
  const emptied = await sql<{ id: string }[]>`
    DELETE FROM remixes
    WHERE NOT EXISTS (SELECT 1 FROM remix_lanes WHERE remix_lanes.remix_id = remixes.id)
    RETURNING id
  `;
  await sweepOld("imports/", 60 * 60 * 1000).catch(() => {});
  return NextResponse.json({ songs, remixes: emptied.length });
}
