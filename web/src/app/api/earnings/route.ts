import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { earningsFor, monetizeSettings } from "@/lib/monetize/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const [summary, settings] = await Promise.all([earningsFor(user.id), monetizeSettings()]);
  // The Toman rate, for the Persian page.
  return NextResponse.json({ ...summary, tomanRate: settings.tomanRate }, { headers: { "Cache-Control": "no-store" } });
}
