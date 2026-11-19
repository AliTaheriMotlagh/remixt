import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/server";
import { getCurrentUser } from "@/lib/auth";
import { allow, TOO_MANY } from "@/lib/rateLimit";
import { draftSchema } from "@/lib/monetize/adSchemas";
import { monetizeSettings } from "@/lib/monetize/store";
import { advertiserCampaigns, createAdvertiserCampaign, promotable } from "@/lib/monetize/adStore";

// The advertiser page's data: your ads (with payments and the last two
// weeks), what you could promote, the lowest prices, the Toman rate and how
// to pay. POST makes a new ad (a draft until it's sent for review).


export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const [campaigns, things, settings] = await Promise.all([advertiserCampaigns(user.id), promotable(user.id), monetizeSettings()]);
  return NextResponse.json({ campaigns, promotable: things, settings }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const settings = await getSettings();
  if (!(await allow(`advertise:${user.id}`, settings.limits.adsPerDay, 24 * 60 * 60))) return NextResponse.json(TOO_MANY, { status: 429 });
  const parsed = draftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;
  // The owner's switches (Admin → Settings): self-serve ads and promotions can each be closed.
  if (d.format === "promote" ? !settings.features.promotions : !settings.features.selfServe) {
    return NextResponse.json({ error: d.format === "promote" ? "Promotions are closed for now" : "New ads are closed for now — write to us to advertise" }, { status: 403 });
  }
  const result = await createAdvertiserCampaign(user.id, {
    ...d,
    name: d.name || d.title || "My ad",
    placements: d.placements as never,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
