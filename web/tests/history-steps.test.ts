// The Studio's history read back and taken back a step at a time
// (historySteps.ts): what each step changed, in words, and by whom; one
// step undone on its own — only what it changed goes back, later edits
// stay (or are said to be undone too, when they touched the same thing);
// and the who/when of each step kept through undo and redo.
//
//   node --import ./tests/support/register.mjs --test tests/history-steps.test.ts

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

// The history records edits only in a browser: a bare window turns that on.
(globalThis as Record<string, unknown>).window ??= {};
const { describeStep, historyEntries, revertStep, undoBackTo, undoStep } = await import("../src/lib/client/historySteps.ts");
const { asAuthor, currentSnapshot, recordStep, redo, resetHistory, startNewStep, undo, useStudioHistory } = await import("../src/lib/client/studioHistory.ts");
const { normaliseLane } = await import("../src/lib/client/clipEdit.ts");
const { DEFAULT_FX, PROJECT_DEFAULTS, useStudioStore } = await import("../src/lib/client/studioStore.ts");
type StudioLane = import("../src/lib/client/studioStore.ts").StudioLane;
type Snapshot = import("../src/lib/client/studioHistory.ts").Snapshot;

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
    originalDuration: 60,
    duration: 60,
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

function mix(lanes: StudioLane[], extra: Partial<Snapshot> = {}): Snapshot {
  return {
    lanes,
    duration: 60,
    projectBpm: 120,
    masterVolume: 0.9,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
    markers: [],
    crossfader: 0,
    pads: [],
    master: { low: 0, high: 0, glue: 0 },
    ...extra,
  };
}

const set = (l: StudioLane, patch: Partial<StudioLane>) => ({ ...l, ...patch });
const fx = (l: StudioLane, patch: Partial<StudioLane["fx"]>) => ({ ...l, fx: { ...l.fx, ...patch } });

describe("reading the history back", () => {
  test("a step says what it changed, lane by lane, and which lanes", () => {
    const a = lane("Vox");
    const b = lane("Beat", { kind: "beat" });
    const { lines, laneIds } = describeStep(mix([a, b]), mix([set(a, { volume: 0.5 }), fx(b, { reverb: 0.3 })], { masterVolume: 1 }));
    assert.deepEqual(laneIds.sort(), ["Beat", "Vox"]);
    assert.ok(lines.some((l) => /Vox/.test(l) && /quieter/i.test(l)), lines.join(" | "));
    assert.ok(lines.some((l) => /Beat/.test(l) && /reverb/.test(l)), lines.join(" | "));
    assert.ok(lines.some((l) => /Master volume 90% → 100%/.test(l)), lines.join(" | "));
  });

  test("each entry is by whoever made it, called what they called it", () => {
    const a = lane("Vox");
    const past = [
      { ...mix([a]), meta: { at: 1, by: "you" as const } },
      { ...mix([set(a, { muted: true })]), meta: { at: 2, by: "ai" as const, label: "Radio hit" } },
    ];
    const entries = historyEntries({ past }, mix([set(a, { muted: true, volume: 0.4 })]));
    assert.equal(entries.length, 2);
    assert.equal(entries[0].by, "you");
    assert.match(entries[0].title, /Vox/);
    assert.equal(entries[1].by, "ai");
    assert.equal(entries[1].title, "Radio hit");
  });
});

describe("taking one step back on its own", () => {
  test("only what it changed goes back; later edits stay", () => {
    const a = lane("Vox");
    const before = mix([a]);
    const after = mix([set(a, { volume: 0.5 })]);
    const now = mix([fx(set(a, { volume: 0.5 }), { reverb: 0.4 })]);
    const back = revertStep(before, after, now)!;
    assert.equal(back.mix.lanes![0].volume, 1);
    assert.equal(back.mix.lanes![0].fx.reverb, 0.4, "the later reverb stays");
    assert.deepEqual(back.later, []);
  });

  test("a setting changed again since goes back too, and is said", () => {
    const a = lane("Vox");
    const back = revertStep(mix([a]), mix([set(a, { volume: 0.5 })]), mix([set(a, { volume: 0.8 })]))!;
    assert.equal(back.mix.lanes![0].volume, 1);
    assert.deepEqual(back.later, ["“Vox”'s volume"]);
  });

  test("a lane it added goes; a lane it took out comes back where it was", () => {
    const a = lane("A");
    const b = lane("B");
    const c = lane("C");
    const added = revertStep(mix([a]), mix([a, b]), mix([a, b, c]))!;
    assert.deepEqual(added.mix.lanes!.map((l) => l.laneId), ["A", "C"]);
    const removed = revertStep(mix([a, b, c]), mix([a, c]), mix([a, c]))!;
    assert.deepEqual(removed.mix.lanes!.map((l) => l.laneId), ["A", "B", "C"]);
  });

  test("just what it did to one lane", () => {
    const a = lane("A");
    const b = lane("B");
    const back = revertStep(mix([a, b]), mix([set(a, { pitchSemitones: 2 }), set(b, { pitchSemitones: -3 })], { projectBpm: 100 }), mix([set(a, { pitchSemitones: 2 }), set(b, { pitchSemitones: -3 })], { projectBpm: 100 }), "B")!;
    assert.equal(back.mix.lanes![0].pitchSemitones, 2, "the other lane keeps its change");
    assert.equal(back.mix.lanes![1].pitchSemitones, 0);
    assert.equal(back.mix.projectBpm, undefined, "the song's tempo isn't one lane's");
  });

  test("the song's settings go back with the whole step", () => {
    const back = revertStep(mix([], { projectBpm: 120, loopEnabled: false }), mix([], { projectBpm: 96, loopEnabled: true }), mix([], { projectBpm: 96, loopEnabled: true }))!;
    assert.equal(back.mix.projectBpm, 120);
    assert.equal(back.mix.loopEnabled, false);
  });

  test("nothing left of it: nothing to do", () => {
    const a = lane("A");
    assert.equal(revertStep(mix([a]), mix([a, lane("B")]), mix([a])), null);
  });
});

describe("in the Studio", () => {
  beforeEach(() => {
    useStudioStore.setState({ lanes: [], ...PROJECT_DEFAULTS, duration: 0 });
    resetHistory();
  });

  test("an edit is a step by the person; the co-producer's are by the AI; undo and redo keep who", () => {
    useStudioStore.setState({ lanes: [lane("Vox")] });
    startNewStep();
    useStudioStore.setState({ lanes: [set(lane("Vox"), { volume: 0.5 })] });
    asAuthor("ai", "Quieter vocal", () => useStudioStore.setState({ lanes: [set(lane("Vox"), { volume: 0.3 })] }));
    const { past } = useStudioHistory.getState();
    assert.deepEqual(past.map((p) => p.meta?.by), ["you", "you", "ai"]);
    assert.equal(past[2].meta?.label, "Quieter vocal");
    undo();
    redo();
    const again = useStudioHistory.getState().past;
    assert.equal(again[again.length - 1].meta?.by, "ai");
    assert.equal(again[again.length - 1].meta?.label, "Quieter vocal");
  });

  test("undoing one step from the middle leaves the ones after it, and is a step of its own", () => {
    const a = lane("Vox");
    useStudioStore.setState({ lanes: [a] });
    startNewStep();
    useStudioStore.setState({ lanes: [set(a, { volume: 0.5 })] });
    startNewStep();
    useStudioStore.setState({ lanes: [fx(set(a, { volume: 0.5 }), { reverb: 0.4 })] });
    // Steps: 0 added the lane, 1 turned it down, 2 added reverb.
    const result = undoStep(1);
    assert.equal(result.ok, true);
    const now = useStudioStore.getState().lanes[0];
    assert.equal(now.volume, 1);
    assert.equal(now.fx.reverb, 0.4);
    const { past } = useStudioHistory.getState();
    assert.match(past[past.length - 1].meta?.label ?? "", /^Undid/);
    // And it undoes like any other step.
    undo();
    assert.equal(useStudioStore.getState().lanes[0].volume, 0.5);
  });

  test("back to before a step undoes it and everything after", () => {
    useStudioStore.setState({ lanes: [lane("A")] });
    startNewStep();
    useStudioStore.setState({ lanes: [lane("A"), lane("B")] });
    startNewStep();
    useStudioStore.setState({ lanes: [lane("A"), lane("B"), lane("C")] });
    undoBackTo(1);
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["A"]);
    assert.equal(useStudioHistory.getState().future.length, 2, "redo brings them back");
  });

  test("an AI idea kept is a step by the AI, called by its title", () => {
    useStudioStore.setState({ lanes: [lane("A")] });
    recordStep({ lanes: [] }, { label: "Make it a radio hit" });
    const last = useStudioHistory.getState().past.at(-1)!;
    assert.equal(last.meta?.by, "ai");
    assert.equal(last.meta?.label, "Make it a radio hit");
    assert.deepEqual(currentSnapshot().lanes.map((l) => l.laneId), ["A"]);
  });
});
