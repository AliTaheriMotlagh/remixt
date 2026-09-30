/// <reference lib="webworker" />

// One stem's MP3 encoder, in a worker of its own (started by the splitter's
// worker), so the five stems encode on five cores at once instead of taking
// turns with the splitting itself. PCM arrives a stretch at a time as the
// splitter finishes it; the MP3 goes back when it's asked to finish.

import { createMp3Encoder } from "wasm-media-encoders";
import type { StemBitrate } from "./splitterProtocol";

declare const self: DedicatedWorkerGlobalScope;

export type Mp3StreamRequest =
  /** `skip`: samples to drop from the start (the encoder's delay, see MP3_DELAY). */
  | { type: "start"; sampleRate: number; bitrate: StemBitrate; skip: number }
  | { type: "add"; left: Float32Array; right: Float32Array }
  | { type: "finish" };

export type Mp3StreamResponse =
  | { type: "ready" }
  | { type: "done"; bytes: Uint8Array }
  | { type: "error"; message: string };

type Encoder = Awaited<ReturnType<typeof createMp3Encoder>>;

const CHUNK = 1152 * 64;
let encoder: Encoder | null = null;
let parts: Uint8Array[] = [];
let skip = 0;

function post(message: Mp3StreamResponse, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

async function handle(request: Mp3StreamRequest) {
  switch (request.type) {
    case "start":
      encoder = await createMp3Encoder();
      encoder.configure({ sampleRate: request.sampleRate, channels: 2, bitrate: request.bitrate });
      parts = [];
      skip = request.skip;
      post({ type: "ready" });
      return;
    case "add": {
      if (!encoder) throw new Error("The MP3 encoder wasn't started");
      const from = Math.min(skip, request.left.length);
      skip -= from;
      const left = request.left.subarray(from);
      const right = request.right.subarray(from);
      for (let start = 0; start < left.length; start += CHUNK) {
        const end = Math.min(left.length, start + CHUNK);
        // The encoder owns the returned buffer, hence the copy.
        parts.push(encoder.encode([left.subarray(start, end), right.subarray(start, end)]).slice());
      }
      return;
    }
    case "finish": {
      if (!encoder) throw new Error("The MP3 encoder wasn't started");
      parts.push(encoder.finalize().slice());
      const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
      parts = [];
      post({ type: "done", bytes }, [bytes.buffer]);
    }
  }
}

// Starting the encoder is async, so messages are handled strictly in turn.
let turn = Promise.resolve();
self.onmessage = (event: MessageEvent<Mp3StreamRequest>) => {
  turn = turn
    .then(() => handle(event.data))
    .catch((err) => post({ type: "error", message: err instanceof Error ? err.message : String(err) }));
};
