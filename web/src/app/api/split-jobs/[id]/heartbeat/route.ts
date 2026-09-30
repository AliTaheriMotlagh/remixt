import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { heartbeat, SESSION_HEADER } from "@/lib/splitQueue";

const bodySchema = z.object({ progress: z.number().min(0).max(1), stage: z.string().max(40) });

/**
 * The helper checking in with how far it's got (shown to the song's owner).
 * 409 means the job isn't theirs any more — cancelled, or handed on after
 * they went quiet — and they should drop it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const session = req.headers.get(SESSION_HEADER);
  const ours = await heartbeat((await params).id, user.id, session, parsed.data.progress, parsed.data.stage);
  if (!ours) return NextResponse.json({ error: "This song isn't yours to split any more" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
