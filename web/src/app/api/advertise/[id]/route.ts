import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { draftSchema } from "@/lib/monetize/adSchemas";
import { setCampaignPaused, submitCampaign, updateAdvertiserCampaign } from "@/lib/monetize/adStore";

// One of your ads: { action: "save", ...draft } | { action: "submit" } (send for review) | { action: "pause" | "resume" }.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  let result: { error: string } | null;
  if (body?.action === "submit") result = await submitCampaign(user.id, id);
  else if (body?.action === "pause" || body?.action === "resume") result = await setCampaignPaused(user.id, id, body.action === "pause");
  else if (body?.action === "save") {
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    const d = parsed.data;
    result = await updateAdvertiserCampaign(user.id, id, { ...d, name: d.name || d.title || "My ad", placements: d.placements as never });
  } else return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  return result ? NextResponse.json(result, { status: 400 }) : NextResponse.json({ ok: true });
}
