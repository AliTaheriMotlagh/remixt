// lib/songFixes.ts: which songs' info looks wrong, and the tidied name
// suggested for them (the admin approves it).
//
//   node --import ./tests/support/register.mjs --test tests/song-fixes.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { doubts, tidyName } from "../src/lib/songFixRules.ts";

describe("doubtful songs", () => {
  const ok = { hasCover: true, hasLyrics: true, reports: 0 };

  test("a clean “Artist - Song” with cover and lyrics: nothing to doubt", () => {
    assert.deepEqual(doubts({ title: "Hichkas - Ye Rooze Khoob", ...ok }), []);
  });

  test("names straight off a file", () => {
    for (const title of ["Dorcci - Moft _320_", "01 Hichkas - Firooz", "Shayea - Deli (Ganja2Music)", "song_final_mp3"]) {
      assert.ok(doubts({ title, ...ok }).includes("name looks like a file name"), title);
    }
  });

  test("no artist, small letters, missing cover and lyrics, reports first", () => {
    const d = doubts({ title: "blinding lights", hasCover: false, hasLyrics: false, reports: 2 });
    assert.equal(d[0], "2 reports");
    assert.ok(d.includes("no artist in the name"));
    assert.ok(d.includes("name all in small letters"));
    assert.ok(d.includes("no cover"));
    assert.ok(d.includes("no lyrics chosen"));
  });

  test("a Persian name isn't “all in small letters”", () => {
    assert.ok(!doubts({ title: "هیچکس - فیروز", ...ok }).includes("name all in small letters"));
  });
});

describe("a tidied name", () => {
  test("underscores, track numbers and site names go; words get capitals", () => {
    assert.equal(tidyName("01_dorcci-moft_320"), "Dorcci - Moft");
    assert.equal(tidyName("the weeknd - blinding lights"), "The Weeknd - Blinding Lights");
  });

  test("a name with no artist stays one part", () => {
    assert.equal(tidyName("blinding_lights"), "Blinding Lights");
  });

  test("Persian is left as it is", () => {
    assert.equal(tidyName("هیچکس - فیروز"), "هیچکس - فیروز");
  });
});
