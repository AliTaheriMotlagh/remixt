import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { projectForMember } from "@/lib/projects";
import { allow, TOO_MANY } from "@/lib/rateLimit";

const schema = z.object({ projectId: z.string().max(64), userId: z.string().max(64) });

/**
 * "Come and remix with me": a member of a shared session asks another
 * artist (often one who's online right now) to join it. They get a
 * notification that opens the session; nothing else is shared until they
 * choose to join.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.userId === user.id) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const project = await projectForMember(parsed.data.projectId, user.id);
  if (!project) return NextResponse.json({ error: "Not your session" }, { status: 404 });
  // Invites are a nudge, not a way to spam: a few a minute, a good number an hour.
  if (!(await allow(`jam-invite:${user.id}`, 30, 60 * 60))) return NextResponse.json(TOO_MANY, { status: 429 });
  await notify({ userId: parsed.data.userId, actorId: user.id, type: "jam", body: `${project.invite_code}|${project.title}`.slice(0, 200) });
  return NextResponse.json({ ok: true });
}
