// mixdown.ts on a phone: the export rendered a piece at a time and each
// piece encoded as it comes (WAV or MP3), so the whole mix is never in
// memory at once — what got the page reloaded part way through an export.
//
// Web Audio doesn't exist in Node, so the offline context here is a stand-in
// whose "render" is a fixed function of the timeline: the pieces, joined,
// must then be exactly the one-go render. (The real graph was checked the
// same way in Chrome: within −56 dB of the one-go render.)
//
//   node --import ./tests/support/register.mjs --test tests/phone-export.test.ts

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { overall } from "../src/lib/client/exportJob.ts";
import { encodeWav, pieceGrid, renderInPieces, ringSeconds, wavSink, type Bounce } from "../src/lib/client/mixdown.ts";
import { openMp3Stream, type PcmSink } from "../src/lib/client/mp3.ts";
import { createMp3Stream, encodePcmToMp3 } from "../src/lib/client/mp3Core.ts";
import { DEFAULT_FX, type StudioLane } from "../src/lib/client/studioStore.ts";

const RATE = 44100;

/** What the stand-in renders at timeline frame `frame`. */
const sound = (frame: number, channel: number) => Math.sin(frame / 97 + channel) * 0.5 + ((frame * 7919) % 1000) / 4000;

class FakeOfflineContext {
  static made: FakeOfflineContext[] = [];
  length: number;
  sampleRate: number;
  /** The timeline frame this context's time 0 plays, set by the bounce's build. */
  from = 0;
  constructor({ length, sampleRate }: { length: number; sampleRate: number }) {
    this.length = length;
    this.sampleRate = sampleRate;
    FakeOfflineContext.made.push(this);
  }
  suspend() {
    return new Promise<void>(() => {});
  }
  resume() {
    return Promise.resolve();
  }
  async startRendering() {
    const channels = [0, 1].map((c) => Float32Array.from({ length: this.length }, (_, k) => sound(this.from + k, c)));
    return { length: this.length, numberOfChannels: 2, sampleRate: this.sampleRate, getChannelData: (c: number) => channels[c] };
  }
}

function bounce(start: number, seconds: number, { ring = 4, sourceRates = [48000] } = {}): Bounce {
  return {
    start,
    seconds,
    sampleRate: RATE,
    ring,
    sourceRates,
    build: (ctx, playhead) => {
      (ctx as unknown as FakeOfflineContext).from = Math.round(playhead * RATE);
    },
  };
}

/** A sink that keeps what it's given. */
function collector() {
  const left: Float32Array[] = [];
  const right: Float32Array[] = [];
  const sink: PcmSink = {
    write: async (l, r) => {
      left.push(l);
      right.push(r);
    },
    finish: async () => new Blob(),
    cancel: () => {},
  };
  const joined = (parts: Float32Array[]) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  return { sink, left, right, joined };
}

const original = (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
before(() => {
  (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = FakeOfflineContext;
});
after(() => {
  (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext = original;
});

describe("rendering in pieces", () => {
  test("the pieces join into exactly the one-go render, start to end", async () => {
    FakeOfflineContext.made = [];
    const start = 17.25;
    const seconds = 131.7;
    const { sink, left, right, joined } = collector();
    await renderInPieces(bounce(start, seconds), sink);

    const total = Math.ceil(seconds * RATE);
    const first = Math.round(start * RATE);
    const l = joined(left);
    const r = joined(right);
    assert.equal(l.length, total);
    assert.equal(r.length, total);
    for (let k = 0; k < total; k++) {
      if (l[k] !== Math.fround(sound(first + k, 0)) || r[k] !== Math.fround(sound(first + k, 1))) {
        assert.fail(`frame ${k} differs from the one-go render`);
      }
    }
    assert.ok(left.length >= 4, "a two-minute mix is several pieces");
  });

  test("every piece starts on the grid, and only the first has no lead-in", async () => {
    FakeOfflineContext.made = [];
    const { sink, left } = collector();
    await renderInPieces(bounce(0, 150, { ring: 5 }), sink);
    const grid = pieceGrid(RATE, [48000]);
    const ring = Math.ceil((5 * RATE) / grid) * grid;
    let keptFrom = 0;
    for (const [i, ctx] of FakeOfflineContext.made.entries()) {
      const lead = ctx.length - left[i].length;
      assert.equal(lead, i === 0 ? 0 : ring, `piece ${i}'s lead-in`);
      assert.equal(ctx.from + lead, keptFrom, `piece ${i} keeps on from where the last one stopped`);
      assert.equal(keptFrom % grid, 0, `piece ${i} starts on the grid`);
      assert.equal(ctx.from % grid, 0, `piece ${i}'s lead-in starts on the grid`);
      keptFrom += left[i].length;
    }
  });

  test("a long mix never has more than a piece and its lead-in in memory", async () => {
    FakeOfflineContext.made = [];
    let biggestWrite = 0;
    const sink: PcmSink = {
      write: async (l) => void (biggestWrite = Math.max(biggestWrite, l.length)),
      finish: async () => new Blob(),
      cancel: () => {},
    };
    // A five-minute mix with effects ringing for longer than the lead-in cap.
    await renderInPieces(bounce(0, 300, { ring: 30 }), sink);
    const longest = Math.max(...FakeOfflineContext.made.map((c) => c.length));
    // 40 s pieces, a lead-in of at most 12 s, each rounded up to the grid (under half a second).
    assert.ok(longest <= 53 * RATE, `a piece rendered ${(longest / RATE).toFixed(1)} s`);
    assert.ok(biggestWrite <= 41 * RATE, `a piece handed on ${(biggestWrite / RATE).toFixed(1)} s`);
    assert.ok(FakeOfflineContext.made.length >= 7);
  });

  test("progress only goes forward, and ends at 1", async () => {
    const seen: number[] = [];
    const { sink } = collector();
    await renderInPieces(bounce(0, 95), sink, (f) => seen.push(f));
    assert.ok(seen.length >= 3);
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `progress went from ${seen[i - 1]} to ${seen[i]}`);
    assert.equal(seen.at(-1), 1);
  });

  test("cancelling stops it between pieces", async () => {
    const controller = new AbortController();
    let writes = 0;
    const sink: PcmSink = {
      write: async () => {
        writes++;
        controller.abort();
      },
      finish: async () => new Blob(),
      cancel: () => {},
    };
    await assert.rejects(renderInPieces(bounce(0, 200), sink, undefined, controller.signal), (err: Error) => err.name === "AbortError");
    assert.equal(writes, 1);
  });
});

describe("the piece grid", () => {
  test("48 kHz lanes into a 44.1 kHz export: whole render blocks and whole lane samples", () => {
    const grid = pieceGrid(44100, [48000]);
    assert.equal(grid, 18816);
    assert.equal(grid % 128, 0);
    assert.equal((grid * 48000) % 44100, 0);
  });

  test("lanes at the export's own rate need only whole blocks", () => {
    assert.equal(pieceGrid(44100, [44100, 44100]), 128);
  });

  test("an odd rate never makes the grid longer than a second", () => {
    assert.ok(pieceGrid(44100, [44099]) <= 44100);
    assert.ok(pieceGrid(44100, [48000, 44099]) <= 44100);
  });
});

describe("how long the effects ring", () => {
  const lane = (fx: Partial<typeof DEFAULT_FX>) => ({ fx: { ...DEFAULT_FX, ...fx } }) as StudioLane;

  test("a dry mix: just the compressors settling", () => {
    assert.equal(ringSeconds([lane({ reverb: 0, delay: 0 })], 120), 1);
  });

  test("the longest reverb", () => {
    assert.equal(ringSeconds([lane({ reverb: 0.3, reverbSize: 2 }), lane({ reverb: 0.2, reverbSize: 4.5 })], 120), 5.5);
  });

  test("echoes until they're 60 dB down", () => {
    const ring = ringSeconds([lane({ delay: 0.3, delayDivision: "free", delayTime: 0.5, delayFeedback: 0.5 })], 120);
    // 0.5^10 ≈ 0.001: ten more echoes after the first, half a second apart.
    assert.ok(Math.abs(ring - (0.5 * (1 + Math.log(0.001) / Math.log(0.5)) + 1)) < 1e-9);
    assert.ok(ring > 5 && ring < 7);
  });

  test("a single echo with no feedback", () => {
    assert.equal(ringSeconds([lane({ delay: 0.3, delayDivision: "free", delayTime: 0.4, delayFeedback: 0 })], 120), 1.4);
  });
});

describe("WAV a piece at a time", () => {
  test("is byte for byte the WAV written in one go", async () => {
    const frames = 3 * RATE + 77;
    const channels = [0, 1].map((c) => Float32Array.from({ length: frames }, (_, k) => sound(k, c) * 1.2));
    const whole = encodeWav({ numberOfChannels: 2, length: frames, sampleRate: RATE, getChannelData: (c: number) => channels[c] } as AudioBuffer);

    const sink = wavSink(RATE);
    for (let at = 0; at < frames; at += RATE) {
      await sink.write(channels[0].slice(at, at + RATE), channels[1].slice(at, at + RATE));
    }
    const pieces = await sink.finish();
    assert.equal(pieces.type, "audio/wav");
    assert.deepEqual(new Uint8Array(await pieces.arrayBuffer()), new Uint8Array(await whole.arrayBuffer()));
  });
});

describe("MP3 a piece at a time", () => {
  const frames = 5 * RATE + 333;
  const left = Float32Array.from({ length: frames }, (_, k) => sound(k, 0) * 0.6);
  const right = Float32Array.from({ length: frames }, (_, k) => sound(k, 1) * 0.6);

  test("is the same MP3 as encoding it all at once", async () => {
    const once = await encodePcmToMp3({ left, right, sampleRate: RATE, bitrate: 256 });
    const stream = await createMp3Stream({ sampleRate: RATE, bitrate: 256 });
    // Pieces that don't line up with MP3 frames (1152 samples).
    for (let at = 0; at < frames; at += 40_000) stream.encode(left.slice(at, at + 40_000), right.slice(at, at + 40_000));
    const pieces = stream.finish();
    assert.equal(pieces[0], 0xff);
    assert.equal(pieces[1] & 0xe0, 0xe0, "starts on an MP3 frame");
    assert.deepEqual(pieces, once);
  });

  test("works without a worker (encoding on the page instead)", async () => {
    assert.equal(typeof (globalThis as { Worker?: unknown }).Worker, "undefined", "Node has no Web Worker: this is the fallback");
    const sink = await openMp3Stream({ sampleRate: RATE });
    await sink.write(left.slice(0, 100_000), right.slice(0, 100_000));
    await sink.write(left.slice(100_000), right.slice(100_000));
    const blob = await sink.finish();
    sink.cancel();
    assert.equal(blob.type, "audio/mpeg");
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), await encodePcmToMp3({ left, right, sampleRate: RATE, bitrate: 256 }));
  });

  test("a cancelled export stops the encoder", async () => {
    const controller = new AbortController();
    const sink = await openMp3Stream({ sampleRate: RATE, signal: controller.signal });
    controller.abort();
    await assert.rejects(sink.write(left.slice(0, 1000), right.slice(0, 1000)), (err: Error) => err.name === "AbortError");
    await assert.rejects(openMp3Stream({ sampleRate: RATE, signal: controller.signal }), (err: Error) => err.name === "AbortError");
  });
});

describe("export progress", () => {
  test("a computer: rendering is the first 60%, encoding the rest", () => {
    assert.equal(overall("Rendering mix…", 0.5), 0.3);
    assert.ok(Math.abs(overall("Encoding MP3…", 1)! - 1) < 1e-9);
  });

  test("a phone renders and encodes together: that's the whole bar", () => {
    assert.ok(Math.abs(overall("Rendering mix and encoding…", 0.5)! - 0.49) < 1e-9);
    assert.ok(Math.abs(overall("Rendering the lane and encoding…", 1)! - 0.98) < 1e-9);
  });

  test("stages without a measure don't move the bar", () => {
    assert.equal(overall("Finishing the file…", undefined), null);
    assert.equal(overall("Loading stems…", undefined), null);
  });
});
