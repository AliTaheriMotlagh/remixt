// What makes moving between pages feel quick: the waveforms a list sends are
// packed small (lib/peaksCodec.ts), every page has a loading screen to show
// at once (app/**/loading.tsx), and the bar across the top answers a tap on
// a link to another page (components/NavProgress.tsx).
//
//   node --import ./tests/support/register.mjs --test tests/navigation-speed.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { decodePeaks, encodePeaks, packPeaksJson } from "../src/lib/peaksCodec.ts";
import { isPageNavigation } from "../src/lib/client/navigation.ts";

const root = path.join(import.meta.dirname, "..");

describe("packed waveforms", () => {
  test("round trip within one step of 256, at every length (padding)", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 599, 600, 601]) {
      const peaks = Array.from({ length: n }, (_, i) => Math.abs(Math.sin(i * 1.7)));
      const back = decodePeaks(encodePeaks(peaks));
      assert.equal(back.length, n, `length ${n}`);
      for (let i = 0; i < n; i++) assert.ok(Math.abs(back[i] - peaks[i]) <= 1 / 255 / 2 + 1e-4, `${n}[${i}]`);
    }
  });

  test("the ends are exact; out of range and NaN are clamped", () => {
    assert.deepEqual(decodePeaks(encodePeaks([0, 1, -3, 7, Number.NaN])), [0, 1, 0, 1, 0]);
  });

  test("5× smaller than the JSON it replaces", () => {
    const peaks = Array.from({ length: 600 }, (_, i) => Math.round(Math.abs(Math.sin(i)) * 10_000) / 10_000);
    const json = JSON.stringify(peaks);
    assert.ok(packPeaksJson(json).length * 4.5 < json.length, `${packPeaksJson(json).length} vs ${json.length}`);
  });

  test("URL- and JSON-safe characters only; bad stored JSON is no waveform, not an error", () => {
    assert.match(encodePeaks([0.1, 0.5, 0.9, 0.3]), /^[A-Za-z0-9_-]*$/);
    assert.equal(packPeaksJson("{oops"), "");
    assert.equal(packPeaksJson(null), "");
  });
});

describe("loading screens", () => {
  test("the list pages have one", () => {
    for (const dir of ["library", "remixes/(list)"]) assert.ok(fs.existsSync(path.join(root, "src/app", dir, "loading.tsx")), `app/${dir}/loading.tsx`);
  });

  test("never above a page that answers 404 or redirects: the loading screen would send 200 first (a soft 404, a client-side redirect)", () => {
    // Every folder with a loading.tsx: no page.tsx at or below it may call notFound() or redirect().
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const files = walk(path.join(root, "src/app"));
    for (const loading of files.filter((f) => f.endsWith("loading.tsx"))) {
      const dir = path.dirname(loading);
      for (const page of files.filter((f) => f.startsWith(dir) && f.endsWith("page.tsx"))) {
        assert.doesNotMatch(fs.readFileSync(page, "utf8"), /notFound\(\)|redirect\(/, `${path.relative(root, page)} under ${path.relative(root, loading)}`);
      }
    }
  });
});

describe("the bar across the top", () => {
  const here = { origin: "https://remixt.example", pathname: "/library" };
  const click = { button: 0 };

  test("starts for another page of the site", () => {
    assert.equal(isPageNavigation({ href: "https://remixt.example/remixes" }, click, here), true);
    assert.equal(isPageNavigation({ href: "/radio/remixt-radio" }, click, here), true);
  });

  test("not for the same page (a filter, a #part), another site, a new tab, a download, an API or a modified click", () => {
    assert.equal(isPageNavigation({ href: "/library?tag=rap" }, click, here), false);
    assert.equal(isPageNavigation({ href: "/library#top" }, click, here), false);
    assert.equal(isPageNavigation({ href: "https://elsewhere.example/" }, click, here), false);
    assert.equal(isPageNavigation({ href: "/remixes", target: "_blank" }, click, here), false);
    assert.equal(isPageNavigation({ href: "/remixes", hasDownload: true }, click, here), false);
    assert.equal(isPageNavigation({ href: "/api/ads/click?t=x" }, click, here), false);
    assert.equal(isPageNavigation({ href: "/remixes" }, { button: 0, meta: true }, here), false);
    assert.equal(isPageNavigation({ href: "/remixes" }, { button: 1 }, here), false);
  });
});
