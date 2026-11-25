import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { MICROS } from "@/lib/monetize/policy";
import { closeNetworkMonth, decideClaim, decidePayout, monetizeOverview, monetizeSettings, networkMonths, saveCampaign, setCampaignActive } from "@/lib/monetize/store";
import { adReviewQueue, decideAdPayment, reviewCampaign } from "@/lib/monetize/adStore";
import { TOPIC_IDS } from "@/lib/monetize/adRules";

// The owner's side of ads and earnings (admin only): campaigns, artists'
// claims to their songs, payouts — and advertisers' ads to approve, their
// payments to check. The money settings it shows are Admin → Settings' (lib/settings).
export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [overview, queue, settings, networks] = await Promise.all([monetizeOverview(), adReviewQueue(), monetizeSettings(), networkMonths()]);
  return NextResponse.json({ ...overview, queue, settings, networks }, { headers: { "Cache-Control": "no-store" } });
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
  format: z.enum(["card", "audio"]).default("card"),
  topic: z.string().refine((t) => TOPIC_IDS.includes(t)).default("other"),
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
  z.object({ action: z.literal("review"), id: z.string().max(64), approve: z.boolean(), note: z.string().max(500).nullable().optional() }),
  z.object({
    action: z.literal("network-close"),
    network: z.enum(["adsense", "other"]),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    /** Dollars the network paid for that month. */
    amount: z.number().positive().max(10_000_000),
    note: z.string().max(500).nullable().optional(),
  }),
  z.object({ action: z.literal("ad-payment"), id: z.string().max(64), received: z.boolean(), note: z.string().max(500).nullable().optional() }),
]);

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const a = parsed.data;
  if (a.action === "campaign") {
    const id = await saveCampaign(a.id ?? null, {
      name: a.name, advertiser: a.advertiser, title: a.title, body: a.body, cta: a.cta, link: a.link, image_url: a.image ?? null,
      lang: a.lang, placements: a.format === "audio" ? a.placements.filter((p) => p !== "site") : a.placements, cpm_micros: Math.round(a.cpm * MICROS),
      budget_micros: Math.round(a.budget * MICROS), ends_at: a.endsAt ?? null, format: a.format, topic: a.topic,
    });
    return NextResponse.json({ ok: true, id });
  }
  if (a.action === "network-close") {
    const result = await closeNetworkMonth({ network: a.network, month: a.month, micros: Math.round(a.amount * MICROS), note: a.note ?? null, adminId: admin.id });
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ok: true, ...result });
  }
  if (a.action === "campaign-active") await setCampaignActive(a.id, a.active);
  if (a.action === "claim") await decideClaim(a.id, a.verify, a.note ?? null);
  if (a.action === "payout") await decidePayout(a.id, a.paid, a.note ?? null);
  if (a.action === "review") await reviewCampaign(a.id, a.approve, a.note ?? null);
  if (a.action === "ad-payment") await decideAdPayment(a.id, a.received, a.note ?? null);
  return NextResponse.json({ ok: true });
}
