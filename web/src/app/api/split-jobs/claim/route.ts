import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { claimNext, leaveRig, queueStats } from "@/lib/splitQueue";

/** The helper tab's name from a request body, if it sent a valid one. */
function sessionOf(body: unknown): string | null {
  const session = (body as { session?: unknown } | null)?.session;
  return typeof session === "string" && /^[\w-]{8,64}$/.test(session) ? session : null;
}

/**
 * A helper's computer asking for the next song to split. Hands back the
 * oldest waiting one (now theirs until they finish, fail or go quiet), or
 * null when the queue is empty. `session` identifies the helper's tab, so
 * one that reloads mid-song gets that song straight back.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const session = sessionOf(await req.json().catch(() => null)) ?? randomUUID();
  const job = await claimNext(user.id, session);
  const stats = await queueStats(user.id);
  if (!job) return NextResponse.json({ job: null, stats });
  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      filename: job.filename,
      forSomeoneElse: job.owner_id !== user.id,
      sourceUrl: `/api/split-jobs/${job.id}/source`,
    },
    stats,
  });
}

/** The helper switched off: this tab stops counting as a rig online. */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const session = sessionOf(await req.json().catch(() => null));
  if (session) await leaveRig(user.id, session);
  return NextResponse.json({ ok: true });
}
