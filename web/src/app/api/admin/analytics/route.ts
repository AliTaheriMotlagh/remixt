import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { analyticsReport } from "@/lib/analyticsStore";

// Admin → Analytics (admin only): ?days=1|7|28|90|365 &tz=<the admin's time zone, for the day and hour charts>.
export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asked = Number(req.nextUrl.searchParams.get("days"));
  const days = [1, 7, 28, 90, 365].includes(asked) ? asked : 28;
  const tz = req.nextUrl.searchParams.get("tz") ?? "UTC";
  return NextResponse.json(await analyticsReport(days, tz), { headers: { "Cache-Control": "no-store" } });
}
