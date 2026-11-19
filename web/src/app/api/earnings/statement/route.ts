import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { statementCsv } from "@/lib/monetize/policy";
import { statementFor } from "@/lib/monetize/store";

// A member's month as a CSV: /api/earnings/statement?month=2026-11
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  const lines = await statementFor(user.id, month);
  if (!lines) return NextResponse.json({ error: "Give a month as YYYY-MM" }, { status: 400 });
  return new NextResponse(statementCsv(month, lines), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="remixt-earnings-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
