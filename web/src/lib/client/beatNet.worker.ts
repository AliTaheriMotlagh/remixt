/// <reference lib="webworker" />

// Runs Beat This! (see beatNet.ts) off the page: the spectrogram, the
// network over each 30-second window, and picking the beats. A song is
// several seconds of number-crunching, which would stall the Studio.

import { BEAT_NET, aggregate, logMelSpectrogram, pickBeats, splitPiece } from "./beatNet";
import { cachedDownload } from "./modelCache";

declare const self: DedicatedWorkerGlobalScope;

// Bump when the model changes, so browsers drop the old copy. The runtime
// is shared with the splitter's cache (same file, no second download).
const MODEL_CACHE = "remixt-beats-v1";
const RUNTIME_CACHE = "remixt-splitter-v1";

export type BeatNetRequest =
  | { type: "init"; modelUrl: string; wasmUrl: string; ortUrl: string; ortBase: string }
  | { type: "track"; id: number; mono: Float32Array };

export type BeatNetResponse =
  | { type: "download"; loaded: number; total: number; fromCache: boolean }
  | { type: "ready" }
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "result"; id: number; beats: number[]; downbeats: number[] }
  | { type: "error"; id?: number; message: string };

type Ort = {
  env: { wasm: { wasmPaths: string; wasmBinary: ArrayBuffer; numThreads: number } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create(model: ArrayBuffer, options: object): Promise<{ run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> }>;
  };
};

let ort: Ort | null = null;
let session: Awaited<ReturnType<Ort["InferenceSession"]["create"]>> | null = null;
/** Songs are tracked one at a time: the network already uses every core it's given. */
let queue: Promise<void> = Promise.resolve();

function post(message: BeatNetResponse) {
  self.postMessage(message);
}

async function init(request: Extract<BeatNetRequest, { type: "init" }>) {
  const loaded = { model: 0, wasm: 0 };
  const totals: { model: number; wasm: number } = { model: BEAT_NET.modelBytes, wasm: 0 };
  let fromCache = true;
  const track = (part: "model" | "wasm") => (bytes: number, total: number | null, cached: boolean) => {
    loaded[part] = bytes;
    if (total) totals[part] = total;
    if (!cached) fromCache = false;
    post({ type: "download", loaded: loaded.model + loaded.wasm, total: totals.model + totals.wasm, fromCache });
  };
  const [model, wasm] = await Promise.all([
    cachedDownload(MODEL_CACHE, request.modelUrl, track("model")),
    cachedDownload(RUNTIME_CACHE, request.wasmUrl, track("wasm")),
  ]);
  ort = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ request.ortUrl)) as Ort;
  ort.env.wasm.wasmPaths = request.ortBase;
  ort.env.wasm.wasmBinary = wasm;
  // A few threads when the page is cross-origin isolated: the model is
  // small, and the rest of the cores keep the Studio (and a split) smooth.
  const cores = navigator.hardwareConcurrency || 4;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, cores - 2)) : 1;
  session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  post({ type: "ready" });
}

async function trackSong(id: number, mono: Float32Array) {
  if (!ort || !session) throw new Error("The beat model isn't loaded");
  const { data, frames } = logMelSpectrogram(mono);
  if (frames < BEAT_NET.border * 4) {
    post({ type: "result", id, beats: [], downbeats: [] });
    return;
  }
  const windows = splitPiece(data, frames);
  const beat: Float32Array[] = [];
  const downbeat: Float32Array[] = [];
  for (const [i, window] of windows.entries()) {
    const out = await session.run({
      [BEAT_NET.inputName]: new ort.Tensor("float32", window.data, [1, window.frames, BEAT_NET.mels]),
    });
    beat.push(out.beat.data);
    downbeat.push(out.downbeat.data);
    post({ type: "progress", id, done: i + 1, total: windows.length });
  }
  const found = pickBeats(aggregate(windows, beat, frames), aggregate(windows, downbeat, frames));
  post({ type: "result", id, ...found });
}

self.onmessage = (event: MessageEvent<BeatNetRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    init(request).catch((err) => post({ type: "error", message: err instanceof Error ? err.message : String(err) }));
    return;
  }
  queue = queue.then(() =>
    trackSong(request.id, request.mono).catch((err) =>
      post({ type: "error", id: request.id, message: err instanceof Error ? err.message : String(err) })
    )
  );
};
