import { secret } from "./secrets";
import { formEncode } from "./stripeWire";
export { formEncode, verifyStripeSignature } from "./stripeWire";
import { saveSubscription, userOfProviderSubscription } from "./store";
import type { Period, Subscription } from "../plans";

// Plus through Stripe: cards, and Apple Pay / Google Pay on the devices
// that have them (Stripe Checkout shows them by itself once the domain is
// verified under Settings → Payment methods). Prices aren't set up in
// Stripe's dashboard: each checkout carries the price from Admin → Settings,
// so changing it there is enough (members already paying keep theirs until
// they change plan). Stripe's REST API, no SDK.

const API = "https://api.stripe.com/v1";

export class StripeError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, data?: Record<string, unknown>, method = data ? "POST" : "GET"): Promise<T> {
  const key = await secret("STRIPE_SECRET_KEY");
  if (!key) throw new StripeError("Stripe isn't connected", 503);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2025-09-30.clover" },
    body: data ? formEncode(data).join("&") : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new StripeError(body.error?.message ?? `Stripe: HTTP ${res.status}`, res.status);
  return body;
}

export async function stripeReady() {
  return !!(await secret("STRIPE_SECRET_KEY"));
}

/** A Checkout page for Plus; its address. */
export async function stripeCheckout(o: { userId: string; email: string; period: Period; micros: number; customer: string | null; base: string }): Promise<string> {
  const session = await call<{ url: string }>("/checkout/sessions", {
    mode: "subscription",
    client_reference_id: o.userId,
    ...(o.customer ? { customer: o.customer } : { customer_email: o.email }),
    success_url: `${o.base}/plus?paid=stripe&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o.base}/plus?cancelled=1`,
    allow_promotion_codes: true,
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(o.micros / 10_000),
          recurring: { interval: o.period },
          product_data: { name: `Remixt Plus (${o.period === "year" ? "yearly" : "monthly"})` },
        },
      },
    },
    metadata: { user_id: o.userId, period: o.period },
    subscription_data: { metadata: { user_id: o.userId, period: o.period } },
  });
  return session.url;
}

/** Stripe's page where a member manages their card, invoices and cancelling. */
export async function stripePortal(customer: string, returnUrl: string): Promise<string> {
  const s = await call<{ url: string }>("/billing_portal/sessions", { customer, return_url: returnUrl });
  return s.url;
}

type StripeSub = {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number; price?: { recurring?: { interval?: string } } }[] };
  metadata?: Record<string, string>;
};

/** Stripe's status in ours. */
function statusOf(s: string): Subscription["status"] {
  if (s === "active") return "active";
  if (s === "trialing") return "trialing";
  if (s === "past_due" || s === "unpaid") return "past_due";
  if (s === "incomplete") return "pending";
  return "canceled";
}

/** Copies a Stripe subscription onto the member it belongs to. */
export async function syncStripeSubscription(sub: StripeSub, userHint: string | null) {
  const userId = sub.metadata?.user_id || userHint || (await userOfProviderSubscription("stripe", sub.id));
  if (!userId) return null;
  // Newer API versions keep the period on each item, older ones on the subscription.
  const end = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  const status = statusOf(sub.status);
  await saveSubscription(userId, {
    plan: status === "pending" ? "free" : "plus",
    status,
    provider: "stripe",
    period: interval === "year" ? "year" : interval === "month" ? "month" : null,
    customer: sub.customer,
    subscription: sub.id,
    periodEnd: end ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
  return userId;
}

export async function stripeSubscription(id: string) {
  return call<StripeSub>(`/subscriptions/${encodeURIComponent(id)}`);
}

export async function stripeCheckoutSession(id: string) {
  return call<{ subscription: string | null; client_reference_id: string | null; status: string }>(`/checkout/sessions/${encodeURIComponent(id)}`);
}
