import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { listReports } from "@/lib/reports";

export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = req.nextUrl.searchParams.get("status");
  const reports = await listReports(
    status === "resolved" || status === "dismissed" || status === "all" ? status : "open"
  );
  return NextResponse.json({ reports });
}
