// lib/monetize/houseAds.ts: Remixt's own ads — which fit a spot, how one is
// picked, what they may link to, and that the built-in ones keep their word.
//
//   node --import ./tests/support/register.mjs --test tests/house-ads.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  BUILTIN_HOUSE_ADS, HOUSE_SPOTS, ctrText, houseAd, houseAdInput, houseCandidates, pickWeighted, safeHref, type HouseAd,
} from "../src/lib/monetize/houseAds.ts";

const root = path.join(import.meta.dirname, "..");

describe("the built-in ads", () => {
  test("ids are unique, weights positive, every one fits at least one spot", () => {
    const ids = BUILTIN_HOUSE_ADS.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of BUILTIN_HOUSE_ADS) {
      assert.ok(a.weight > 0, a.id);
      assert.ok(a.spots.length > 0, a.id);
      assert.ok(safeHref(a.href), `${a.id} links somewhere allowed`);
      assert.ok(houseAdInput.safeParse(a).success, `${a.id} passes the admin form's own checks`);
    }
  });

  test("every page they link to exists", () => {
    // A folder per segment, or the route's [dynamic] folder there.
    const pageFor = (page: string) => {
      let dir = path.join(root, "src/app");
      for (const seg of page.split("/").filter(Boolean)) {
        const exact = path.join(dir, seg);
        const dynamic = fs.existsSync(dir) ? fs.readdirSync(dir).find((d) => /^\[[^.]/.test(d)) : undefined;
        dir = fs.existsSync(exact) ? exact : dynamic ? path.join(dir, dynamic) : exact;
      }
      return path.join(dir, "page.tsx");
    };
    for (const a of BUILTIN_HOUSE_ADS) {
      const page = a.href.split(/[?#]/)[0];
      if (!page.startsWith("/")) continue;
      assert.ok(fs.existsSync(pageFor(page)), `${a.id} → ${page} has a page`);
    }
  });

  test("their sounds are in public/ and no longer than an audio ad may be", () => {
    for (const a of BUILTIN_HOUSE_ADS.filter((x) => x.kind === "audio")) {
      assert.ok(a.media && fs.existsSync(path.join(root, "public", a.media)), `${a.id}'s sound is there`);
      assert.ok((a.seconds ?? 99) <= 15, `${a.id} is short`);
    }
  });

  test("every spot has a picture ad and the radio a sound, in both languages", () => {
    for (const lang of ["en", "fa"] as const) {
      for (const spot of HOUSE_SPOTS) assert.ok(houseCandidates(BUILTIN_HOUSE_ADS, spot, lang, "visual").length > 0, `${lang} ${spot}`);
      assert.ok(houseCandidates(BUILTIN_HOUSE_ADS, "radio", lang, "audio").length > 0, `${lang} radio sound`);
    }
  });

  test("Persian pages get Persian ads, English pages English ones (sounds have no words: both)", () => {
    for (const a of houseCandidates(BUILTIN_HOUSE_ADS, "site", "fa", "visual")) assert.match(a.title, /[؀-ۿ]/);
    for (const a of houseCandidates(BUILTIN_HOUSE_ADS, "site", "en", "visual")) assert.doesNotMatch(a.title, /[؀-ۿ]/);
  });
});

describe("which fit", () => {
  const base: HouseAd = { ...BUILTIN_HOUSE_ADS[0], id: "x", lang: "en", kind: "card", spots: ["site"], weight: 5, active: true, media: null };

  test("turned off, weight 0, other spot, other language: left out", () => {
    const ads = [base, { ...base, id: "off", active: false }, { ...base, id: "zero", weight: 0 }, { ...base, id: "radio", spots: ["radio" as const] }, { ...base, id: "fa", lang: "fa" as const }];
    assert.deepEqual(houseCandidates(ads, "site", "en", "visual").map((a) => a.id), ["x"]);
  });

  test("a video with no file yet, or a sound with none, never fills a spot", () => {
    const ads = [{ ...base, id: "v", kind: "video" as const }, { ...base, id: "a", kind: "audio" as const }];
    assert.equal(houseCandidates(ads, "site", "en", "visual").length, 0);
    assert.equal(houseCandidates(ads, "site", "en", "audio").length, 0);
  });

  test("sounds only for sound spots, pictures only for picture spots", () => {
    const ads = [base, { ...base, id: "a", kind: "audio" as const, media: "/ads/x.mp3" }];
    assert.deepEqual(houseCandidates(ads, "site", "en", "audio").map((a) => a.id), ["a"]);
    assert.deepEqual(houseCandidates(ads, "site", "en", "visual").map((a) => a.id), ["x"]);
  });
});

describe("picking", () => {
  test("by weight: a weight-3 ad takes three quarters of the draws against a weight-1", () => {
    const ads = [{ id: "a", weight: 3 }, { id: "b", weight: 1 }];
    let a = 0;
    for (let i = 0; i < 1000; i++) if (pickWeighted(ads, i / 1000)?.id === "a") a++;
    assert.equal(a, 750);
  });

  test("nothing to pick from: null; the edges of rand stay in range", () => {
    assert.equal(pickWeighted([], 0.5), null);
    assert.equal(pickWeighted([{ weight: 0 }], 0.5), null);
    assert.ok(pickWeighted([{ weight: 1 }], 1));
    assert.ok(pickWeighted([{ weight: 1 }], -1));
  });

  test("the old helper still gives a card for an ordinary page", () => {
    assert.equal(houseAd("en", 3).kind, "card");
    assert.equal(houseAd("fa", 7).lang, "fa");
  });
});

describe("links and numbers", () => {
  test("a page here or https only — not another site by //, not javascript:, not http", () => {
    assert.ok(safeHref("/radio"));
    assert.ok(safeHref("/earnings#claims"));
    assert.ok(safeHref("https://t.me/remixt"));
    for (const bad of ["//evil.example", "javascript:alert(1)", "http://example.com", "radio", "/ spaced"]) assert.equal(safeHref(bad), false, bad);
  });

  test("click-through rate", () => {
    assert.equal(ctrText(0, 0), "—");
    assert.equal(ctrText(1000, 24), "2.4%");
  });

  test("the admin form refuses a house ad with nowhere to show", () => {
    const r = houseAdInput.safeParse({ lang: "en", kind: "card", title: "Hi", cta: "Go", href: "/", spots: [] });
    assert.equal(r.success, false);
  });
});
