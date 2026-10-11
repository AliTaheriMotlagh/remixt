import { NextRequest, NextResponse } from "next/server";
import { getStream, readReplay, replayMix } from "@/lib/live";

// An ended session's replay (lib/liveReplay.ts): its timeline, or with
// ?mix=<id> one of a studio session's mixes. Anyone who can open the
// session can play it back.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mixId = req.nextUrl.searchParams.get("mix");
  if (mixId !== null) {
    const n = Number(mixId);
    const body = Number.isSafeInteger(n) && n > 0 ? await replayMix(id, n) : null;
    if (body === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // A kept mix never changes once the session has ended.
    return new NextResponse(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400, immutable" } });
  }
  const stream = await getStream(id);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const replay = await readReplay(stream);
  if (!replay) return NextResponse.json({ error: "There's no replay until the session has ended" }, { status: 409 });
  return NextResponse.json(replay, { headers: { "Cache-Control": "no-store" } });
}
