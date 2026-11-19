import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requestPayout } from "@/lib/monetize/store";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const result = await requestPayout(user.id);
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
