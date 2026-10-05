import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  createStream,
  currentStreamOf,
  liveDirectory,
  ownsPublishedRemix,
} from "@/lib/live";

// The live directory (who's live, what's coming up, what just ended) and
// starting or scheduling a session of your own.

export async function GET() {
  return NextResponse.json(await liveDirectory(), { headers: { "Cache-Control": "no-store" } });
}

const createSchema = z.object({
  /** "studio": make a remix live in the Studio; "perform": play a published one. */
  mode: z.enum(["perform", "studio"]).default("perform"),
  title: z.string().trim().min(2).max(TITLE_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).default(""),
  tags: z.array(z.string().max(40)).max(8).default([]),
  remixId: z.string().max(64).nullable().default(null),
  chatMode: z.enum(["open", "followers", "off"]).default("open"),
  slowMode: z.number().int().min(0).max(60).default(0),
  /** ISO time to schedule for; without it, the session starts now. */
  scheduledAt: z.iso.datetime().nullable().default(null),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to go live" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && (scheduledAt.getTime() < Date.now() - 60_000 || scheduledAt.getTime() > Date.now() + 30 * 86_400_000)) {
    return NextResponse.json({ error: "Pick a time within the next 30 days" }, { status: 400 });
  }
  if (input.mode === "studio") input.remixId = null;
  if (input.remixId && !(await ownsPublishedRemix(user.id, input.remixId))) {
    return NextResponse.json({ error: "Pick one of your published remixes to perform" }, { status: 400 });
  }
  if (!scheduledAt) {
    const existing = await currentStreamOf(user.id);
    if (existing) return NextResponse.json({ error: "You're already live", id: existing.id }, { status: 409 });
  }
  const id = await createStream(user.id, { ...input, scheduledAt });
  return NextResponse.json({ id });
}
