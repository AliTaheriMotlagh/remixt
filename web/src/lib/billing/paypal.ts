import sql from "../db";
import { secret } from "./secrets";
import { saveSubscription, userOfProviderSubscription } from "./store";
import type { Period, Subscription } from "../plans";

// Plus through PayPal subscriptions. PayPal wants a product and a plan per
// price: they're made the first time a price is asked for and remembered
// (`billing_kv`), so a price changed in Admin → Settings just makes a new
// plan. The member approves on PayPal, comes back to /plus, and the
// webhooks keep the subscription in step after that (renewals, cancels).

export class PayPalError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function base() {
  return (await secret("PAYPAL_MODE"))?.toLowerCase() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

let token: { value: string; until: number; for: string } | null = null;

async function accessToken(): Promise<string> {
  const [id, key, url] = await Promise.all([secret("PAYPAL_CLIENT_ID"), secret("PAYPAL_CLIENT_SECRET"), base()]);
  if (!id || !key) throw new PayPalError("PayPal isn't connected", 503);
  if (token && token.for === `${url}:${id}` && token.until > Date.now() + 60_000) return token.value;
  const res = await fetch(`${url}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${key}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new PayPalError(data.error_description ?? `PayPal: HTTP ${res.status}`, res.status === 401 ? 503 : res.status);
  token = { value: data.access_token, until: Date.now() + (data.expires_in ?? 3000) * 1000, for: `${url}:${id}` };
  return token.value;
}

async function call<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const url = await base();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as T & { message?: string; details?: { description?: string }[] };
  if (!res.ok) throw new PayPalError(data.details?.[0]?.description ?? data.message ?? `PayPal: HTTP ${res.status}`, res.status);
  return data;
}

export async function paypalReady() {
  return !!((await secret("PAYPAL_CLIENT_ID")) && (await secret("PAYPAL_CLIENT_SECRET")));
}

let kvReady: Promise<unknown> | null = null;
async function kv(key: string, make: () => Promise<string>): Promise<string> {
  kvReady ??= sql`CREATE TABLE IF NOT EXISTS billing_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`.catch((e) => {
    kvReady = null;
    throw e;
  });
  await kvReady;
  const [row] = await sql<{ value: string }[]>`SELECT value FROM billing_kv WHERE key = ${key}`;
  if (row) return row.value;
  const value = await make();
  await sql`INSERT INTO billing_kv (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING`;
  return value;
}

/** The PayPal plan for this price (made the first time). */
async function planFor(period: Period, micros: number): Promise<string> {
  const mode = (await base()).includes("sandbox") ? "sandbox" : "live";
  const product = await kv(`paypal:${mode}:product`, async () => (await call<{ id: string }>("/v1/catalogs/products", { name: "Remixt Plus", type: "SERVICE", category: "SOFTWARE" })).id);
  return kv(`paypal:${mode}:plan:${period}:${micros}`, async () => {
    const plan = await call<{ id: string }>("/v1/billing/plans", {
      product_id: product,
      name: `Remixt Plus ${period === "year" ? "yearly" : "monthly"}`,
      billing_cycles: [
        {
          frequency: { interval_unit: period === "year" ? "YEAR" : "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: (micros / 1_000_000).toFixed(2), currency_code: "USD" } },
        },
      ],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
    });
    return plan.id;
  });
}

/** A PayPal approval page for Plus; its address. */
export async function paypalCheckout(o: { userId: string; period: Period; micros: number; base: string }): Promise<string> {
  const sub = await call<{ id: string; links: { rel: string; href: string }[] }>("/v1/billing/subscriptions", {
    plan_id: await planFor(o.period, o.micros),
    custom_id: o.userId,
    application_context: {
      brand_name: "Remixt",
      user_action: "SUBSCRIBE_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: `${o.base}/api/billing/paypal/return`,
      cancel_url: `${o.base}/plus?cancelled=1`,
    },
  });
  const approve = sub.links.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new PayPalError("PayPal gave no approval page", 502);
  return approve;
}

type PayPalSub = { id: string; status: string; custom_id?: string; plan_id?: string; billing_info?: { next_billing_time?: string; last_payment?: { time?: string } } };

function statusOf(s: string): Subscription["status"] {
  if (s === "ACTIVE") return "active";
  if (s === "APPROVAL_PENDING" || s === "APPROVED") return "pending";
  if (s === "SUSPENDED") return "past_due";
  return "canceled";
}

/** Reads a PayPal subscription and copies it onto its member. */
export async function syncPayPalSubscription(id: string): Promise<string | null> {
  const sub = await call<PayPalSub>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);
  const userId = sub.custom_id || (await userOfProviderSubscription("paypal", sub.id));
  if (!userId) return null;
  const status = statusOf(sub.status);
  const next = sub.billing_info?.next_billing_time;
  // Cancelled: Plus stays until the end of what was paid (a month on from the last payment at most).
  const lastPaid = sub.billing_info?.last_payment?.time;
  const end = next ? new Date(next) : lastPaid && status === "canceled" ? new Date(new Date(lastPaid).getTime() + 31 * 86_400_000) : null;
  await saveSubscription(userId, {
    plan: status === "pending" ? "free" : "plus",
    status,
    provider: "paypal",
    subscription: sub.id,
    periodEnd: end,
    cancelAtPeriodEnd: status === "canceled",
  });
  return userId;
}

export async function paypalCancel(id: string) {
  await call(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason: "Cancelled from Remixt" });
}

/** Asks PayPal whether a webhook really came from it (its own check: the signature against the webhook's id). */
export async function verifyPayPalWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = await secret("PAYPAL_WEBHOOK_ID");
  if (!webhookId) return false;
  const res = await call<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  }).catch(() => null);
  return res?.verification_status === "SUCCESS";
}
