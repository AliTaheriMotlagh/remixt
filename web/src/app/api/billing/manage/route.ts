import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { paypalCancel, syncPayPalSubscription } from "@/lib/billing/paypal";
import { subscriptionOf } from "@/lib/billing/store";
import { stripePortal } from "@/lib/billing/stripe";
import sql from "@/lib/db";
import { siteUrl } from "@/lib/site";

// POST: Stripe members go to Stripe's billing page (card, invoices,
// cancelling); a PayPal subscription is cancelled here (Plus stays until the
// end of what was paid).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const sub = await subscriptionOf(user.id);
  if (!sub) return NextResponse.json({ error: "No subscription to manage" }, { status: 404 });
  try {
    if (sub.provider === "stripe" && sub.providerCustomer) {
      return NextResponse.json({ url: await stripePortal(sub.providerCustomer, `${siteUrl().origin}/plus`) });
    }
    if (sub.provider === "paypal") {
      const [row] = await sql<{ provider_subscription: string | null }[]>`SELECT provider_subscription FROM subscriptions WHERE user_id = ${user.id}`;
      if (!row?.provider_subscription) return NextResponse.json({ error: "No PayPal subscription found" }, { status: 404 });
      await paypalCancel(row.provider_subscription);
      await syncPayPalSubscription(row.provider_subscription);
      return NextResponse.json({ cancelled: true });
    }
  } catch (err) {
    console.error("billing manage failed", err);
    return NextResponse.json({ error: "Couldn't reach the payment service — try again in a minute" }, { status: 502 });
  }
  return NextResponse.json({ error: "Paid by hand or given by the team: it simply ends on its date" }, { status: 400 });
}
