// clipEdit.ts: the Studio's multi-clip editing — move, delete, duplicate,
// repeat, split, quantize, copy/paste, stutter — on plain lane objects.
//
//   node --test tests/clip-edit.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  WHOLE,
  allClipRefs,
  clipEnd,
  clipStart,
  clipsOf,
  copyClips,
  deleteClips,
  duplicateClips,
  moveClips,
  normaliseLane,
  pasteClips,
  quantizeClips,
  selectionBounds,
  splitClips,
  stutterLane,
  updateClips,
} from "../src/lib/client/clipEdit.ts";
import type { LaneClip, StudioLane } from "../src/lib/client/studioStore.ts";

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
    originalDuration: 20,
    duration: 20,
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

const starts = (l: StudioLane) => clipsOf(l).map((c) => Number(clipStart(l, c).toFixed(3)));
const find = (lanes: StudioLane[], id: string) => lanes.find((l) => l.laneId === id)!;

describe("ids", () => {
  test("every clip gets a unique id, copies included", () => {
    const clip: LaneClip = { id: "x", from: 0, to: 2, at: 0 };
    const l = lane("a", { clips: [clip, { ...clip, at: 4 }, { from: 5, to: 6, at: 8 }] });
    const ids = clipsOf(l).map((c) => c.id);
    assert.equal(new Set(ids).size, 3);
    assert.equal(ids[0], "x");
  });

  test("a whole take is one clip called WHOLE", () => {
    assert.deepEqual(allClipRefs([lane("a")]), [{ laneId: "a", clipId: WHOLE }]);
  });
});

describe("split", () => {
  test("cuts a whole take in two and keeps both halves selected", () => {
    const result = splitClips([lane("a")], ["a"], [{ laneId: "a", clipId: WHOLE }], 5);
    const a = find(result.lanes, "a");
    assert.equal(result.count, 1);
    assert.deepEqual(starts(a), [0, 5]);
    assert.equal(result.selection.length, 2);
    assert.ok(result.selection.every((r) => r.clipId !== WHOLE));
  });

  test("a reversed clip's left half is the end of the audio", () => {
    const l = lane("a", { clips: [{ id: "r", from: 0, to: 10, at: 0, reverse: true }] });
    const [first, second] = clipsOf(find(splitClips([l], ["a"], [], 4).lanes, "a"));
    assert.deepEqual([first.from, first.to], [6, 10]);
    assert.deepEqual([second.from, second.to], [0, 6]);
  });

  test("nothing under the cut: no change", () => {
    const l = lane("a", { offsetSeconds: 10 });
    assert.equal(splitClips([l], ["a"], [], 2).count, 0);
  });
});

describe("move", () => {
  test("moves selected clips across lanes by the same amount, never before 0", () => {
    const lanes = [lane("a", { offsetSeconds: 2 }), lane("b", { offsetSeconds: 6 })];
    const refs = allClipRefs(lanes);
    const moved = moveClips(lanes, refs, -5).lanes;
    assert.equal(find(moved, "a").offsetSeconds, 0);
    assert.equal(find(moved, "b").offsetSeconds, 4);
  });

  test("moving one clip of an arranged lane leaves the others where they are", () => {
    const l = lane("a", { clips: [{ id: "1", from: 0, to: 2, at: 0 }, { id: "2", from: 2, to: 4, at: 4 }], offsetSeconds: 1 });
    const moved = find(moveClips([l], [{ laneId: "a", clipId: "1" }], 1).lanes, "a");
    assert.deepEqual(starts(moved), [2, 5]);
  });

  test("respects the lane's speed", () => {
    const l = lane("a", { clips: [{ id: "1", from: 0, to: 2, at: 0 }, { id: "2", from: 2, to: 4, at: 4 }], tempoRatio: 2 });
    const moved = find(moveClips([l], [{ laneId: "a", clipId: "2" }], 1).lanes, "a");
    assert.deepEqual(starts(moved), [0, 3]);
  });
});

describe("delete", () => {
  test("removes clips, and a lane with nothing left", () => {
    const lanes = [lane("a", { clips: [{ id: "1", from: 0, to: 2, at: 0 }, { id: "2", from: 2, to: 4, at: 4 }] }), lane("b")];
    const result = deleteClips(lanes, [{ laneId: "a", clipId: "1" }, { laneId: "b", clipId: WHOLE }]);
    assert.deepEqual(result.lanes.map((l) => l.laneId), ["a"]);
    assert.deepEqual(clipsOf(result.lanes[0]).map((c) => c.id), ["2"]);
    assert.deepEqual(result.selection, []);
  });
});

describe("duplicate and repeat", () => {
  test("a multi-lane selection is copied as one block", () => {
    const lanes = [
      lane("beat", { clips: [{ id: "b", from: 0, to: 8, at: 0 }] }),
      lane("vox", { clips: [{ id: "v", from: 0, to: 2, at: 0 }], offsetSeconds: 4 }),
    ];
    const result = duplicateClips(lanes, allClipRefs(lanes));
    assert.deepEqual(starts(find(result.lanes, "beat")), [0, 8]);
    assert.deepEqual(starts(find(result.lanes, "vox")), [4, 12]);
    assert.equal(result.selection.length, 2);
  });

  test("repeat ×3 lays three copies end to end", () => {
    const l = lane("a", { clips: [{ id: "1", from: 0, to: 4, at: 0 }] });
    const result = duplicateClips([l], [{ laneId: "a", clipId: "1" }], { times: 3 });
    assert.deepEqual(starts(result.lanes[0]), [0, 4, 8, 12]);
  });

  test("in place copies sit exactly on the originals", () => {
    const l = lane("a", { offsetSeconds: 3 });
    const result = duplicateClips([l], [{ laneId: "a", clipId: WHOLE }], { inPlace: true });
    assert.deepEqual(starts(result.lanes[0]), [3, 3]);
  });
});

describe("quantize", () => {
  test("snaps clip starts to the grid", () => {
    const l = lane("a", { clips: [{ id: "1", from: 0, to: 1, at: 0 }, { id: "2", from: 1, to: 2, at: 2.3 }], offsetSeconds: 0.9 });
    const q = quantizeClips([l], allClipRefs([l]), 0.5).lanes[0];
    assert.deepEqual(starts(q), [1, 3]);
  });
});

describe("copy and paste", () => {
  test("pastes at a new time, into the same lane", () => {
    const l = lane("a", { clips: [{ id: "1", from: 0, to: 2, at: 0 }, { id: "2", from: 5, to: 6, at: 5 }] });
    const board = copyClips([l], [{ laneId: "a", clipId: "2" }])!;
    const result = pasteClips([l], board, 10);
    assert.equal(result.count, 1);
    assert.deepEqual(starts(result.lanes[0]), [0, 5, 10]);
    assert.deepEqual(selectionBounds(result.lanes, result.selection), { start: 10, end: 11 });
  });

  test("falls back to a lane playing the same stem", () => {
    const l = lane("a");
    const board = copyClips([l], [{ laneId: "a", clipId: WHOLE }])!;
    const other = { ...lane("b"), stemId: "stem-a" };
    assert.equal(pasteClips([other], board, 2).count, 1);
  });
});

describe("reverse and stutter", () => {
  test("reverse turns a whole take into a reversed clip, still selected", () => {
    const result = updateClips([lane("a")], [{ laneId: "a", clipId: WHOLE }], (c) => ({ reverse: !c.reverse }));
    assert.equal(clipsOf(result.lanes[0])[0].reverse, true);
    assert.equal(result.selection[0].clipId, clipsOf(result.lanes[0])[0].id);
  });

  test("stutter repeats a slice over what follows, and keeps the rest", () => {
    const clips = stutterLane(lane("a"), 2, 0.5, 4)!;
    const l = lane("a", { clips });
    assert.deepEqual(starts(l), [0, 2, 2.5, 3, 3.5, 4]);
    assert.equal(Number(clipEnd(l, clipsOf(l).at(-1)!).toFixed(3)), 20);
    assert.equal(new Set(clips.map((c) => c.id)).size, clips.length);
  });
});
