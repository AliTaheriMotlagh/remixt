/// <reference lib="webworker" />

// Signalsmith Stretch — the high-quality stretcher — run straight on its
// library calls, in a worker of its own (see stretchWorkers.ts). Its
// AudioWorklet wrapper re-reads one stretcher block of input and seeks on
// every 128 samples, and every offline render in the browser shares one
// audio thread, so twenty lanes took minutes; here it streams, about
// twice as fast on one core, and the workers run side by side on as many.
//
// The stem comes in a piece at a time as it's needed and the result goes
// back a piece at a time, so neither side ever holds a second whole copy.
// The result is aligned with the input (the stretcher's latency is taken
// off): output sample n is input sample n × rate.

declare const self: DedicatedWorkerGlobalScope;

export type StretchStart = {
  type: "start";
  id: number;
  moduleUrl: string;
  sampleRate: number;
  rate: number;
  semitones: number;
  /** A voice keeps its formants where they were when its pitch moves. */
  voice: boolean;
  /** Frames of input in all. */
  length: number;
};

export type StretchInput = { type: "input"; id: number; from: number; left: Float32Array; right: Float32Array };
/** Pauses (or goes on with) what this worker is rendering: something more pressing has the cores (see stretchWorkers.ts). */
export type StretchHold = { type: "hold"; on: boolean };
export type StretchToWorker = StretchStart | StretchInput | StretchHold;

export type StretchFromWorker =
  /** Asks for input frames from `from` to `to`. */
  | { type: "need"; id: number; from: number; to: number }
  /** The result from frame `at`. */
  | { type: "output"; id: number; at: number; left: Float32Array; right: Float32Array }
  | { type: "done"; id: number }
  | { type: "error"; id: number; message: string };

type Wasm = {
  HEAP8: Int8Array;
  _presetDefault(channels: number, sampleRate: number): void;
  _setBuffers(channels: number, length: number): number;
  _setTransposeSemitones(semitones: number, tonalityLimit: number): void;
  _setFormantSemitones(semitones: number, compensate: boolean): void;
  _setFormantBase(base: number): void;
  _inputLatency(): number;
  _outputLatency(): number;
  _seek(inputSamples: number, rate: number): void;
  _process(inputSamples: number, outputSamples: number): void;
};

/** Output frames per call into the library. */
const BLOCK = 4096;
/** Input asked for at a time, and output sent back at a time, in frames. */
const PIECE = 1 << 18;

let wasm: Promise<Wasm> | null = null;

/**
 * The library's WebAssembly, from the same module the AudioWorklet loads.
 * That module only hands it over to an AudioWorklet processor, so this
 * looks like one: it registers its processor here, and one made here
 * loads the library and keeps it on itself.
 */
function load(moduleUrl: string): Promise<Wasm> {
  wasm ??= (async () => {
    type Processor = new (options: object) => { wasmModule: Wasm | null };
    let processor: Processor | null = null;
    const scope = self as unknown as Record<string, unknown>;
    scope.AudioWorkletProcessor = class {
      port = { postMessage() {}, onmessage: null };
    };
    scope.registerProcessor = (_name: string, cls: Processor) => (processor = cls);
    scope.sampleRate = 48000;
    scope.currentTime = 0;
    await import(/* webpackIgnore: true */ moduleUrl);
    if (!processor) throw new Error("The stretcher didn't load");
    const made = new (processor as Processor)({ numberOfOutputs: 1, outputChannelCount: [2] });
    for (let waited = 0; !made.wasmModule; waited += 5) {
      if (waited > 10_000) throw new Error("The stretcher didn't start");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return made.wasmModule;
  })();
  wasm.catch(() => (wasm = null));
  return wasm;
}

type Job = {
  id: number;
  pieces: { from: number; left: Float32Array; right: Float32Array }[];
  /** Input asked for, and come in, so far (exclusive). */
  asked: number;
  received: number;
  length: number;
  /** Wakes the job when more input comes in. */
  wake: (() => void) | null;
};

const jobs = new Map<number, Job>();

/** While held, a render stops between blocks; `release` lets it go on. */
let held = false;
let release: (() => void) | null = null;

/** Asks for the next piece of input, if there's more and it isn't asked for yet. */
function askMore(job: Job, upTo: number) {
  while (job.asked < Math.min(job.length, upTo)) {
    const from = job.asked;
    const to = Math.min(job.length, from + PIECE);
    job.asked = to;
    self.postMessage({ type: "need", id: job.id, from, to } satisfies StretchFromWorker);
  }
}

/** Waits until the input reaches frame `end` (or the end of the stem). */
async function haveInput(job: Job, end: number) {
  const want = Math.min(job.length, end);
  // A piece ahead of where it's read, so the next is on its way while this one is worked through.
  askMore(job, want + PIECE);
  while (job.received < want) await new Promise<void>((resolve) => (job.wake = resolve));
}

/** Copies input frames `from`..`from + count` of one channel into `out` (silence before the start and past the end). */
function readInput(job: Job, channel: 0 | 1, from: number, count: number, out: Float32Array) {
  out.fill(0, 0, count);
  for (const piece of job.pieces) {
    const data = channel === 0 ? piece.left : piece.right;
    const a = Math.max(from, piece.from);
    const b = Math.min(from + count, piece.from + data.length);
    if (b > a) out.set(data.subarray(a - piece.from, b - piece.from), a - from);
  }
}

async function run(start: StretchStart) {
  const job: Job = { id: start.id, pieces: [], asked: 0, received: 0, length: start.length, wake: null };
  jobs.set(job.id, job);
  try {
    const lib = await load(start.moduleUrl);
    const { sampleRate, rate, semitones, voice } = start;
    lib._presetDefault(2, sampleRate);
    lib._setTransposeSemitones(semitones, 8000 / sampleRate);
    lib._setFormantSemitones(0, voice && Math.abs(semitones) > 0.001);
    lib._setFormantBase(0);
    const inLatency = lib._inputLatency();
    const outLatency = lib._outputLatency();
    const bufferLength = Math.max(inLatency + outLatency, Math.ceil(BLOCK * rate) + 64, BLOCK);
    const pointer = lib._setBuffers(2, bufferLength);
    // The library's memory can move if it grows: views are made afresh for every call.
    const view = (slot: number, count: number) => new Float32Array(lib.HEAP8.buffer, pointer + bufferLength * 4 * slot, count);
    const scratch = new Float32Array(bufferLength);
    const fill = (from: number, count: number) => {
      for (const channel of [0, 1] as const) {
        readInput(job, channel, from, count, scratch);
        view(channel, count).set(scratch.subarray(0, count));
      }
    };

    const total = Math.max(1, Math.round(start.length / rate));
    // Primed with the first stretch of input, so the output starts where the input does (less the output latency, taken off below).
    await haveInput(job, inLatency);
    fill(0, inLatency);
    lib._seek(inLatency, rate);

    let read = inLatency;
    let made = 0;
    let sent = 0;
    let outLeft = new Float32Array(Math.min(PIECE, total));
    let outRight = new Float32Array(outLeft.length);
    let filled = 0;
    const flush = () => {
      if (!filled) return;
      const left = outLeft.subarray(0, filled).slice();
      const right = outRight.subarray(0, filled).slice();
      self.postMessage({ type: "output", id: job.id, at: sent, left, right } satisfies StretchFromWorker, [left.buffer, right.buffer]);
      sent += filled;
      filled = 0;
      const next = Math.min(PIECE, total - sent);
      if (next > 0 && next !== outLeft.length) {
        outLeft = new Float32Array(next);
        outRight = new Float32Array(next);
      }
    };
    while (sent + filled < total) {
      while (held) await new Promise<void>((resolve) => (release = resolve));
      const until = Math.round((made + BLOCK) * rate) + inLatency;
      await haveInput(job, until);
      fill(read, until - read);
      lib._process(until - read, BLOCK);
      read = until;
      // Output frame `made` is result frame `made - outLatency`.
      const left = view(2, BLOCK);
      const right = view(3, BLOCK);
      for (let i = 0; i < BLOCK; i++) {
        const at = made + i - outLatency;
        if (at < sent + filled) continue;
        if (at >= total) break;
        outLeft[filled] = left[i];
        outRight[filled] = right[i];
        if (++filled === outLeft.length) flush();
      }
      made += BLOCK;
      // What's been read can go.
      while (job.pieces.length && job.pieces[0].from + job.pieces[0].left.length < read - bufferLength) job.pieces.shift();
    }
    flush();
    self.postMessage({ type: "done", id: job.id } satisfies StretchFromWorker);
  } catch (error) {
    self.postMessage({ type: "error", id: job.id, message: error instanceof Error ? error.message : String(error) } satisfies StretchFromWorker);
  } finally {
    jobs.delete(job.id);
  }
}

self.onmessage = (event: MessageEvent<StretchToWorker>) => {
  const message = event.data;
  if (message.type === "start") {
    void run(message);
    return;
  }
  if (message.type === "hold") {
    held = message.on;
    if (!held) release?.();
    release = null;
    return;
  }
  const job = jobs.get(message.id);
  if (!job) return;
  job.pieces.push({ from: message.from, left: message.left, right: message.right });
  job.received = Math.max(job.received, message.from + message.left.length);
  job.wake?.();
  job.wake = null;
};
