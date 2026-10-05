// The DJ engine's transport maths (position, loops, tempo, cue, sync, phase
// setup) against a fake AudioContext: no sound, but every node the engine
// builds and the clock it schedules on are simulated.
//
//   node --import ./tests/support/register.mjs --test tests/dj-engine.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DjEngine } from "../src/lib/client/dj/djEngine.ts";
import { djTrackInfo } from "../src/lib/client/dj/djTrackInfo.ts";
import { derive } from "../src/lib/client/dj/djDerived.ts";
import { MISSIONS } from "../src/lib/client/dj/scenarios.ts";
import type { LoadedTrack } from "../src/lib/client/dj/djTracks.ts";

class FakeParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {}
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  delayTime = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  playbackRate = new FakeParam();
  type = "";
  fftSize = 0;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  buffer: unknown = null;
  onended: (() => void) | null = null;
  startedWith: { when: number; offset: number } | null = null;
  stopped = false;
  connect<T>(n: T) {
    return n;
  }
  disconnect() {}
  start(when = 0, offset = 0) {
    this.startedWith = { when, offset };
  }
  stop() {
    this.stopped = true;
  }
  getFloatTimeDomainData(a: Float32Array) {
    a.fill(0);
  }
}

class FakeContext {
  currentTime = 1;
  sampleRate = 44100;
  state = "running";
  destination = new FakeNode();
  created: FakeNode[] = [];
  constructor() {}
  make() {
    const n = new FakeNode();
    this.created.push(n);
    return n;
  }
  createGain() {
    return this.make();
  }
  createBiquadFilter() {
    return this.make();
  }
  createDynamicsCompressor() {
    return this.make();
  }
  createAnalyser() {
    return this.make();
  }
  createDelay() {
    return this.make();
  }
  createConvolver() {
    return this.make();
  }
  createBufferSource() {
    return this.make();
  }
  createOscillator() {
    return this.make();
  }
  createBuffer(channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length), length };
  }
  async resume() {}
  async close() {}
}

(globalThis as unknown as { window: unknown }).window = { AudioContext: FakeContext };

function track(id: string): LoadedTrack {
  const info = djTrackInfo(id)!;
  const buf = { duration: info.duration } as unknown as AudioBuffer;
  return {
    info,
    stems: { drums: buf, bass: buf, chords: buf, vocal: buf },
    peaks: { drums: new Float32Array(1), bass: new Float32Array(1), chords: new Float32Array(1), vocal: new Float32Array(1) },
    overview: new Float32Array(1),
  };
}

function setup() {
  const engine = new DjEngine();
  const ctx = engine.ctx as unknown as FakeContext;
  return { engine, ctx };
}

describe("transport", () => {
  test("position follows the clock at the tempo-fader rate and survives a tempo change", () => {
    const { engine, ctx } = setup();
    engine.loadTrack("A", track("warehouse-lights"));
    engine.seek("A", 10);
    engine.play("A");
    ctx.currentTime += 0.01 + 2; // started at +0.01
    assert.ok(Math.abs(engine.deckPosition("A") - 12) < 1e-9);
    engine.setTempoPct("A", 8);
    assert.ok(Math.abs(engine.deckPosition("A") - 12) < 1e-9, "no jump when the tempo changes");
    ctx.currentTime += 3;
    assert.ok(Math.abs(engine.deckPosition("A") - (12 + 3 * 1.08)) < 1e-9);
    engine.dispose();
  });

  test("nudge changes the speed only while held", () => {
    const { engine, ctx } = setup();
    engine.loadTrack("A", track("warehouse-lights"));
    engine.play("A");
    ctx.currentTime += 0.01;
    engine.setBend("A", 1);
    ctx.currentTime += 1;
    engine.setBend("A", 0);
    assert.ok(Math.abs(engine.deckPosition("A") - 1.06) < 1e-9);
    ctx.currentTime += 1;
    assert.ok(Math.abs(engine.deckPosition("A") - 2.06) < 1e-9);
    engine.dispose();
  });

  test("pause remembers the position; play resumes from it", () => {
    const { engine, ctx } = setup();
    engine.loadTrack("A", track("golden-hour"));
    engine.play("A");
    ctx.currentTime += 0.01 + 4;
    engine.pause("A");
    const at = engine.deckPosition("A");
    assert.ok(Math.abs(at - 4) < 1e-9);
    ctx.currentTime += 10;
    assert.equal(engine.deckPosition("A"), at);
    engine.dispose();
  });

  test("a 4-beat loop wraps the position inside the loop", () => {
    const { engine, ctx } = setup();
    const t = track("warehouse-lights");
    const beat = 60 / t.info.bpm;
    engine.loadTrack("A", t);
    engine.seek("A", 16 * beat + 0.2);
    engine.play("A");
    ctx.currentTime += 0.01;
    engine.loopBeats("A", 4);
    const loop = engine.deckState("A").loop;
    assert.ok(loop.active);
    assert.ok(Math.abs(loop.start - 16 * beat) < 1e-9 && Math.abs(loop.end - 20 * beat) < 1e-9);
    ctx.currentTime += 10;
    const pos = engine.deckPosition("A");
    assert.ok(pos >= loop.start && pos < loop.end, `pos ${pos}`);
    engine.loopExit("A");
    const exitedAt = engine.deckPosition("A");
    ctx.currentTime += 1;
    assert.ok(Math.abs(engine.deckPosition("A") - (exitedAt + 1)) < 1e-9);
    engine.dispose();
  });

  test("CUE: while playing returns to the cue point and stops; stopped, it sets the cue", () => {
    const { engine, ctx } = setup();
    engine.loadTrack("A", track("neon-drive"));
    engine.seek("A", 5);
    engine.cueDown("A"); // stopped away from the cue: sets it here and previews
    engine.cueUp("A");
    assert.equal(engine.deckState("A").playing, false);
    assert.ok(Math.abs(engine.deckState("A").cue - 5) < 1e-9);
    engine.play("A");
    ctx.currentTime += 3;
    engine.cueDown("A");
    assert.equal(engine.deckState("A").playing, false);
    assert.ok(Math.abs(engine.deckPosition("A") - 5) < 1e-9);
    engine.dispose();
  });

  test("jumping by beats moves by the track's beat length", () => {
    const { engine } = setup();
    const t = track("island-time");
    engine.loadTrack("A", t);
    engine.seek("A", 10);
    engine.jumpBeats("A", 4);
    assert.ok(Math.abs(engine.deckPosition("A") - (10 + 4 * (60 / 100))) < 1e-9);
    engine.dispose();
  });
});

describe("two decks", () => {
  test("SYNC matches tempo and beat phase", () => {
    const { engine, ctx } = setup();
    engine.loadTrack("A", track("warehouse-lights"));
    engine.loadTrack("B", track("golden-hour"));
    engine.seek("A", 10.3);
    engine.seek("B", 3.7);
    engine.playTogether(["A", "B"]);
    ctx.currentTime += 0.2;
    assert.equal(engine.sync("B"), "ok");
    ctx.currentTime += 0.01;
    const d = derive(engine.snapshot());
    assert.ok(Math.abs(d.tempoDiff) < 0.01, `tempo ${d.tempoDiff}`);
    assert.ok(Math.abs(d.phaseMs) < 2, `phase ${d.phaseMs}`);
    engine.dispose();
  });

  test("SYNC reports a tempo outside the pitch range", () => {
    const { engine } = setup();
    engine.loadTrack("A", track("concrete-run")); // 140
    engine.loadTrack("B", track("midnight-static")); // 92 → needs +52% (or half: 70 → -24%)
    engine.play("A");
    assert.equal(engine.sync("B"), "out-of-range");
    engine.setTempoRange("B", 50);
    assert.equal(engine.sync("B"), "ok");
    engine.dispose();
  });

  test("every mission setup puts the decks where it says", async () => {
    for (const mission of MISSIONS) {
      const { engine, ctx } = setup();
      await engine.applySetup(mission.setup, async (id) => track(id));
      ctx.currentTime += 0.5;
      const snap = engine.snapshot();
      for (const id of ["A", "B"] as const) {
        const want = mission.setup.decks[id];
        assert.equal(!!snap.decks[id].track, !!want, `${mission.id} deck ${id} loaded`);
        if (want) assert.equal(snap.decks[id].playing, !!want.playing, `${mission.id} deck ${id} playing`);
      }
      if (mission.setup.phaseOffsetMs !== undefined && mission.setup.decks.A?.playing && mission.setup.decks.B?.playing) {
        const d = derive(snap);
        assert.ok(Math.abs(d.phaseMs - mission.setup.phaseOffsetMs) < 1.5, `${mission.id}: phase ${d.phaseMs}`);
        assert.ok(Math.abs(d.tempoDiff) < 0.05, `${mission.id}: tempo ${d.tempoDiff}`);
      }
      engine.dispose();
    }
  });

  test("changing missions empties decks the next setup doesn't use", async () => {
    const { engine } = setup();
    await engine.applySetup(MISSIONS[2].setup, async (id) => track(id));
    await engine.applySetup(MISSIONS[4].setup, async (id) => track(id)); // only deck A
    assert.equal(engine.deckState("B").track, null);
    engine.dispose();
  });

  test("brake stops the deck where the slowing platter would have", async () => {
    const { engine, ctx } = setup();
    engine.loadTrack("A", track("warehouse-lights"));
    engine.seek("A", 20);
    engine.play("A");
    ctx.currentTime += 0.01;
    engine.brake("A", 0.05);
    ctx.currentTime += 0.025;
    const mid = engine.deckPosition("A");
    assert.ok(mid > 20 && mid < 20.03);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(engine.deckState("A").playing, false);
    assert.ok(Math.abs(engine.deckState("A").position - (20 + 0.025)) < 1e-6);
    engine.dispose();
  });
});

describe("cleanup", () => {
  test("dispose stops every source and leaves no timers running", () => {
    const { engine, ctx } = setup();
    engine.loadTrack("A", track("warehouse-lights"));
    engine.play("A");
    engine.tapNudge("A", 1);
    engine.sirenOn();
    engine.dispose();
    const sources = ctx.created.filter((n) => n.startedWith);
    assert.ok(sources.length > 0 && sources.every((n) => n.stopped));
  });
});
