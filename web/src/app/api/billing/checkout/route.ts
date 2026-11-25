import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { PayPalError, paypalCheckout, paypalReady } from "@/lib/billing/paypal";
import { subscriptionOf } from "@/lib/billing/store";
import { StripeError, stripeCheckout, stripeReady } from "@/lib/billing/stripe";
import { needsVerifiedEmail } from "@/lib/needsVerified";
import { planOf, priceOf } from "@/lib/plans";
import { allow, TOO_MANY } from "@/lib/rateLimit";
import { getSettings } from "@/lib/settings/server";
import { siteUrl } from "@/lib/site";

// POST { provider: "stripe" | "paypal", period: "month" | "year" } → { url }:
// the gateway's own page, where the member pays. The webhooks then turn Plus on.
const schema = z.object({ provider: z.enum(["stripe", "paypal"]), period: z.enum(["month", "year"]) });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to join Plus" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { provider, period } = parsed.data;
  const settings = await getSettings();
  if (!settings.plans.enabled) return NextResponse.json({ error: "Plus isn't on sale right now" }, { status: 403 });
  const unconfirmed = await needsVerifiedEmail(user.id);
  if (unconfirmed) return unconfirmed;
  if (!(await allow(`checkout:${user.id}`, 20, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  const current = await subscriptionOf(user.id);
  if (planOf(current) === "plus" && (current?.provider === "stripe" || current?.provider === "paypal") && !current.cancelAtPeriodEnd) {
    return NextResponse.json({ error: "You're on Plus already — manage it below" }, { status: 409 });
  }
  const base = siteUrl().origin;
  const micros = priceOf(period, settings);
  try {
    if (provider === "stripe") {
      if (!settings.plans.stripe || !(await stripeReady())) return NextResponse.json({ error: "Card payments aren't available right now" }, { status: 503 });
      return NextResponse.json({ url: await stripeCheckout({ userId: user.id, email: user.email, period, micros, customer: current?.provider === "stripe" ? current.providerCustomer : null, base }) });
    }
    if (!settings.plans.paypal || !(await paypalReady())) return NextResponse.json({ error: "PayPal isn't available right now" }, { status: 503 });
    return NextResponse.json({ url: await paypalCheckout({ userId: user.id, period, micros, base }) });
  } catch (err) {
    console.error(`${provider} checkout failed`, err);
    const status = err instanceof StripeError || err instanceof PayPalError ? (err.status >= 500 ? 502 : 400) : 502;
    return NextResponse.json({ error: `${provider === "stripe" ? "Stripe" : "PayPal"} couldn't start the payment — try again in a minute` }, { status });
  }
}
