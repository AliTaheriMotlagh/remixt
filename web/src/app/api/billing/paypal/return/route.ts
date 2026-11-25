import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncPayPalSubscription } from "@/lib/billing/paypal";
import { siteUrl } from "@/lib/site";

// Back from approving on PayPal (?subscription_id=…): read it at once, then on to /plus.
export async function GET(req: NextRequest) {
  const base = siteUrl().origin;
  const user = await getCurrentUser();
  const id = req.nextUrl.searchParams.get("subscription_id");
  if (user && id && /^I-[\w]+$/.test(id)) {
    const owner = await syncPayPalSubscription(id).catch((err) => {
      console.error("paypal return sync failed", err);
      return null;
    });
    if (owner && owner !== user.id) console.warn("paypal return: subscription belongs to someone else");
  }
  return NextResponse.redirect(`${base}/plus?paid=paypal`, 303);
}
