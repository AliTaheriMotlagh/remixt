import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { realtime } from "@/lib/analyticsStore";
import { presenceSnapshot } from "@/lib/presence";

// Admin → Analytics → Right now (admin only): the last 30 minutes, and who's online where (presence).
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [now, presence] = await Promise.all([realtime(), presenceSnapshot(24).catch(() => null)]);
  return NextResponse.json({ ...now, presence }, { headers: { "Cache-Control": "no-store" } });
}
