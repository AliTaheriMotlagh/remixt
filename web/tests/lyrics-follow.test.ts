// The words stay on the singing (lib/client/lyricsFollow.ts) — tried the
// way it's really used: the Studio's store, the follower listening to it,
// and one vocal edit after another, hundreds of them, picked at random
// (always the same ones: the dice are seeded). After every edit each timed
// line must be at a place where its own moment of the vocal now plays —
// whatever was done: moved, sped up, split, trimmed, stretched, sliced,
// duplicated, deleted, time cut out of the song, undone.
//
//   node --import ./tests/support/register.mjs --test tests/lyrics-follow.test.ts

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  clipEnd,
  clipId,
  clipsOf,
  clipStart,
  deleteClips,
  duplicateClips,
  fitClips,
  insertTime,
  joinClips,
  moveClips,
  normaliseLane,
  removeTime,
  sliceClips,
  splitClips,
  trimClipsAt,
  type ClipRef,
} from "../src/lib/client/clipEdit.ts";
import { startLyricsFollow } from "../src/lib/client/lyricsFollow.ts";
import { useLyrics } from "../src/lib/client/lyricsStore.ts";
import { useStudioStore, type StudioLane } from "../src/lib/client/studioStore.ts";
import { timelineOf } from "../src/lib/client/vocalTime.ts";
import { parseLyrics } from "../src/lib/lyrics.ts";

function lane(id: string, opts: Partial<StudioLane> = {}): StudioLane {
  return normaliseLane({
    laneId: id,
    stemId: `stem-${id}`,
    kind: "vocals",
    trackTitle: "Singer - Song",
    artistName: "uploader",
    volume: 1,
    muted: false,
    solo: false,
    peaks: [],
    originalDuration: 200,
    duration: 200,
    offsetSeconds: 0,
    bpm: 100,
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

/** Lines sung every 4 s from 12 s to 180 s into the vocal — each named for its moment. */
const MOMENTS = Array.from({ length: 43 }, (_, i) => 12 + i * 4);
const stamp = (t: number) => `[${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}]`;
const SHEET = MOMENTS.map((t) => `${stamp(t)} line ${t}`).join("\n");

/** The same dice every run. */
function dice(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lanes = () => useStudioStore.getState().lanes;
const vocal = () => lanes().find((l) => l.laneId === "v")!;
const setLanes = (next: StudioLane[]) => useStudioStore.setState({ lanes: next });
const lineTimes = () => new Map(parseLyrics(useLyrics.getState().sheets.find((s) => s.id === useLyrics.getState().activeId)!.text).map((l) => [l.text, l.time]));

/** Everywhere stem second `src` of the vocal can be heard now. */
function playsAt(src: number): number[] {
  const out: number[] = [];
  for (const l of lanes()) {
    if (l.kind !== "vocals" || l.stemId !== "stem-v") continue;
    for (const clip of clipsOf(l)) if (!clip.muted && !l.muted && src >= clip.from && src <= clip.to) out.push(timelineOf(l, clip, src));
  }
  return out;
}

/** Every line whose moment still plays must be at one of the places it plays. */
function check(after: string) {
  const times = lineTimes();
  for (const moment of MOMENTS) {
    const at = times.get(`line ${moment}`);
    const places = playsAt(moment);
    if (!places.length) continue; // cut out of the mix: wherever it was left is fine
    assert.ok(at !== null && at !== undefined, `line ${moment} lost its time after ${after}`);
    const off = Math.min(...places.map((p) => Math.abs(p - at)));
    assert.ok(off <= 0.02, `after ${after}: line ${moment} is at ${at}, its singing at ${places.map((p) => p.toFixed(2)).join(" / ")}`);
  }
}

let stop = () => {};
beforeEach(() => {
  useStudioStore.setState({ lanes: [lane("v"), lane("beat", { kind: "beat", trackTitle: "Producer - Beat" })] });
  useLyrics.setState({ sheets: [], activeId: null, past: [], future: [] });
  useLyrics.getState().create({ title: "Song", artist: "Singer", text: SHEET, source: "own" });
  stop = startLyricsFollow();
});
afterEach(() => stop());

const refs = (l: StudioLane): ClipRef[] => clipsOf(l).map((c) => ({ laneId: l.laneId, clipId: clipId(c) }));

describe("one edit at a time", () => {
  test("the starting point: every line on its moment", () => check("nothing"));

  test("moved", () => {
    setLanes(moveClips(lanes(), refs(vocal()), 7.3).lanes);
    check("a move");
    assert.equal(lineTimes().get("line 12"), 19.3);
  });

  test("a new tempo", () => {
    setLanes(lanes().map((l) => (l.laneId === "v" ? normaliseLane({ ...l, tempoRatio: 1.1 }) : l)));
    check("a tempo change");
  });

  test("split, the second half dragged later, then the first half deleted", () => {
    setLanes(splitClips(lanes(), ["v"], [], 90).lanes);
    const [, second] = clipsOf(vocal());
    setLanes(moveClips(lanes(), [{ laneId: "v", clipId: clipId(second) }], 12).lanes);
    check("a split and a move");
    const [first] = clipsOf(vocal());
    setLanes(deleteClips(lanes(), [{ laneId: "v", clipId: clipId(first) }]).lanes);
    check("deleting the first half");
  });

  test("time cut out of the whole song, and put back in", () => {
    setLanes(removeTime(lanes(), 40, 60));
    check("removing 40–60 s");
    setLanes(insertTime(lanes(), 30, 8));
    check("inserting 8 s at 30 s");
  });

  test("a section duplicated: the line stays on its first singing", () => {
    setLanes(splitClips(lanes(), ["v"], [], 60).lanes);
    setLanes(splitClips(lanes(), ["v"], [], 80).lanes);
    const middle = clipsOf(vocal())[1];
    setLanes(duplicateClips(lanes(), [{ laneId: "v", clipId: clipId(middle) }], { blockSeconds: 150 }).lanes);
    check("duplicating the chorus");
    assert.equal(lineTimes().get("line 64"), 64);
  });
});

describe("edit after edit", () => {
  for (const seed of Array.from({ length: 30 }, (_, i) => i + 1)) {
    test(`a session of 60 edits (dice ${seed})`, () => {
      const roll = dice(seed);
      const pick = <T,>(list: T[]) => list[Math.floor(roll() * list.length)];
      const history: StudioLane[][] = [];
      for (let step = 1; step <= 60; step++) {
        const v = vocal();
        const clips = clipsOf(v);
        const one = pick(clips);
        const ref: ClipRef = { laneId: "v", clipId: clipId(one) };
        const start = clipStart(v, one);
        const end = clipEnd(v, one);
        const inside = start + (end - start) * (0.2 + roll() * 0.6);
        history.push(lanes());
        const kind = Math.floor(roll() * 13);
        let what = "";
        if (kind === 0) {
          what = "moving the whole vocal";
          setLanes(moveClips(lanes(), refs(v), (roll() - 0.4) * 10).lanes);
        } else if (kind === 1) {
          what = "moving one clip";
          setLanes(moveClips(lanes(), [ref], (roll() - 0.3) * 6).lanes);
        } else if (kind === 2 && clips.length < 40) {
          what = `splitting at ${inside.toFixed(2)}`;
          setLanes(splitClips(lanes(), ["v"], [], inside).lanes);
        } else if (kind === 3) {
          what = "trimming a clip's start";
          setLanes(trimClipsAt(lanes(), [ref], inside, "start").lanes);
        } else if (kind === 4) {
          what = "trimming a clip's end";
          setLanes(trimClipsAt(lanes(), [ref], inside, "end").lanes);
        } else if (kind === 5 && clips.length > 3) {
          what = "deleting a clip";
          setLanes(deleteClips(lanes(), [ref]).lanes);
        } else if (kind === 6) {
          what = "stretching a clip to a new length";
          setLanes(fitClips(lanes(), [ref], (end - start) * (0.8 + roll() * 0.5)).lanes);
        } else if (kind === 7) {
          what = "a new tempo";
          setLanes(lanes().map((l) => (l.laneId === "v" ? normaliseLane({ ...l, tempoRatio: 0.9 + roll() * 0.25 }) : l)));
        } else if (kind === 8 && end - start > 8 && clips.length < 30) {
          what = "slicing a clip on a grid";
          setLanes(sliceClips(lanes(), [ref], Math.max(2, (end - start) / 4)).lanes);
        } else if (kind === 9) {
          what = "cutting time out of the song";
          setLanes(removeTime(lanes(), inside, inside + 1 + roll() * 3));
        } else if (kind === 11 && clips.length < 30 && end - start < 40) {
          what = "pasting a copy of a clip later in the song";
          setLanes(duplicateClips(lanes(), [ref], { blockSeconds: 210 + roll() * 20 }).lanes);
        } else if (kind === 12) {
          what = "joining the clips back together";
          setLanes(joinClips(lanes(), refs(v)).lanes);
        } else if (kind === 10 && history.length > 3) {
          what = "undoing three edits";
          setLanes(history[history.length - 4]);
        } else {
          what = "putting silence into the song";
          setLanes(insertTime(lanes(), inside, 1 + roll() * 4));
        }
        check(`step ${step}, ${what}`);
      }
    });
  }
});
