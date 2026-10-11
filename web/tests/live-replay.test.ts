// Replays of live sessions, the pure half (lib/liveReplay.ts): which stage
// states are worth keeping, and where the host was at any moment.
//
//   node --import ./tests/support/register.mjs --test tests/live-replay.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { indexAt, positionAt, stateChanged, type ReplayState } from "../src/lib/liveReplay.ts";

const lanes = [{ muted: false, solo: false, volume: 1 }];

describe("stateChanged", () => {
  test("the first state is always kept", () => {
    assert.equal(stateChanged(null, { playing: false, position: 0, lanes: [] }, 0), true);
  });

  test("a keyframe that agrees with the clock adds nothing", () => {
    const prev = { playing: true, position: 10, lanes };
    assert.equal(stateChanged(prev, { playing: true, position: 13.2, lanes }, 3), false);
    assert.equal(stateChanged({ ...prev, playing: false }, { playing: false, position: 10, lanes }, 30), false);
  });

  test("play, pause, seeks, stems, notes and selections are kept", () => {
    const prev = { playing: true, position: 10, lanes };
    assert.equal(stateChanged(prev, { playing: false, position: 12, lanes }, 2), true);
    assert.equal(stateChanged(prev, { playing: true, position: 40, lanes }, 2), true);
    assert.equal(stateChanged(prev, { playing: true, position: 12, lanes: [{ muted: true, solo: false, volume: 1 }] }, 2), true);
    assert.equal(stateChanged(prev, { playing: true, position: 12, lanes, note: "Drop!" }, 2), true);
    assert.equal(stateChanged(prev, { playing: true, position: 12, lanes, selected: ["a"] }, 2), true);
  });
});

describe("positionAt", () => {
  const states: ReplayState[] = [
    { t: 5, state: { playing: true, position: 0, lanes }, remixId: "r" },
    { t: 20, state: { playing: false, position: 15, lanes }, remixId: "r" },
    { t: 30, state: { playing: true, position: 60, lanes }, remixId: "r" },
  ];

  test("finds the state in force", () => {
    assert.equal(indexAt(states, 0), -1);
    assert.equal(indexAt(states, 5), 0);
    assert.equal(indexAt(states, 25), 1);
    assert.equal(indexAt(states, 99), 2);
  });

  test("runs on while playing, holds while paused, jumps on a seek", () => {
    assert.equal(positionAt(states, 2), 0);
    assert.equal(positionAt(states, 12), 7);
    assert.equal(positionAt(states, 25), 15);
    assert.equal(positionAt(states, 31.5), 61.5);
  });
});
