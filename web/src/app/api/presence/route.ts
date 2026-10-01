import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { areaFor, heartbeat, presenceSnapshot, recentActivity } from "@/lib/presence";

// Live presence for the home page (lib/presence.ts).
//
// POST {sid, path}: a tab's heartbeat — this visitor is here, on that page.
// Answers with who's online, so the tab doesn't have to ask separately.
// GET: who's online; with ?activity=1, the latest activity feed too.

const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sid = typeof body?.sid === "string" ? body.sid : "";
  const path = typeof body?.path === "string" ? body.path.slice(0, 200) : "/";
  if (!SESSION_ID.test(sid)) return NextResponse.json({ error: "Bad session id" }, { status: 400 });
  const user = await getCurrentUser();
  await heartbeat(sid, user?.id ?? null, areaFor(path));
  return NextResponse.json(await presenceSnapshot(), { headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const withActivity = req.nextUrl.searchParams.get("activity") === "1";
  const [presence, activity] = await Promise.all([
    presenceSnapshot(),
    withActivity ? recentActivity() : Promise.resolve(undefined),
  ]);
  return NextResponse.json({ ...presence, activity }, { headers: { "Cache-Control": "no-store" } });
}
