// lib/monetize/adRules.ts: who decides what shows, how often audio ads
// play, and money in Toman.
//
//   node --import ./tests/support/register.mjs --test tests/ad-rules.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  adHeard, cleanSettings, DEFAULT_REMIX_ADS, effectiveAds, formatToman, kindsOf, microsOfToman, persianNumber,
  prerollDue, radioBreakDue, tomanOf, type ListenerAds,
} from "../src/lib/monetize/adRules.ts";
import { MICROS } from "../src/lib/monetize/policy.ts";
import { DEFAULTS } from "../src/lib/settings/registry.ts";

describe("who decides", () => {
  const on = DEFAULT_REMIX_ADS;
  const off = { ...on, on: false };

  test("the remixer's choice when no artist chose anything", () => {
    assert.deepEqual(effectiveAds(on, [null, "follow"]).kinds, ["card", "preroll", "radio"]);
    const e = effectiveAds(off, [null, "follow"]);
    assert.equal(e.on, false);
    assert.equal(e.forced, false);
  });

  test("an artist's Monetize keeps ads on when the remixer turned them off — in the kinds the remixer ticked", () => {
    const e = effectiveAds({ on: false, kinds: ["card", "radio"], blockedTopics: ["dating"] }, ["follow", "monetize"]);
    assert.equal(e.on, true);
    assert.equal(e.forced, true);
    assert.deepEqual(e.kinds, ["card", "radio"]);
    assert.deepEqual(e.blockedTopics, ["dating"], "the remixer's blocked topics still hold");
  });

  test("Monetize with no kind ticked still shows the picture card", () => {
    const e = effectiveAds({ on: true, kinds: [], blockedTopics: [] }, ["monetize"]);
    assert.deepEqual(e.kinds, ["card"]);
    assert.equal(e.forced, true);
  });

  test("a remixer with no kind ticked and no Monetize: nothing", () => {
    assert.equal(effectiveAds({ on: true, kinds: [], blockedTopics: [] }, [null]).on, false);
  });

  test("Block wins over everything: the remix can't be public", () => {
    const e = effectiveAds(on, ["monetize", "block"]);
    assert.equal(e.blocked, true);
    assert.equal(e.on, false);
  });

  test("stored settings are cleaned: unknown kinds and topics dropped, missing means the defaults", () => {
    assert.deepEqual(cleanSettings(null), DEFAULT_REMIX_ADS);
    assert.deepEqual(cleanSettings({ on: false, kinds: ["card", "popup" as never], blockedTopics: ["games", "nope"] }), {
      on: false,
      kinds: ["card"],
      blockedTopics: ["games"],
    });
  });

  test("formats fill kinds", () => {
    assert.deepEqual(kindsOf("card"), ["card"]);
    assert.deepEqual(kindsOf("audio"), ["preroll", "radio"]);
    assert.deepEqual(kindsOf("promote"), []);
  });

  test("the owner's lowest prices: card $0.50, audio $2, promote $0.50 per 1,000", () => {
    assert.deepEqual(DEFAULTS.ads.floors, { card: 500_000, audio: 2_000_000, promote: 500_000 });
  });
});

describe("how often audio ads play", () => {
  const min = 60_000;

  test("never on the first remix of a visit", () => {
    const first = prerollDue(null, 1_000 * min);
    assert.equal(first.due, false);
    assert.equal(first.next.playsThisVisit, 1);
  });

  test("the second remix of a visit gets one; then none for 30 minutes", () => {
    let s: ListenerAds = prerollDue(null, 1_000 * min).next;
    const second = prerollDue(s, 1_003 * min);
    assert.equal(second.due, true);
    s = adHeard(second.next, 1_003 * min);
    assert.equal(prerollDue(s, 1_010 * min).due, false);
    assert.equal(prerollDue(s, 1_020 * min).due, false);
    // Plays keep the visit alive; 30 minutes after the ad, the next remix may have one.
    s = prerollDue(s, 1_020 * min).next;
    s = prerollDue(s, 1_030 * min).next;
    assert.equal(prerollDue(s, 1_033 * min).due, true);
  });

  test("a long gap starts a new visit, whose first remix is free again", () => {
    let s = prerollDue(null, 0).next;
    s = adHeard(prerollDue(s, 2 * min).next, 2 * min);
    const back = prerollDue(s, 2 * min + DEFAULTS.audio.visitGapMinutes * min + 1);
    assert.equal(back.due, false);
    assert.equal(back.next.playsThisVisit, 1);
  });

  test("radio: a break per 20 minutes of listening", () => {
    assert.equal(radioBreakDue(19 * min), false);
    assert.equal(radioBreakDue(20 * min), true);
  });
});

describe("Toman", () => {
  test("Persian digits, grouped", () => {
    assert.equal(persianNumber(1234567), "۱٬۲۳۴٬۵۶۷");
    assert.equal(persianNumber(0), "۰");
  });

  test("dollars to Toman at the owner's rate, to 10 Toman", () => {
    assert.equal(tomanOf(10 * MICROS, 100_000), 1_000_000);
    assert.equal(tomanOf(1_234, 100_000), 120);
    assert.equal(formatToman(10 * MICROS, 100_000), "۱٬۰۰۰٬۰۰۰ تومان");
    assert.equal(formatToman(10, 100_000), "کمتر از ۱۰ تومان");
    assert.equal(formatToman(0, 100_000), "۰ تومان");
  });

  test("a price typed in Toman back to dollars", () => {
    assert.equal(microsOfToman(50_000, 100_000), MICROS / 2);
    assert.equal(microsOfToman(50_000, 0), 0);
  });
});

describe("the owner's audio rules", () => {
  const min = 60_000;
  const rules = { ...DEFAULTS.audio, prerollEveryMinutes: 5, prerollFreeFirst: false, radioEveryMinutes: 10 };

  test("a first remix can have one when the owner allows it", () => {
    assert.equal(prerollDue(null, 100 * min, rules).due, true);
  });

  test("the wait between ads is the owner's", () => {
    const s = adHeard(prerollDue(null, 100 * min, rules).next, 100 * min);
    assert.equal(prerollDue(s, 104 * min, rules).due, false);
    assert.equal(prerollDue(s, 105 * min, rules).due, true);
  });

  test("the radio's break comes when the owner says", () => {
    assert.equal(radioBreakDue(10 * min, rules), true);
    assert.equal(radioBreakDue(9 * min, rules), false);
  });
});
