// Where an ad stands (lib/monetize/adStatus.ts): what the advertiser and the
// owner are told must match what the server really serves.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { deliveryStatus, hasMoneyLeft, viewsLeft, type DeliveryInput } from "../src/lib/monetize/adStatus.ts";
import { MICROS } from "../src/lib/monetize/policy.ts";

const now = Date.parse("2026-11-25T12:00:00Z");
const ad = (o: Partial<DeliveryInput> = {}): DeliveryInput => ({
  format: "card", review: "approved", active: true, starts_at: "2026-11-01T00:00:00Z", ends_at: null,
  budget_micros: 10 * MICROS, spent_micros: 0, cpm_micros: 2 * MICROS, audio_key: null, ...o,
});

/** The same conditions as store.pickCampaign's WHERE (format and placement aside). */
function servable(c: DeliveryInput): boolean {
  return c.active && c.review === "approved" && (!c.starts_at || Date.parse(c.starts_at) <= now) && (!c.ends_at || Date.parse(c.ends_at) > now)
    && c.spent_micros + Math.max(1, c.cpm_micros / 1000) <= c.budget_micros && (c.format !== "audio" || !!c.audio_key);
}

describe("where an ad stands", () => {
  test("approved, paid and on: showing", () => {
    const d = deliveryStatus(ad(), { now });
    assert.equal(d.state, "running");
    assert.equal(d.tone, "good");
    assert.equal(d.step, 3);
  });

  test("approved with no money is never 'running' — it says to add money (the reason ads didn't show)", () => {
    const d = deliveryStatus(ad({ budget_micros: 0 }), { now });
    assert.equal(d.state, "needsMoney");
    assert.equal(d.action, "pay");
    assert.equal(d.step, 2);
  });

  test("a payment sent but not checked yet says so, without asking to pay again", () => {
    const d = deliveryStatus(ad({ budget_micros: 0 }), { now, paymentPending: true });
    assert.equal(d.state, "checkingPayment");
    assert.equal(d.action, null);
  });

  test("a budget spent down to less than one view: used up", () => {
    const c = ad({ budget_micros: 10 * MICROS, spent_micros: 10 * MICROS - 1000, cpm_micros: 2 * MICROS });
    assert.equal(hasMoneyLeft(c), false);
    assert.equal(deliveryStatus(c, { now }).state, "spent");
  });

  test("being checked asks for money early when there's none", () => {
    assert.equal(deliveryStatus(ad({ review: "pending", budget_micros: 0 }), { now }).action, "pay");
    assert.equal(deliveryStatus(ad({ review: "pending" }), { now }).action, null);
  });

  test("an audio ad with no sound asks for it", () => {
    assert.equal(deliveryStatus(ad({ format: "audio", audio_key: null }), { now }).state, "needsSound");
    assert.equal(deliveryStatus(ad({ format: "audio", review: "draft" }), { now }).action, "upload");
  });

  test("paused, ended, not started, switched off", () => {
    assert.equal(deliveryStatus(ad({ active: false }), { now }).state, "paused");
    assert.equal(deliveryStatus(ad({ ends_at: "2026-11-20T00:00:00Z" }), { now }).state, "ended");
    assert.equal(deliveryStatus(ad({ starts_at: "2026-12-01T00:00:00Z" }), { now }).state, "scheduled");
    assert.equal(deliveryStatus(ad({ format: "audio", audio_key: "a" }), { now, switches: { ads: true, audioAds: false, promotions: true } }).state, "switchedOff");
  });

  test("'showing' exactly when the server would serve it", () => {
    const cases: DeliveryInput[] = [];
    for (const review of ["draft", "pending", "approved", "rejected"] as const)
      for (const active of [true, false])
        for (const budget of [0, 1000, 10 * MICROS])
          for (const ends of [null, "2026-11-20T00:00:00Z"])
            for (const format of ["card", "audio"] as const)
              for (const audio_key of [null, "k"]) cases.push(ad({ review, active, budget_micros: budget, ends_at: ends, format, audio_key, spent_micros: budget ? 500 : 0 }));
    for (const c of cases) assert.equal(deliveryStatus(c, { now }).state === "running", servable(c), JSON.stringify(c));
  });

  test("views left", () => {
    assert.equal(viewsLeft(ad({ budget_micros: 2 * MICROS, cpm_micros: 2 * MICROS })), 1000);
    assert.equal(viewsLeft(ad({ budget_micros: 0 })), 0);
  });

  test("every state says something in both languages", () => {
    for (const c of [ad(), ad({ review: "draft" }), ad({ review: "rejected" }), ad({ budget_micros: 0 }), ad({ active: false })]) {
      const d = deliveryStatus(c, { now });
      assert.ok(d.en.label && d.en.why && d.fa.label && d.fa.why);
    }
  });
});
