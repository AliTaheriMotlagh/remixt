// The co-producer's hands on the history (coproducerTools.ts): it reads
// every change back, takes one back on its own, and what it changes
// straight away (a lane taken out, the master, the loop) is a step in the
// history by the AI — which the person can undo like any other.
//
//   node --import ./tests/support/register.mjs --test tests/coproducer-history.test.ts

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

// The history records edits only in a browser: a bare window turns that on.
(globalThis as Record<string, unknown>).window ??= {};
const { runCoproducerTool } = await import("../src/lib/client/coproducerTools.ts");
const { resetHistory, startNewStep, undo, useStudioHistory } = await import("../src/lib/client/studioHistory.ts");
const { normaliseLane } = await import("../src/lib/client/clipEdit.ts");
const { DEFAULT_FX, PROJECT_DEFAULTS, useStudioStore } = await import("../src/lib/client/studioStore.ts");
type StudioLane = import("../src/lib/client/studioStore.ts").StudioLane;

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

// The tools that read and change the history don't listen to the mix.
const ctx = { session: () => null, ideas: () => [], listen: async () => null };
const call = async (name: string, input: Record<string, unknown> = {}) => {
  const result = await runCoproducerTool(name, input, ctx);
  return { ...result, data: result.isError ? null : JSON.parse(result.content) };
};

describe("the co-producer and the history", () => {
  beforeEach(() => {
    useStudioStore.setState({ lanes: [], ...PROJECT_DEFAULTS, duration: 0 });
    resetHistory();
    useStudioStore.setState({ lanes: [lane("Vox"), lane("Beat", { kind: "beat" })] });
    startNewStep();
    useStudioStore.getState().setVolume("Vox", 0.5);
    startNewStep();
    useStudioStore.getState().setFx("Beat", { reverb: 0.3 });
  });

  test("list_changes: every change, newest first, with what it changed and who", async () => {
    const { data } = await call("list_changes");
    assert.equal(data.total, 3);
    assert.deepEqual(data.changes.map((c: { step: number }) => c.step), [2, 1, 0]);
    assert.equal(data.changes[0].by, "you");
    assert.deepEqual(data.changes[0].lanes, ["Beat"]);
    assert.ok(data.changes[1].changed.some((line: string) => /Vox/.test(line)));
    const onVox = await call("list_changes", { lane_id: "Vox" });
    assert.deepEqual(onVox.data.changes.map((c: { step: number }) => c.step), [1, 0]);
  });

  test("undo_change: that change goes back, the later one stays, and it's a step by the AI", async () => {
    const { data } = await call("undo_change", { step: 1 });
    assert.equal(data.ok, true);
    const [vox, beat] = useStudioStore.getState().lanes;
    assert.equal(vox.volume, 1);
    assert.equal(beat.fx.reverb, 0.3);
    const last = useStudioHistory.getState().past.at(-1)!;
    assert.equal(last.meta?.by, "ai");
    // The person can take the AI's undo back.
    undo();
    assert.equal(useStudioStore.getState().lanes[0].volume, 0.5);
  });

  test("undo_back_to: the mix as it was before a change", async () => {
    await call("undo_back_to", { step: 1 });
    const [vox, beat] = useStudioStore.getState().lanes;
    assert.equal(vox.volume, 1);
    assert.equal(beat.fx.reverb, 0);
  });

  test("a step that isn't there is said plainly", async () => {
    const result = await call("undo_change", { step: 40 });
    assert.equal(result.isError, true);
  });

  test("remove_lane, set_master and set_loop change the mix straight away, each a step by the AI", async () => {
    await call("remove_lane", { lane_id: "Beat" });
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["Vox"]);
    await call("set_master", { volume: 1.2, preset: "warm" });
    assert.equal(useStudioStore.getState().masterVolume, 1.2);
    await call("set_loop", { on: true, from_seconds: 4, to_seconds: 12 });
    const state = useStudioStore.getState();
    assert.equal(state.loopEnabled, true);
    assert.equal(state.loopEnd, 12);
    const past = useStudioHistory.getState().past;
    assert.deepEqual(past.slice(-3).map((p) => [p.meta?.by, p.meta?.label]), [
      ["ai", "Took out “Beat”"],
      ["ai", "Master volume 120%, master: Warm"],
      ["ai", "Loop 4–12 s"],
    ]);
    // All of it undoes.
    undo();
    undo();
    undo();
    assert.deepEqual(useStudioStore.getState().lanes.map((l) => l.laneId), ["Vox", "Beat"]);
  });
});
