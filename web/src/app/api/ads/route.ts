import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/server";
import { getCurrentUser } from "@/lib/auth";
import { adsFor } from "@/lib/billing/store";
import { adAudioUrl, adImageUrl, isOwnViewer, namesFor, parseTarget, pickCampaign, sharesFor, viewToken } from "@/lib/monetize/store";
import { adsAllowed, pickPromoted } from "@/lib/monetize/adStore";
import { pickHouseAd } from "@/lib/monetize/houseStore";
import { networkFor, networkId } from "@/lib/monetize/network";
import { AD_SPOTS, FORMATS, type AdKind, type AdSpot, type Format } from "@/lib/monetize/adRules";
import type { HouseSpot } from "@/lib/monetize/houseAds";
import type { Placement } from "@/lib/monetize/policy";

// An ad for a spot on a page: a paying campaign if one fits, else one of
// Remixt's own (houseStore.ts) when the owner and the page's maker allow it,
// who a view of it pays, and the signed token the page hands back when it
// was seen or heard (/api/ads/view) or clicked (/api/ads/click).
//
//   ?placement=site|remix|radio|promote &target=remix:<id>|track:<id> &lang=en|fa
//   &format=card (default) | audio (before a remix, or a radio break) | promote (a promoted remix/song for a list: &kind=remix|track)
//   &spot=player|comments|radio  where on a remix's page the card sits (its maker chooses which may show)
//
// `off: true`: the remix's maker (or an artist's Block) keeps this kind of ad
// off here — show nothing at all, not even Remixt's own.
// `house`: one of ours (no paying ad fits); `ad` is then null.
// `style`: "full" or "compact", as the remix's maker chose.

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const placement = (["site", "remix", "radio", "promote"].includes(params.get("placement") ?? "") ? params.get("placement") : "site") as Placement;
  const format = (FORMATS.includes(params.get("format") as Format) ? params.get("format") : "card") as Format;
  const target = placement === "site" || placement === "promote" ? null : parseTarget(params.get("target"));
  const lang = params.get("lang") === "fa" ? "fa" : "en";
  const spotParam = params.get("spot");
  const spot = (AD_SPOTS as readonly string[]).includes(spotParam ?? "") ? (spotParam as AdSpot) : null;
  const none = { ad: null, house: null, token: null, supports: [] };
  try {
    const { features, network: networks } = await getSettings();
    // Plus members see and hear no ads (Admin → Settings → Plans).
    if (!(await adsFor(await getCurrentUser().catch(() => null)))) return NextResponse.json({ ...none, off: true }, NO_STORE);
    if (format === "promote") {
      if (!features.ads || !features.promotions) return NextResponse.json(none, NO_STORE);
      const kind = params.get("kind") === "track" ? "track" : "remix";
      const found = await pickPromoted(lang, kind);
      if (!found?.target) return NextResponse.json(none, NO_STORE);
      return NextResponse.json(
        { ad: { id: found.campaign.id, target: `${found.target.kind}:${found.target.id}` }, token: viewToken("promote", found.target, found.campaign.id, Date.now(), "promote") },
        NO_STORE
      );
    }
    // No audio at all while the owner has audio ads off (Admin → Settings).
    if (format === "audio" && !features.audioAds) return NextResponse.json(none, NO_STORE);

    const kind: AdKind = format === "card" ? "card" : placement === "radio" ? "radio" : "preroll";
    const { allowed, blockedTopics, style, house: makerAllowsHouse } = await adsAllowed(target, kind, spot);
    if (!allowed) return NextResponse.json({ ...none, off: true }, NO_STORE);
    const shares = await sharesFor(placement, target);
    // Audio is never played to the music's own makers (a card still shows them, unpaid).
    if (format === "audio") {
      const user = await getCurrentUser().catch(() => null);
      if (isOwnViewer(user?.id ?? null, shares)) return NextResponse.json(none, NO_STORE);
    }

    const campaign = features.ads ? await pickCampaign(placement, lang, { format, blockedTopics }) : null;
    if (campaign) {
      return NextResponse.json(
        {
          ad: {
            id: campaign.id,
            advertiser: campaign.advertiser,
            title: campaign.title,
            body: campaign.body,
            cta: campaign.cta,
            image: adImageUrl(campaign),
            audio: format === "audio" ? adAudioUrl(campaign) : null,
            seconds: campaign.audio_seconds,
          },
          house: null,
          token: viewToken(placement, target, campaign.id, Date.now(), format),
          supports: await namesFor(shares),
          style,
        },
        NO_STORE
      );
    }

    // No paying ad: one of ours, where the owner's switch and the page's maker allow.
    const ownSwitch = format === "card" ? features.houseAds : placement === "radio" ? features.houseRadio : features.housePreroll;
    const houseSpot: HouseSpot = placement === "radio" ? "radio" : placement === "remix" ? "remix" : "site";
    const house = ownSwitch && makerAllowsHouse ? await pickHouseAd(houseSpot, lang, format === "card" ? "visual" : "audio") : null;
    const houseOut = house
      ? { id: house.id, kind: house.kind, title: house.title, body: house.body, cta: house.cta, href: house.href, tone: house.tone, media: house.media, seconds: house.seconds }
      : null;
    const houseToken = house ? viewToken(placement, target, null, Date.now(), format, house.id) : null;

    // An ad network (AdSense, Yektanet…) before ours: it pays. Picture spots only, and not where the
    // page's maker blocked topics (a network's ads can't be filtered by our topics). Ours stays as the
    // fallback the page shows if the network has nothing to fill the spot with.
    const network = features.ads && format === "card" && blockedTopics.length === 0 ? networkFor(networks, lang) : null;
    if (network) {
      return NextResponse.json(
        {
          ad: null,
          network,
          token: viewToken(placement, target, null, Date.now(), format, null, networkId(network)),
          house: houseOut,
          houseToken,
          supports: await namesFor(shares),
          style,
        },
        NO_STORE
      );
    }
    if (!house) return NextResponse.json({ ...none, style }, NO_STORE);
    return NextResponse.json({ ad: null, house: houseOut, token: houseToken, supports: [], style }, NO_STORE);
  } catch {
    // Ads never break a page: nothing, and the page carries on.
    return NextResponse.json(none);
  }
}
