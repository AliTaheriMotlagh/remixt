// Editing a timed sheet's words with the times kept out of the way
// (lib/lyricsEdit.ts): every line keeps its time through an edit.
//
//   node --import ./tests/support/register.mjs --test tests/lyrics-edit.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLyrics } from "../src/lib/lyrics.ts";
import { rewordLines, rewordSheet, wordsOf } from "../src/lib/lyricsEdit.ts";

const sheet = "[Verse]\n[00:10.00]First line\n[00:14.00]Second line\n[00:18.00]Third line\n\n[Chorus]\n[00:30.00]Hook one\n[00:34.00]Hook two";
const lines = parseLyrics(sheet);

test("the words alone, one row per line", () => {
  assert.equal(wordsOf(lines), "[Verse]\nFirst line\nSecond line\nThird line\n\n[Chorus]\nHook one\nHook two");
});

test("unchanged words give back the same sheet", () => {
  assert.equal(rewordSheet(sheet, wordsOf(lines)), sheet);
});

test("a line typed over keeps its time", () => {
  const out = rewordLines(lines, wordsOf(lines).replace("Second line", "Second line, fixed"));
  assert.deepEqual(out[2], { time: 14, text: "Second line, fixed" });
  assert.equal(out[3].time, 18);
});

test("a new line goes between its neighbours; a deleted one takes its time with it", () => {
  const added = rewordLines(lines, wordsOf(lines).replace("Second line\n", "Second line\nNew line\n"));
  assert.deepEqual(added[3], { time: 16, text: "New line" });
  const removed = rewordLines(lines, wordsOf(lines).replace("Second line\n", ""));
  assert.deepEqual(removed.map((l) => l.time), [null, 10, 18, null, null, 30, 34]);
});

test("two lines added after the last one stay untimed (nothing after them to go by)", () => {
  const out = rewordLines(lines, `${wordsOf(lines)}\nOutro one\nOutro two`);
  assert.deepEqual(out.slice(-2), [{ time: null, text: "Outro one" }, { time: null, text: "Outro two" }]);
});

test("a new section heading and blank rows are never timed", () => {
  const out = rewordLines(lines, wordsOf(lines).replace("Hook one", "[Pre-Chorus]\nHook one"));
  const heading = out.find((l) => l.text === "[Pre-Chorus]")!;
  assert.equal(heading.time, null);
  assert.equal(out.find((l) => l.text === "Hook one")!.time, 30);
});

test("right-to-left words are kept as typed", () => {
  const fa = parseLyrics("[00:10.19]یه روز خوب میاد\n[00:14.08]به هم نگاه بد نکنیم");
  const out = rewordLines(fa, "یه روز خوب میاد، که ما همو نکشیم\nبه هم نگاه بد نکنیم");
  assert.deepEqual(out.map((l) => l.time), [10.19, 14.08]);
});
