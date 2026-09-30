import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { claimNext, queueStats } from "@/lib/splitQueue";

/**
 * A helper's computer asking for the next song to split. Hands back the
 * oldest waiting one (now theirs until they finish, fail or go quiet), or
 * null when the queue is empty. `session` identifies the helper's tab, so
 * one that reloads mid-song gets that song straight back.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const session =
    typeof body?.session === "string" && /^[\w-]{8,64}$/.test(body.session) ? body.session : randomUUID();
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
