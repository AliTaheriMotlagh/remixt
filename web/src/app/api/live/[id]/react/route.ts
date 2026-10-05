import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStream, sendReaction } from "@/lib/live";
import { bodyOf, sessionIdOf } from "@/lib/liveRequest";

// Send reactions (a tap, or a burst of taps batched together).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await bodyOf(req);
  const sessionId = sessionIdOf(body?.sid);
  if (!sessionId || typeof body?.emoji !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const stream = await getStream(id);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getCurrentUser();
  const result = await sendReaction(
    stream,
    { userId: user?.id ?? null, sessionId },
    body.emoji,
    typeof body.count === "number" ? body.count : 1
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
