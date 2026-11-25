import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { paypalReady } from "@/lib/billing/paypal";
import { aiAllowance, myManualPayments, subscriptionOf } from "@/lib/billing/store";
import { stripeCheckoutSession, stripeReady, stripeSubscription, syncStripeSubscription } from "@/lib/billing/stripe";
import { planOf } from "@/lib/plans";
import { getSettings } from "@/lib/settings/server";

// GET: the member's plan, how they pay, what's on offer — and, coming back
// from Stripe Checkout (?session=…), the subscription read at once instead
// of waiting for the webhook.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const [stripe, paypal] = await Promise.all([stripeReady(), paypalReady()]);
  const offers = {
    enabled: settings.plans.enabled,
    stripe: settings.plans.stripe && stripe,
    paypal: settings.plans.paypal && paypal,
    manual: settings.plans.manual,
  };
  if (!user) return NextResponse.json({ user: null, plan: "free", offers }, { headers: { "Cache-Control": "no-store" } });

  const session = req.nextUrl.searchParams.get("session");
  if (session && /^cs_[\w]+$/.test(session) && stripe) {
    try {
      const s = await stripeCheckoutSession(session);
      if (s.client_reference_id === user.id && s.subscription) await syncStripeSubscription(await stripeSubscription(s.subscription), user.id);
    } catch (err) {
      console.error("stripe return sync failed", err);
    }
  }
  const sub = await subscriptionOf(user.id);
  const [manual, ai] = await Promise.all([myManualPayments(user.id), aiAllowance(user.id).catch(() => null)]);
  return NextResponse.json(
    {
      user: { id: user.id, email: user.email, verified: !!user.email_verified_at },
      plan: planOf(sub),
      subscription: sub && { status: sub.status, provider: sub.provider, period: sub.period, until: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, canManage: sub.provider === "stripe" ? !!sub.providerCustomer : sub.provider === "paypal" },
      manual,
      ai,
      offers,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
