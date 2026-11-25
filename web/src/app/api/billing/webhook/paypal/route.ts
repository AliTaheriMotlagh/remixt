import { NextRequest, NextResponse } from "next/server";
import { syncPayPalSubscription, verifyPayPalWebhook } from "@/lib/billing/paypal";
import { firstTime } from "@/lib/billing/store";
import sql from "@/lib/db";

// PayPal's webhook (developer.paypal.com → your app → Webhooks → add
// https://<site>/api/billing/webhook/paypal with BILLING.SUBSCRIPTION.* and
// PAYMENT.SALE.COMPLETED; its id is PAYPAL_WEBHOOK_ID). PayPal checks the
// signature itself; the subscription is read fresh each time.

type Event = { id: string; event_type: string; resource?: { id?: string; billing_agreement_id?: string } };

export async function POST(req: NextRequest) {
  const event = (await req.json().catch(() => null)) as Event | null;
  if (!event?.id || !event.event_type) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!(await verifyPayPalWebhook(req.headers, event))) return NextResponse.json({ error: "Not verified" }, { status: 400 });
  const subId = event.event_type.startsWith("BILLING.SUBSCRIPTION.") ? event.resource?.id : event.event_type === "PAYMENT.SALE.COMPLETED" ? event.resource?.billing_agreement_id : null;
  if (!subId) return NextResponse.json({ ignored: true });
  if (!(await firstTime("paypal", event.id, event.event_type, null))) return NextResponse.json({ duplicate: true });
  try {
    await syncPayPalSubscription(subId);
  } catch (err) {
    console.error("paypal webhook sync failed", err);
    await sql`DELETE FROM billing_events WHERE provider = 'paypal' AND event_id = ${event.id}`.catch(() => {});
    return NextResponse.json({ error: "Try again" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
