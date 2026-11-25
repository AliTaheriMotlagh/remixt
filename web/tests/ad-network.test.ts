import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { adsTxt, isClosedMonth, networkFor, shareNetworkMonth } from "../src/lib/monetize/network";
import { crossesIsolation, isIsolatedPath } from "../src/lib/isolation";
import { DEFAULTS } from "../src/lib/settings/registry";

const both = {
  ...DEFAULTS.network,
  adsense: true,
  adsenseClient: "ca-pub-1234567890123456",
  adsenseSlot: "9876543210",
  other: true,
  otherName: "Yektanet",
  otherScript: "https://cdn.example/y.js",
  otherElementId: "pos-1",
};

describe("which network fills a spot", () => {
  test("none when both are off", () => {
    assert.equal(networkFor(DEFAULTS.network, "en"), null);
  });
  test("English pages AdSense, Persian pages the other network", () => {
    assert.equal(networkFor(both, "en")?.kind, "adsense");
    assert.equal(networkFor(both, "fa")?.kind, "script");
  });
  test("either stands in for the other", () => {
    assert.equal(networkFor({ ...both, other: false }, "fa")?.kind, "adsense");
    assert.equal(networkFor({ ...both, adsense: false }, "en")?.kind, "script");
  });
  test("a switch on with its ids missing shows nothing", () => {
    assert.equal(networkFor({ ...DEFAULTS.network, adsense: true }, "en"), null);
  });
});

describe("ads.txt", () => {
  test("AdSense's line from the publisher id, then the owner's lines once each", () => {
    const body = adsTxt({ ...both, adsTxt: "yektanet.com, 123, DIRECT\n\nyektanet.com, 123, DIRECT\n" });
    assert.equal(body, "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\nyektanet.com, 123, DIRECT\n");
  });
  test("a comment when there's nothing", () => {
    assert.match(adsTxt(DEFAULTS.network), /^#/);
  });
});

describe("a month's network money", () => {
  test("split by views, adding up exactly, pages with no views left out", () => {
    const out = shareNetworkMonth(1_000_000, [
      { placement: "remix", target: "remix:a", views: 2 },
      { placement: "remix", target: "remix:b", views: 1 },
      { placement: "site", target: "", views: 0 },
    ]);
    assert.deepEqual(out.map((p) => p.micros), [666_667, 333_333]);
    assert.equal(out.reduce((s, p) => s + p.micros, 0), 1_000_000);
  });
  test("only a month that's over can be shared", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    assert.equal(isClosedMonth("2026-10", now), true);
    assert.equal(isClosedMonth("2026-11", now), false);
    assert.equal(isClosedMonth("2026-13", now), false);
    assert.equal(isClosedMonth("nope", now), false);
  });
});

describe("isolated pages", () => {
  test("the heavy pages are isolated, the ad pages aren't", () => {
    for (const p of ["/studio", "/upload", "/library", "/dj/learn", "/live/abc"]) assert.equal(isIsolatedPath(p), true, p);
    for (const p of ["/", "/remixes/abc", "/radio/remixt-radio", "/tools/vocal-remover", "/fa/tools", "/guides/x", "/studios"]) assert.equal(isIsolatedPath(p), false, p);
  });
  test("a full load only when crossing between the two", () => {
    assert.equal(crossesIsolation("/", "/studio"), true);
    assert.equal(crossesIsolation("/studio", "/remixes/x"), true);
    assert.equal(crossesIsolation("/studio", "/library"), false);
    assert.equal(crossesIsolation("/remixes", "/radio"), false);
  });
});
