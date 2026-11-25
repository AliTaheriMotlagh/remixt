import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { aiTokensPerDay, canUse, periodEnd, planOf, showsAds, tomanMonthly, yearlySaving, type Subscription } from "../src/lib/plans";
import { DEFAULTS } from "../src/lib/settings/registry";
import { formEncode, verifyStripeSignature } from "../src/lib/billing/stripeWire";

const on = { ...DEFAULTS, plans: { ...DEFAULTS.plans, enabled: true } };
const day = 86_400_000;
const sub = (o: Partial<Subscription>): Subscription => ({ plan: "plus", status: "active", provider: "stripe", currentPeriodEnd: new Date(Date.now() + 10 * day), cancelAtPeriodEnd: false, ...o });

test("no subscription is Free; a paid period is Plus until it ends", () => {
  assert.equal(planOf(null), "free");
  assert.equal(planOf(sub({})), "plus");
  assert.equal(planOf(sub({ currentPeriodEnd: new Date(Date.now() - day) })), "free");
});

test("cancelled keeps Plus to the end of what was paid; a failed renewal gets a few days' grace", () => {
  assert.equal(planOf(sub({ status: "canceled", cancelAtPeriodEnd: true })), "plus");
  assert.equal(planOf(sub({ status: "past_due", currentPeriodEnd: new Date(Date.now() - day) })), "plus");
  assert.equal(planOf(sub({ status: "past_due", currentPeriodEnd: new Date(Date.now() - 5 * day) })), "free");
  assert.equal(planOf(sub({ status: "pending" })), "free");
});

test("with plans off everyone has everything and sees ads", () => {
  assert.equal(canUse("linkImport", "free", DEFAULTS), true);
  assert.equal(showsAds("plus", DEFAULTS), true);
  assert.equal(aiTokensPerDay("free", DEFAULTS), DEFAULTS.ai.plusTokensPerDay);
});

test("with plans on, server features are Plus-only as switched, and Plus has no ads", () => {
  assert.equal(canUse("linkImport", "free", on), false);
  assert.equal(canUse("linkImport", "plus", on), true);
  assert.equal(canUse("ai", "free", on), true, "AI isn't Plus-only by default");
  assert.equal(showsAds("free", on), true);
  assert.equal(showsAds("plus", on), false);
  assert.equal(aiTokensPerDay("free", on), on.ai.freeTokensPerDay);
  assert.equal(aiTokensPerDay("free", { ...on, plans: { ...on.plans, plusOnlyAi: true } }), 0);
});

test("prices: the yearly saving and the Toman price", () => {
  assert.equal(yearlySaving(on), 17);
  assert.equal(tomanMonthly({ ...on, payouts: { ...on.payouts, tomanRate: 100_000 } }), 499_000);
  assert.equal(tomanMonthly(on), 0);
});

test("a month later is the same day, or the month's last", () => {
  assert.equal(periodEnd(new Date("2026-01-31T10:00:00Z"), "month").toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(periodEnd(new Date("2026-11-25T00:00:00Z"), "month", 12).toISOString(), "2027-11-25T00:00:00.000Z");
  assert.equal(periodEnd(new Date("2026-11-25T00:00:00Z"), "year").toISOString(), "2027-11-25T00:00:00.000Z");
});

test("Stripe: nested form fields, and the webhook signature", () => {
  assert.deepEqual(formEncode({ a: 1, line_items: { 0: { price_data: { currency: "usd" } } }, skip: undefined }), ["a=1", "line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd"]);
  const secret = "whsec_test";
  const payload = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret), true);
  assert.equal(verifyStripeSignature(payload + " ", `t=${t},v1=${v1}`, secret), false, "a changed body");
  assert.equal(verifyStripeSignature(payload, `t=${t - 600},v1=${createHmac("sha256", secret).update(`${t - 600}.${payload}`).digest("hex")}`, secret), false, "too old");
  assert.equal(verifyStripeSignature(payload, null, secret), false);
});
