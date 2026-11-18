import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteStation, readFeed } from "@/lib/radio";
import { sessionIdOf } from "@/lib/liveRequest";
import { fail, noStore, requireManager } from "@/lib/radioRequest";

// What a listener's tab polls every few seconds: what's on (with the
// server's clock, so every tab plays the same moment), the vote, requests,
// history and how many are listening. ?hb=1 also counts the tab as tuned in.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const q = req.nextUrl.searchParams;
  const sessionId = sessionIdOf(q.get("sid"));
  if (!sessionId) return fail("Bad session id");
  const user = await getCurrentUser();
  const feed = await readFeed(slug, { sessionId, user, heartbeat: q.get("hb") === "1" });
  if (!feed) return fail("No station at this address", 404);
  return NextResponse.json(feed, { headers: noStore });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await requireManager(slug);
  if ("error" in found) return found.error;
  try {
    await deleteStation(found.station);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't delete the station");
  }
}
