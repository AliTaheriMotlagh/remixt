// What browsers share about a stem (lib/stemResults.ts): the beat model's
// beats and the Studio's analysis, packed to go to the server and back.
// What comes back must be what went in, and anything malformed — which
// the server would otherwise hand to everyone — must be turned away.
//
//   node --import ./tests/support/register.mjs --test tests/stem-results.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { encodeBeats, isAnalysisPack, pack, parseBeats, unpack } from "../src/lib/stemResults.ts";
import { packAnalysis, unpackAnalysis, type StemAnalysis } from "../src/lib/client/analysis.ts";

function ramp(length: number, scale = 1) {
  return Float32Array.from({ length }, (_, i) => (i % 97) * scale);
}

function analysis(vocal: boolean): StemAnalysis {
  return {
    key: { tonic: 9, mode: "minor" },
    keyConfidence: 0.42,
    onsets: ramp(5000, 0.01),
    lowOnsets: ramp(5000, 0.02),
    energy: ramp(5000, 0.001),
    onsetRate: 11025 / 128,
    entry: 3.25,
    loudness: 0.12,
    bpmEstimate: 92.5,
    chroma: ramp(12 * 300, 1 / 97),
    chromaRate: 11025 / 2048,
    ...(vocal
      ? { melody: { midi: ramp(2500, 0.5), confidence: ramp(2500, 0.01), rate: 11025 / 256, offset: 0.023, tuning: -0.125 } }
      : {}),
  };
}

describe("packed arrays", () => {
  test("come back as they went in", () => {
    const arrays = { a: Float32Array.from([1.5, -2, 3e-7]), b: new Float32Array(0), c: ramp(1001) };
    const out = unpack(pack({ header: { x: 1, name: "é" }, arrays }));
    assert.ok(out);
    assert.deepEqual(out.header, { x: 1, name: "é" });
    for (const name of Object.keys(arrays) as (keyof typeof arrays)[]) assert.deepEqual(out.arrays[name], arrays[name]);
  });

  test("anything cut short, padded or not a pack is turned away", () => {
    const bytes = pack({ header: {}, arrays: { a: ramp(100) } });
    assert.equal(unpack(bytes.subarray(0, bytes.length - 4)), null);
    assert.equal(unpack(Uint8Array.from([...bytes, 0, 0, 0, 0])), null);
    assert.equal(unpack(new TextEncoder().encode("hello world, not a pack")), null);
    const nan = pack({ header: {}, arrays: { a: Float32Array.from([1, NaN]) } });
    assert.equal(unpack(nan), null);
  });
});

describe("an analysis", () => {
  for (const vocal of [false, true]) {
    test(`${vocal ? "a vocal's" : "a beat's"} comes back the same, for the same audio`, () => {
      const a = analysis(vocal);
      const bytes = packAnalysis(a, 180.5, vocal);
      assert.ok(isAnalysisPack(bytes));
      assert.deepEqual(unpackAnalysis(bytes, 180.501, vocal), a);
    });
  }

  test("isn't used for audio of another length — another browser decoding the MP3 differently", () => {
    assert.equal(unpackAnalysis(packAnalysis(analysis(false), 180.5, false), 180.53, false), null);
  });

  test("isn't used when it was analysed the other way (a vocal's key also comes from its melody)", () => {
    assert.equal(unpackAnalysis(packAnalysis(analysis(false), 180, false), 180, true), null);
    assert.equal(unpackAnalysis(packAnalysis(analysis(true), 180, true), 180, false), null);
  });

  test("the server turns away one with parts missing or wrong", () => {
    const whole = unpack(packAnalysis(analysis(false), 100, false))!;
    const { onsets: _onsets, ...noOnsets } = whole.arrays;
    void _onsets;
    const bad = [
      pack({ header: { seconds: 10 }, arrays: { onsets: ramp(10) } }),
      packAnalysis({ ...analysis(false), chroma: ramp(13) }, 100, false),
      packAnalysis({ ...analysis(false), key: { tonic: 14, mode: "major" } }, 100, false),
      packAnalysis({ ...analysis(false), entry: -1 }, 100, false),
      pack({ header: whole.header, arrays: noOnsets }),
      pack({ header: whole.header, arrays: { ...whole.arrays, extra: ramp(4) } }),
    ];
    for (const bytes of bad) assert.equal(isAnalysisPack(bytes), false);
  });
});

describe("beats", () => {
  test("come back as they went in", () => {
    const beats = { seconds: 30, beats: [0.5, 1, 1.5, 2], downbeats: [0.5, 2] };
    assert.deepEqual(parseBeats(encodeBeats(beats)), beats);
  });

  test("out of order, past the end, or not numbers are turned away", () => {
    const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
    assert.equal(parseBeats(enc({ seconds: 30, beats: [2, 1], downbeats: [] })), null);
    assert.equal(parseBeats(enc({ seconds: 30, beats: [1, 40], downbeats: [] })), null);
    assert.equal(parseBeats(enc({ seconds: 30, beats: ["1"], downbeats: [] })), null);
    assert.equal(parseBeats(enc({ beats: [1], downbeats: [] })), null);
    assert.equal(parseBeats(enc({ seconds: 30, beats: [1], downbeats: [1, 2] })), null);
    assert.equal(parseBeats(new TextEncoder().encode("{")), null);
  });
});
