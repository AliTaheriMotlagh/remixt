import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/monetize/store";

// A click on an ad: counted for its report, then on to where it goes.
// Clicks pay nobody (pay is per view), so there's nothing to gain by
// clicking.
//
// GET ?t=<token>: count it and go there (a paying ad's link).
// POST <token> (a beacon): count it only — one of Remixt's own ads opens its
// page on the site itself, as a quick in-app navigation.
export async function GET(req: NextRequest) {
  const link = await recordClick(req.nextUrl.searchParams.get("t") ?? "").catch(() => null);
  return NextResponse.redirect(new URL(link ?? "/", req.url), 302);
}

export async function POST(req: NextRequest) {
  const token = (await req.text().catch(() => "")).trim().slice(0, 600);
  if (token) await recordClick(token).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
