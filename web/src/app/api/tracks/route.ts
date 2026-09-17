import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTracksByOwner, getStemsByTrack } from "@/lib/models";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const ownedTracks = await getTracksByOwner(user.id);
  const tracks = await Promise.all(
    ownedTracks.map(async (t) => ({
      ...t,
      stems: t.status === "ready" ? await getStemsByTrack(t.id) : [],
    }))
  );

  return NextResponse.json({ tracks });
}
