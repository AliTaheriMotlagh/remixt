// uploadStems (lib/client/splitter.ts): a split song's stems go up several
// at a time, and when one is refused the rest stop taking new stems — the
// track is abandoned, so they shouldn't keep uploading into it.
//
//   node --test tests/stem-upload.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FinalUploadError, type Send, type UploadTarget } from "../src/lib/client/directUpload.ts";
import { uploadStems } from "../src/lib/client/splitter.ts";
import type { SplitOutput, SplitResult } from "../src/lib/client/splitterProtocol.ts";

const KINDS: SplitOutput[] = ["vocals", "beat", "drums", "bass", "other"];

function splitResult(): SplitResult {
  const mp3 = Object.fromEntries(KINDS.map((kind) => [kind, new Uint8Array(1000).fill(1)]));
  return { mp3: mp3 as SplitResult["mp3"], peaks: { vocals: [], beat: [] }, bpm: null };
}

function uploadTargets(): Record<string, UploadTarget> {
  return Object.fromEntries(KINDS.map((kind) => [kind, { type: "put", url: `/stems/${kind}`, headers: {} }]));
}

const kindOf = (url: string) => url.split("/").pop()!;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("uploading a song's stems", () => {
  test("every stem goes up, four at a time", async () => {
    const requested: string[] = [];
    let inFlight = 0;
    let most = 0;
    const send: Send = async (request) => {
      requested.push(kindOf(request.url));
      inFlight++;
      most = Math.max(most, inFlight);
      await pause(20);
      inFlight--;
      return { status: 200, text: "" };
    };

    await uploadStems(uploadTargets(), splitResult(), () => {}, send);

    assert.deepEqual([...requested].sort(), [...KINDS].sort());
    assert.equal(most, 4);
  });

  test("a refused stem stops the rest from starting", async () => {
    const requested: string[] = [];
    const send: Send = async (request) => {
      const kind = kindOf(request.url);
      requested.push(kind);
      if (kind === "drums") return { status: 403, text: "" };
      await pause(20);
      return { status: 200, text: "" };
    };

    await assert.rejects(uploadStems(uploadTargets(), splitResult(), () => {}, send), FinalUploadError);
    // Let the stems that were already going finish; none of them should
    // have started the one still waiting.
    await pause(100);

    assert.ok(!requested.includes("other"), `started after the failure: ${requested.join(", ")}`);
  });
});
