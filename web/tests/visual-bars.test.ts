// The radio visualizer's bars (visualBars.ts): in time with what's heard.
//
//   node --import ./tests/support/register.mjs --test tests/visual-bars.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { delayed, frequencyBars, loudnessWindow } from "../src/lib/visualBars.ts";

test("frequency bars: log-spaced, the bass in the first bars", () => {
  const data = new Uint8Array(1024);
  data[2] = 255; // a low note
  const bars = frequencyBars(data, 64);
  assert.equal(bars.length, 64);
  const loud = [...bars].findIndex((v) => v > 0.9);
  assert.ok(loud >= 0 && loud < 16, `the bass shows in bar ${loud}`);
});

test("shown late by the sound's path: the frame from `lag` ago", () => {
  const frames = [
    { t: 0, v: "a" },
    { t: 100, v: "b" },
    { t: 200, v: "c" },
    { t: 300, v: "d" },
  ];
  assert.equal(delayed(frames, 300, 0), "d");
  assert.equal(delayed(frames, 300, 150), "b");
  // Nothing that old yet: the oldest there is.
  assert.equal(delayed(frames, 300, 1000), "a");
  assert.equal(delayed([], 300, 0), null);
});

test("the song's loudness around now: the middle bar is the station's moment", () => {
  // Silent until 10 s, loud from 10 s on (a curve at 10 points a second).
  const values = Array.from({ length: 300 }, (_, i) => (i >= 100 ? 1 : 0));
  const curve = { values, start: 0, step: 0.1 };
  const bars = loudnessWindow(curve, 10, 41, 4);
  // Left half (before 10 s) quiet, right half loud, and the far edge lower than the middle.
  assert.ok(bars[5] < 0.05, `before now: ${bars[5]}`);
  assert.ok(bars[21] > 0.95 && bars[25] > 0.8, `just after now: ${bars[21]}, ${bars[25]}`);
  assert.ok(bars[40] < bars[22], "the far edge is drawn lower");
  // A second later the loud part has moved a quarter of the way left.
  const later = loudnessWindow(curve, 11, 41, 4);
  assert.ok(later[12] > 0.5 && bars[12] < 0.05);
});
