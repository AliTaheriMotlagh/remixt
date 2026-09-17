import { NextRequest, NextResponse } from "next/server";
import { getTrackById, getStemsByTrack } from "@/lib/models";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const track = await getTrackById(id);
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stems = track.status === "ready" ? await getStemsByTrack(id) : [];
  return NextResponse.json({ track, stems });
}
