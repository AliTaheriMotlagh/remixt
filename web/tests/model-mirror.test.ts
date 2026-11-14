// This app's copy of the in-browser models (lib/modelMirror.ts,
// lib/client/modelCache.ts): for browsers that can't reach Hugging Face or
// GitHub, the model comes a slice at a time, and must arrive byte for byte.
//
//   node --import ./tests/support/register.mjs --test tests/model-mirror.test.ts

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import { MIRROR_SLICE_BYTES, MODEL_SIZE_HEADER, mirrorFor, SPLITTER_MODEL_URL } from "../src/lib/modelMirror.ts";
import { slicedDownload } from "../src/lib/client/modelCache.ts";

describe("the model mirror", () => {
  test("only the known models have a mirror, and only when they come from elsewhere", () => {
    assert.equal(mirrorFor(SPLITTER_MODEL_URL, "https://remixt.app"), "https://remixt.app/api/model/htdemucs.onnx");
    assert.equal(mirrorFor("https://example.com/other.onnx", "https://remixt.app"), null);
    assert.equal(mirrorFor("/models/local.onnx", "https://remixt.app"), null);
  });

  test("a model fetched in slices arrives whole, even when slices fail on the way", async () => {
    const model = randomBytes(MIRROR_SLICE_BYTES * 3 + 1234);
    const failures = new Set([2]);
    const asked: number[] = [];
    const fetchSlice = async (url: string) => {
      const part = Number(new URL(url).searchParams.get("part"));
      asked.push(part);
      if (failures.delete(part)) return new Response("busy", { status: 502 });
      const bytes = model.subarray(part * MIRROR_SLICE_BYTES, (part + 1) * MIRROR_SLICE_BYTES);
      return new Response(bytes, { headers: { [MODEL_SIZE_HEADER]: String(model.length) } });
    };
    const progress: number[] = [];
    const got = await slicedDownload("https://remixt.app/api/model/htdemucs.onnx", (loaded) => progress.push(loaded), fetchSlice);
    assert.ok(Buffer.from(got).equals(model));
    assert.equal(progress.at(-1), model.length);
    assert.deepEqual(asked.sort(), [0, 1, 2, 2, 3]);
  });
});
