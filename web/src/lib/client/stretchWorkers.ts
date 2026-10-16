"use client";

import { isConstrainedDevice } from "./device";
import type { StretchFromWorker, StretchToWorker } from "./stretch.worker";

// A few workers running the high-quality stretcher (see stretch.worker.ts),
// each on a core of its own. Measured on an eight-core laptop: one renders
// at ~90× real time against the AudioWorklet's ~45×, and six together at
// ~200× — the AudioWorklet renders all take turns on one thread. A render
// hands its stem over a piece at a time as the worker asks, and the result
// is written into one AudioBuffer as it comes back, so a phone never holds
// a second copy of either.

/**
 * Workers kept for whole renders: a core or two left for the page and the
 * audio itself. Stand-ins (what's being heard) may use as many again —
 * and while any is waiting or running, the whole renders hold between
 * blocks, so the stand-ins have the cores to themselves.
 */
const POOL_SIZE = (() => {
  if (typeof navigator === "undefined") return 2;
  if (isConstrainedDevice()) return 2;
  return Math.min(6, Math.max(2, (navigator.hardwareConcurrency || 4) - 2));
})();

/** Workers at most, stand-ins included. */
export const MAX_WORKERS = POOL_SIZE + 4;

/** How soon it's wanted: "now" (a lane's stand-in, being heard) goes before "soon" (whole renders). */
export type StretchPriority = "now" | "soon";

type Job = {
  id: number;
  source: AudioBuffer;
  out: AudioBuffer;
  rate: number;
  semitones: number;
  voice: boolean;
  priority: StretchPriority;
  resolve: (buffer: AudioBuffer) => void;
  reject: (error: Error) => void;
};

type Slot = { worker: Worker; job: Job | null; holding: boolean };

let nextId = 1;
const queue: Job[] = [];
const slots: Slot[] = [];
/** Set once a worker couldn't load the stretcher: pitchTempo.ts falls back to the AudioWorklet. */
let broken = false;

export function stretchWorkersBroken() {
  return broken;
}

function moduleUrl() {
  return new URL(process.env.NEXT_PUBLIC_STRETCH_MODULE_URL || "/stretch/SignalsmithStretch.mjs", window.location.href).href;
}

function send(slot: Slot, message: StretchToWorker, transfer: Transferable[] = []) {
  slot.worker.postMessage(message, transfer);
}

function finish(slot: Slot) {
  slot.job = null;
  next();
}

/** Holds whole renders while a stand-in waits or renders, and lets them go on once none does. */
function holdForNow() {
  const urgent = queue.some((j) => j.priority === "now") || slots.some((s) => s.job?.priority === "now");
  for (const slot of slots) {
    const hold = urgent && slot.job?.priority === "soon";
    if (hold === slot.holding) continue;
    slot.holding = hold;
    send(slot, { type: "hold", on: hold });
  }
}

function onMessage(slot: Slot, message: StretchFromWorker) {
  const job = slot.job;
  if (!job || message.id !== job.id) return;
  if (message.type === "need") {
    const left = job.source.getChannelData(0).slice(message.from, message.to);
    const right = (job.source.numberOfChannels > 1 ? job.source.getChannelData(1) : job.source.getChannelData(0)).slice(message.from, message.to);
    send(slot, { type: "input", id: job.id, from: message.from, left, right }, [left.buffer, right.buffer]);
  } else if (message.type === "output") {
    job.out.copyToChannel(message.left as Float32Array<ArrayBuffer>, 0, message.at);
    job.out.copyToChannel(message.right as Float32Array<ArrayBuffer>, 1, message.at);
  } else if (message.type === "done") {
    finish(slot);
    job.resolve(job.out);
  } else {
    // The library didn't load here: nothing else will go to the workers.
    if (/didn't (load|start)/.test(message.message)) broken = true;
    finish(slot);
    job.reject(new Error(message.message));
  }
}

function makeSlot(): Slot {
  const worker = new Worker(new URL("./stretch.worker.ts", import.meta.url), { type: "module" });
  const slot: Slot = { worker, job: null, holding: false };
  worker.onmessage = (event: MessageEvent<StretchFromWorker>) => onMessage(slot, event.data);
  worker.onerror = () => {
    // A worker that fails outright (it couldn't even start) takes its job with it.
    broken = true;
    const job = slot.job;
    slots.splice(slots.indexOf(slot), 1);
    worker.terminate();
    job?.reject(new Error("The stretcher's worker failed"));
    next();
  };
  slots.push(slot);
  return slot;
}

function next() {
  while (queue.length) {
    const at = queue.findIndex((j) => j.priority === "now");
    const urgent = at >= 0;
    // A stand-in can have a worker beyond the pool (the whole renders hold meanwhile); a whole render only one of the pool's.
    const free = slots.find((s) => !s.job);
    const busy = slots.filter((s) => s.job).length;
    const slot = free ?? (busy < (urgent ? MAX_WORKERS : POOL_SIZE) ? makeSlot() : null);
    if (!slot || (!urgent && busy >= POOL_SIZE)) break;
    const job = queue.splice(urgent ? at : 0, 1)[0];
    slot.job = job;
    send(slot, {
      type: "start",
      id: job.id,
      moduleUrl: moduleUrl(),
      sampleRate: job.source.sampleRate,
      rate: job.rate,
      semitones: job.semitones,
      voice: job.voice,
      length: job.source.length,
    });
  }
  holdForNow();
  // Workers beyond the pool go once they've had nothing to do for a while (starting one again takes a moment).
  if (slots.length > POOL_SIZE && !spareTimer) {
    spareTimer = setTimeout(() => {
      spareTimer = null;
      while (slots.length > POOL_SIZE) {
        const idle = slots.findIndex((s) => !s.job);
        if (idle < 0) break;
        slots.splice(idle, 1)[0].worker.terminate();
      }
    }, SPARE_WORKER_MS);
  }
}

/** How long workers beyond the pool are kept with nothing to do. */
const SPARE_WORKER_MS = 30_000;
let spareTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * `source` at `rate`× speed and `semitones` higher, rendered in a worker.
 * Rejects if the workers can't run the stretcher (see stretchWorkersBroken).
 */
export function stretchInWorker(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  { rate, semitones, voice, priority = "soon" }: { rate: number; semitones: number; voice: boolean; priority?: StretchPriority }
): Promise<AudioBuffer> {
  if (broken || typeof Worker === "undefined") return Promise.reject(new Error("No stretcher workers here"));
  const out = ctx.createBuffer(2, Math.max(1, Math.round(source.length / rate)), source.sampleRate);
  return new Promise<AudioBuffer>((resolve, reject) => {
    queue.push({ id: nextId++, source, out, rate, semitones, voice, priority, resolve, reject });
    next();
  });
}
