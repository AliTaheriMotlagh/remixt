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
import type { Mp3StreamRequest, Mp3StreamResponse } from "./mp3Stream.worker";
import type { SplitOutput, SplitResult, SplitterRequest, SplitterResponse, StemBitrate } from "./splitterProtocol";

declare const self: DedicatedWorkerGlobalScope;

// Bump when the model or runtime changes, so browsers drop the old copy.
const CACHE_NAME = "remixt-splitter-v1";

let processor: DemucsProcessor | null = null;
/** Splits asked to stop (checked between segments). */
const cancelled = new Set<number>();

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
  // path still works, just on one core. With it: every core but one (big
  // desktops have 10–16), which is left for the page, so the rest of the
  // site stays smooth while a song splits.
  const cores = navigator.hardwareConcurrency || 4;
  const threads = self.crossOriginIsolated ? Math.max(1, Math.min(16, cores - 1)) : 1;
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

type StemEncoder = { add(left: Float32Array, right: Float32Array): void; finish(): Promise<Uint8Array> };

/** An MP3 encoder fed a piece at a time, as the splitter finishes them — here, on this thread. */
async function inlineMp3(sampleRate: number, bitrate: StemBitrate): Promise<StemEncoder> {
  const encoder = await createMp3Encoder();
  encoder.configure({ sampleRate, channels: 2, bitrate });
  const parts: Uint8Array[] = [];
  let skip = MP3_DELAY;
  const CHUNK = 1152 * 64;
  return {
    add(fullLeft, fullRight) {
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
    async finish() {
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

/** How long a stem encoder's worker gets to start before this thread encodes instead. */
const ENCODER_START_MS = 10_000;
/** The current split's encoder workers, stopped when it ends — however it ends. */
const encoderWorkers = new Set<Worker>();

/**
 * The same, in a worker of its own (mp3Stream.worker.ts), so encoding runs
 * on another core alongside the splitting instead of taking turns with it.
 * Null if the worker doesn't start (no nested workers, say) — the caller
 * then encodes here.
 */
function workerMp3(sampleRate: number, bitrate: StemBitrate): Promise<StemEncoder | null> {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./mp3Stream.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return Promise.resolve(null);
  }
  encoderWorkers.add(worker);
  return new Promise((resolve) => {
    let result: { resolve: (bytes: Uint8Array) => void; reject: (err: Error) => void } | null = null;
    let failure: Error | null = null;
    const fail = (err: Error) => {
      failure ??= err;
      worker.terminate();
      result?.reject(err);
    };
    const timer = setTimeout(() => {
      worker.terminate();
      resolve(null);
    }, ENCODER_START_MS);

    worker.onmessage = (event: MessageEvent<Mp3StreamResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        clearTimeout(timer);
        resolve({
          add(left, right) {
            if (failure) return;
            // These buffers are fresh for each stretch, so they can be handed over rather than copied.
            worker.postMessage({ type: "add", left, right } satisfies Mp3StreamRequest, [left.buffer, right.buffer]);
          },
          finish() {
            if (failure) return Promise.reject(failure);
            return new Promise<Uint8Array>((res, rej) => {
              result = { resolve: res, reject: rej };
              worker.postMessage({ type: "finish" } satisfies Mp3StreamRequest);
            });
          },
        });
      } else if (message.type === "done") {
        worker.terminate();
        result?.resolve(message.bytes);
      } else {
        clearTimeout(timer);
        fail(new Error(`Couldn't encode a stem: ${message.message}`));
        resolve(null);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      clearTimeout(timer);
      fail(new Error("A stem's encoder crashed — the browser may be out of memory"));
      resolve(null);
    };
    worker.postMessage({ type: "start", sampleRate, bitrate, skip: MP3_DELAY } satisfies Mp3StreamRequest);
  });
}

const { TRAINING_SAMPLES, MODEL_SPEC_BINS, MODEL_SPEC_FRAMES, SEGMENT_OVERLAP } = CONSTANTS;
/** demucs-web's track order: drums, bass, other, vocals. Everything but the voice is the beat. */
const TRACKS = CONSTANTS.TRACKS as readonly string[];

type Stereo = { left: Float32Array; right: Float32Array };

function stereo(samples: number): Stereo {
  return { left: new Float32Array(samples), right: new Float32Array(samples) };
}

/**
 * Runs the model over one ~7.8 s segment, the way demucs-web's `separate`
 * does: the time-domain and spectrogram branches' outputs, summed. Returns
 * the vocals, the beat (the other three stems added together) and, when
 * `parts` is set, those three on their own too.
 */
async function separateSegment(
  session: NonNullable<DemucsProcessor["session"]>,
  ort: { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown },
  segLeft: Float32Array,
  segRight: Float32Array,
  outputs: readonly SplitOutput[]
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
  const out = Object.fromEntries(outputs.map((o) => [o, stereo(samples)])) as Record<SplitOutput, Stereo>;
  for (let t = 0; t < tracks; t++) {
    const name = TRACKS[t] as SplitOutput;
    // Every track lands in its own output (if kept) and, unless it's the
    // voice, in the beat as well.
    const targets = [out[name], name === "vocals" ? undefined : out.beat].filter(Boolean) as Stereo[];
    const fromFreq = specs ? standaloneIspec(specs[t], TRAINING_SAMPLES) : null;
    const leftBase = (t * channels + 0) * samples;
    const rightBase = (t * channels + 1) * samples;
    for (let i = 0; i < samples; i++) {
      const l = time.data[leftBase + i] + (fromFreq?.left[i] || 0);
      const r = time.data[rightBase + i] + (fromFreq?.right[i] || 0);
      for (const target of targets) {
        target.left[i] += l;
        target.right[i] += r;
      }
    }
  }
  return out;
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
  const {
    jobId,
    left,
    right,
    sampleRate,
    bitrate,
    parts,
    parallelEncode,
  } = request;

  const session = processor?.session;

  if (!session) {
    throw new Error("The splitter isn't loaded yet");
  }

  const ort = (
    processor as unknown as {
      ort: Parameters<typeof separateSegment>[1];
    }
  ).ort;

  const outputs: SplitOutput[] = parts
    ? ["vocals", "beat", "drums", "bass", "other"]
    : ["vocals", "beat"];

  const total = left.length;

  const stride = Math.floor(
    TRAINING_SAMPLES * (1 - SEGMENT_OVERLAP)
  );

  const segments = Math.max(
    1,
    Math.ceil(total / stride)
  );

  /*
   * Pending overlapping output.
   *
   * Each Demucs segment overlaps with the next segment.
   * We accumulate the samples here and divide them by their
   * overlap weights before passing them to the encoder.
   */
  const pending = Object.fromEntries(
    outputs.map((output) => [
      output,
      stereo(TRAINING_SAMPLES),
    ])
  ) as Record<SplitOutput, Stereo>;

  const weights = new Float32Array(TRAINING_SAMPLES);

  /*
   * IMPORTANT:
   *
   * Keep the encoders inline.
   *
   * The parallel nested-worker encoder introduced in
   * fb58108c8ceaed203bb3006ffe3f5e21c7ccb105
   * caused some desktop splits to stall/crash before
   * completing.
   *
   * Stability is more important here than the small
   * encoding speed improvement.
   */
  const encoders = {} as Record<SplitOutput, StemEncoder>;
  const meters = {} as Record<SplitOutput, PeakMeter>;

  for (const output of outputs) {
    encoders[output] = await inlineMp3(
      sampleRate,
      bitrate
    );

    meters[output] = new PeakMeter(total);
  }

  /*
   * BPM analysis is calculated from the reconstructed beat.
   */
  const factor = tempoDecimation(sampleRate);

  const tempo = new Float32Array(
    Math.floor(total / factor)
  );

  let tempoSum = 0;
  let tempoCount = 0;
  let tempoLength = 0;

  /**
   * Flush samples that can no longer be modified by
   * a later overlapping segment.
   */
  const flush = (count: number) => {
    for (const output of outputs) {
      const out = stereo(count);

      const buffer = pending[output];

      /*
       * Normalize overlapping samples using their
       * accumulated fade weights.
       */
      for (let i = 0; i < count; i++) {
        const weight =
          weights[i] > 0
            ? weights[i]
            : 1;

        out.left[i] =
          buffer.left[i] / weight;

        out.right[i] =
          buffer.right[i] / weight;
      }

      /*
       * Feed the reconstructed beat to the BPM detector.
       */
      if (output === "beat") {
        for (let i = 0; i < count; i++) {
          tempoSum +=
            (out.left[i] + out.right[i]) / 2;

          tempoCount++;

          if (tempoCount === factor) {
            if (tempoLength < tempo.length) {
              tempo[tempoLength] =
                tempoSum / factor;

              tempoLength++;
            }

            tempoSum = 0;
            tempoCount = 0;
          }
        }
      }

      /*
       * Calculate waveform preview BEFORE encoding.
       */
      meters[output].add(
        out.left,
        out.right
      );

      /*
       * Encode sequentially inside this worker.
       *
       * Do not transfer the buffers to nested workers.
       */
      encoders[output].add(
        out.left,
        out.right
      );

      /*
       * Slide pending audio towards the beginning
       * so it is ready for the next Demucs segment.
       */
      buffer.left.copyWithin(0, count);
      buffer.right.copyWithin(0, count);

      buffer.left.fill(
        0,
        buffer.left.length - count
      );

      buffer.right.fill(
        0,
        buffer.right.length - count
      );
    }

    /*
     * Slide overlap weights in exactly the same way
     * as the pending audio.
     */
    weights.copyWithin(0, count);

    weights.fill(
      0,
      weights.length - count
    );
  };

  /*
   * Reusable model input buffers.
   */
  const segLeft =
    new Float32Array(TRAINING_SAMPLES);

  const segRight =
    new Float32Array(TRAINING_SAMPLES);

  let done = 0;

  /*
   * IMPORTANT:
   *
   * Process Demucs segments sequentially.
   *
   * Do NOT start inference for the next segment while
   * processing the current result.
   *
   * That pipelining was introduced in fb58108 and is
   * one of the regression candidates.
   */
  for (
    let start = 0;
    start < total;
    start += stride
  ) {
    /*
     * Cancellation is checked between Demucs segments.
     */
    if (cancelled.has(jobId)) {
      throw new Error("Cancelled");
    }

    const length = Math.min(
      TRAINING_SAMPLES,
      total - start
    );

    /*
     * Clear old samples.
     */
    segLeft.fill(0);
    segRight.fill(0);

    /*
     * Copy this segment of the song.
     *
     * The final segment is zero padded automatically.
     */
    segLeft.set(
      left.subarray(
        start,
        start + length
      )
    );

    segRight.set(
      right.subarray(
        start,
        start + length
      )
    );

    /*
     * Wait for this inference to fully complete before
     * starting another one.
     */
    const separated =
      await separateSegment(
        session,
        ort,
        segLeft,
        segRight,
        outputs
      );

    /*
     * Check again because one model segment may take
     * several seconds.
     */
    if (cancelled.has(jobId)) {
      throw new Error("Cancelled");
    }

    /*
     * Crossfade neighboring Demucs windows.
     */
    const fade = stride * 0.5;

    for (let i = 0; i < length; i++) {
      const fadeIn = Math.min(
        i / fade,
        1
      );

      const fadeOut = Math.min(
        (length - i) / fade,
        1
      );

      const weight = Math.min(
        fadeIn,
        fadeOut
      );

      for (const output of outputs) {
        pending[output].left[i] +=
          separated[output].left[i] *
          weight;

        pending[output].right[i] +=
          separated[output].right[i] *
          weight;
      }

      weights[i] += weight;
    }

    /*
     * Anything before the next stride can no longer
     * be affected by another overlapping segment.
     */
    const last =
      start + stride >= total;

    flush(
      last
        ? length
        : stride
    );

    done++;

    post({
      type: "progress",
      jobId,
      stage: "splitting",
      value: Math.min(
        1,
        done / segments
      ),
    });
  }

  /*
   * Model inference is complete.
   */
  post({
    type: "progress",
    jobId,
    stage: "encoding",
    value: 0,
  });

  const mp3 = {} as SplitResult["mp3"];
  const peaks =
    {} as SplitResult["peaks"];

  /*
   * Finish MP3 files one by one.
   *
   * Sequential finalization is intentionally used here
   * for predictable memory usage.
   */
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];

    if (cancelled.has(jobId)) {
      throw new Error("Cancelled");
    }

    mp3[output] =
      await encoders[output].finish();

    peaks[output] =
      meters[output].result();

    post({
      type: "progress",
      jobId,
      stage: "encoding",
      value:
        (i + 1) /
        outputs.length,
    });
  }

  const bpm =
    estimateTempoDecimated(
      tempo.subarray(
        0,
        tempoLength
      ),
      sampleRate / factor
    );

  /*
   * Transfer MP3 buffers instead of copying them back
   * to the UI thread.
   */
  const transfer = Object.values(mp3)
    .filter(
      (
        bytes
      ): bytes is Uint8Array =>
        !!bytes
    )
    .map(
      (bytes) =>
        bytes.buffer
    );

  post(
    {
      type: "result",
      jobId,
      mp3,
      peaks,
      bpm,
    },
    transfer
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
  } else if (request.type === "cancel") {
    cancelled.add(request.jobId);
  } else if (request.type === "split") {
    try {
      await split(request);
    } catch (err) {
      post({
        type: "split-error",
        jobId: request.jobId,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      cancelled.delete(request.jobId);
      for (const worker of encoderWorkers) worker.terminate();
      encoderWorkers.clear();
    }
  }
};
