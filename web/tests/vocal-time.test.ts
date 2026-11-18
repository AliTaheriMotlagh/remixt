// vocalTime.ts: lyric lines tied to moments of the vocal, carried to where
// those moments play after the vocals are edited — moved, split, trimmed,
// stretched, sped up, re-cut, deleted and undone.
//
//   node --import ./tests/support/register.mjs --test tests/vocal-time.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clipsOf, deleteClips, fitClips, moveClips, normaliseLane, splitClips, trimClipsAt, WHOLE } from "../src/lib/client/clipEdit.ts";
import type { LaneClip, StudioLane } from "../src/lib/client/studioStore.ts";
import { anchorAt, clipKeys, layOut, linesInEveryPlay, placeAnchor, placeOnStem, slideAlongVocal, startOnStem, stemOf, sungAt, timelineOf, vocalShape } from "../src/lib/client/vocalTime.ts";

function lane(id: string, opts: Partial<StudioLane> = {}): StudioLane {
  return normaliseLane({
    laneId: id,
    stemId: `stem-${id}`,
    kind: "vocals",
    trackTitle: id,
    artistName: "a",
    volume: 1,
    muted: false,
    solo: false,
    peaks: [],
    originalDuration: 60,
    duration: 60,
    offsetSeconds: 0,
    bpm: 120,
    musicalKey: null,
    pitchSemitones: 0,
    tempoRatio: 1,
    fx: {} as StudioLane["fx"],
    clips: null,
    xfade: null,
    automation: {},
    ...opts,
  });
}

/** Where a line sung at `t` on `before` is sung on `after`. */
function follow(before: StudioLane[], after: StudioLane[], t: number) {
  const a = anchorAt(before, t);
  assert.ok(a, "anchored");
  return placeAnchor(after, a, clipKeys(before));
}

const near = (actual: number | undefined, expected: number) => assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);

describe("timeline ↔ stem", () => {
  test("round trip through offset, tempo, stretch and reverse", () => {
    const l = lane("v", { offsetSeconds: 3, tempoRatio: 1.25 });
    for (const clip of [
      { id: "a", from: 10, to: 20, at: 0 },
      { id: "b", from: 10, to: 20, at: 4, stretch: 0.8 },
      { id: "c", from: 10, to: 20, at: 2, reverse: true },
    ] as LaneClip[]) {
      near(stemOf(l, clip, timelineOf(l, clip, 14.2)), 14.2);
    }
    // Reversed: the stem's end plays first.
    const rev = { id: "c", from: 10, to: 20, at: 0, reverse: true } as LaneClip;
    near(timelineOf(lane("v"), rev, 20), 0);
  });
});

describe("lines follow the vocal", () => {
  const before = [lane("v", { offsetSeconds: 2 }), lane("beat", { kind: "beat" })];

  test("the whole vocal moved", () => {
    const after = moveClips(before, [{ laneId: "v", clipId: WHOLE }], 1.5).lanes;
    near(follow(before, after, 10)?.time, 11.5);
  });

  test("sped up (a new tempo)", () => {
    const after = before.map((l) => (l.laneId === "v" ? { ...l, tempoRatio: 2 } : l));
    // 8 s into the stem, now played twice as fast from 2 s.
    near(follow(before, after, 10)?.time, 6);
  });

  test("split, and only the second half moved", () => {
    const split = splitClips(before, ["v"], [{ laneId: "v", clipId: WHOLE }], 20);
    const right = clipsOf(split.lanes[0]).find((c) => c.from > 0)!;
    const moved = moveClips(split.lanes, [{ laneId: "v", clipId: right.id! }], 4).lanes;
    near(follow(before, moved, 10)?.time, 10);
    near(follow(before, moved, 30)?.time, 34);
    // Step by step through the edits, as the Studio sees them.
    const a = anchorAt(before, 30)!;
    const mid = placeAnchor(split.lanes, a, clipKeys(before))!;
    near(placeAnchor(moved, mid, clipKeys(split.lanes))?.time, 34);
  });

  test("stretched to fit", () => {
    const l = [lane("v", { clips: [{ id: "a", from: 0, to: 10, at: 0 }] })];
    const after = fitClips(l, [{ laneId: "v", clipId: "a" }], 20).lanes;
    near(follow(l, after, 5)?.time, 10);
  });

  test("trimmed past the line: it goes with its clip", () => {
    const l = [lane("v", { offsetSeconds: 0, clips: [{ id: "a", from: 0, to: 10, at: 0 }, { id: "b", from: 10, to: 20, at: 12 }] })];
    const after = trimClipsAt(l, [{ laneId: "v", clipId: "b" }], 14, "start").lanes;
    near(follow(l, after, 13)?.time, 13);
    near(follow(l, after, 16)?.time, 16);
  });

  test("AI Match re-cut: new clips, phrases moved", () => {
    const l = [lane("v")];
    const recut = [
      lane("v", {
        clips: [
          { id: "p1", from: 0, to: 8, at: 1 },
          { id: "p2", from: 8, to: 16, at: 10, stretch: 1.05 },
        ],
      }),
    ];
    near(follow(l, recut, 4)?.time, 5);
    near(follow(l, recut, 12)?.time, 10 + 4 / 1.05);
  });

  test("a deleted clip leaves its words; undo brings them back onto it", () => {
    const l = [lane("v", { clips: [{ id: "a", from: 0, to: 10, at: 0 }, { id: "b", from: 10, to: 20, at: 15 }] })];
    const a = anchorAt(l, 17)!;
    const gone = deleteClips(l, [{ laneId: "v", clipId: "b" }]).lanes;
    assert.equal(placeAnchor(gone, a, clipKeys(l)), null);
    near(placeAnchor(l, a, clipKeys(gone))?.time, 17);
  });

  test("a line just before the singing goes with it; one far from any vocal isn't anchored", () => {
    const l = [lane("v", { offsetSeconds: 10 })];
    assert.ok(anchorAt(l, 9.5));
    assert.equal(anchorAt(l, 2), null);
  });

  test("the lane the lyrics belong to wins", () => {
    const l = [lane("take", { offsetSeconds: 0 }), lane("song", { offsetSeconds: 0 })];
    assert.equal(anchorAt(l, 5, (x) => (x.laneId === "song" ? 0 : 1))?.laneId, "song");
  });
});

describe("placeOnStem", () => {
  test("recording times land where the clips play them", () => {
    const l = lane("v", { offsetSeconds: 5, clips: [{ id: "a", from: 0, to: 10, at: 0 }, { id: "b", from: 20, to: 30, at: 12 }] });
    const lines = placeOnStem(
      [
        { time: 3, text: "one" },
        { time: 25, text: "two" },
        { time: 15, text: "cut out" },
        { time: null, text: "[Chorus]" },
      ],
      l
    );
    assert.deepEqual(
      lines.map((x) => x.time),
      [8, 22, null, null]
    );
  });
});

describe("layOut", () => {
  test("the stem's loudness drawn where the clips play it", () => {
    const stem = { values: Array.from({ length: 60 }, (_, i) => i), step: 1 };
    const l = lane("v", { offsetSeconds: 0, clips: [{ id: "a", from: 30, to: 32, at: 0 }, { id: "b", from: 10, to: 12, at: 4 }] });
    const env = layOut(l, stem, 1);
    assert.deepEqual(Array.from(env.values), [30, 31, 0, 0, 10, 11]);
  });
});

describe("vocalShape", () => {
  test("changes with placement, not with level", () => {
    const l = [lane("v")];
    assert.equal(vocalShape(l), vocalShape([{ ...l[0], volume: 0.3 }]));
    assert.notEqual(vocalShape(l), vocalShape([{ ...l[0], offsetSeconds: 1 }]));
  });
});

describe("first line at the playhead, the rest on their words", () => {
  // Lyrics timed to the recording: lines 4 s apart from 10 s.
  const recording = [10, 14, 18, 22, 26, 30].map((time, i) => ({ time, text: `line ${i}` }));

  test("a vocal sped up: every line lands, not just the first", () => {
    const l = [lane("v", { offsetSeconds: 0, tempoRatio: 1.25 })];
    // The singer's first line (10 s into the recording) plays at 8 s.
    const placed = startOnStem(recording, l, 8)!;
    assert.deepEqual(
      placed.map((x) => x.time),
      [8, 11.2, 14.4, 17.6, 20.8, 24]
    );
  });

  test("a vocal cut into stretched phrases (AI Match)", () => {
    const l = [
      lane("v", {
        offsetSeconds: 0,
        clips: [
          { id: "p1", from: 9, to: 17, at: 0 },
          { id: "p2", from: 17, to: 25, at: 9, stretch: 0.9 },
          { id: "p3", from: 25, to: 33, at: 19, stretch: 1.1 },
        ],
      }),
    ];
    const at = timelineOf(l[0], clipsOf(l[0])[0], 10);
    const placed = startOnStem(recording, l, at)!;
    for (const [i, line] of placed.entries()) {
      const src = recording[i].time;
      const clip = clipsOf(l[0]).find((c) => src >= c.from && src <= c.to)!;
      near(line.time!, Math.round(timelineOf(l[0], clip, src) * 100) / 100);
    }
  });

  test("timed lines slid along a sped-up vocal keep their places in the singing", () => {
    const l = [lane("v", { offsetSeconds: 0, tempoRatio: 2 })];
    // On the timeline: recording 10, 14, 18 → 5, 7, 9.
    const lines = [5, 7, 9].map((time, i) => ({ time, text: `l${i}` }));
    const slid = slideAlongVocal(lines, l, 6)!;
    assert.deepEqual(
      slid.map((x) => x.time),
      [6, 8, 10]
    );
  });
});

describe("everywhere a line is sung", () => {
  // Stem seconds 20–30 (the chorus) play at 20 s, and again at 80 s.
  const clips: LaneClip[] = [
    { from: 0, to: 60, at: 0 },
    { from: 20, to: 30, at: 80 },
  ];

  test("a section pasted in again: the line is sung at both", () => {
    const v = lane("v", { clips });
    assert.deepEqual(sungAt([v], 22).map((s) => s.time), [22, 82]);
  });

  test("a doubled voice a moment behind is one singing, not two", () => {
    const v = lane("v");
    const double = lane("d", { stemId: v.stemId, offsetSeconds: 0.03 });
    assert.deepEqual(sungAt([v, double], 22).map((s) => s.time), [22]);
  });

  test("a muted copy isn't sung", () => {
    const v = lane("v", { clips: [clips[0], { ...clips[1], muted: true }] });
    assert.deepEqual(sungAt([v], 22).map((s) => s.time), [22]);
    const quiet = lane("q", { stemId: v.stemId, offsetSeconds: 100, muted: true });
    assert.deepEqual(sungAt([lane("v"), quiet], 22).map((s) => s.time), [22]);
  });

  test("how fast the vocal plays there: its tempo and the clip's stretch", () => {
    const v = lane("v", { tempoRatio: 1.25, clips: [{ from: 0, to: 60, at: 0, stretch: 1.2 }] });
    const [only] = sungAt([v], 10);
    near(only.speed, 1.5);
  });

  test("no vocal near: just where it is", () => {
    assert.deepEqual(sungAt([lane("v", { offsetSeconds: 100 })], 5), [{ time: 5, speed: 1 }]);
  });
});

describe("linesInEveryPlay: one sheet for a new song cut from several vocals", () => {
  const clip = (from: number, to: number, at: number, id: string): LaneClip => ({ from, to, at, id }) as LaneClip;

  test("each line goes to every play of its moment, singers interleaved in time", () => {
    // Singer A: verse (stem 10–20) at 0 s, chorus (stem 30–40) at 20 s and again at 50 s. B: verse (stem 5–15) at 35 s.
    const a = lane("a", { clips: [clip(10, 20, 0, "a1"), clip(30, 40, 20, "a2"), clip(30, 40, 50, "a3")] });
    const b = lane("b", { clips: [clip(5, 15, 35, "b1")] });
    const sheet = linesInEveryPlay([
      { lane: a, lines: [{ at: 11, text: "verse a" }, { at: 31, text: "chorus" }, { at: 50, text: "never sung" }] },
      { lane: b, lines: [{ at: 6, text: "verse b" }] },
    ]);
    assert.deepEqual(sheet, [
      { time: 1, text: "verse a" },
      { time: 21, text: "chorus" },
      { time: 36, text: "verse b" },
      { time: 51, text: "chorus" },
    ]);
  });

  test("a stamp a breath before its clip counts; one at the very end of a clip doesn't", () => {
    const a = lane("a", { clips: [clip(10, 20, 0, "a1")] });
    const sheet = linesInEveryPlay([{ lane: a, lines: [{ at: 9.7, text: "early" }, { at: 19.9, text: "cut off" }] }]);
    assert.deepEqual(sheet, [{ time: 0, text: "early" }]);
  });

  test("speed and offset are followed; two clips playing on from each other give one line", () => {
    const a = lane("a", { tempoRatio: 2, offsetSeconds: 4, clips: [clip(0, 10, 0, "a1"), clip(10, 20, 10, "a2")] });
    const sheet = linesInEveryPlay([{ lane: a, lines: [{ at: 9.8, text: "across" }] }]);
    assert.deepEqual(sheet, [{ time: 8.9, text: "across" }]);
  });

  test("the same words from two singers at once are kept once; muted lanes sing nothing", () => {
    const a = lane("a", { clips: [clip(0, 10, 0, "a1")] });
    const b = lane("b", { clips: [clip(0, 10, 0, "b1")] });
    const m = lane("m", { muted: true, clips: [clip(0, 10, 0, "m1")] });
    const lines = [{ at: 1, text: "together" }];
    assert.deepEqual(linesInEveryPlay([{ lane: a, lines }, { lane: b, lines: [{ at: 1.2, text: "together" }] }, { lane: m, lines: [{ at: 2, text: "muted" }] }]), [
      { time: 1, text: "together" },
    ]);
  });
});
