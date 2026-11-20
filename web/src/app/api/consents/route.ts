import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { decide, requestsFor } from "@/lib/publishConsent";

// Requests to publish remixes that use your private songs (lib/publishConsent.ts).
// GET: what you were asked, newest first. POST { remixId, trackId, agree, note? }: your answer.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ requests: await requestsFor(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

const answer = z.object({ remixId: z.string().max(64), trackId: z.string().max(64), agree: z.boolean(), note: z.string().trim().max(300).optional() });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = answer.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { remixId, trackId, agree, note } = parsed.data;
  const result = await decide(remixId, trackId, user.id, agree, note || null);
  if ("error" in result) return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result);
}
