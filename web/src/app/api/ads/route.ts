import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/server";
import { getCurrentUser } from "@/lib/auth";
import { adAudioUrl, adImageUrl, isOwnViewer, namesFor, parseTarget, pickCampaign, sharesFor, viewToken } from "@/lib/monetize/store";
import { adsAllowed, pickPromoted } from "@/lib/monetize/adStore";
import { FORMATS, type AdKind, type Format } from "@/lib/monetize/adRules";
import type { Placement } from "@/lib/monetize/policy";

// An ad for a spot on a page: a paying campaign if one fits (null: the page
// shows one of Remixt's own), who a view of it pays, and the signed token
// the page hands back when it was seen or heard (/api/ads/view) or clicked
// (/api/ads/click).
//
//   ?placement=site|remix|radio|promote &target=remix:<id>|track:<id> &lang=en|fa
//   &format=card (default) | audio (before a remix, or a radio break) | promote (a promoted remix/song for a list: &kind=remix|track)
//
// `off: true`: the remix's maker (or an artist's Block) keeps this kind of ad
// off the page — show nothing at all, not even Remixt's own.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const placement = (["site", "remix", "radio", "promote"].includes(params.get("placement") ?? "") ? params.get("placement") : "site") as Placement;
  const format = (FORMATS.includes(params.get("format") as Format) ? params.get("format") : "card") as Format;
  const target = placement === "site" || placement === "promote" ? null : parseTarget(params.get("target"));
  const lang = params.get("lang") === "fa" ? "fa" : "en";
  try {
    const { features } = await getSettings();
    // The owner's switches (Admin → Settings): no paying ads at all, no audio, no promotions.
    const none = { ad: null, token: null, supports: [] };
    if (!features.ads || (format === "audio" && !features.audioAds) || (format === "promote" && !features.promotions)) {
      return NextResponse.json(format === "card" ? { ...none, token: viewToken(placement, target, null) } : none, { headers: { "Cache-Control": "no-store" } });
    }
    if (format === "promote") {
      const kind = params.get("kind") === "track" ? "track" : "remix";
      const found = await pickPromoted(lang, kind);
      if (!found?.target) return NextResponse.json({ ad: null, token: null }, { headers: { "Cache-Control": "no-store" } });
      return NextResponse.json(
        { ad: { id: found.campaign.id, target: `${found.target.kind}:${found.target.id}` }, token: viewToken("promote", found.target, found.campaign.id, Date.now(), "promote") },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const kind: AdKind = format === "card" ? "card" : placement === "radio" ? "radio" : "preroll";
    const { allowed, blockedTopics } = await adsAllowed(target, kind);
    if (!allowed) return NextResponse.json({ off: true, ad: null, token: null, supports: [] }, { headers: { "Cache-Control": "no-store" } });
    const shares = await sharesFor(placement, target);
    // Audio is never played to the music's own makers (a card still shows them, unpaid).
    if (format === "audio") {
      const user = await getCurrentUser().catch(() => null);
      if (isOwnViewer(user?.id ?? null, shares)) return NextResponse.json({ ad: null, token: null, supports: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const campaign = await pickCampaign(placement, lang, { format, blockedTopics });
    // No paying audio ad: nothing plays (Remixt's own ads are cards only).
    if (format === "audio" && !campaign) return NextResponse.json({ ad: null, token: null, supports: [] }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(
      {
        ad: campaign && {
          id: campaign.id,
          advertiser: campaign.advertiser,
          title: campaign.title,
          body: campaign.body,
          cta: campaign.cta,
          image: adImageUrl(campaign),
          audio: format === "audio" ? adAudioUrl(campaign) : null,
          seconds: campaign.audio_seconds,
        },
        token: viewToken(placement, target, campaign?.id ?? null, Date.now(), format),
        supports: campaign ? await namesFor(shares) : [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Ads never break a page: no ad, and the page shows its own.
    return NextResponse.json({ ad: null, token: null, supports: [] });
  }
}
