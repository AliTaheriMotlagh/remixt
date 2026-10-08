// The high-quality stretcher without a whole extra copy of the stem
// (pitchTempo.ts): the stem is fed in pieces as the render goes, and the
// worklet's read across two pieces is fixed as it's copied to public/
// (scripts/stretchFix.mjs). Checked in Chrome as well: renders sample for
// sample the same as feeding the whole stem at once.
//
//   node --import ./tests/support/register.mjs --test tests/stretch-memory.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, test } from "node:test";
import { feedAsRendered, type StretchInput } from "../src/lib/client/pitchTempo.ts";
import { fixStretchWorklet } from "../scripts/stretchFix.mjs";

const library = fs.readFileSync(new URL("../node_modules/signalsmith-stretch/SignalsmithStretch.mjs", import.meta.url), "utf8");

/**
 * The worklet's own code that fills its input window from the buffers it
 * was given, cut out of `source` and run on its own: returns the window
 * that ends at input sample `end`.
 */
function readWindow(source: string, buffers: Float32Array[], firstSample: number, end: number, windowLength: number) {
  const from = source.indexOf("let blockSamples = 0;");
  const to = source.indexOf("if (blockSamples < this.bufferLength)", from);
  assert.ok(from > 0 && to > from, "found the worklet's read");
  const window = new Float32Array(windowLength).fill(NaN);
  const run = new Function("buffers", "inputSamplesEnd", source.slice(from, to) + "\nreturn blockSamples;");
  const filled = run.call({ bufferLength: windowLength, audioBuffersStart: firstSample, audioBuffers: buffers.map((b) => [b]) }, [window], end);
  if (filled < windowLength) window.fill(0, filled);
  return window;
}

describe("the stretcher's worklet, as copied to public/", () => {
  test("the installed version gets the fix", () => {
    const fixed = fixStretchWorklet(library);
    assert.notEqual(fixed, library);
    assert.ok(fixed.includes("audioSamples = bufferEnd;"));
    assert.equal(fixStretchWorklet(fixed), fixed, "fixing twice changes nothing");
  });

  test("a version it doesn't know stops the build rather than ship unchecked", () => {
    assert.throws(() => fixStretchWorklet("export default function SignalsmithStretch() {}"), /signalsmith-stretch changed/);
  });

  // The stem 0…999 in pieces of 300 (the last one shorter), as pitchTempo feeds it.
  const stem = Float32Array.from({ length: 1000 }, (_, i) => i);
  const pieces = [0, 300, 600, 900].map((at) => stem.slice(at, at + 300));
  const expected = (end: number, length: number) => Float32Array.from({ length }, (_, k) => Math.max(0, end - length + k));

  test("fixed: a window across two pieces reads the stem as it is", () => {
    const fixed = fixStretchWorklet(library);
    for (const end of [250, 300, 301, 350, 599, 610, 905, 1000]) {
      assert.deepEqual(readWindow(fixed, pieces, 0, end, 64), expected(end, 64), `window ending at ${end}`);
    }
  });

  test("fixed: after the start was dropped, it still reads from the right place", () => {
    const fixed = fixStretchWorklet(library);
    assert.deepEqual(readWindow(fixed, pieces.slice(1), 300, 640, 64), expected(640, 64));
  });

  test("as published, it reads across two pieces wrongly (why the fix is there)", () => {
    // Wrong samples, or (here) reading past the end of a piece and throwing.
    let read: Float32Array | null = null;
    try {
      read = readWindow(library, pieces, 0, 320, 64);
    } catch (err) {
      assert.ok(err instanceof RangeError);
    }
    if (read) assert.notDeepEqual(read, expected(320, 64));
    // One whole buffer — how it was fed before — never crosses, and reads right.
    assert.deepEqual(readWindow(library, [stem], 0, 320, 64), expected(320, 64));
  });
});

/** A stand-in render: runs up to each pause, waits for the resume, and lets the test look at the stretcher there. */
class FakeRender {
  pauses: { t: number; reached: () => void }[] = [];
  private resumed: (() => void) | null = null;
  readonly length: number;
  readonly sampleRate: number;
  constructor(length: number, sampleRate: number) {
    this.length = length;
    this.sampleRate = sampleRate;
  }
  suspend(t: number) {
    return new Promise<void>((reached) => this.pauses.push({ t, reached }));
  }
  resume() {
    this.resumed?.();
    return Promise.resolve();
  }
  /** Renders to the end; `atPause(t, next)` sees the stretcher once it's been fed at each pause. */
  async run(atPause: (t: number, next: number) => void) {
    const pauses = [...this.pauses].sort((a, b) => a.t - b.t);
    atPause(0, pauses[0]?.t ?? this.length / this.sampleRate);
    for (const [i, pause] of pauses.entries()) {
      const resumed = new Promise<void>((r) => (this.resumed = r));
      pause.reached();
      await resumed;
      atPause(pause.t, pauses[i + 1]?.t ?? this.length / this.sampleRate);
    }
  }
}

/** A stand-in stretcher that keeps what it's handed, like the real one (absolute input times). */
function fakeStretcher(rate: number) {
  const held: { start: number; data: Float32Array[] }[] = [];
  let end = 0;
  const node: StretchInput & { fail?: boolean } = {
    addBuffers: async (buffers) => {
      if (node.fail) throw new Error("the worklet went away");
      held.push({ start: end, data: buffers });
      end += buffers[0].length;
      return end / rate;
    },
    dropBuffers: async (toSeconds) => {
      const to = toSeconds * rate;
      while (held.length && held[0].start + held[0].data[0].length <= to) held.shift();
      return {};
    },
  };
  return { node, held, end: () => end };
}

function stemBuffer(seconds: number, rate: number) {
  const left = Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => i);
  const right = left.map((v) => -v);
  return { length: left.length, sampleRate: rate, numberOfChannels: 2, duration: seconds, getChannelData: (c: number) => (c ? right : left) } as unknown as AudioBuffer;
}

describe("feeding the stretcher as it renders", () => {
  const RATE = 48000;

  for (const tempo of [0.5, 0.9, 1.25, 2.5]) {
    test(`tempo ${tempo}: the stem is there wherever it reads, and never all of it at once`, async () => {
      const source = stemBuffer(240, RATE);
      const ctx = new FakeRender(Math.round(source.length / tempo), RATE);
      const { node, held, end } = fakeStretcher(RATE);
      const feeding = await feedAsRendered(ctx, node, source, tempo);
      let mostHeld = 0;
      await ctx.run((t, next) => {
        const first = held[0]?.start ?? end();
        // It reads a little behind and ahead of the input position (window and look-ahead: well under a second).
        const needFrom = Math.max(0, (t * tempo - 0.5) * RATE);
        const needTo = Math.min(source.length, (next * tempo + 0.5) * RATE);
        assert.ok(first <= needFrom, `at ${t} s it had dropped the stem it still reads`);
        assert.ok(end() >= needTo, `at ${t} s it hadn't been given the stem it reads next`);
        mostHeld = Math.max(mostHeld, end() - first);
      });
      feeding.check();
      assert.equal(end(), source.length, "the whole stem went in");
      // A few pieces' worth (it lets go of whole pieces only), against the whole four minutes it used to get.
      assert.ok(mostHeld / RATE < 3 * 4 * tempo + 5, `held ${(mostHeld / RATE).toFixed(1)} s of the stem at once`);
      assert.ok(mostHeld < source.length / 4);
    });
  }

  test("it goes in as the stem is, in order, nothing left out or repeated", async () => {
    const source = stemBuffer(30, RATE);
    const ctx = new FakeRender(Math.round(source.length / 1.1), RATE);
    const pieces: Float32Array[] = [];
    const node: StretchInput = {
      addBuffers: async (buffers) => {
        pieces.push(buffers[0]);
        return 0;
      },
      dropBuffers: async () => ({}),
    };
    await feedAsRendered(ctx, node, source, 1.1);
    await ctx.run(() => {});
    const joined = pieces.flatMap((p) => [...p]);
    assert.equal(joined.length, source.length);
    assert.ok(joined.every((v, i) => v === i));
  });

  test("a short clip goes in at once, with no pauses", async () => {
    const source = stemBuffer(2, RATE);
    const ctx = new FakeRender(source.length, RATE);
    const { node, end } = fakeStretcher(RATE);
    await feedAsRendered(ctx, node, source, 1);
    assert.equal(ctx.pauses.length, 0);
    assert.equal(end(), source.length);
  });

  test("if feeding fails part way, the render is thrown away (the classic engine takes over)", async () => {
    const source = stemBuffer(60, RATE);
    const ctx = new FakeRender(source.length, RATE);
    const { node } = fakeStretcher(RATE);
    const feeding = await feedAsRendered(ctx, node, source, 1);
    node.fail = true;
    await ctx.run(() => {});
    assert.throws(() => feeding.check(), /the worklet went away/);
  });
});
