import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AD_KINDS, TOPIC_IDS } from "@/lib/monetize/adRules";
import { remixMoney, saveRemixAdSettings } from "@/lib/monetize/adStore";

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
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const error = await saveRemixAdSettings(user.id, id, parsed.data);
  return error ? NextResponse.json(error, { status: 403 }) : NextResponse.json({ ok: true });
}
