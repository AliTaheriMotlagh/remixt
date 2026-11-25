// lib/settings/registry.ts: the owner's settings — every field has a
// default of the right kind, stored values are checked before they're used,
// and a change is checked as a whole (a split must still make 100%).
//
//   node --import ./tests/support/register.mjs --test tests/settings-registry.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyChange, checkValue, crossCheck, DEFAULTS, FIELD_BY_PATH, FIELDS, getPath, GROUPS, publicSettings, resolveSettings, setPath,
} from "../src/lib/settings/registry.ts";

describe("the registry", () => {
  test("every field points at a default of its kind, inside its own limits", () => {
    for (const f of FIELDS) {
      const v = getPath(DEFAULTS, f.path);
      assert.notEqual(v, undefined, `${f.path} has no default`);
      assert.ok("value" in checkValue(f, v), `${f.path}'s default breaks its own limits`);
      assert.ok(GROUPS.some((g) => g.id === f.group), `${f.path} is in no group`);
      assert.ok(f.en && f.fa, `${f.path} needs both names`);
    }
  });

  test("every default value has a field (nothing the owner can't change)", () => {
    const walk = (o: unknown, at: string): string[] =>
      o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => walk(v, at ? `${at}.${k}` : k)) : [at];
    const missing = walk(DEFAULTS, "").filter((p) => !FIELD_BY_PATH.has(p));
    assert.deepEqual(missing, []);
  });

  test("no two fields share a path", () => {
    assert.equal(new Set(FIELDS.map((f) => f.path)).size, FIELDS.length);
  });

  test("the defaults keep every rule", () => {
    assert.deepEqual(crossCheck(DEFAULTS), {});
  });

  test("limits and security never reach the browser", () => {
    const pub = publicSettings(DEFAULTS) as Record<string, unknown>;
    assert.equal(pub.limits, undefined);
    assert.equal(pub.security, undefined);
    assert.equal((pub.network as Record<string, unknown>).adsTxt, undefined);
    assert.ok(FIELDS.filter((f) => !f.public).every((f) => ["limits", "security", "ads", "network"].includes(f.group)));
  });
});

describe("ad networks", () => {
  const on = (patch: Record<string, unknown>) => applyChange(DEFAULTS, patch);
  test("AdSense can't be switched on without its ids", () => {
    const r = on({ "network.adsense": true });
    assert.ok("errors" in r && r.errors["network.adsense"]);
  });
  test("ids are checked", () => {
    const r = on({ "network.adsenseClient": "pub-123", "network.adsenseSlot": "12a" });
    assert.ok("errors" in r && r.errors["network.adsenseClient"] && r.errors["network.adsenseSlot"]);
  });
  test("a complete AdSense setup is accepted", () => {
    const r = on({ "network.adsense": true, "network.adsenseClient": "ca-pub-1234567890123456", "network.adsenseSlot": "9876543210" });
    assert.ok("settings" in r && r.settings.network.adsense);
  });
  test("another network needs an https script and a plain element id", () => {
    const r = on({ "network.other": true, "network.otherScript": "http://x.example/a.js", "network.otherElementId": "#pos" });
    assert.ok("errors" in r && r.errors["network.otherScript"] && r.errors["network.otherElementId"]);
    const ok = on({ "network.other": true, "network.otherScript": "https://cdn.example/a.js", "network.otherElementId": "pos-article-display-1" });
    assert.ok("settings" in ok);
  });
});

describe("one value", () => {
  const pct = FIELD_BY_PATH.get("shares.uploader")!;
  test("numbers within limits, whole when they must be", () => {
    assert.deepEqual(checkValue(pct, 600), { value: 600 });
    assert.deepEqual(checkValue(pct, "600"), { value: 600 });
    assert.ok("error" in checkValue(pct, 10_001));
    assert.ok("error" in checkValue(pct, -1));
    assert.ok("error" in checkValue(pct, 1.5));
    assert.ok("error" in checkValue(pct, "abc"));
  });
  test("switches and text", () => {
    assert.ok("error" in checkValue(FIELD_BY_PATH.get("features.ads")!, "yes"));
    assert.ok("value" in checkValue(FIELD_BY_PATH.get("features.ads")!, false));
    assert.ok("error" in checkValue(FIELD_BY_PATH.get("payTo.en")!, "x".repeat(2_001)));
  });
});

describe("stored values", () => {
  test("valid ones are used; unknown and broken ones are left out", () => {
    const s = resolveSettings({ "payouts.holdDays": 14, "nope.x": 1, "audio.maxSeconds": "lots", "features.ads": false });
    assert.equal(s.payouts.holdDays, 14);
    assert.equal(s.audio.maxSeconds, DEFAULTS.audio.maxSeconds);
    assert.equal(s.features.ads, false);
  });

  test("shares that don't make 100% never run: their group goes back to the defaults", () => {
    const s = resolveSettings({ "shares.remix.platform": 5_000, "payouts.holdDays": 7 });
    assert.deepEqual(s.shares, DEFAULTS.shares);
    assert.equal(s.payouts.holdDays, 7, "other groups keep their values");
  });
});

describe("a change from Admin", () => {
  test("a split moved together is saved", () => {
    const r = applyChange(DEFAULTS, { "shares.remix.platform": 2_000, "shares.remix.remixers": 4_000 });
    assert.ok("settings" in r);
    if ("settings" in r) {
      assert.deepEqual(r.settings.shares.remix, { platform: 2_000, artists: 4_000, remixers: 4_000 });
      assert.deepEqual(r.changed.sort(), ["shares.remix.platform", "shares.remix.remixers"]);
    }
  });

  test("a split that doesn't make 100% is refused, saying where", () => {
    const r = applyChange(DEFAULTS, { "shares.remix.platform": 2_000 });
    assert.ok("errors" in r && /100%/.test(r.errors["shares.remix.platform"]));
  });

  test("uploader + miner must leave Remixt something of its part", () => {
    const r = applyChange(DEFAULTS, { "shares.uploader": 2_800 });
    assert.ok("errors" in r && r.errors["shares.uploader"]);
  });

  test("an audio ad can't be skipped or paid after it ends", () => {
    const r = applyChange(DEFAULTS, { "audio.maxSeconds": 10, "audio.skipAfter": 12 });
    assert.ok("errors" in r && r.errors["audio.skipAfter"]);
  });

  test("unknown settings and bad values are named", () => {
    const r = applyChange(DEFAULTS, { "made.up": 1, "payouts.holdDays": -3 });
    assert.ok("errors" in r && r.errors["made.up"] && r.errors["payouts.holdDays"]);
  });

  test("the same value isn't a change", () => {
    const r = applyChange(DEFAULTS, { "payouts.holdDays": DEFAULTS.payouts.holdDays });
    assert.ok("settings" in r && r.changed.length === 0);
  });

  test("setPath copies, never changes the original", () => {
    const next = setPath(DEFAULTS, "payouts.holdDays", 1);
    assert.equal(next.payouts.holdDays, 1);
    assert.equal(DEFAULTS.payouts.holdDays, 30);
  });
});
