import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStream, sendChat } from "@/lib/live";
import { bodyOf, sessionIdOf } from "@/lib/liveRequest";

// Say something in a session's chat: signed in, or as a guest with a name.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await bodyOf(req);
  const sessionId = sessionIdOf(body?.sid);
  if (!sessionId || typeof body?.body !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const stream = await getStream(id);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getCurrentUser();
  const result = await sendChat(
    stream,
    { userId: user?.id ?? null, sessionId, guestName: typeof body.name === "string" ? body.name : undefined },
    body.body
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id });
}
