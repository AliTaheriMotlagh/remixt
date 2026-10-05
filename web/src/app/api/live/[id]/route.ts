import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  currentStreamOf,
  endStream,
  getStream,
  ownsPublishedRemix,
  recap,
  startStream,
  updateStream,
} from "@/lib/live";

// One live session: anyone can read it; its host can change its settings,
// start it (if scheduled) or end it.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stream = await getStream(id);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ stream, recap: stream.status === "ended" ? await recap(stream) : null });
}

const patchSchema = z.object({
  action: z.enum(["start", "end"]).optional(),
  title: z.string().trim().min(2).max(TITLE_MAX).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX).optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  chatMode: z.enum(["open", "followers", "off"]).optional(),
  slowMode: z.number().int().min(0).max(60).optional(),
  remixId: z.string().max(64).nullable().optional(),
  scheduledAt: z.iso.datetime().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const stream = await getStream(id);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (stream.host_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { action, remixId, scheduledAt, ...rest } = parsed.data;
  if (stream.status === "ended") return NextResponse.json({ error: "This session has ended" }, { status: 409 });

  if (remixId && !(await ownsPublishedRemix(user.id, remixId))) {
    return NextResponse.json({ error: "Pick one of your published remixes to perform" }, { status: 400 });
  }
  if (action === "start") {
    const existing = await currentStreamOf(user.id);
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "You're already live in another session", id: existing.id }, { status: 409 });
    }
    await startStream(id);
  }
  await updateStream(id, {
    ...rest,
    ...(remixId !== undefined ? { remixId } : {}),
    ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
  });
  if (action === "end") await endStream(id);
  return NextResponse.json({ stream: await getStream(id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const stream = await getStream(id);
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (stream.host_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // A running session is ended, not deleted: its recap stays.
  if (stream.status === "live") {
    await endStream(id);
    return NextResponse.json({ ended: true });
  }
  await sql`DELETE FROM live_streams WHERE id = ${id}`;
  return NextResponse.json({ deleted: true });
}
