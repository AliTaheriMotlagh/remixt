import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readFeed } from "@/lib/live";
import { sessionIdOf } from "@/lib/liveRequest";

// What a tab polls every second or two: the stage state, counts, and the
// chat and reactions since ?after=<last event id>. ?hb=1 also reports the
// tab in as a viewer (every few polls is enough).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const sessionId = sessionIdOf(q.get("sid"));
  if (!sessionId) return NextResponse.json({ error: "Bad session id" }, { status: 400 });
  const user = await getCurrentUser();
  const feed = await readFeed(id, {
    after: Number(q.get("after")) || 0,
    sessionId,
    userId: user?.id ?? null,
    modVersion: Number(q.get("mv") ?? -1),
    heartbeat: q.get("hb") === "1",
  });
  if (!feed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}
