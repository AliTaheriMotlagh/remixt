/// <reference lib="webworker" />

// Splits a song into vocals and beat, entirely in the browser: the same
// htdemucs model the old Python service ran, exported to ONNX and run by
// ONNX Runtime Web — on the GPU through WebGPU where the browser has it,
// otherwise on the CPU through WebAssembly. It lives in a worker because a
// split is minutes of number-crunching that would freeze the page.

import { DemucsProcessor } from "demucs-web";
import { CONSTANTS } from "demucs-web/constants";
import { prepareModelInput, standaloneIspec, standaloneMask } from "demucs-web/processor";
import { createMp3Encoder } from "wasm-media-encoders";
import { estimateTempoDecimated, tempoDecimation } from "./analysis";
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
  // `caches` doesn't exist at all outside secure contexts (e.g. a phone
  // opening the dev server by its LAN address over plain http).
  const cache =
    typeof caches === "undefined" ? null : await caches.open(CACHE_NAME).catch(() => null);
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
 *
 * When the size is announced, bytes go straight into one buffer of that
 * size. Collecting chunks and joining them at the end would briefly need
 * twice the model's size in memory, which is enough to get the tab killed
 * on a phone.
 */
async function resumableDownload(
  url: string,
  onBytes: (loaded: number, total: number | null) => void
): Promise<Uint8Array<ArrayBuffer>> {
  let chunks: Uint8Array[] = [];
  let whole: Uint8Array<ArrayBuffer> | null = null;
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
        if (total && loaded === 0) whole = new Uint8Array(total);
      }

      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(stall);
        stall = setTimeout(() => controller.abort(), STALL_MS);
        if (whole) {
          if (loaded + value.length > whole.length) throw new Error("the download is bigger than announced");
          whole.set(value, loaded);
        } else {
          chunks.push(value);
        }
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

  if (whole) return whole;
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

  const create = async (providers: string[], weights: ArrayBuffer) => {
    const next = new DemucsProcessor({
      ort,
      sessionOptions: { executionProviders: providers, graphOptimizationLevel: "all" },
    });
    await next.loadModel(weights);
    return next;
  };

  // The session copies the weights into its own memory, and may not leave
  // ours usable. Keeping a spare copy for a CPU retry would cost another
  // 172 MB, too much for a phone, so a retry reads them again instead
  // (from Cache Storage, normally).
  let backend: "webgpu" | "wasm" = "wasm";
  let weights: ArrayBuffer | null = model;
  if (hasGpu) {
    try {
      processor = await create(["webgpu"], weights);
      backend = "webgpu";
    } catch {
      processor = null;
      weights = null;
    }
  }
  processor ??= await create(["wasm"], weights ?? (await cachedDownload(request.modelUrl, () => {})));

  post({ type: "ready", backend, threads });
}

/**
 * Waveform overview built as the audio streams past: max |mid| per bucket,
 * normalised at the end, like the old service's.
 */
class PeakMeter {
  private peaks: Float32Array;
  private size: number;
  private position = 0;

  constructor(totalSamples: number, buckets = 600) {
    this.peaks = new Float32Array(buckets);
    this.size = Math.max(1, Math.floor(totalSamples / buckets));
  }

  add(left: Float32Array, right: Float32Array) {
    for (let i = 0; i < left.length; i++, this.position++) {
      const bucket = Math.floor(this.position / this.size);
      if (bucket >= this.peaks.length) return;
      const v = Math.abs((left[i] + right[i]) / 2);
      if (v > this.peaks[bucket]) this.peaks[bucket] = v;
    }
  }

  result(): number[] {
    const top = Math.max(...this.peaks) || 1;
    return Array.from(this.peaks, (p) => Math.round((p / top) * 10000) / 10000);
  }
}

/**
 * LAME's encoder + decoder delay, in samples. Encoders normally record it
 * in a header so players can trim it; this one doesn't, so every stem
 * would start 25 ms late — out of step with stems from other songs.
 * Skipping that many input samples cancels it (it costs the first 25 ms
 * of the song, which is practically always silence).
 */
const MP3_DELAY = 576 + 529;

/** An MP3 encoder fed a piece at a time, as the splitter finishes them. */
async function streamingMp3(sampleRate: number, bitrate: StemBitrate) {
  const encoder = await createMp3Encoder();
  encoder.configure({ sampleRate, channels: 2, bitrate });
  const parts: Uint8Array[] = [];
  let skip = MP3_DELAY;
  const CHUNK = 1152 * 64;
  return {
    add(fullLeft: Float32Array, fullRight: Float32Array) {
      const from = Math.min(skip, fullLeft.length);
      skip -= from;
      const left = fullLeft.subarray(from);
      const right = fullRight.subarray(from);
      for (let start = 0; start < left.length; start += CHUNK) {
        const end = Math.min(left.length, start + CHUNK);
        // The encoder owns the returned buffer, hence the copy.
        parts.push(encoder.encode([left.subarray(start, end), right.subarray(start, end)]).slice());
      }
    },
    finish() {
      parts.push(encoder.finalize().slice());
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    },
  };
}

const { TRAINING_SAMPLES, MODEL_SPEC_BINS, MODEL_SPEC_FRAMES, SEGMENT_OVERLAP } = CONSTANTS;
/** demucs-web's track order. Everything but the voice is the beat. */
const VOCALS = CONSTANTS.TRACKS.indexOf("vocals");

/**
 * Runs the model over one ~7.8 s segment, the way demucs-web's `separate`
 * does: the time-domain and spectrogram branches' outputs, summed. Returns
 * the vocals and the beat (the other three stems added together).
 */
async function separateSegment(
  session: NonNullable<DemucsProcessor["session"]>,
  ort: { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown },
  segLeft: Float32Array,
  segRight: Float32Array
) {
  const input = prepareModelInput(segLeft, segRight);
  const feeds: Record<string, unknown> = {
    [session.inputNames[0]]: new ort.Tensor("float32", input.waveform, [1, 2, TRAINING_SAMPLES]),
  };
  if (session.inputNames.length > 1) {
    feeds[session.inputNames[1]] = new ort.Tensor("float32", input.magSpec, [
      1,
      4,
      MODEL_SPEC_BINS,
      MODEL_SPEC_FRAMES,
    ]);
  }
  const results = await session.run(feeds);

  let time: { dims: readonly number[]; data: Float32Array } | null = null;
  let freq: Float32Array | null = null;
  for (const name of session.outputNames) {
    const tensor = results[name];
    if (tensor.dims.length === 4 && tensor.dims[2] === 2) time = tensor;
    else if (tensor.dims.length === 5 && tensor.dims[2] === 4) freq = tensor.data;
  }
  if (!time) throw new Error("The splitter model returned something unexpected");

  const [, tracks, channels, samples] = time.dims;
  const specs = freq ? standaloneMask(freq) : null;
  const vocals = { left: new Float32Array(samples), right: new Float32Array(samples) };
  const beat = { left: new Float32Array(samples), right: new Float32Array(samples) };
  for (let t = 0; t < tracks; t++) {
    const out = t === VOCALS ? vocals : beat;
    const fromFreq = specs ? standaloneIspec(specs[t], TRAINING_SAMPLES) : null;
    const leftBase = (t * channels + 0) * samples;
    const rightBase = (t * channels + 1) * samples;
    for (let i = 0; i < samples; i++) {
      out.left[i] += time.data[leftBase + i] + (fromFreq?.left[i] || 0);
      out.right[i] += time.data[rightBase + i] + (fromFreq?.right[i] || 0);
    }
  }
  return { vocals, beat };
}

/**
 * Splits a song the way demucs-web's `separate` does — overlapping
 * segments, cross-faded — but hands each stretch of output on to the MP3
 * encoders as soon as no later segment can change it. `separate` keeps all
 * four stems of the whole song in memory until the end (a few hundred MB
 * for a normal song), which is what got the tab killed on phones; this
 * only ever holds one segment's worth.
 */
async function split(request: Extract<SplitterRequest, { type: "split" }>) {
  const { jobId, left, right, sampleRate, bitrate } = request;
  const session = processor?.session;
  if (!session) throw new Error("The splitter isn't loaded yet");
  const ort = (processor as unknown as { ort: Parameters<typeof separateSegment>[1] }).ort;

  const total = left.length;
  const stride = Math.floor(TRAINING_SAMPLES * (1 - SEGMENT_OVERLAP));
  const segments = Math.max(1, Math.ceil(total / stride));

  // Output that isn't final yet, from the current segment's start on: the
  // running cross-faded sums and the fade weights they get divided by.
  const pending = {
    vocalsLeft: new Float32Array(TRAINING_SAMPLES),
    vocalsRight: new Float32Array(TRAINING_SAMPLES),
    beatLeft: new Float32Array(TRAINING_SAMPLES),
    beatRight: new Float32Array(TRAINING_SAMPLES),
    weights: new Float32Array(TRAINING_SAMPLES),
  };

  const vocalsMp3 = await streamingMp3(sampleRate, bitrate);
  const beatMp3 = await streamingMp3(sampleRate, bitrate);
  const vocalsPeaks = new PeakMeter(total);
  const beatPeaks = new PeakMeter(total);
  const factor = tempoDecimation(sampleRate);
  const tempo = new Float32Array(Math.floor(total / factor));
  let tempoSum = 0;
  let tempoCount = 0;
  let tempoLength = 0;

  /** Passes on the first `count` pending samples, which are final. */
  const flush = (count: number) => {
    const w = pending.weights;
    const out = {
      vocalsLeft: new Float32Array(count),
      vocalsRight: new Float32Array(count),
      beatLeft: new Float32Array(count),
      beatRight: new Float32Array(count),
    };
    for (let i = 0; i < count; i++) {
      const weight = w[i] > 0 ? w[i] : 1;
      out.vocalsLeft[i] = pending.vocalsLeft[i] / weight;
      out.vocalsRight[i] = pending.vocalsRight[i] / weight;
      out.beatLeft[i] = pending.beatLeft[i] / weight;
      out.beatRight[i] = pending.beatRight[i] / weight;

      tempoSum += (out.beatLeft[i] + out.beatRight[i]) / 2;
      if (++tempoCount === factor) {
        if (tempoLength < tempo.length) tempo[tempoLength++] = tempoSum / factor;
        tempoSum = 0;
        tempoCount = 0;
      }
    }
    vocalsMp3.add(out.vocalsLeft, out.vocalsRight);
    beatMp3.add(out.beatLeft, out.beatRight);
    vocalsPeaks.add(out.vocalsLeft, out.vocalsRight);
    beatPeaks.add(out.beatLeft, out.beatRight);

    // Slide the window along.
    for (const buffer of Object.values(pending)) {
      buffer.copyWithin(0, count);
      buffer.fill(0, buffer.length - count);
    }
  };

  const segLeft = new Float32Array(TRAINING_SAMPLES);
  const segRight = new Float32Array(TRAINING_SAMPLES);
  let done = 0;
  for (let start = 0; start < total; start += stride) {
    const length = Math.min(TRAINING_SAMPLES, total - start);
    segLeft.fill(0);
    segRight.fill(0);
    segLeft.set(left.subarray(start, start + length));
    segRight.set(right.subarray(start, start + length));

    const { vocals, beat } = await separateSegment(session, ort, segLeft, segRight);

    const fade = stride * 0.5;
    for (let i = 0; i < length; i++) {
      const weight = Math.min(Math.min(i / fade, 1), Math.min((length - i) / fade, 1));
      pending.vocalsLeft[i] += vocals.left[i] * weight;
      pending.vocalsRight[i] += vocals.right[i] * weight;
      pending.beatLeft[i] += beat.left[i] * weight;
      pending.beatRight[i] += beat.right[i] * weight;
      pending.weights[i] += weight;
    }

    // The next segment starts `stride` further on, so everything before
    // that is final; after the last segment, all of it is.
    const last = start + stride >= total;
    flush(last ? length : stride);

    done++;
    post({ type: "progress", jobId, stage: "splitting", value: Math.min(1, done / segments) });
  }

  post({ type: "progress", jobId, stage: "encoding", value: 1 });
  const vocalsBytes = vocalsMp3.finish();
  const beatBytes = beatMp3.finish();

  post(
    {
      type: "result",
      jobId,
      vocalsMp3: vocalsBytes,
      beatMp3: beatBytes,
      vocalsPeaks: vocalsPeaks.result(),
      beatPeaks: beatPeaks.result(),
      bpm: estimateTempoDecimated(tempo.subarray(0, tempoLength), sampleRate / factor),
    },
    [vocalsBytes.buffer, beatBytes.buffer]
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
