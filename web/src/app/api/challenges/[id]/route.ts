import { NextRequest, NextResponse } from "next/server";
import { getChallenge } from "@/lib/challenges";

// A challenge and its two stems — what the Studio loads for ?challenge=<id>.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const challenge = await getChallenge((await params).id);
  if (!challenge || challenge.status === "upcoming") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ challenge });
}
