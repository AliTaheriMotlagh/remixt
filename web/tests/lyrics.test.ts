// lyrics.ts: lyric sheets read and written as LRC, the line under the
// playhead, and the tools that fit the lines to the beat.
//
//   node --import ./tests/support/register.mjs --test tests/lyrics.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  barAt,
  cleanAiLines,
  countSyllables,
  fitOf,
  formatStamp,
  keepTimes,
  lineAt,
  parseLyrics,
  serializeLyrics,
  shiftLines,
  snapLines,
  spreadOverBars,
  startAt,
  syllableTarget,
} from "../src/lib/lyrics.ts";

describe("parseLyrics", () => {
  test("reads LRC stamps and leaves metadata tags out", () => {
    const lines = parseLyrics("[ar:Someone]\n[ti:A song]\n[00:12.50] First line\n[00:15.00]Second line");
    assert.deepEqual(lines, [
      { time: 12.5, text: "First line" },
      { time: 15, text: "Second line" },
    ]);
  });

  test("plain text stays untimed, blank lines between verses kept, at the ends dropped", () => {
    const lines = parseLyrics("\n\nOne\nTwo\n\nThree\n\n");
    assert.deepEqual(lines.map((l) => l.text), ["One", "Two", "", "Three"]);
    assert.ok(lines.every((l) => l.time === null));
  });

  test("a line stamped twice is sung twice, in time order", () => {
    const lines = parseLyrics("[00:10.00][00:40.00]Chorus\n[00:20.00]Verse");
    assert.deepEqual(lines.map((l) => [l.time, l.text]), [
      [10, "Chorus"],
      [20, "Verse"],
      [40, "Chorus"],
    ]);
  });

  test("[offset:] moves the words earlier", () => {
    assert.equal(parseLyrics("[offset:500]\n[00:10.00]Hi")[0].time, 9.5);
  });

  test("Persian lines come through untouched", () => {
    assert.equal(parseLyrics("[00:01.00] سلام دنیا")[0].text, "سلام دنیا");
  });

  test("round trip through serializeLyrics", () => {
    const text = "[00:12.50]First\nUntimed\n[01:05.25]Third";
    assert.equal(serializeLyrics(parseLyrics(text)), text);
  });
});

describe("timing", () => {
  test("formatStamp", () => {
    assert.equal(formatStamp(83.456), "[01:23.46]");
    assert.equal(formatStamp(0), "[00:00.00]");
  });

  test("lineAt picks the last line at or just before the time", () => {
    const lines = parseLyrics("[00:05.00]a\n[00:10.00]b\n[00:15.00]c");
    assert.equal(lineAt(lines, 2), -1);
    assert.equal(lineAt(lines, 5), 0);
    assert.equal(lineAt(lines, 9.9), 1); // shown a moment early
    assert.equal(lineAt(lines, 30), 2);
  });

  test("shiftLines and startAt move the whole sheet, never before 0", () => {
    const lines = parseLyrics("[00:05.00]a\nuntimed\n[00:10.00]b");
    assert.deepEqual(shiftLines(lines, -7).map((l) => l.time), [0, null, 3]);
    assert.deepEqual(startAt(lines, 20).map((l) => l.time), [20, null, 25]);
  });

  test("snapLines onto beats and bars", () => {
    // 120 BPM: a beat is 0.5 s, a bar 2 s.
    const lines = parseLyrics("[00:01.20]a\n[00:02.90]b");
    assert.deepEqual(snapLines(lines, 120, 1).map((l) => l.time), [1, 3]);
    assert.deepEqual(snapLines(lines, 120, 4).map((l) => l.time), [2, 2]);
  });

  test("spreadOverBars puts each line on its bar, with a bar's rest at a break", () => {
    const lines = parseLyrics("one\ntwo\n\nthree");
    const spread = spreadOverBars(lines, 120, { startBar: 3, barsPerLine: 2 });
    assert.deepEqual(spread.map((l) => l.time), [4, 8, null, 14]);
  });

  test("barAt counts from 1", () => {
    assert.equal(barAt(0, 120), 1);
    assert.equal(barAt(2, 120), 2);
    assert.equal(barAt(3.99, 120), 2);
  });
});

describe("fitting", () => {
  test("countSyllables, roughly", () => {
    assert.equal(countSyllables("hello world"), 3);
    assert.equal(countSyllables("make it rhyme"), 3);
    assert.equal(countSyllables(""), 0);
    // Persian: about a syllable per two letters.
    assert.ok(countSyllables("سلام دنیا") >= 3);
  });

  test("fitOf tells a crammed line from a roomy one", () => {
    // 120 BPM: two lines a beat apart (0.5 s), then one with a bar to itself.
    const lines = parseLyrics(
      "[00:00.00]so many many words crammed into one tiny little beat here\n[00:00.50]hey\n[00:02.50]end"
    );
    assert.equal(fitOf(lines, 0, 120, "rap").verdict, "tight");
    assert.equal(fitOf(lines, 1, 120, "rap").verdict, "roomy");
    assert.equal(fitOf(lines, 1, 120, "rap").beats, 4);
    assert.equal(fitOf(lines, 2, 120, "rap").verdict, null);
  });

  test("syllableTarget grows with the bar and with rap", () => {
    assert.ok(syllableTarget(90, "rap") > syllableTarget(90, "sing"));
    assert.ok(syllableTarget(80, "rap") > syllableTarget(140, "rap"));
  });

  test("keepTimes puts rewritten words on the old times", () => {
    const old = parseLyrics("[00:01.00]a\n\n[00:03.00]b");
    assert.deepEqual(keepTimes(old, ["x", "y", "z"]), [
      { time: 1, text: "x" },
      { time: 3, text: "y" },
      { time: null, text: "z" },
    ]);
  });

  test("cleanAiLines strips list marks, stamps, quotes and fences", () => {
    assert.deepEqual(cleanAiLines('```\n1. "First line"\n- [00:01.00] second\n\n\nthird\n```'), ["First line", "second", "", "third"]);
    assert.deepEqual(cleanAiLines("   "), []);
  });
});
