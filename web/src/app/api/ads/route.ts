import { NextRequest, NextResponse } from "next/server";
import { namesFor, parseTarget, pickCampaign, sharesFor, viewToken } from "@/lib/monetize/store";
import type { Placement } from "@/lib/monetize/policy";

// An ad for a spot on a page: a paying campaign if one fits (null: the page
// shows one of Remixt's own), who a view of it pays, and the signed token
// the page hands back when it was seen (/api/ads/view) or clicked (/api/ads/click).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const placement = (["site", "remix", "radio"].includes(params.get("placement") ?? "") ? params.get("placement") : "site") as Placement;
  const target = placement === "site" ? null : parseTarget(params.get("target"));
  const lang = params.get("lang") === "fa" ? "fa" : "en";
  try {
    const [campaign, shares] = await Promise.all([pickCampaign(placement, lang), sharesFor(placement, target)]);
    return NextResponse.json(
      {
        ad: campaign && {
          id: campaign.id, advertiser: campaign.advertiser, title: campaign.title, body: campaign.body, cta: campaign.cta, image: campaign.image_url,
        },
        token: viewToken(placement, target, campaign?.id ?? null),
        supports: campaign ? await namesFor(shares) : [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Ads never break a page: no ad, and the page shows its own.
    return NextResponse.json({ ad: null, token: null, supports: [] });
  }
}
