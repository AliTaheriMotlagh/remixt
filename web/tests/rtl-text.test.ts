// rtlText.ts: Persian/Arabic titles laid out for the share cards — letters
// joined, words in the order they're seen, lines going the right way.
//
//   node --test tests/rtl-text.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bidiRuns, hasRtl, visualWord } from "../src/lib/rtlText.ts";

const codes = (s: string) => [...s].map((ch) => ch.codePointAt(0)!.toString(16));

describe("visualWord", () => {
  test("joins letters and reverses them, with lam-alef as one glyph", () => {
    // سلام: initial seen, final lam-alef (it follows a joining letter), isolated meem (alef doesn't join on).
    assert.deepEqual(codes(visualWord("سلام")), ["fee1", "fefc", "feb3"]);
  });

  test("Persian letters get their own forms", () => {
    // پ initial, ی final; ژ only joins the letter before it, so the گ after it stands alone.
    assert.deepEqual(codes(visualWord("پی")), ["fbfd", "fb58"]);
    assert.deepEqual(codes(visualWord("ژگ")), ["fb92", "fb8a"]);
  });

  test("the half-space keeps letters apart and isn't drawn", () => {
    assert.deepEqual(codes(visualWord("می\u200cخواهم")), ["fee2", "feeb", "fe8d", "feee", "fea7", "fbfd", "fee3"]);
  });

  test("numbers keep their order, decimals included", () => {
    assert.equal(visualWord("۲.۵"), "۲.۵");
    assert.equal(visualWord("2024"), "2024");
  });

  test("brackets are mirrored", () => {
    assert.equal(visualWord("(د)"), "(ﺩ)");
  });

  test("vowel marks are left out", () => {
    assert.equal(visualWord("دَ"), visualWord("د"));
  });
});

describe("bidiRuns", () => {
  test("a Persian line goes right to left, a Latin name inside it kept together", () => {
    const { rtl, runs } = bidiRuns("آهنگ شماره ۱۲۳ + Blinding Lights");
    assert.equal(rtl, true);
    assert.deepEqual(
      runs.map((r) => [r.rtl, r.words.length]),
      [
        [true, 4],
        [false, 2],
      ]
    );
    assert.deepEqual(runs[1].words, ["Blinding", "Lights"]);
  });

  test("a Latin line keeps a Persian part (and its number) as one run", () => {
    const { rtl, runs } = bidiRuns("Shape of You (ریمیکس فارسی) — نسخه ۲.۵");
    assert.equal(rtl, false);
    assert.deepEqual(
      runs.map((r) => [r.rtl, r.words.length]),
      [
        [false, 3],
        [true, 5],
      ]
    );
  });

  test("plain Latin text isn't touched", () => {
    assert.equal(hasRtl("Midnight City — slowed + reverb"), false);
    assert.equal(hasRtl("Remix by علی"), true);
  });
});
