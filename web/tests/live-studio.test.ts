// The words listeners see as a live studio session's mix changes
// (lib/client/liveStudioDiff.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describeMixChanges, type DiffLane, type DiffMix } from "../src/lib/client/liveStudioDiff.ts";

const lane = (id: string, patch: Partial<DiffLane> = {}): DiffLane => ({
  laneId: id,
  kind: "vocals",
  trackTitle: `Song ${id}`,
  muted: false,
  volume: 1,
  offsetSeconds: 0,
  pitchSemitones: 0,
  tempoRatio: 1,
  fx: { reverb: 0, delay: 0 },
  clips: null,
  ...patch,
});
const mix = (lanes: DiffLane[], project: DiffMix["project"] = { projectBpm: 120 }): DiffMix => ({ lanes, project });

describe("describing a live mix's changes", () => {
  test("the first mix, and nothing changed", () => {
    assert.deepEqual(describeMixChanges(null, mix([lane("a"), lane("b")])), ["Opened a mix with 2 stems"]);
    assert.deepEqual(describeMixChanges(mix([lane("a")]), mix([lane("a")])), []);
  });

  test("lanes added, removed, muted, soloed, levels", () => {
    const before = mix([lane("a"), lane("b", { kind: "beat" })]);
    const after = mix([lane("a", { muted: true, volume: 0.5 }), lane("c", { kind: "drums" })]);
    assert.deepEqual(describeMixChanges(before, after, 10), [
      "Added “Song c” drums",
      "Removed “Song b” beat",
      "Muted “Song a” vocals",
      "Turned “Song a” vocals down to 50%",
    ]);
    assert.deepEqual(describeMixChanges(mix([lane("a")]), mix([lane("a", { solo: true })])), ["Soloed “Song a” vocals"]);
  });

  test("clips, effects, tempo and the project", () => {
    const before = mix([lane("a")], { projectBpm: 120, loopEnabled: false });
    const after = mix(
      [lane("a", { clips: [{ from: 0, to: 4, at: 0 }, { from: 4, to: 8, at: 8 }], fx: { reverb: 0.4, delay: 0.2 }, pitchSemitones: 2 })],
      { projectBpm: 124, loopEnabled: true }
    );
    const lines = describeMixChanges(before, after, 10);
    assert.ok(lines.includes("Cut “Song a” vocals into 2 clips"));
    assert.ok(lines.includes("Tweaked reverb and delay on “Song a” vocals"));
    assert.ok(lines.includes("Pitched “Song a” vocals to +2 semitones"));
    assert.ok(lines.includes("Set the tempo to 124 BPM"));
    assert.ok(lines.includes("Started looping a section"));
  });

  test("small fader wobbles and many changes are kept short", () => {
    assert.deepEqual(describeMixChanges(mix([lane("a")]), mix([lane("a", { volume: 0.99 })])), []);
    const many = mix(["a", "b", "c", "d", "e", "f"].map((id) => lane(id)));
    assert.equal(describeMixChanges(mix([]), many).length, 4);
  });
});
