"use client";

import { useSyncExternalStore } from "react";
import { fetchInSlices } from "./stemFetch";
import {
  STEM_BITRATES,
  type SplitOutput,
  type SplitResult,
  type SplitterRequest,
  type SplitterResponse,
  type StemBitrate,
} from "./splitterProtocol";

// The in-browser song splitter, as seen by the page: one worker for the
// whole session (so the model loads once), its download/ready state for the
// UI, and `uploadSong`, which runs a file all the way from decoding to a
// ready track in the library.

/** Model weights: htdemucs exported to ONNX (see demucs-web). ~172 MB. */
export const MODEL_URL =
  process.env.NEXT_PUBLIC_DEMUCS_MODEL_URL ||
  "https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx";
/**
 * ONNX Runtime Web's files. Served from this app by default (copied into
 * public/ort by scripts/copy-ort.mjs); can point at a CDN instead, e.g.
 * https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/
 */
const ORT_BASE = process.env.NEXT_PUBLIC_ORT_BASE_URL || "/ort/";
/** Used for the progress bar until the real sizes arrive. */
const EXPECTED_BYTES = 180_534_758 + 28_312_028;
const SAMPLE_RATE = 44100; // what the model was trained on
/**
 * Stem quality. 192 kbps is transparent for remixing; 128 kbps makes each
 * song ~30% smaller, which stretches a small free storage tier.
 */
const STEM_BITRATE: StemBitrate =
  STEM_BITRATES.find((b) => b === Number(process.env.NEXT_PUBLIC_STEM_BITRATE)) ?? 192;
const MAX_SECONDS = 15 * 60;
/**
 * Keep the beat's drums, bass and other parts as stems of their own, so
 * people can remix at that level. Costs about 2.5× the storage per song;
 * NEXT_PUBLIC_SPLIT_PARTS=false goes back to vocals + beat only.
 */
const SPLIT_PARTS = process.env.NEXT_PUBLIC_SPLIT_PARTS !== "false";
/**
 * Phones and tablets get a shorter limit: the decoded song alone is ~21 MB
 * a minute, and iOS kills a tab outright (it just reloads) when it asks for
 * more memory than the device will give it.
 */
const MAX_SECONDS_MOBILE = 10 * 60;

/**
 * True on phones and tablets, where memory is tight and the OS kills tabs
 * that use too much: keep the ~500 MB splitter out of memory until it's
 * needed, and let it go again afterwards. iPadOS reports itself as a Mac,
 * so it's recognised by its touchscreen.
 */
export function isConstrainedDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (iPadOS || /iPhone|iPad|iPod|Android|Mobi/i.test(ua)) return true;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memory !== undefined && memory <= 2;
}

export type SplitterState = {
  status: "idle" | "downloading" | "starting" | "ready" | "error";
  loaded: number;
  total: number;
  fromCache: boolean;
  backend: "webgpu" | "wasm" | null;
  threads: number;
  error: string | null;
};

type Job = {
  resolve: (result: SplitResult) => void;
  reject: (err: Error) => void;
  onProgress: (stage: "splitting" | "encoding", value: number) => void;
};

/**
 * A split reports progress every segment (seconds apart even on one CPU
 * core); this long without a word and its worker is taken to have died
 * without saying so — which is what running out of memory looks like.
 */
const SILENT_FOR_MS = 4 * 60_000;

/** Someone waiting for the splitter; your own songs go before songs split for others. */
type Turn = { own: boolean; start: () => void };

class Splitter {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private jobs = new Map<number, Job>();
  private nextJobId = 1;
  private listeners = new Set<() => void>();
  /** A song is being decoded, split or encoded (one at a time: two would share one model). */
  private holding = false;
  private turns: Turn[] = [];
  private lastHeard = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  state: SplitterState = {
    status: "idle",
    loaded: 0,
    total: EXPECTED_BYTES,
    fromCache: false,
    backend: null,
    threads: 1,
    error: null,
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SplitterState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Starts (or joins) loading the model. Safe to call any number of times. */
  load(): Promise<void> {
    if (this.ready) return this.ready;
    this.set({ status: "downloading", error: null });

    this.ready = new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL("./splitter.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker = worker;

      worker.onmessage = (event: MessageEvent<SplitterResponse>) => {
        const message = event.data;
        switch (message.type) {
          case "download":
            this.set({
              status: "downloading",
              loaded: message.loaded,
              total: message.total,
              fromCache: message.fromCache,
            });
            break;
          case "starting":
            this.set({ status: "starting" });
            break;
          case "ready":
            this.set({ status: "ready", backend: message.backend, threads: message.threads });
            resolve();
            break;
          case "init-error":
            this.fail(message.message);
            reject(new Error(message.message));
            break;
          case "progress":
            this.lastHeard = Date.now();
            this.jobs.get(message.jobId)?.onProgress(message.stage, message.value);
            break;
          case "result": {
            const job = this.jobs.get(message.jobId);
            this.jobs.delete(message.jobId);
            job?.resolve(message);
            break;
          }
          case "split-error": {
            const job = this.jobs.get(message.jobId);
            this.jobs.delete(message.jobId);
            job?.reject(new Error(message.message));
            break;
          }
        }
      };
      worker.onerror = (event) => {
        const message = event.message || "The splitter crashed — the browser may be out of memory";
        reject(new Error(message));
        this.fail(message);
      };

      // Absolute, because the worker resolves relative URLs against its
      // own script's location, not the page.
      const ortBase = new URL(ORT_BASE, window.location.href).href;
      worker.postMessage({
        type: "init",
        modelUrl: MODEL_URL,
        wasmUrl: `${ortBase}ort-wasm-simd-threaded.jsep.wasm`,
        ortUrl: `${ortBase}ort.min.mjs`,
        ortBase,
        expectedBytes: EXPECTED_BYTES,
      } satisfies SplitterRequest);
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  /**
   * Shuts the worker down, freeing the model's memory. The next `load`
   * starts it again, from Cache Storage, in a few seconds.
   */
  unload() {
    if (!this.worker || this.jobs.size > 0) return;
    this.worker.terminate();
    this.worker = null;
    this.ready = null;
    this.set({ status: "idle", backend: null });
  }

  /** Whether a song is being split right now, or waiting to be (the helper waits for the user's own). */
  get busy() {
    return this.holding || this.jobs.size > 0;
  }

  /**
   * Runs `work` once no other song is using the splitter — the model can
   * only split one at a time, and two at once would also need twice the
   * memory. Your own songs (`own`) go ahead of any waiting to be split for
   * someone else; `onWait` is called if there's a wait.
   */
  async exclusive<T>(own: boolean, onWait: () => void, work: () => Promise<T>): Promise<T> {
    if (this.holding) {
      onWait();
      await new Promise<void>((start) => {
        const turn = { own, start };
        const before = own ? this.turns.findIndex((t) => !t.own) : -1;
        if (before === -1) this.turns.push(turn);
        else this.turns.splice(before, 0, turn);
      });
    }
    // Handed over directly by whoever finished (see below), so nobody can
    // slip in between.
    this.holding = true;
    try {
      return await work();
    } finally {
      const next = this.turns.shift();
      if (next) next.start();
      else this.holding = false;
    }
  }

  private fail(message: string) {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null; // let "Try again" start over
    this.stopWatchdog();
    for (const job of this.jobs.values()) job.reject(new Error(message));
    this.jobs.clear();
    this.set({ status: "error", error: message });
  }

  private startWatchdog() {
    this.lastHeard = Date.now();
    this.watchdog ??= setInterval(() => {
      if (this.jobs.size === 0) return this.stopWatchdog();
      if (Date.now() - this.lastHeard > SILENT_FOR_MS) {
        this.fail("The splitter stopped responding — the browser may have run out of memory");
      }
    }, 15_000);
  }

  private stopWatchdog() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  /**
   * Splits one song. Aborting `signal` stops it at the next segment (it
   * then rejects) — not at once, so it's never still running when the
   * next song starts.
   */
  async split(
    left: Float32Array,
    right: Float32Array,
    onProgress: Job["onProgress"],
    signal?: AbortSignal
  ): Promise<SplitResult> {
    await this.load();
    const worker = this.worker;
    if (!worker) throw new Error(this.state.error ?? "The splitter isn't running");
    signal?.throwIfAborted();
    const jobId = this.nextJobId++;
    const cancel = () => worker.postMessage({ type: "cancel", jobId } satisfies SplitterRequest);
    signal?.addEventListener("abort", cancel, { once: true });
    return new Promise<SplitResult>((resolve, reject) => {
      this.jobs.set(jobId, { resolve, reject, onProgress });
      this.startWatchdog();
      worker.postMessage(
        {
          type: "split",
          jobId,
          left,
          right,
          sampleRate: SAMPLE_RATE,
          bitrate: STEM_BITRATE,
          parts: SPLIT_PARTS,
          parallelEncode: !isConstrainedDevice(),
        } satisfies SplitterRequest,
        [left.buffer, right.buffer]
      );
    }).finally(() => signal?.removeEventListener("abort", cancel));
  }
}

export const splitter = new Splitter();

const serverSnapshot = splitter.state;
export function useSplitter(): SplitterState {
  return useSyncExternalStore(
    splitter.subscribe,
    () => splitter.state,
    () => serverSnapshot
  );
}

// --- Upload pipeline ------------------------------------------------------------

export type UploadStage =
  | { stage: "fetching-link" }
  | { stage: "downloading"; progress: number }
  | { stage: "decoding" }
  | { stage: "loading-model" }
  | { stage: "splitting"; progress: number }
  | { stage: "encoding"; progress: number }
  | { stage: "uploading"; progress: number }
  | { stage: "saving" }
  /** A phone sending the song to the split queue (see splitQueue.ts). */
  | { stage: "queueing"; progress: number }
  /** A phone shrinking a big lossless file before sending it to the queue. */
  | { stage: "compressing" }
  /** Waiting for the splitter to finish another song first. */
  | { stage: "waiting" };

export type UploadTarget =
  | { type: "put"; url: string; headers: Record<string, string> }
  | {
      type: "blob";
      pathname: string;
      token: string;
      contentType: string;
      access: "public" | "private";
    };

/** Uploads one stem wherever the server said to (see lib/storage.ts). */
export async function upload(target: UploadTarget, body: Uint8Array, onProgress: (loaded: number) => void) {
  if (target.type === "blob") {
    // Vercel Blob: straight from the browser to the store, with a token
    // the server scoped to exactly this file.
    const { put } = await import("@vercel/blob/client");
    await put(target.pathname, new Blob([body as BlobPart], { type: target.contentType }), {
      access: target.access,
      token: target.token,
      contentType: target.contentType,
      // Blob's parts are 8 MB, so a file of two or more goes up in
      // parallel parts that retry on their own — faster, and kinder to a
      // shaky connection. (Smaller, it'd be one part plus two extra round
      // trips to start and finish it: slower than a plain upload.)
      multipart: body.length > 16 * 1024 * 1024,
      onUploadProgress: ({ loaded }) => onProgress(loaded),
    });
    return;
  }
  return putWithProgress(target, body, onProgress);
}

/** PUT with upload progress — fetch still can't report that, XHR can. */
function putWithProgress(
  target: Extract<UploadTarget, { type: "put" }>,
  body: Uint8Array,
  onProgress: (loaded: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(new Blob([body as BlobPart]));
  });
}

async function decode(file: File): Promise<{ left: Float32Array; right: Float32Array; duration: number }> {
  const data = await file.arrayBuffer();
  // An offline context at 44.1 kHz resamples whatever the file is to the
  // rate the model expects, and needs no user gesture to exist.
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(data);
  } catch {
    throw new Error("This browser can't read that file — try an MP3 or WAV");
  }
  const limit = isConstrainedDevice() ? MAX_SECONDS_MOBILE : MAX_SECONDS;
  if (buffer.duration > limit) {
    throw new Error(
      limit === MAX_SECONDS
        ? `Songs can be up to ${limit / 60} minutes long`
        : `On a phone or tablet songs can be up to ${limit / 60} minutes long — use a computer for longer ones`
    );
  }
  const left = buffer.getChannelData(0).slice();
  const right = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice();
  return { left, right, duration: buffer.duration };
}

/**
 * Decodes and splits one song, and encodes its stems — everything that
 * happens on this device, before anything is sent anywhere. One song at a
 * time: `own` songs (the user's) go before ones split for someone else.
 */
export async function splitSong(
  file: File,
  onStage: (stage: UploadStage) => void,
  { own = true, signal }: { own?: boolean; signal?: AbortSignal } = {}
): Promise<{ result: SplitResult; duration: number }> {
  return splitter.exclusive(own, () => onStage({ stage: "waiting" }), async () => {
    signal?.throwIfAborted();
    onStage({ stage: "decoding" });
    const { left, right, duration } = await decode(file);

    if (splitter.state.status !== "ready") onStage({ stage: "loading-model" });
    await splitter.load();

    onStage({ stage: "splitting", progress: 0 });
    try {
      const result = await splitter.split(left, right, (stage, value) => onStage({ stage, progress: value }), signal);
      return { result, duration };
    } finally {
      // Give the memory back before uploading, and to the rest of the app.
      if (isConstrainedDevice()) splitter.unload();
    }
  });
}

/** What POST /api/tracks (or a split-queue job's /track) needs to know about a split song. */
export function splitTrackPayload(file: { name: string }, result: SplitResult, duration: number, tags: string[]) {
  return {
    title: file.name.replace(/\.[^/.]+$/, "").slice(0, 200) || "Untitled",
    filename: file.name,
    duration,
    bpm: result.bpm,
    vocalsPeaks: result.peaks.vocals,
    beatPeaks: result.peaks.beat,
    partPeaks: {
      drums: result.peaks.drums,
      bass: result.peaks.bass,
      other: result.peaks.other,
    },
    tags,
  };
}

/** Uploads every stem the server made room for (older servers: two), in parallel. */
export async function uploadStems(
  uploads: Record<string, UploadTarget>,
  result: SplitResult,
  onStage: (stage: UploadStage) => void
) {
  const files = (Object.entries(uploads) as [SplitOutput, UploadTarget][])
    .map(([kind, target]) => ({ kind, target, bytes: result.mp3[kind] }))
    .filter((f): f is { kind: SplitOutput; target: UploadTarget; bytes: Uint8Array } => !!f.bytes);
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  const sent: Partial<Record<SplitOutput, number>> = {};
  const report = () =>
    onStage({ stage: "uploading", progress: Object.values(sent).reduce((a, b) => a + (b ?? 0), 0) / total });
  report();
  await Promise.all(files.map((f) => upload(f.target, f.bytes, (n) => ((sent[f.kind] = n), report()))));
}

/**
 * Decodes, splits, encodes and uploads one song; resolves with the new
 * track's id once it's ready in the library.
 */
export async function uploadSong(
  file: File,
  onStage: (stage: UploadStage) => void,
  { tags = [] }: { tags?: string[] } = {}
): Promise<string> {
  const { result, duration } = await splitSong(file, onStage);

  onStage({ stage: "saving" });
  const created = await fetch("/api/tracks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...splitTrackPayload(file, result, duration, tags),
      // The upload form doesn't start without the box ticked.
      rightsConfirmed: true,
    }),
  });
  const track = await created.json().catch(() => null);
  if (!created.ok || !track?.id) {
    throw new Error(track?.error ?? "Couldn't save the track");
  }

  await uploadStems(track.uploads, result, onStage);

  onStage({ stage: "saving" });
  const done = await fetch(`/api/tracks/${track.id}/complete`, { method: "POST" });
  if (!done.ok) {
    const data = await done.json().catch(() => null);
    throw new Error(data?.error ?? "Couldn't finish saving the track");
  }
  return track.id as string;
}

/**
 * Gets the song behind a link (YouTube, SoundCloud, …) as a File, ready
 * for `uploadSong`. The server fetches it — browsers aren't allowed to
 * read those sites — and parks it briefly; it's deleted as soon as it's
 * here.
 */
export async function fetchSongFromLink(
  link: string,
  onStage: (stage: UploadStage) => void
): Promise<File> {
  onStage({ stage: "fetching-link" });
  const res = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: link }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) throw new Error(data?.error ?? "Couldn't get a song from that link");

  const url = `/api/import/${data.id}`;
  onStage({ stage: "downloading", progress: 0 });
  try {
    const bytes = await fetchInSlices(url, (loaded, total) =>
      onStage({ stage: "downloading", progress: loaded / Math.max(1, total) })
    );
    const ext = String(data.id).split(".").pop();
    return new File([bytes], `${data.title}.${ext}`);
  } finally {
    void fetch(url, { method: "DELETE" }).catch(() => {});
  }
}
