/// <reference lib="webworker" />

// Splits a song into vocals and beat, entirely in the browser: the same
// htdemucs model the old Python service ran, exported to ONNX and run by
// ONNX Runtime Web — on the GPU through WebGPU where the browser has it,
// otherwise on the CPU through WebAssembly. It lives in a worker because a
// split is minutes of number-crunching that would freeze the page.

import { DemucsProcessor } from "demucs-web";
import { createMp3Encoder } from "wasm-media-encoders";
import { estimateTempo } from "./analysis";
import type { SplitterRequest, SplitterResponse, StemBitrate } from "./splitterProtocol";

declare const self: DedicatedWorkerGlobalScope;

// Bump when the model or runtime changes, so browsers drop the old copy.
const CACHE_NAME = "remixt-splitter-v1";

let processor: DemucsProcessor | null = null;

function post(message: SplitterResponse, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

/**
 * Fetches a large file once and keeps it in Cache Storage, so every visit
 * after the first loads the splitter from disk. Reports bytes as they
 * arrive. If caching isn't available (private windows, full disk) it still
 * works — it just downloads again next time.
 */
async function cachedDownload(
  url: string,
  onBytes: (loaded: number, total: number | null, fromCache: boolean) => void
): Promise<ArrayBuffer> {
  const cache = await caches?.open(CACHE_NAME).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) {
    const buffer = await hit.arrayBuffer();
    onBytes(buffer.byteLength, buffer.byteLength, true);
    return buffer;
  }

  const bytes = await resumableDownload(url, (loaded, total) => onBytes(loaded, total, false));
  try {
    await cache?.put(url, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
  } catch {
    // Over quota — fine, it's only a cache.
  }
  return bytes.buffer;
}

const STALL_MS = 20_000;
const MAX_ATTEMPTS = 8;

/**
 * Downloads a large file, surviving flaky connections: if no bytes arrive
 * for STALL_MS the request is dropped and picked up again from where it
 * stopped with a Range request, rather than starting 200 MB over. The
 * final size is checked against what the server announced, so a truncated
 * file never gets cached.
 */
async function resumableDownload(
  url: string,
  onBytes: (loaded: number, total: number | null) => void
): Promise<Uint8Array<ArrayBuffer>> {
  let chunks: Uint8Array[] = [];
  let loaded = 0;
  let total: number | null = null;

  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    let stall = setTimeout(() => controller.abort(), STALL_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: loaded > 0 ? { Range: `bytes=${loaded}-` } : undefined,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Couldn't download ${url.split("/").pop()} (HTTP ${response.status})`);
      }
      if (loaded > 0 && response.status !== 206) {
        // The server ignored the Range header; start again from zero.
        chunks = [];
        loaded = 0;
      }
      if (total === null) {
        const range = response.headers.get("content-range")?.match(/\/(\d+)$/);
        total = range ? Number(range[1]) : Number(response.headers.get("content-length")) || null;
      }

      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(stall);
        stall = setTimeout(() => controller.abort(), STALL_MS);
        chunks.push(value);
        loaded += value.length;
        onBytes(loaded, total);
      }
      clearTimeout(stall);
      if (total !== null && loaded < total) throw new Error("connection closed early");
      break;
    } catch (err) {
      clearTimeout(stall);
      if (attempt >= MAX_ATTEMPTS) {
        throw err instanceof Error && err.name !== "AbortError"
          ? err
          : new Error("The download keeps stalling — check your connection and try again");
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 1000 * attempt)));
    }
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function init(request: Extract<SplitterRequest, { type: "init" }>) {
  // Model and runtime download in parallel; progress is reported as one
  // number so the page can show a single bar.
  const loaded = { model: 0, wasm: 0 };
  const totals = { model: 0, wasm: 0 };
  let fromCache = true;
  const report = () => {
    const known = totals.model && totals.wasm ? totals.model + totals.wasm : request.expectedBytes;
    post({ type: "download", loaded: loaded.model + loaded.wasm, total: known, fromCache });
  };
  const track = (part: "model" | "wasm") => (bytes: number, total: number | null, cached: boolean) => {
    loaded[part] = bytes;
    if (total) totals[part] = total;
    if (!cached) fromCache = false;
    report();
  };

  const [model, wasm] = await Promise.all([
    cachedDownload(request.modelUrl, track("model")),
    cachedDownload(request.wasmUrl, track("wasm")),
  ]);

  post({ type: "starting" });
  const ort = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ request.ortUrl);
  ort.env.wasm.wasmPaths = request.ortBase;
  ort.env.wasm.wasmBinary = wasm;
  // Threads need SharedArrayBuffer, which needs a cross-origin isolated
  // page (see the COOP/COEP headers in next.config.ts). Without it the CPU
  // path still works, just on one core.
  const threads = self.crossOriginIsolated
    ? Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4))
    : 1;
  ort.env.wasm.numThreads = threads;

  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const hasGpu = !!(await gpu?.requestAdapter().catch(() => null));

  const create = async (providers: string[]) => {
    const next = new DemucsProcessor({
      ort,
      sessionOptions: { executionProviders: providers, graphOptimizationLevel: "all" },
    });
    // The session keeps its own copy; hand it a copy so ours stays usable
    // for a CPU retry.
    await next.loadModel(model.slice(0));
    return next;
  };

  let backend: "webgpu" | "wasm" = "wasm";
  if (hasGpu) {
    try {
      processor = await create(["webgpu"]);
      backend = "webgpu";
    } catch {
      processor = null;
    }
  }
  if (!processor) processor = await create(["wasm"]);

  post({ type: "ready", backend, threads });
}

/** Normalised waveform overview: max |sample| per bucket, like the old service. */
function computePeaks(left: Float32Array, right: Float32Array, buckets = 600): number[] {
  const size = Math.max(1, Math.floor(left.length / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const end = Math.min(left.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) {
      const v = Math.abs((left[i] + right[i]) / 2);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const top = Math.max(...peaks) || 1;
  return peaks.map((p) => Math.round((p / top) * 10000) / 10000);
}

/**
 * LAME's encoder + decoder delay, in samples. Encoders normally record it
 * in a header so players can trim it; this one doesn't, so every stem
 * would start 25 ms late — out of step with stems from other songs.
 * Skipping that many input samples cancels it (it costs the first 25 ms
 * of the song, which is practically always silence).
 */
const MP3_DELAY = 576 + 529;

async function encodeMp3(
  fullLeft: Float32Array,
  fullRight: Float32Array,
  sampleRate: number,
  bitrate: StemBitrate
) {
  const left = fullLeft.subarray(MP3_DELAY);
  const right = fullRight.subarray(MP3_DELAY);
  const encoder = await createMp3Encoder();
  encoder.configure({ sampleRate, channels: 2, bitrate });
  const parts: Uint8Array[] = [];
  const CHUNK = 1152 * 64;
  for (let start = 0; start < left.length; start += CHUNK) {
    const end = Math.min(left.length, start + CHUNK);
    // The encoder owns the returned buffer, hence the copy.
    parts.push(encoder.encode([left.subarray(start, end), right.subarray(start, end)]).slice());
  }
  parts.push(encoder.finalize().slice());
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function split(request: Extract<SplitterRequest, { type: "split" }>) {
  const { jobId, left, right, sampleRate, bitrate } = request;
  if (!processor) throw new Error("The splitter isn't loaded yet");

  // demucs-web's own segment count can run one past its total, so clamp.
  processor.onProgress = ({ progress }) =>
    post({ type: "progress", jobId, stage: "splitting", value: Math.min(1, progress) });

  const stems = await processor.separate(left, right);

  // Beat = everything that isn't the voice. Summed in place into the
  // drums buffers to avoid another pair of song-length arrays.
  const beatLeft = stems.drums.left;
  const beatRight = stems.drums.right;
  for (let i = 0; i < beatLeft.length; i++) {
    beatLeft[i] += stems.bass.left[i] + stems.other.left[i];
    beatRight[i] += stems.bass.right[i] + stems.other.right[i];
  }

  post({ type: "progress", jobId, stage: "encoding", value: 0 });
  const vocalsMp3 = await encodeMp3(stems.vocals.left, stems.vocals.right, sampleRate, bitrate);
  post({ type: "progress", jobId, stage: "encoding", value: 0.5 });
  const beatMp3 = await encodeMp3(beatLeft, beatRight, sampleRate, bitrate);
  post({ type: "progress", jobId, stage: "encoding", value: 1 });

  const mono = new Float32Array(beatLeft.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (beatLeft[i] + beatRight[i]) / 2;

  post(
    {
      type: "result",
      jobId,
      vocalsMp3,
      beatMp3,
      vocalsPeaks: computePeaks(stems.vocals.left, stems.vocals.right),
      beatPeaks: computePeaks(beatLeft, beatRight),
      bpm: estimateTempo(mono, sampleRate),
    },
    [vocalsMp3.buffer, beatMp3.buffer]
  );
}

self.onmessage = async (event: MessageEvent<SplitterRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    try {
      await init(request);
    } catch (err) {
      post({ type: "init-error", message: err instanceof Error ? err.message : String(err) });
    }
  } else if (request.type === "split") {
    try {
      await split(request);
    } catch (err) {
      post({
        type: "split-error",
        jobId: request.jobId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
