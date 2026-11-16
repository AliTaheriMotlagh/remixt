// vocalTime.ts: lyric lines tied to moments of the vocal, carried to where
// those moments play after the vocals are edited — moved, split, trimmed,
// stretched, sped up, re-cut, deleted and undone.
//
//   node --import ./tests/support/register.mjs --test tests/vocal-time.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clipsOf, deleteClips, fitClips, moveClips, normaliseLane, splitClips, trimClipsAt, WHOLE } from "../src/lib/client/clipEdit.ts";
import type { LaneClip, StudioLane } from "../src/lib/client/studioStore.ts";
import { anchorAt, clipKeys, layOut, placeAnchor, placeOnStem, stemOf, timelineOf, vocalShape } from "../src/lib/client/vocalTime.ts";

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
