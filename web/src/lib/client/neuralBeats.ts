"use client";

import { create } from "zustand";
import type { StemAnalysis } from "./analysis";
import { BEAT_NET, type NeuralBeats } from "./beatNet";
import { isConstrainedDevice } from "./device";
import type { BeatNetRequest, BeatNetResponse } from "./beatNet.worker";

// The beat model as the Studio sees it: one worker for the session, its
// download state for the UI, and `neuralBeats`, which hears a stem's beats
// and downbeats once — kept in Cache Storage, so a stem is only ever
// listened to once per browser. Off (or failing) just means the Studio's
// own tracker in analysis.ts is used, as before.

const ORT_BASE = process.env.NEXT_PUBLIC_ORT_BASE_URL || "/ort/";
// Bump with the model (see beatNet.worker.ts), so old results are dropped.
const RESULTS_CACHE = "remixt-beat-results-v1";
const SETTING_KEY = "remixt.neuralBeats";

export type BeatModelState = {
  /** idle: not needed yet · loading: downloading/starting · ready · failed · off: the person turned it off */
  status: "idle" | "loading" | "ready" | "failed" | "off";
  loaded: number;
  total: number;
  fromCache: boolean;
  /** Songs being listened to right now. */
  working: number;
  error: string | null;
};

export const useBeatModel = create<BeatModelState>(() => ({
  status: "idle",
  loaded: 0,
  total: BEAT_NET.modelBytes,
  fromCache: true,
  working: 0,
  error: null,
}));

/**
 * Phones don't run the model: it and its runtime listen to a whole song
 * at once, on top of the lanes the Studio already holds — past what a
 * phone lets a page use, and a phone reloads the page when that happens
 * (see device.ts). The Studio's own tracker does the job there.
 */
export function beatModelSupported(): boolean {
  return !isConstrainedDevice();
}

export function beatModelEnabled(): boolean {
  if (!beatModelSupported()) return false;
  try {
    return localStorage.getItem(SETTING_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setBeatModelEnabled(on: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, on ? "on" : "off");
  } catch {
    // Private mode: remembered for this visit only.
  }
  if (!on) useBeatModel.setState({ status: "off" });
  else if (useBeatModel.getState().status === "off") useBeatModel.setState({ status: worker ? "ready" : "idle" });
}

let worker: Worker | null = null;
let ready: Promise<Worker> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (beats: NeuralBeats) => void; reject: (err: Error) => void }>();

function startWorker(): Promise<Worker> {
  if (ready) return ready;
  ready = new Promise<Worker>((resolve, reject) => {
    const w = new Worker(new URL("./beatNet.worker.ts", import.meta.url), { type: "module" });
    useBeatModel.setState({ status: "loading", error: null });
    w.onmessage = (event: MessageEvent<BeatNetResponse>) => {
      const message = event.data;
      if (message.type === "download") {
        useBeatModel.setState({ loaded: message.loaded, total: message.total, fromCache: message.fromCache });
      } else if (message.type === "ready") {
        worker = w;
        if (useBeatModel.getState().status !== "off") useBeatModel.setState({ status: "ready" });
        resolve(w);
      } else if (message.type === "result") {
        pending.get(message.id)?.resolve({ beats: message.beats, downbeats: message.downbeats });
        pending.delete(message.id);
      } else if (message.type === "error") {
        if (message.id === undefined) {
          // The model couldn't load: forget this worker so a later try starts afresh.
          useBeatModel.setState({ status: "failed", error: message.message });
          w.terminate();
          ready = null;
          reject(new Error(message.message));
          for (const [id, p] of pending) {
            p.reject(new Error(message.message));
            pending.delete(id);
          }
        } else {
          pending.get(message.id)?.reject(new Error(message.message));
          pending.delete(message.id);
        }
      }
    };
    w.onerror = (event) => {
      useBeatModel.setState({ status: "failed", error: event.message || "The beat model's worker failed to start" });
      ready = null;
      reject(new Error(event.message || "beat worker failed"));
    };
    const ortBase = new URL(ORT_BASE, window.location.href).href;
    w.postMessage({
      type: "init",
      modelUrl: BEAT_NET.modelUrl,
      wasmUrl: `${ortBase}ort-wasm-simd-threaded.jsep.wasm`,
      ortUrl: `${ortBase}ort.min.mjs`,
      ortBase,
    } satisfies BeatNetRequest);
  });
  return ready;
}

/** Mono at the model's rate. An offline context resamples properly, and mixes stereo down as (L+R)/2. */
async function toModelRate(buffer: AudioBuffer): Promise<Float32Array> {
  const { sampleRate } = BEAT_NET;
  const length = Math.max(1, Math.ceil(buffer.duration * sampleRate));
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  return (await ctx.startRendering()).getChannelData(0);
}

const resultKey = (stemId: string) => `/beat-results/${stemId}`;

async function storedResult(stemId: string): Promise<NeuralBeats | null> {
  try {
    if (typeof caches === "undefined") return null;
    const hit = await (await caches.open(RESULTS_CACHE)).match(resultKey(stemId));
    return hit ? ((await hit.json()) as NeuralBeats) : null;
  } catch {
    return null;
  }
}

async function storeResult(stemId: string, beats: NeuralBeats) {
  try {
    if (typeof caches === "undefined") return;
    await (await caches.open(RESULTS_CACHE)).put(resultKey(stemId), new Response(JSON.stringify(beats), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // Only a cache.
  }
}

const results = new Map<string, Promise<NeuralBeats | null>>();

/**
 * A stem's beats and downbeats as the model hears them (null when it's
 * turned off or couldn't run). Listened to once per stem, then remembered.
 */
export function neuralBeats(stemId: string, buffer: AudioBuffer): Promise<NeuralBeats | null> {
  if (!beatModelEnabled()) {
    useBeatModel.setState({ status: "off" });
    return Promise.resolve(null);
  }
  const known = results.get(stemId);
  if (known) return known;
  const promise = (async () => {
    const stored = await storedResult(stemId);
    if (stored) return stored;
    const w = await startWorker();
    const mono = await toModelRate(buffer);
    useBeatModel.setState((s) => ({ working: s.working + 1 }));
    try {
      const id = nextId++;
      const found = await new Promise<NeuralBeats>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ type: "track", id, mono } satisfies BeatNetRequest, [mono.buffer]);
      });
      void storeResult(stemId, found);
      return found;
    } finally {
      useBeatModel.setState((s) => ({ working: Math.max(0, s.working - 1) }));
    }
  })().catch(() => null);
  results.set(stemId, promise);
  // A failure isn't remembered: the next ask tries again.
  void promise.then((r) => r === null && results.delete(stemId));
  return promise;
}

/**
 * Puts the model's beats on a stem's analysis (see StemAnalysis.neural),
 * where the bar finding in arrange.ts picks them up. Waits at most
 * `waitMs`; if the model is slower, the analysis is used without them this
 * time and gets them when they arrive.
 */
export async function hearBeats(analysis: StemAnalysis, stemId: string, buffer: AudioBuffer, waitMs = 45_000): Promise<boolean> {
  if (analysis.neural) return true;
  const found = neuralBeats(stemId, buffer).then((beats) => {
    if (beats && beats.beats.length >= 8) analysis.neural = beats;
    return !!analysis.neural;
  });
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs));
  return Promise.race([found, timeout]);
}
