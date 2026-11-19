import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/monetize/store";

// A click on a paying ad: counted for the advertiser's report, then on to
// their page. Clicks pay nobody (pay is per view), so there's nothing to
// gain by clicking.
export async function GET(req: NextRequest) {
  const link = await recordClick(req.nextUrl.searchParams.get("t") ?? "").catch(() => null);
  return NextResponse.redirect(new URL(link ?? "/", req.url), 302);
}
