// The Studio's newer DAW tools, on plain lane objects: clip level, mute and
// fades; slicing, joining, trimming and fitting clips; ripple delete and
// insert time; rhythmic automation; the master bus; lane names and order;
// saving it all; and finding a beat that fits.
//
//   node --import ./tests/support/register.mjs --test tests/studio-tools.test.ts

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { clipEnvelope } from "../src/lib/client/audioGraph.ts";
import { gatePattern, pumpPattern, spliceAutomation } from "../src/lib/client/automationPatterns.ts";
import {
  asWholeTake,
  cleanClip,
  clipEnd,
  clipStart,
  clipsOf,
  cutClip,
  fitClips,
  insertTime,
  joinClips,
  laneClipRefs,
  normaliseLane,
  playsInOrder,
  removeTime,
  shiftAutomation,
  shiftMarkers,
  sliceClips,
  splitClips,
  trimClipsAt,
  updateClips,
} from "../src/lib/client/clipEdit.ts";
import { describeFit, rankByTempo, tempoFit } from "../src/lib/client/matchFinder.ts";
import { laneFromApi, lanesToPayload, projectFromApi, type RemixLaneApi } from "../src/lib/client/remixLanes.ts";
import {
  DEFAULT_FX,
  DEFAULT_MASTER,
  laneName,
  normaliseMaster,
  snapTime,
  useStudioStore,
  type LaneClip,
  type LoadableStem,
  type StudioLane,
} from "../src/lib/client/studioStore.ts";

/** 120 BPM: a beat is half a second, a bar 2 seconds. */
const BEAT = 0.5;
const BAR = 2;

function lane(id: string, opts: Partial<StudioLane> = {}): StudioLane {
  return normaliseLane({
    laneId: id,
    stemId: `stem-${id}`,
    kind: "vocals",
    trackTitle: id,
    artistName: "Test",
    volume: 1,
    muted: false,
    solo: false,
    peaks: [],
    originalDuration: 16,
    duration: 16,
    offsetSeconds: 0,
    bpm: 120,
    musicalKey: null,
    pitchSemitones: 0,
    tempoRatio: 1,
    fx: { ...DEFAULT_FX },
    clips: null,
    xfade: null,
    automation: {},
    ...opts,
  });
}

const spans = (l: StudioLane) => clipsOf(l).map((c) => [+clipStart(l, c).toFixed(3), +clipEnd(l, c).toFixed(3)]);
const source = (l: StudioLane) => clipsOf(l).map((c) => [+c.from.toFixed(3), +c.to.toFixed(3)]);

describe("clip level, mute and fades", () => {
  test("defaults are dropped, so an untouched clip saves and compares the same", () => {
    const clip: LaneClip = { id: "a", from: 0, to: 1, at: 0, gain: 1, muted: false, fadeIn: 0, fadeOut: 0, stretch: 1, reverse: false };
    assert.deepEqual(cleanClip(clip), { id: "a", from: 0, to: 1, at: 0 });
    assert.deepEqual(cleanClip({ ...clip, gain: 0.5, muted: true, fadeIn: 0.25 }), { id: "a", from: 0, to: 1, at: 0, gain: 0.5, muted: true, fadeIn: 0.25 });
  });

  test("a lane playing its whole stem gets a real clip to hold the setting", () => {
    const l = lane("v");
    const { lanes } = updateClips([l], laneClipRefs(l), () => ({ gain: 0.5, fadeIn: 1 }));
    assert.equal(lanes[0].clips?.length, 1);
    assert.equal(lanes[0].clips![0].gain, 0.5);
    assert.equal(lanes[0].clips![0].fadeIn, 1);
  });

  test("cutting a clip: the left half keeps the fade in, the right half the fade out, both keep the level", () => {
    const [left, right] = cutClip({ id: "a", from: 0, to: 4, at: 0, gain: 0.5, fadeIn: 1, fadeOut: 1, label: "Chorus" }, 2);
    assert.deepEqual({ ...left }, { id: "a", from: 0, to: 2, at: 0, gain: 0.5, fadeIn: 1, label: "Chorus" });
    assert.equal(right.from, 2);
    assert.equal(right.at, 2);
    assert.equal(right.fadeOut, 1);
    assert.equal(right.fadeIn, undefined);
    assert.equal(right.gain, 0.5);
    assert.notEqual(right.id, "a");
  });

  test("splitting at the playhead hands the fades to the right halves", () => {
    const l = lane("v", { clips: [{ id: "a", from: 0, to: 8, at: 0, fadeIn: 1, fadeOut: 2 }] });
    const { lanes } = splitClips([l], ["v"], [], 4);
    const [a, b] = lanes[0].clips!;
    assert.equal(a.fadeIn, 1);
    assert.equal(a.fadeOut, undefined);
    assert.equal(b.fadeOut, 2);
    assert.equal(b.fadeIn, undefined);
  });

  test("the level shape: up over the fade in, held at the clip's gain, down over the fade out", () => {
    const shape = clipEnvelope({ gain: 0.5, fadeIn: 1, fadeOut: 2 }, 10);
    assert.equal(shape.at(0), 0);
    assert.equal(shape.at(0.5), 0.25);
    assert.equal(shape.at(5), 0.5);
    assert.equal(shape.at(9), 0.25);
    assert.equal(shape.at(10), 0);
  });

  test("fades longer than the clip are scaled down together, never past each other", () => {
    const shape = clipEnvelope({ fadeIn: 4, fadeOut: 4 }, 2);
    assert.ok(Math.abs(shape.fadeIn + shape.fadeOut - 2) < 1e-9);
    assert.ok(Math.abs(shape.at(1) - 1) < 1e-9, "full level only at the very middle");
  });

  test("with no settings, only the short anti-click fades", () => {
    const shape = clipEnvelope(null, 10);
    assert.equal(shape.level, 1);
    assert.ok(shape.fadeIn < 0.05 && shape.fadeOut < 0.05);
  });
});

describe("slicing, joining, trimming, fitting", () => {
  test("slice every beat: one piece per beat, end to end, all selected", () => {
    const l = lane("v", { clips: [{ id: "a", from: 0, to: 2, at: 0 }] });
    const { lanes, selection, count } = sliceClips([l], [{ laneId: "v", clipId: "a" }], BEAT);
    assert.equal(count, 3);
    assert.deepEqual(spans(lanes[0]), [[0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2]]);
    assert.deepEqual(source(lanes[0]), [[0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2]]);
    assert.equal(selection.length, 4);
  });

  test("slices fall on the timeline's grid, not the clip's start", () => {
    const l = lane("v", { offsetSeconds: 0.25, clips: [{ id: "a", from: 0, to: 1, at: 0 }] });
    const { lanes } = sliceClips([l], [{ laneId: "v", clipId: "a" }], BEAT);
    assert.deepEqual(spans(lanes[0]), [[0.25, 0.5], [0.5, 1], [1, 1.25]]);
  });

  test("join puts sliced pieces back into one clip", () => {
    const l = lane("v", { clips: [{ id: "a", from: 0, to: 2, at: 0, fadeIn: 0.1, fadeOut: 0.2 }] });
    const sliced = sliceClips([l], [{ laneId: "v", clipId: "a" }], BEAT);
    const { lanes, count, selection } = joinClips(sliced.lanes, sliced.selection);
    assert.equal(count, 3);
    assert.deepEqual(source(lanes[0]), [[0, 2]]);
    assert.equal(lanes[0].clips![0].fadeIn, 0.1);
    assert.equal(lanes[0].clips![0].fadeOut, 0.2);
    assert.equal(selection.length, 1);
  });

  test("join leaves clips that don't follow on from each other", () => {
    const l = lane("v", {
      clips: [
        { id: "a", from: 0, to: 1, at: 0 },
        { id: "b", from: 3, to: 4, at: 1 },
      ],
    });
    assert.equal(joinClips([l], laneClipRefs(l)).count, 0);
  });

  test("trim at the playhead: cut the start or the end of the clip under it", () => {
    const l = lane("v", { clips: [{ id: "a", from: 0, to: 8, at: 0 }] });
    const refs = [{ laneId: "v", clipId: "a" }];
    const start = trimClipsAt([l], refs, 3, "start");
    assert.deepEqual(spans(start.lanes[0]), [[3, 8]]);
    assert.equal(start.lanes[0].clips![0].id, "a", "the kept half stays selected");
    const end = trimClipsAt([l], refs, 3, "end");
    assert.deepEqual(spans(end.lanes[0]), [[0, 3]]);
  });

  test("fit to bars: the clip is stretched to last exactly that long", () => {
    const l = lane("v", { clips: [{ id: "a", from: 0, to: 3, at: 0 }] });
    const { lanes, count } = fitClips([l], [{ laneId: "v", clipId: "a" }], 2 * BAR);
    assert.equal(count, 1);
    assert.deepEqual(spans(lanes[0]), [[0, 4]]);
    assert.equal(lanes[0].clips![0].stretch, 0.75);
  });

  test("fit refuses a change of more than 4×", () => {
    const l = lane("v", { clips: [{ id: "a", from: 0, to: 0.5, at: 0 }] });
    assert.equal(fitClips([l], [{ laneId: "v", clipId: "a" }], 8 * BAR).count, 0);
  });
});

describe("ripple delete and insert time", () => {
  const beat = () => lane("beat", { kind: "beat", originalDuration: 20 });
  const vocal = () => lane("vocal", { offsetSeconds: 8, originalDuration: 4 });

  test("taking out 2..4s: what's inside goes, everything after moves up", () => {
    const [b, v] = removeTime([beat(), vocal()], 2, 4);
    assert.deepEqual(spans(b), [[0, 2], [2, 18]]);
    assert.deepEqual(source(b), [[0, 2], [4, 20]]);
    assert.deepEqual(spans(v), [[6, 10]], "a lane after the cut just moves up");
  });

  test("a lane wholly inside the deleted time is removed", () => {
    const lanes = removeTime([beat(), vocal()], 7, 13);
    assert.deepEqual(lanes.map((l) => l.laneId), ["beat"]);
  });

  test("inserting a bar at 4s pushes everything from there later", () => {
    const [b, v] = insertTime([beat(), vocal()], 4, BAR);
    assert.deepEqual(spans(b), [[0, 4], [6, 22]]);
    assert.deepEqual(spans(v), [[10, 14]]);
  });

  test("automation follows the edit, and the line carries on where it was", () => {
    const points = [
      { t: 0, v: 0 },
      { t: 10, v: 1 },
    ];
    const removed = shiftAutomation(points, 2, 4, -2);
    assert.deepEqual(removed.at(-1), { t: 8, v: 1 });
    assert.equal(removed.find((p) => p.t === 2)?.v, 0.2);
    const inserted = shiftAutomation(points, 5, 5, 3);
    assert.deepEqual(inserted.at(-1), { t: 13, v: 1 });
    assert.deepEqual(
      inserted.filter((p) => p.t === 5 || p.t === 8).map((p) => p.v),
      [0.5, 0.5],
      "held level across the new space"
    );
  });

  test("sections after the cut move up; one inside it goes", () => {
    const markers = [
      { id: "a", label: "intro", start: 0, end: 2 },
      { id: "b", label: "gone", start: 2.5, end: 3.5 },
      { id: "c", label: "chorus", start: 6, end: 10 },
    ];
    assert.deepEqual(
      shiftMarkers(markers, 2, 4, -2).map((m) => [m.label, m.start, m.end]),
      [
        ["intro", 0, 2],
        ["chorus", 4, 8],
      ]
    );
  });
});

describe("rhythmic automation", () => {
  test("a gate is on for part of every step and down to the floor for the rest", () => {
    const points = gatePattern(0, 2, BEAT, { duty: 0.5, floor: 0 });
    assert.equal(points.length, 16);
    const value = (t: number) => points.filter((p) => p.t <= t).at(-1)!.v;
    assert.equal(value(0.1), 1);
    assert.equal(value(0.3), 0);
    assert.equal(value(0.6), 1);
  });

  test("a pump dips on every beat and is back up before the next", () => {
    const points = pumpPattern(0, 2, BEAT, { depth: 0.6 });
    assert.equal(points.filter((p) => Math.abs(p.v - 0.4) < 1e-9).length, 4);
    assert.ok(points.every((p) => p.v >= 0.4 - 1e-9 && p.v <= 1));
  });

  test("a pattern goes in over a stretch, keeping the line either side", () => {
    const existing = [
      { t: 0, v: 0.2 },
      { t: 10, v: 0.2 },
    ];
    const out = spliceAutomation(existing, 4, 6, gatePattern(4, 6, BEAT));
    assert.equal(out[0].v, 0.2);
    assert.equal(out.at(-1)!.v, 0.2);
    assert.ok(out.some((p) => p.t >= 4 && p.t <= 6 && p.v === 1));
    for (let i = 1; i < out.length; i++) assert.ok(out[i].t >= out[i - 1].t, "points stay in order");
  });
});

describe("the store: grid, master, lane names and order", () => {
  beforeEach(() => {
    useStudioStore.getState().clearLanes();
    useStudioStore.setState({ projectBpm: 120, snapToGrid: true, gridBeats: 1 });
  });

  test("snapping follows the grid size", () => {
    const state = useStudioStore.getState();
    assert.equal(snapTime(0.7, state), 0.5);
    state.setGridBeats(4);
    assert.equal(snapTime(1.2, useStudioStore.getState()), 2);
    state.setGridBeats(0.25);
    assert.equal(snapTime(0.2, useStudioStore.getState()), 0.25);
    useStudioStore.getState().toggleSnap();
    assert.equal(snapTime(0.2, useStudioStore.getState()), 0.2);
  });

  test("the master keeps its numbers in range and clears with the Studio", () => {
    useStudioStore.getState().setMaster({ low: 20, glue: 2 });
    assert.deepEqual(useStudioStore.getState().master, { low: 6, high: 0, glue: 1 });
    useStudioStore.getState().clearLanes();
    assert.deepEqual(useStudioStore.getState().master, DEFAULT_MASTER);
    assert.deepEqual(normaliseMaster({ low: "x", high: -3 }), { low: 0, high: -3, glue: 0 });
  });

  test("lanes can be named, renamed back, and moved up and down", () => {
    useStudioStore.setState({ lanes: [lane("a"), lane("b"), lane("c")] });
    const store = useStudioStore.getState();
    store.renameLane("b", "  Hook  ");
    assert.equal(laneName(useStudioStore.getState().lanes[1]), "Hook");
    store.renameLane("b", "");
    assert.equal(useStudioStore.getState().lanes[1].name, undefined);
    store.moveLane("c", -1);
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["a", "c", "b"]);
    store.moveLane("a", -1);
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["a", "c", "b"], "the top lane can't go higher");
  });
});

describe("saving", () => {
  test("clip level, mute, fades and the lane's name survive a save and load", () => {
    const l = lane("v", { name: "Lead", clips: [{ id: "a", from: 0, to: 4, at: 0, gain: 0.5, muted: true, fadeIn: 0.25, fadeOut: 1 }] });
    const [payload] = lanesToPayload([l]);
    const row: RemixLaneApi = {
      stem_id: payload.stemId,
      kind: "vocals",
      peaks_json: "[]",
      volume: payload.volume,
      muted: payload.muted,
      offset_seconds: payload.offsetSeconds,
      pitch_semitones: payload.pitchSemitones,
      tempo_ratio: payload.tempoRatio,
      settings_json: JSON.stringify(payload.settings),
      track_title: "v",
      track_duration: 16,
      track_bpm: 120,
      stem_artist_name: "Test",
    };
    const back = laneFromApi(row);
    assert.equal(back.name, "Lead");
    const { id: _id, ...clip } = back.clips![0];
    void _id;
    assert.deepEqual(clip, { from: 0, to: 4, at: 0, gain: 0.5, muted: true, fadeIn: 0.25, fadeOut: 1 });
  });

  test("the master comes back from a saved remix; older remixes get the default", () => {
    const project = (master?: unknown) => projectFromApi({ id: "r", title: "t", published: true, project_json: JSON.stringify({ projectBpm: 100, master }) });
    assert.deepEqual(project({ low: 2, high: -1, glue: 0.5 }).master, { low: 2, high: -1, glue: 0.5 });
    assert.deepEqual(project().master, DEFAULT_MASTER);
  });
});

describe("finding a beat that fits", () => {
  const stem = (id: string, bpm: number | null): LoadableStem => ({ id, kind: "beat", track_title: id, artist_name: "A", peaks_json: "[]", track_duration: 100, track_bpm: bpm });

  test("half and double time count", () => {
    assert.deepEqual(tempoFit(70, 140), { stretch: 1, factor: 0.5 });
    assert.deepEqual(tempoFit(140, 70), { stretch: 1, factor: 2 });
    assert.equal(describeFit(tempoFit(100, 96)!), "4% faster");
    assert.equal(describeFit(tempoFit(70, 140)!), "half time, same speed");
  });

  test("closest first; too far, no tempo and already in the mix are left out", () => {
    const ranked = rankByTempo([stem("far", 75), stem("near", 98), stem("exact", 100), stem("none", null), stem("mine", 100), stem("double", 52)], 100, {
      exclude: new Set(["mine"]),
    });
    assert.deepEqual(
      ranked.map((c) => c.stem.id),
      ["exact", "near", "double"]
    );
  });
});

describe("whole track or clips", () => {
  beforeEach(() => {
    useStudioStore.getState().clearLanes();
    useStudioStore.setState({ projectBpm: 120 });
  });

  test("a lane is split every so many bars, then made whole again — undoable either way", async () => {
    const { splitLane, makeWhole } = await import("../src/lib/client/clipCommands.ts");
    useStudioStore.setState({ lanes: [lane("v", { offsetSeconds: 4 })] });
    splitLane("v", 2);
    const split = useStudioStore.getState().lanes[0];
    assert.deepEqual(spans(split), [[4, 8], [8, 12], [12, 16], [16, 20]]);
    makeWhole("v");
    const whole = useStudioStore.getState().lanes[0];
    assert.equal(whole.clips, null);
    assert.equal(whole.offsetSeconds, 4);
  });

  test("clips in the take's own order can be played as the whole take; chopped ones can't", () => {
    const inOrder = lane("v", { clips: [{ from: 1, to: 3, at: 0 }, { from: 5, to: 6, at: 3 }] });
    assert.ok(playsInOrder(inOrder));
    assert.ok(!playsInOrder(lane("v", { clips: [{ from: 5, to: 6, at: 0 }, { from: 1, to: 3, at: 2 }] })), "reordered");
    assert.ok(!playsInOrder(lane("v", { clips: [{ from: 1, to: 2, at: 0 }, { from: 1, to: 2, at: 1 }] })), "repeated");
    assert.ok(!playsInOrder(lane("v", { clips: [{ from: 1, to: 2, at: 0, reverse: true }] })), "reversed");
    // The first clip (stem 1s) was at the lane's start: the whole take starts 1s before.
    const whole = asWholeTake(normaliseLane({ ...inOrder, offsetSeconds: 6 }));
    assert.equal(whole.clips, null);
    assert.equal(whole.offsetSeconds, 5);
  });
});

describe("whole track: what counts as in order", () => {
  test("phrases the AI stretched a little, or that overlap at their edges, can still be the whole take", () => {
    assert.ok(playsInOrder(lane("v", { clips: [{ from: 1, to: 3, at: 0, stretch: 1.04 }, { from: 2.8, to: 5, at: 3, stretch: 0.97 }] })));
    assert.ok(!playsInOrder(lane("v", { clips: [{ from: 1, to: 3, at: 0, stretch: 1.5 }] })), "really sped up");
    assert.ok(!playsInOrder(lane("v", { clips: [{ from: 1, to: 5, at: 0 }, { from: 2, to: 6, at: 5 }] })), "goes back over the last part");
  });
});
