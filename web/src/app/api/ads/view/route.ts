import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordView } from "@/lib/monetize/store";
import { clientKey } from "@/lib/rateLimit";

// An ad was seen: at least half of it on screen for a second, in a visible
// tab (the page checks; see components/ads/AdCard). Booked, and paid when
// the rules allow (lib/monetize/store.ts recordView).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: string; visitor?: string } | null;
  if (!body?.token || !body.visitor) return NextResponse.json({ counted: false }, { status: 400 });
  const user = await getCurrentUser().catch(() => null);
  const result = await recordView({
    token: body.token,
    visitor: body.visitor,
    address: clientKey(req),
    viewerId: user?.id ?? null,
    userAgent: req.headers.get("user-agent") ?? "",
  }).catch(() => ({ counted: false, paid: false }));
  return NextResponse.json(result);
}
