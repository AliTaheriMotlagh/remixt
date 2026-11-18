// The radio's words (itemWords.ts, lyricsFit.bestTimed): which found sheet
// is surely the vocal's, words placed through a remix's clips, untimed words
// timed from the vocal's waveform, a chosen sheet read back with its nudge.
//
//   node --import ./tests/support/register.mjs --test tests/item-words.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bestTimed } from "../src/lib/lyricsFit.ts";
import { linesOfChoice, placeWords, timeWords, voiceOf } from "../src/lib/client/itemWords.ts";
import type { StudioLane } from "../src/lib/client/studioStore.ts";

/** A vocal stem of `seconds`, singing in `runs` ([from, to] s), as its waveform (10 points a second). */
function vocal(seconds: number, runs: [number, number][], extra: Partial<StudioLane> = {}): StudioLane {
  const peaks = Array.from({ length: seconds * 10 }, (_, i) => (runs.some(([a, b]) => i / 10 >= a && i / 10 < b) ? 0.8 : 0.01));
  return {
    laneId: "v",
    stemId: "stem-v",
    kind: "vocals",
    trackTitle: "Song",
    artistName: "Someone",
    volume: 1,
    muted: false,
    peaks,
    originalDuration: seconds,
    duration: seconds,
    offsetSeconds: 0,
    tempoRatio: 1,
    clips: null,
    ...extra,
  } as unknown as StudioLane;
}

const lrc = (lines: [number, string][]) => lines.map(([t, s]) => `[${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}]${s}`).join("\n");

describe("bestTimed: the sheet surely of this vocal", () => {
  // Singing from 10 s to 50 s, 4 phrases.
  const lane = vocal(60, [
    [10, 18],
    [20, 28],
    [30, 38],
    [40, 50],
  ]);
  const voice = voiceOf(lane);
  const sheet = (duration: number, times: number[]) => ({
    duration,
    instrumental: false,
    plain: null,
    synced: lrc(times.map((t, i) => [t, `line ${i}`] as [number, string])),
  });

  test("the one as long as the recording", () => {
    const pick = bestTimed([sheet(200, [5, 60, 120, 180]), sheet(61, [10, 20, 30, 41])], voice, 60);
    assert.equal(pick?.result.duration, 61);
  });

  test("a copy of another length still wins when its lines land on the singing", () => {
    const pick = bestTimed([sheet(75, [10, 20, 30, 41])], voice, 60);
    assert.ok(pick, "taken: timed to this vocal");
  });

  test("nothing sure: no words rather than the wrong ones", () => {
    assert.equal(bestTimed([sheet(200, [70, 100, 150, 190])], voice, 60), null);
    assert.equal(bestTimed([{ duration: 60, instrumental: false, plain: "words only", synced: null }], voice, 60), null);
  });
});

describe("words on the song as heard", () => {
  test("a remix that repeats the chorus has its words twice", () => {
    // The stem's 20–28 s (the chorus) played at 0 s and again at 30 s.
    const lane = vocal(60, [[20, 28]], {
      clips: [
        { at: 0, from: 20, to: 28 },
        { at: 30, from: 20, to: 28 },
      ],
    } as Partial<StudioLane>);
    const lines = placeWords([lane], "stem-v", [
      { time: 20.5, text: "chorus one" },
      { time: 24, text: "chorus two" },
    ]);
    assert.deepEqual(
      lines.map((l) => [l.time, l.text]),
      [
        [0.5, "chorus one"],
        [4, "chorus two"],
        [30.5, "chorus one"],
        [34, "chorus two"],
      ]
    );
  });

  test("untimed words get a line per sung phrase", () => {
    const lane = vocal(40, [
      [2, 6],
      [10, 14],
      [20, 25],
    ]);
    const timed = timeWords(
      [
        { time: null, text: "first" },
        { time: null, text: "second" },
        { time: null, text: "third" },
      ],
      lane
    );
    assert.ok(timed);
    const times = timed!.map((l) => l.time!);
    assert.ok(times[0] >= 1.5 && times[0] <= 2.5, `first at ${times[0]}`);
    assert.ok(times[1] > times[0] && times[2] > times[1]);
  });

  test("a chosen sheet is read back nudged, in order, without headers", () => {
    const lines = linesOfChoice({ lrc: "[Chorus]\n[00:10.00]b\n[00:05.00]a", shift: -0.5 });
    assert.deepEqual(
      lines.map((l) => [l.time, l.text]),
      [
        [4.5, "a"],
        [9.5, "b"],
      ]
    );
  });
});
