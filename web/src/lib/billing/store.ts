import { randomUUID } from "crypto";
import sql from "../db";
import type { User } from "../auth";
import { getSettings } from "../settings/server";
import { notify } from "../notifications";
import { aiTokensPerDay, canUse, periodEnd, planOf, showsAds, type Period, type Plan, type PlusFeature, type Provider, type Subscription } from "../plans";

// Who is on Plus, and how they pay. One row per member (`subscriptions`):
// the gateways' webhooks keep it up to date (lib/billing/stripe.ts,
// paypal.ts), an admin can grant Plus by hand, and a payment made by hand
// (card to card, bank, USDT) is a request the admin confirms. Every webhook
// event is written down once (`billing_events`), so one delivered twice
// changes nothing the second time.

let ready: Promise<void> | null = null;
export function ensureBillingSchema(): Promise<void> {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'active',
        provider TEXT NOT NULL,
        period TEXT,
        provider_customer TEXT,
        provider_subscription TEXT,
        current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS subscriptions_provider_sub ON subscriptions (provider, provider_subscription)`;
    await sql`
      CREATE TABLE IF NOT EXISTS billing_events (
        provider TEXT NOT NULL,
        event_id TEXT NOT NULL,
        type TEXT NOT NULL,
        user_id TEXT,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, event_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS manual_payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        period TEXT NOT NULL,
        months INTEGER NOT NULL,
        amount TEXT NOT NULL,
        reference TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        admin_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS ai_token_usage (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day DATE NOT NULL DEFAULT CURRENT_DATE,
        tokens BIGINT NOT NULL DEFAULT 0,
        requests INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      )
    `;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

type Row = {
  user_id: string;
  plan: Plan;
  status: Subscription["status"];
  provider: Provider;
  period: Period | null;
  provider_customer: string | null;
  provider_subscription: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
};

const asSub = (r: Row): Subscription => ({ plan: r.plan, status: r.status, provider: r.provider, currentPeriodEnd: r.current_period_end, cancelAtPeriodEnd: r.cancel_at_period_end });

export async function subscriptionOf(userId: string): Promise<(Subscription & { period: Period | null; providerCustomer: string | null }) | null> {
  await ensureBillingSchema();
  const [r] = await sql<Row[]>`SELECT * FROM subscriptions WHERE user_id = ${userId}`;
  return r ? { ...asSub(r), period: r.period, providerCustomer: r.provider_customer } : null;
}

/** The plan someone is on (signed out = Free). */
export async function planFor(user: Pick<User, "id"> | null): Promise<Plan> {
  if (!user) return "free";
  return planOf(await subscriptionOf(user.id).catch(() => null));
}

/** Whether `user` may use `feature` now; the message to show when not. */
export async function mayUse(user: Pick<User, "id"> | null, feature: PlusFeature): Promise<{ ok: true } | { ok: false; error: string; plus: true }> {
  const settings = await getSettings();
  if (canUse(feature, await planFor(user), settings)) return { ok: true };
  return { ok: false, plus: true, error: "That's part of Remixt Plus — see remixt.app/plus" };
}

/** Whether ads are shown to `user`. */
export async function adsFor(user: Pick<User, "id"> | null): Promise<boolean> {
  return showsAds(await planFor(user), await getSettings());
}

/** Sets a member's subscription (a webhook, an admin grant, a confirmed payment). */
export async function saveSubscription(
  userId: string,
  s: { plan: Plan; status: Subscription["status"]; provider: Provider; period?: Period | null; customer?: string | null; subscription?: string | null; periodEnd: Date | null; cancelAtPeriodEnd?: boolean; note?: string | null }
) {
  await ensureBillingSchema();
  await sql`
    INSERT INTO subscriptions (user_id, plan, status, provider, period, provider_customer, provider_subscription, current_period_end, cancel_at_period_end, note)
    VALUES (${userId}, ${s.plan}, ${s.status}, ${s.provider}, ${s.period ?? null}, ${s.customer ?? null}, ${s.subscription ?? null}, ${s.periodEnd}, ${s.cancelAtPeriodEnd ?? false}, ${s.note ?? null})
    ON CONFLICT (user_id) DO UPDATE SET
      plan = EXCLUDED.plan, status = EXCLUDED.status, provider = EXCLUDED.provider,
      period = COALESCE(EXCLUDED.period, subscriptions.period),
      provider_customer = COALESCE(EXCLUDED.provider_customer, subscriptions.provider_customer),
      provider_subscription = COALESCE(EXCLUDED.provider_subscription, subscriptions.provider_subscription),
      current_period_end = EXCLUDED.current_period_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      note = COALESCE(EXCLUDED.note, subscriptions.note), updated_at = now()
  `;
}

/** The member a gateway's subscription belongs to. */
export async function userOfProviderSubscription(provider: Provider, id: string): Promise<string | null> {
  await ensureBillingSchema();
  const [r] = await sql<{ user_id: string }[]>`SELECT user_id FROM subscriptions WHERE provider = ${provider} AND provider_subscription = ${id}`;
  return r?.user_id ?? null;
}

/** Writes an event down; false when it was seen before (a webhook delivered twice). */
export async function firstTime(provider: Provider, eventId: string, type: string, userId: string | null): Promise<boolean> {
  await ensureBillingSchema();
  const rows = await sql`INSERT INTO billing_events (provider, event_id, type, user_id) VALUES (${provider}, ${eventId}, ${type}, ${userId}) ON CONFLICT DO NOTHING RETURNING event_id`;
  return rows.length === 1;
}

/** Adds `months` of Plus on top of what's left (a payment by hand, an admin's grant). */
export async function extendPlus(userId: string, months: number, provider: Provider, note: string | null) {
  const now = new Date();
  const current = await subscriptionOf(userId);
  const from = current && planOf(current) === "plus" && current.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
  const end = periodEnd(from, "month", months);
  // A gateway subscription already running keeps its provider (it renews by itself); otherwise this is a fixed period.
  const keepGateway = current && (current.provider === "stripe" || current.provider === "paypal") && planOf(current) === "plus";
  await saveSubscription(userId, {
    plan: "plus",
    status: "active",
    provider: keepGateway ? current!.provider : provider,
    period: months >= 12 ? "year" : "month",
    periodEnd: end,
    cancelAtPeriodEnd: keepGateway ? current!.cancelAtPeriodEnd : true,
    note,
  });
  return end;
}

/** Takes Plus away now (an admin, a refund). */
export async function endPlus(userId: string, note: string | null) {
  await saveSubscription(userId, { plan: "free", status: "canceled", provider: "admin", periodEnd: new Date(), cancelAtPeriodEnd: true, note });
}

// ——— paying by hand ———

export type ManualPayment = { id: string; user_id: string; artist_name: string; email: string; period: Period; months: number; amount: string; reference: string; status: "waiting" | "confirmed" | "refused"; admin_note: string | null; created_at: string };

export async function askManualPayment(userId: string, period: Period, amount: string, reference: string): Promise<string> {
  await ensureBillingSchema();
  const id = randomUUID();
  await sql`INSERT INTO manual_payments (id, user_id, period, months, amount, reference) VALUES (${id}, ${userId}, ${period}, ${period === "year" ? 12 : 1}, ${amount}, ${reference})`;
  return id;
}

export async function manualPayments(status: "waiting" | "all" = "waiting"): Promise<ManualPayment[]> {
  await ensureBillingSchema();
  return sql<ManualPayment[]>`
    SELECT m.*, u.artist_name, u.email FROM manual_payments m JOIN users u ON u.id = m.user_id
    WHERE (${status} = 'all' OR m.status = ${status}) ORDER BY m.created_at DESC LIMIT 200
  `;
}

export async function myManualPayments(userId: string) {
  await ensureBillingSchema();
  return sql<{ id: string; period: Period; amount: string; reference: string; status: string; admin_note: string | null; created_at: string }[]>`
    SELECT id, period, amount, reference, status, admin_note, created_at FROM manual_payments WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 10
  `;
}

/** The admin's answer to a payment by hand: confirmed adds the months of Plus and tells the member. */
export async function decideManualPayment(id: string, confirm: boolean, note: string | null) {
  await ensureBillingSchema();
  const [p] = await sql<{ user_id: string; months: number; status: string }[]>`
    UPDATE manual_payments SET status = ${confirm ? "confirmed" : "refused"}, admin_note = ${note}, decided_at = now()
    WHERE id = ${id} AND status = 'waiting' RETURNING user_id, months, status
  `;
  if (!p) return null;
  if (confirm) {
    const end = await extendPlus(p.user_id, p.months, "manual", `Paid by hand (${id.slice(0, 8)})`);
    await notify({ userId: p.user_id, actorId: null, type: "plan", body: `on|${end.toISOString().slice(0, 10)}|` });
    return { userId: p.user_id, end };
  }
  await notify({ userId: p.user_id, actorId: null, type: "plan", body: `refused||${note ?? ""}` });
  return { userId: p.user_id, end: null };
}

// ——— the site's AI, in tokens ———

/** Tokens used today and the day's allowance for `user`'s plan. */
export async function aiAllowance(userId: string): Promise<{ used: number; limit: number; left: number }> {
  await ensureBillingSchema();
  const [settings, plan] = await Promise.all([getSettings(), planFor({ id: userId })]);
  const limit = aiTokensPerDay(plan, settings);
  const [r] = await sql<{ tokens: string }[]>`SELECT tokens FROM ai_token_usage WHERE user_id = ${userId} AND day = CURRENT_DATE`;
  const used = Number(r?.tokens ?? 0);
  return { used, limit, left: Math.max(0, limit - used) };
}

/** Counts the tokens one reply took. */
export async function spendAiTokens(userId: string, tokens: number) {
  await ensureBillingSchema();
  const n = Math.max(0, Math.round(tokens));
  await sql`
    INSERT INTO ai_token_usage (user_id, tokens, requests) VALUES (${userId}, ${n}, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET tokens = ai_token_usage.tokens + ${n}, requests = ai_token_usage.requests + 1
  `;
}
