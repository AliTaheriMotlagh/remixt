// clipLyrics.ts: the parts of a song a social clip can cover, and the
// lyrics shown on it in time.
//
//   node --import ./tests/support/register.mjs --test tests/clip-lyrics.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clampRange, clipLineAt, clipLyrics, clipParts, defaultPart, lineRange, MAX_CLIP_SECONDS } from "../src/lib/clipLyrics";
import { parseLyrics } from "../src/lib/lyrics";

const sheet = parseLyrics(
  [
    "[Verse]",
    "[00:10.00] first line of the verse",
    "[00:14.00] second line of the verse",
    "[Chorus]",
    "[00:20.00] this is the hook",
    "[00:24.00] sing it again",
    "[Verse 2]",
    "[00:40.00] back to the verse",
  ].join("\n")
);

describe("clipLyrics", () => {
  test("only the lines in the clip, timed from its start", () => {
    const lines = clipLyrics(sheet, 19.5, 30);
    assert.deepEqual(
      lines.map((l) => l.text),
      ["this is the hook", "sing it again"]
    );
    assert.equal(lines[0].start, 0.5);
    assert.ok(lines[1].end <= 10.5);
  });

  test("a line already being sung when the clip starts is shown, part filled", () => {
    const lines = clipLyrics(sheet, 15, 22);
    assert.equal(lines[0].text, "second line of the verse");
    assert.equal(lines[0].start, -1);
  });

  test("a long gap clears the screen a few seconds after the line", () => {
    const line = clipLyrics(sheet, 23, 40).at(-1)!;
    assert.equal(line.text, "sing it again");
    assert.ok(line.end < 10, `cleared at ${line.end}`);
  });

  test("the line on screen and the one after it", () => {
    const lines = clipLyrics(sheet, 19.5, 30);
    const at = clipLineAt(lines, 1);
    assert.equal(at.current?.text, "this is the hook");
    assert.equal(at.next?.text, "sing it again");
    assert.equal(clipLineAt(lines, 0.4).current?.text, "this is the hook");
  });
});

test("a line only on screen for a blink at the start is left out", () => {
  // "second line" runs to 20 s, the clip starts at 19.5.
  assert.equal(clipLyrics(sheet, 19.5, 30)[0].text, "this is the hook");
});

describe("clipParts", () => {
  const parts = clipParts({ lines: sheet, loop: { enabled: false, start: 0, end: 0 }, playhead: 12, duration: 180 });

  test("the song's sections, from just before each", () => {
    const chorus = parts.find((p) => p.label === "Chorus");
    assert.deepEqual(chorus && { start: chorus.start, end: chorus.end }, { start: 19.5, end: 40 });
  });

  test("stretches from the playhead, and no whole song when it's too long", () => {
    assert.ok(parts.some((p) => p.id === "playhead-30" && p.start === 12 && p.end === 42));
    assert.ok(!parts.some((p) => p.kind === "song"));
  });

  test("the loop comes first and is picked by default", () => {
    const withLoop = clipParts({ lines: sheet, loop: { enabled: true, start: 5, end: 25 }, playhead: 0, duration: 180 });
    assert.equal(withLoop[0].kind, "loop");
    assert.equal(defaultPart(withLoop, 0)?.kind, "loop");
  });

  test("without a loop, the section under the playhead", () => {
    assert.equal(defaultPart(parts, 21)?.label, "Chorus");
  });
});

describe("ranges", () => {
  test("kept inside the song and no longer than a clip can be", () => {
    assert.deepEqual(clampRange(10, 200, 120), { start: 10, end: 10 + MAX_CLIP_SECONDS });
    assert.deepEqual(clampRange(118, 119, 120), { start: 115, end: 120 });
  });

  test("from one line to another", () => {
    const first = sheet.findIndex((l) => l.text === "this is the hook");
    const last = sheet.findIndex((l) => l.text === "sing it again");
    assert.deepEqual(lineRange(sheet, first, last, 180), { start: 19.5, end: 40 });
  });
});
