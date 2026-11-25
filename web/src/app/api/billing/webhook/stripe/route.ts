import { NextRequest, NextResponse } from "next/server";
import { secret } from "@/lib/billing/secrets";
import { firstTime } from "@/lib/billing/store";
import { stripeSubscription, syncStripeSubscription, verifyStripeSignature } from "@/lib/billing/stripe";

// Stripe's webhook (Developers → Webhooks → add https://<site>/api/billing/webhook/stripe
// with checkout.session.completed, customer.subscription.created/updated/deleted,
// invoice.paid, invoice.payment_failed). Signed with STRIPE_WEBHOOK_SECRET; each
// event acted on once. The subscription is always read fresh from Stripe, so
// events arriving out of order can't leave it wrong.

type Event = { id: string; type: string; data: { object: Record<string, unknown> } };

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signing = await secret("STRIPE_WEBHOOK_SECRET");
  if (!signing || !verifyStripeSignature(payload, req.headers.get("stripe-signature"), signing)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as Event;
  const o = event.data.object;
  let subId: string | null = null;
  let userHint: string | null = null;
  if (event.type === "checkout.session.completed") {
    subId = typeof o.subscription === "string" ? o.subscription : null;
    userHint = typeof o.client_reference_id === "string" ? o.client_reference_id : null;
  } else if (event.type.startsWith("customer.subscription.")) {
    subId = typeof o.id === "string" ? o.id : null;
  } else if (event.type.startsWith("invoice.")) {
    const parent = o.parent as { subscription_details?: { subscription?: string } } | undefined;
    subId = typeof o.subscription === "string" ? o.subscription : (parent?.subscription_details?.subscription ?? null);
  }
  if (!subId) return NextResponse.json({ ignored: true });
  if (!(await firstTime("stripe", event.id, event.type, userHint))) return NextResponse.json({ duplicate: true });
  try {
    await syncStripeSubscription(await stripeSubscription(subId), userHint);
  } catch (err) {
    console.error("stripe webhook sync failed", err);
    // Stripe tries again later; the event is forgotten so that try counts.
    const sql = (await import("@/lib/db")).default;
    await sql`DELETE FROM billing_events WHERE provider = 'stripe' AND event_id = ${event.id}`.catch(() => {});
    return NextResponse.json({ error: "Try again" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
