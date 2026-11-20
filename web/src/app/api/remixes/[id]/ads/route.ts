import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AD_KINDS, AD_SPOTS, AD_STYLES, TOPIC_IDS } from "@/lib/monetize/adRules";
import { remixAdSettings, remixMoney, saveRemixAdSettings } from "@/lib/monetize/adStore";

// A remix's ads, for its maker: GET the panel (settings, what the artists
// chose, what it earned, its promotions); PUT the settings.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const money = await remixMoney(user.id, id);
  if (!money) return NextResponse.json({ error: "Not your remix" }, { status: 404 });
  return NextResponse.json(money, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  on: z.boolean(),
  kinds: z.array(z.enum(AD_KINDS)).max(3),
  blockedTopics: z.array(z.string().refine((t) => TOPIC_IDS.includes(t))).max(30),
  // Added later: an older page leaves them out, and they stay as they were.
  spots: z.array(z.enum(AD_SPOTS)).max(AD_SPOTS.length).optional(),
  style: z.enum(AD_STYLES).optional(),
  house: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const before = await remixAdSettings(id);
  const error = await saveRemixAdSettings(user.id, id, { ...before, ...parsed.data });
  return error ? NextResponse.json(error, { status: 403 }) : NextResponse.json({ ok: true });
}
