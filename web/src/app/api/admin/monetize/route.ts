import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { MICROS } from "@/lib/monetize/policy";
import { decideClaim, decidePayout, monetizeOverview, saveCampaign, setCampaignActive } from "@/lib/monetize/store";

// The owner's side of ads and earnings (admin only): campaigns, artists'
// claims to their songs, payouts.
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await monetizeOverview(), { headers: { "Cache-Control": "no-store" } });
}

const campaign = z.object({
  action: z.literal("campaign"),
  id: z.string().max(64).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  advertiser: z.string().trim().max(120).default(""),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(200).default(""),
  cta: z.string().trim().min(1).max(30).default("Learn more"),
  link: z.string().trim().url().max(1000).refine((u) => /^https?:\/\//.test(u), "Use an http(s) link"),
  image: z.string().trim().url().max(1000).nullable().optional(),
  lang: z.enum(["any", "en", "fa"]).default("any"),
  placements: z.array(z.enum(["site", "remix", "radio"])).min(1),
  /** Dollars per 1,000 paid views. */
  cpm: z.number().positive().max(1000),
  /** Dollars in all. */
  budget: z.number().positive().max(1_000_000),
  endsAt: z.string().datetime().nullable().optional(),
});

const action = z.discriminatedUnion("action", [
  campaign,
  z.object({ action: z.literal("campaign-active"), id: z.string().max(64), active: z.boolean() }),
  z.object({ action: z.literal("claim"), id: z.string().max(64), verify: z.boolean(), note: z.string().max(500).nullable().optional() }),
  z.object({ action: z.literal("payout"), id: z.string().max(64), paid: z.boolean(), note: z.string().max(500).nullable().optional() }),
]);

export async function POST(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const a = parsed.data;
  if (a.action === "campaign") {
    const id = await saveCampaign(a.id ?? null, {
      name: a.name, advertiser: a.advertiser, title: a.title, body: a.body, cta: a.cta, link: a.link, image_url: a.image ?? null,
      lang: a.lang, placements: a.placements, cpm_micros: Math.round(a.cpm * MICROS), budget_micros: Math.round(a.budget * MICROS), ends_at: a.endsAt ?? null,
    });
    return NextResponse.json({ ok: true, id });
  }
  if (a.action === "campaign-active") await setCampaignActive(a.id, a.active);
  if (a.action === "claim") await decideClaim(a.id, a.verify, a.note ?? null);
  if (a.action === "payout") await decidePayout(a.id, a.paid, a.note ?? null);
  return NextResponse.json({ ok: true });
}
