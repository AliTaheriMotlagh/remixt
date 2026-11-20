// lib/analytics.ts: what a page view is made of and how Admin → Analytics
// counts — devices, where people came from, pages as routes, GA4's engaged
// session, changes against the period before, and privacy opt-outs.
//
//   node --import ./tests/support/register.mjs --test tests/analytics.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  changeOf, changeText, channelOf, cleanPath, daysOf, durationText, funnel, hostOf, isEngaged, optedOut, parseUserAgent, routeOf, screenBucket,
} from "../src/lib/analytics.ts";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  headless: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
};

describe("devices", () => {
  test("phones, tablets (an iPad asking for the desktop site too) and computers", () => {
    assert.deepEqual(parseUserAgent(UA.iphone), { device: "phone", os: "iOS", browser: "Safari", bot: false });
    assert.equal(parseUserAgent(UA.ipadDesktopMode).device, "tablet");
    assert.equal(parseUserAgent(UA.ipadDesktopMode).os, "iOS");
    assert.deepEqual(parseUserAgent(UA.android), { device: "phone", os: "Android", browser: "Chrome", bot: false });
    assert.equal(parseUserAgent(UA.androidTablet).device, "tablet");
    assert.deepEqual(parseUserAgent(UA.macSafari), { device: "desktop", os: "macOS", browser: "Safari", bot: false });
    assert.equal(parseUserAgent(UA.winEdge).browser, "Edge");
    assert.equal(parseUserAgent(UA.firefox).os, "Linux");
  });

  test("robots and headless browsers are robots", () => {
    assert.equal(parseUserAgent(UA.googlebot).bot, true);
    assert.equal(parseUserAgent(UA.headless).bot, true);
    assert.equal(parseUserAgent("").bot, false);
  });
});

describe("where people come from", () => {
  const own = "remixt.example";
  test("a tagged link wins over its referrer", () => {
    assert.equal(channelOf("google.com", { source: "ig", medium: "social" }, own), "Social");
    assert.equal(channelOf("", { source: "newsletter", medium: "email" }, own), "Email");
    assert.equal(channelOf("", { source: "partner", medium: "cpc" }, own), "Campaign");
    assert.equal(channelOf("", { source: "telegram-channel" }, own), "Campaign");
  });

  test("by the referrer's site", () => {
    assert.equal(channelOf("www.google.com", {}, own), "Organic search");
    assert.equal(channelOf("duckduckgo.com", {}, own), "Organic search");
    assert.equal(channelOf("t.me", {}, own), "Social");
    assert.equal(channelOf("instagram.com", {}, own), "Social");
    assert.equal(channelOf("blog.someone.net", {}, own), "Referral");
    assert.equal(channelOf("", {}, own), "Direct");
    assert.equal(channelOf("www.remixt.example", {}, own), "Internal");
  });

  test("a referrer's host, or nothing", () => {
    assert.equal(hostOf("https://www.google.com/search?q=x"), "google.com");
    assert.equal(hostOf("not a url"), "");
    assert.equal(hostOf(null), "");
  });
});

describe("pages", () => {
  test("ids become [id]; tool and station names stay", () => {
    assert.equal(routeOf("/remixes/3f2b1c9e-1111-4222-8333-944455556666"), "/remixes/[id]");
    assert.equal(routeOf("/artist/abc123"), "/artist/[id]");
    assert.equal(routeOf("/earnings/remix/abc"), "/earnings/remix/[id]");
    assert.equal(routeOf("/tools/karaoke-maker"), "/tools/karaoke-maker");
    assert.equal(routeOf("/radio/remixt-radio/console"), "/radio/remixt-radio/console");
    assert.equal(routeOf("/live/new"), "/live/new");
    assert.equal(routeOf("/"), "/");
    assert.equal(routeOf("/library/?tag=rap"), "/library");
  });

  test("a kept path has no query (it can carry tokens) and a length limit", () => {
    assert.equal(cleanPath("/reset?token=secret"), "/reset");
    assert.equal(cleanPath("library"), "/library");
    assert.equal(cleanPath(`/${"x".repeat(500)}`).length, 200);
  });

  test("screen widths in a few buckets", () => {
    assert.equal(screenBucket(390), "< 400");
    assert.equal(screenBucket(820), "768–1023");
    assert.equal(screenBucket(1920), "1440+");
    assert.equal(screenBucket(0), "");
  });
});

describe("the numbers", () => {
  test("an engaged session: 10 s, or 2 pages, or a key event", () => {
    assert.equal(isEngaged({ views: 1, engagedMs: 9_999, keyEvents: 0 }), false);
    assert.equal(isEngaged({ views: 1, engagedMs: 10_000, keyEvents: 0 }), true);
    assert.equal(isEngaged({ views: 2, engagedMs: 0, keyEvents: 0 }), true);
    assert.equal(isEngaged({ views: 1, engagedMs: 0, keyEvents: 1 }), true);
  });

  test("changes against the period before", () => {
    assert.equal(changeOf(150, 100), 0.5);
    assert.equal(changeOf(0, 0), 0);
    assert.equal(changeOf(5, 0), null);
    assert.equal(changeText(0.5), "+50%");
    assert.equal(changeText(-0.08), "−8%");
    assert.equal(changeText(null, false), "new");
    assert.equal(changeText(0.001), "0%");
  });

  test("durations", () => {
    assert.equal(durationText(42_000), "42s");
    assert.equal(durationText(65_000), "1m 05s");
    assert.equal(durationText(3_725_000), "1h 02m");
  });

  test("days of a range, oldest first", () => {
    assert.deepEqual(daysOf(new Date("2026-03-02T10:00:00Z"), 3), ["2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  test("a funnel's shares", () => {
    const f = funnel([{ name: "a", count: 200 }, { name: "b", count: 50 }, { name: "c", count: 0 }, { name: "d", count: 0 }]);
    assert.equal(f[1].ofFirst, 0.25);
    assert.equal(f[1].ofPrevious, 0.25);
    assert.equal(f[3].ofPrevious, 0, "no division by zero");
  });
});

describe("privacy", () => {
  test("Do Not Track and Global Privacy Control are honoured", () => {
    assert.equal(optedOut({ doNotTrack: "1" }), true);
    assert.equal(optedOut({ globalPrivacyControl: true }), true);
    assert.equal(optedOut({ doNotTrack: "0" }), false);
    assert.equal(optedOut(undefined), false);
  });
});
