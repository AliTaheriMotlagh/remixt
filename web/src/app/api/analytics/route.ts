import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings/server";
import { EVENTS } from "@/lib/analytics";
import { recordEngagement, recordEvent, recordView } from "@/lib/analyticsStore";

// The page's analytics beacon (lib/client/analytics.ts): a page view, the
// time it was looked at (sent when it's left), or an event. Sent with
// navigator.sendBeacon as plain text, so it costs the page nothing and
// survives the page closing. Always answers 204: analytics never shows an
// error to anyone.

const id = z.string().regex(/^[\w-]{6,64}$/);
const body = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("view"),
    id,
    v: id,
    s: id,
    p: z.string().max(500),
    e: z.boolean(),
    r: z.string().max(500).nullable().optional(),
    u: z.object({ source: z.string().max(100).nullish(), medium: z.string().max(100).nullish(), campaign: z.string().max(150).nullish() }).optional(),
    l: z.string().max(20).optional(),
    w: z.number().max(10_000).optional(),
  }),
  z.object({ t: z.literal("engage"), id, ms: z.number().min(0).max(24 * 3600_000) }),
  z.object({
    t: z.literal("event"),
    n: z.enum(EVENTS),
    v: id.optional(),
    s: id.optional(),
    p: z.string().max(500).optional(),
    x: z.record(z.string().max(30), z.union([z.string().max(120), z.number(), z.boolean()])).optional(),
  }),
]);

const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (text.length > 4000) return done();
    const parsed = body.safeParse(JSON.parse(text));
    if (!parsed.success) return done();
    const { features } = await getSettings();
    if (!features.analytics) return done();
    const b = parsed.data;
    if (b.t === "engage") {
      await recordEngagement(b.id, b.ms);
      return done();
    }
    const user = await getCurrentUser().catch(() => null);
    if (b.t === "event") {
      await recordEvent(b.n, { visitor: b.v, session: b.s, userId: user?.id ?? null, path: b.p, props: b.x });
      return done();
    }
    await recordView(
      { id: b.id, visitor: b.v, session: b.s, path: b.p, entry: b.e, referrer: b.r ?? null, utm: b.u ?? {}, lang: b.l ?? "", width: b.w ?? 0 },
      {
        userId: user?.id ?? null,
        userAgent: req.headers.get("user-agent") ?? "",
        // The country the host's edge saw (Vercel, or Cloudflare in front); the address itself is never kept.
        country: req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? "",
        ownHost: req.nextUrl.hostname,
      }
    );
  } catch {
    // Never an error for analytics.
  }
  return done();
}
