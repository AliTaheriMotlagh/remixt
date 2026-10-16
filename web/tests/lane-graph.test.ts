// A lane's signal path and how its audio is scheduled (audioGraph.ts),
// against a fake AudioContext that records what's connected to what and
// when each source starts:
//
// - the costly stages (drive, compressor, reverb) are only in the path
//   while they're on, and lanes with the same reverb share one;
// - a stand-in window plays just its stretch of the timeline, read from
//   its own audio, crossfaded at its seams; windowRange says what that
//   stretch needs rendered.
//
//   node --import ./tests/support/register.mjs --test tests/lane-graph.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { WINDOW_SEAM, createLaneChain, scheduleLane, windowRange, type LaneWindow } from "../src/lib/client/audioGraph.ts";
import { DEFAULT_FX, type LaneFx, type StudioLane } from "../src/lib/client/studioStore.ts";

type Event = [string, number, number?];

class FakeParam {
  value = 1;
  events: Event[] = [];
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push(["set", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push(["ramp", v, t]);
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {}
}

class FakeNode {
  kind: string;
  outputs = new Set<FakeNode>();
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  delayTime = new FakeParam();
  pan = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  type = "";
  oversample = "";
  curve: unknown = null;
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started: { when: number; offset: number; duration: number } | null = null;
  constructor(kind: string) {
    this.kind = kind;
  }
  connect(target: FakeNode) {
    this.outputs.add(target);
    return target;
  }
  disconnect(target?: FakeNode) {
    if (!target) this.outputs.clear();
    else if (!this.outputs.delete(target)) throw new Error("not connected");
  }
  start(when: number, offset: number, duration: number) {
    this.started = { when, offset, duration };
  }
  stop() {}
}

class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  made: FakeNode[] = [];
  private node(kind: string) {
    const n = new FakeNode(kind);
    this.made.push(n);
    return n;
  }
  createGain = () => this.node("gain");
  createBiquadFilter = () => this.node("filter");
  createWaveShaper = () => this.node("shaper");
  createDynamicsCompressor = () => this.node("compressor");
  createChannelSplitter = () => this.node("splitter");
  createChannelMerger = () => this.node("merger");
  createDelay = () => this.node("delay");
  createStereoPanner = () => this.node("panner");
  createConvolver = () => this.node("convolver");
  createBufferSource = () => this.node("source");
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c: number) => data[c] };
  }
}

const buffer = (seconds: number) => ({ duration: seconds, length: seconds * 48000, sampleRate: 48000, numberOfChannels: 2 }) as unknown as AudioBuffer;

function lane(fx: Partial<LaneFx> = {}, extra: Partial<StudioLane> = {}): StudioLane {
  return {
    laneId: "l1",
    stemId: "s1",
    kind: "vocals",
    trackTitle: "Song",
    artistName: "Artist",
    volume: 1,
    muted: false,
    solo: false,
    peaks: [],
    originalDuration: 120,
    duration: 120,
    offsetSeconds: 0,
    bpm: 100,
    musicalKey: null,
    pitchSemitones: 0,
    tempoRatio: 1,
    fx: { ...DEFAULT_FX, ...fx },
    clips: null,
    xfade: null,
    automation: {},
    ...extra,
  };
}

/** Whether `to` is reachable from `from` through the graph. */
function reaches(from: FakeNode, to: FakeNode, seen = new Set<FakeNode>()): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return [...from.outputs].some((n) => reaches(n, to, seen));
}

describe("a lane's signal path", () => {
  test("drive, the compressor and the reverb are only in the path while they're on", () => {
    const ctx = new FakeContext();
    const master = new FakeNode("master");
    const chain = createLaneChain(ctx as unknown as BaseAudioContext, lane(), 100, master as unknown as AudioNode);
    const input = chain.input as unknown as FakeNode;
    const of = (kind: string) => ctx.made.filter((n) => n.kind === kind);
    assert.ok(reaches(input, master), "the lane plays into the master");
    assert.equal(reaches(input, of("shaper")[0]), false, "no drive: the shaper isn't fed");
    assert.equal(reaches(input, of("compressor")[0]), false, "no compressor: it isn't fed");
    assert.equal(of("convolver").length, 0, "no reverb: none made");

    chain.update(lane({ drive: 0.4, compress: true, reverb: 0.3 }), 100);
    assert.ok(reaches(input, of("shaper")[0]));
    assert.ok(reaches(input, of("compressor")[0]));
    assert.equal(of("convolver").length, 1);
    assert.ok(reaches(input, of("convolver")[0]));
    assert.ok(reaches(of("convolver")[0], master), "the reverb plays into the master");
  });

  test("lanes with the same room size share one reverb", () => {
    const ctx = new FakeContext();
    const master = new FakeNode("master") as unknown as AudioNode;
    const wet = lane({ reverb: 0.3, reverbSize: 2 });
    createLaneChain(ctx as unknown as BaseAudioContext, wet, 100, master);
    createLaneChain(ctx as unknown as BaseAudioContext, { ...wet, laneId: "l2" }, 100, master);
    createLaneChain(ctx as unknown as BaseAudioContext, lane({ reverb: 0.3, reverbSize: 4 }, { laneId: "l3" }), 100, master);
    assert.equal(ctx.made.filter((n) => n.kind === "convolver").length, 2);
  });
});

describe("a stand-in window", () => {
  const chainFor = (ctx: FakeContext) => createLaneChain(ctx as unknown as BaseAudioContext, lane(), 100, new FakeNode("master") as unknown as AudioNode);

  test("a whole lane needs its own audio for the window's stretch, the seam after it included", () => {
    const l = lane({}, { offsetSeconds: 4 });
    assert.deepEqual(windowRange(l, 120, 10, 25), { start: 6, end: 21 + WINDOW_SEAM });
    assert.equal(windowRange(l, 120, 0, 3), null, "before the lane starts: nothing to render");
  });

  test("an arranged lane needs the span of what its clips read in the window", () => {
    // At speed 2 a clip from stem 40–60 s reads lane audio 20–30 s.
    const l = lane({}, { tempoRatio: 2, clips: [{ from: 40, to: 60, at: 0 }, { from: 0, to: 20, at: 40 }] });
    // The window 0–5 s on the timeline plays only the first clip: lane audio 20–25 s.
    const range = windowRange(l, 60, 0, 5)!;
    assert.equal(range.start, 20);
    assert.ok(Math.abs(range.end - (25 + WINDOW_SEAM)) < 1e-9);
    // 8–25 s plays the end of the first (28–30) and the start of the second (lane 0–5).
    assert.deepEqual(windowRange(l, 60, 8, 25), { start: 0, end: 30 });
  });

  test("it plays its stretch of the timeline from its own audio, faded in and out at the seams", () => {
    const ctx = new FakeContext();
    const chain = chainFor(ctx);
    const l = lane({}, { offsetSeconds: 0 });
    const own = buffer(16);
    // Lane audio from 9.5 s (a little before the window, for the stretcher to settle) on.
    const window: LaneWindow = { from: 10, to: 25, buffer: own, bufferStart: 9.5 };
    const sources = scheduleLane({
      ctx: ctx as unknown as BaseAudioContext,
      lane: l,
      buffer: buffer(120),
      chain,
      startTime: 100,
      playhead: 5,
      window,
      laneLength: 120,
      keepFade: true,
    });
    assert.equal(sources.length, 1);
    const source = sources[0] as unknown as FakeNode;
    assert.equal(source.buffer, own);
    // Timeline 10 s is 5 s after the playhead: heard at 105, read 0.5 s into its audio, up to the seam past 25 s.
    assert.deepEqual(source.started, { when: 105, offset: 0.5, duration: 15 + WINDOW_SEAM });
    const seam = [...source.outputs][0];
    assert.deepEqual(seam.gain.events, [
      ["set", 0, 105],
      ["ramp", 1, 105 + WINDOW_SEAM],
      ["set", 1, 120],
      ["ramp", 0, 120 + WINDOW_SEAM],
    ]);
  });

  test("without a window, a lane is one source from the playhead, as before", () => {
    const ctx = new FakeContext();
    const chain = chainFor(ctx);
    const sources = scheduleLane({ ctx: ctx as unknown as BaseAudioContext, lane: lane(), buffer: buffer(120), chain, startTime: 50, playhead: 30 });
    assert.equal(sources.length, 1);
    assert.deepEqual((sources[0] as unknown as FakeNode).started, { when: 50, offset: 30, duration: 90 });
    assert.ok((sources[0] as unknown as FakeNode).outputs.has(chain.input as unknown as FakeNode));
  });
});
