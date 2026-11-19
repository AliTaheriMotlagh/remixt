import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { earningsFor } from "@/lib/monetize/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(await earningsFor(user.id), { headers: { "Cache-Control": "no-store" } });
}
