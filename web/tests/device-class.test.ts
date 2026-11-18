// What kind of device this is (lib/client/device.ts classify) and what each
// heavy feature does on it (lib/client/deviceFeatures.ts).
//
//   node --import ./tests/support/register.mjs --test tests/device-class.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, type DeviceInfo } from "../src/lib/client/device.ts";
import { featureNotice, supportFor } from "../src/lib/client/deviceFeatures.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_OS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const info = (userAgent: string, patch: Partial<DeviceInfo> = {}): DeviceInfo => ({
  userAgent,
  maxTouchPoints: 0,
  coarse: false,
  screen: { width: 1440, height: 900 },
  memoryGb: null,
  cores: 8,
  ...patch,
});

test("phones, tablets and computers", () => {
  assert.deepEqual(classify(info(IPHONE, { maxTouchPoints: 5, coarse: true, screen: { width: 390, height: 844 } })), { kind: "phone", ios: true, android: false, memoryGb: null, cores: 8 });
  assert.equal(classify(info(ANDROID_PHONE, { maxTouchPoints: 5, coarse: true, screen: { width: 412, height: 915 }, memoryGb: 8 })).kind, "phone");
  assert.equal(classify(info(ANDROID_TABLET, { maxTouchPoints: 10, coarse: true, screen: { width: 800, height: 1280 } })).kind, "tablet");
  assert.equal(classify(info(MAC)).kind, "computer");
});

test("an iPad says it's a Mac: its touch screen gives it away, and it's iOS", () => {
  const ipad = classify(info(IPAD_OS, { maxTouchPoints: 5, coarse: true, screen: { width: 820, height: 1180 } }));
  assert.equal(ipad.kind, "tablet");
  assert.equal(ipad.ios, true);
});

test("a touch-screen laptop with a mouse is a computer; a big touch screen with no name to go by goes by its size", () => {
  assert.equal(classify(info(WINDOWS, { maxTouchPoints: 10, coarse: false })).kind, "computer");
  assert.equal(classify(info(WINDOWS, { maxTouchPoints: 10, coarse: true, screen: { width: 800, height: 1280 } })).kind, "tablet");
});

test("what each feature does on each device", () => {
  const phone = { kind: "phone" as const };
  assert.equal(supportFor("laneSplit", { kind: "computer" }), "works");
  assert.equal(supportFor("laneSplit", phone), "computer");
  assert.equal(supportFor("split", phone), "slow");
  assert.equal(supportFor("aiProducer", phone), "works");
  assert.equal(supportFor("mashup", phone, 2), "works");
  assert.equal(supportFor("mashup", phone, 3), "slow", "three songs weigh more on a phone");
  assert.equal(supportFor("mashup", { kind: "tablet" }, 3), "works");
  assert.equal(supportFor("newSong", phone, 4), "computer");
});

test("the notice says what happens, and nothing when it just works", () => {
  assert.equal(featureNotice("proMix", { kind: "phone" }), null);
  const lane = featureNotice("laneSplit", { kind: "tablet" })!;
  assert.equal(lane.level, "computer");
  assert.match(lane.title, /needs a computer/);
  assert.match(featureNotice("split", { kind: "phone" })!.title, /slow on phones/);
});
