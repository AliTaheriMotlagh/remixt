import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { artistSongs, setSongPolicy } from "@/lib/monetize/adStore";

// An artist's songs (verified claims and their own Studio takes): GET the
// list with what each earned and the remixes using it; PUT one song's
// choice — Monetize / Follow the remixer / Block.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ songs: await artistSongs(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({ trackId: z.string().max(64), policy: z.enum(["monetize", "follow", "block"]) });

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const result = await setSongPolicy(user.id, parsed.data.trackId, parsed.data.policy);
  return NextResponse.json(result, { status: "error" in result ? 403 : 200 });
}
