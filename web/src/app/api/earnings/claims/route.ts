import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claimSong } from "@/lib/monetize/store";
import { allow, TOO_MANY } from "@/lib/rateLimit";

const schema = z.object({
  trackId: z.string().max(64),
  evidence: z.string().trim().min(20, "Tell us how we can check it's yours (a sentence or two, with links)").max(3000),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await allow(`claim:${user.id}`, (await getSettings()).limits.claimsPerDay, 24 * 60 * 60))) return NextResponse.json(TOO_MANY, { status: 429 });
  const problem = await claimSong(user.id, parsed.data.trackId, parsed.data.evidence);
  return NextResponse.json(problem ?? { ok: true }, { status: problem ? 400 : 200 });
}
