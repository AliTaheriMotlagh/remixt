// clipLyrics.ts: the parts of a song a social clip can cover, and the
// lyrics shown on it in time.
//
//   node --import ./tests/support/register.mjs --test tests/clip-lyrics.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clampRange, clipLineAt, clipLyrics, clipParts, defaultPart, lineRange, loudestStretch, MAX_CLIP_SECONDS } from "../src/lib/clipLyrics";
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

// The vocal rearranged: the chorus moved to the front, the first verse after it.
const rearranged = parseLyrics(
  [
    "[Verse]",
    "[00:30.00] first line of the verse",
    "[00:34.00] second line of the verse",
    "[Chorus]",
    "[00:05.00] this is the hook",
    "[00:09.00] sing it again",
    "[Verse 2]",
    "[00:50.00] back to the verse",
  ].join("\n")
);

describe("after the vocal is rearranged", () => {
  const parts = clipParts({ lines: rearranged, loop: { enabled: false, start: 0, end: 0 }, playhead: 0, duration: 180 });
  const part = (label: string) => {
    const p = parts.find((x) => x.label === label)!;
    return { start: p.start, end: p.end };
  };

  test("a section runs from where it plays to the next one in time — not the next one written", () => {
    // Written after the verse, played before it: it ends where the verse comes in, at 30 s.
    assert.deepEqual(part("Chorus"), { start: 4.5, end: 30 });
    assert.deepEqual(part("Verse"), { start: 29.5, end: 50 });
  });

  test("the sections are offered in the order they play", () => {
    assert.deepEqual(
      parts.filter((p) => p.kind === "section").map((p) => p.label),
      ["Chorus", "Verse", "Verse 2"]
    );
  });

  test("the last part ends when its last line has been sung, not 30 s on", () => {
    const last = part("Verse 2");
    assert.equal(last.start, 49.5);
    assert.ok(last.end > 52 && last.end < 60, `ends at ${last.end}`);
  });

  test("the words of a clip are the ones playing there", () => {
    assert.deepEqual(
      clipLyrics(rearranged, 4.5, 30).map((l) => l.text),
      ["this is the hook", "sing it again"]
    );
  });
});

describe("words wherever they're sung", () => {
  // The chorus is pasted in again a minute later, and plays 1.25× as fast there.
  const places = (time: number) => (time >= 20 && time < 30 ? [{ time, speed: 1 }, { time: time + 60, speed: 1.25 }] : [{ time, speed: 1 }]);

  test("a chorus pasted in again has its words again", () => {
    const again = clipLyrics(sheet, 79.5, 95, places);
    assert.deepEqual(
      again.map((l) => l.text),
      ["this is the hook", "sing it again"]
    );
    assert.equal(again[0].start, 0.5);
  });

  test("a line fills in as fast as the vocal plays there", () => {
    const [first] = clipLyrics(sheet, 19.5, 30, places);
    const [copy] = clipLyrics(sheet, 79.5, 95, places);
    assert.ok(copy.wipe < first.wipe);
    assert.ok(Math.abs(copy.wipe - first.wipe / 1.25) < 0.02);
  });

  test("without places, a line is sung once, where it's timed", () => {
    assert.deepEqual(clipLyrics(sheet, 79.5, 95), []);
  });
});

describe("more parts to pick from", () => {
  // Quiet, then loud from 60 s to 100 s, then quiet: 180 points over 180 s.
  const peaks = Array.from({ length: 180 }, (_, i) => (i >= 60 && i < 100 ? 0.9 : 0.2));

  test("the loudest stretch is found from the song's shape", () => {
    const loud = loudestStretch(peaks, 180, 30)!;
    assert.ok(loud.start >= 60 && loud.end <= 100, `${loud.start}–${loud.end}`);
    assert.equal(loud.end - loud.start, 30);
  });

  test("it starts on a sung line when one comes in around there", () => {
    const lines = parseLyrics("[01:01.00] here comes the hook");
    assert.equal(loudestStretch(peaks, 180, 30, lines)!.start, 60.5);
  });

  test("no shape, or a song shorter than the stretch: none", () => {
    assert.equal(loudestStretch([], 180, 30), null);
    assert.equal(loudestStretch(peaks, 20, 30), null);
    assert.equal(loudestStretch(new Array(180).fill(0), 180, 30), null);
  });

  test("offered with the sections, and from the first words", () => {
    const parts = clipParts({ lines: sheet, loop: { enabled: false, start: 0, end: 0 }, playhead: 0, duration: 180, peaks });
    assert.ok(parts.some((p) => p.id === "hook-30"));
    assert.ok(parts.some((p) => p.id === "hook-15"));
    const words = parts.find((p) => p.kind === "words")!;
    assert.deepEqual({ start: words.start, end: words.end }, { start: 9.5, end: 39.5 });
  });
});
