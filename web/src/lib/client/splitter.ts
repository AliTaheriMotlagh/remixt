"use client";

import { linkCovers } from "./songCovers";
import { useSyncExternalStore } from "react";
import { upload, type Send, type UploadTarget } from "./directUpload";
import { fetchInSlices } from "./stemFetch";
import { SPLITTER_MODEL_URL } from "../modelMirror";
import { isConstrainedDevice } from "./device";
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
export const MODEL_URL = SPLITTER_MODEL_URL;
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
export { isConstrainedDevice };

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
  /** Checking whether this exact song is already in the library. */
  | { stage: "checking" }
  /** A link's song wouldn't come; trying again in a moment. */
  | { stage: "retrying"; reason: string; inSeconds: number }
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
    // On a computer the model starts loading while the song decodes; a
    // phone does one then the other, so it never holds both at once.
    const constrained = isConstrainedDevice();
    if (!constrained) void splitter.load().catch(() => {});
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
      if (constrained) splitter.unload();
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

/**
 * Stems uploading at once: all of a song's usually, to fill the connection
 * (each is one request of a few MB — nothing like enough alone to keep a
 * fast line busy), with progress moving as each lands.
 */
const STEMS_AT_ONCE = 4;

/** Uploads every stem the server made room for (older servers: two), several at a time. */
export async function uploadStems(
  uploads: Record<string, UploadTarget>,
  result: SplitResult,
  onStage: (stage: UploadStage) => void,
  send?: Send,
  signal?: AbortSignal
) {
  const files = (Object.entries(uploads) as [SplitOutput, UploadTarget][])
    .map(([kind, target]) => ({ kind, target, bytes: result.mp3[kind] }))
    .filter((f): f is { kind: SplitOutput; target: UploadTarget; bytes: Uint8Array } => !!f.bytes);
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  const sent: Partial<Record<SplitOutput, number>> = {};
  const report = () =>
    onStage({
      stage: "uploading",
      progress: total ? Math.min(1, Object.values(sent).reduce((a, b) => a + (b ?? 0), 0) / total) : 1,
    });
  report();
  const waiting = [...files];
  // Once one stem has failed the track is abandoned, so the others stop
  // taking new stems rather than keep uploading into it.
  let failed = false;
  const next = async (): Promise<void> => {
    const f = waiting.shift();
    if (!f || failed) return;
    try {
      await upload(
        f.target,
        new Blob([f.bytes as BlobPart], { type: "audio/mpeg" }),
        (n) => {
          sent[f.kind] = Math.min(n, f.bytes.length);
          report();
        },
        send,
        signal
      );
    } catch (err) {
      failed = true;
      throw err;
    }
    return next();
  };
  await Promise.all(Array.from({ length: Math.min(STEMS_AT_ONCE, files.length) }, next));
}

/** A call to this app's API that gives up after this long, rather than hang (the old "frozen after the split"). */
const API_LIMIT_MS = 30_000;

/**
 * `fetch` with a time limit, stopped early by `signal`, sent up to
 * `attempts` times when the connection drops or the server hiccups (5xx).
 * Only for requests that are safe to send twice.
 */
async function callApi(
  url: string,
  init: RequestInit,
  { signal, attempts = 1, what }: { signal?: AbortSignal; attempts?: number; what: string }
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_LIMIT_MS);
    const stop = () => controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500 && attempt < attempts) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      signal?.throwIfAborted();
      if (attempt >= attempts) throw new TransientError(`${what} — check your connection`, { cause: err });
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    }
  }
}

/** A song that was already in the library: nothing was split or uploaded. */
export type AlreadyThere = { id: string; title: string; artist_name: string; mine: boolean };

/**
 * The song's fingerprint (SHA-256 of the file), or null where the browser
 * can't work one out (no WebCrypto outside a secure context).
 */
export async function fingerprint(file: Blob): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** The ready track that is this exact file, if the library has one this user can see. */
async function alreadyThere(hash: string, signal?: AbortSignal): Promise<AlreadyThere | null> {
  try {
    const res = await fetch("/api/tracks/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash }),
      signal,
    });
    if (!res.ok) return null;
    return ((await res.json()) as { track: AlreadyThere | null }).track;
  } catch {
    signal?.throwIfAborted();
    // Only a shortcut: without an answer, the song is split as usual.
    return null;
  }
}

/**
 * Decodes, splits, encodes and uploads one song; resolves with the new
 * track's id once it's ready in the library — or, when this exact file is
 * in the library already (uploaded before, by this user or anyone),
 * with that track, at once, without splitting it again. `signal` cancels
 * it at any point; a track already created for it is dropped.
 */
export async function uploadSong(
  file: File,
  onStage: (stage: UploadStage) => void,
  { tags = [], signal, keepPrivate = false }: { tags?: string[]; signal?: AbortSignal; keepPrivate?: boolean } = {}
): Promise<{ id: string; existing: AlreadyThere | null }> {
  onStage({ stage: "checking" });
  const sourceHash = await fingerprint(file);
  signal?.throwIfAborted();
  const existing = sourceHash ? await alreadyThere(sourceHash, signal) : null;
  if (existing) return { id: existing.id, existing };

  const { result, duration } = await splitSong(file, onStage, { signal });
  signal?.throwIfAborted();

  // Sent again if it doesn't arrive: a second, unfinished copy of the
  // track (its answer lost on the way) is dropped by the server, by the
  // song's fingerprint, when the next one is made.
  onStage({ stage: "saving" });
  const created = await callApi(
    "/api/tracks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...splitTrackPayload(file, result, duration, tags),
        ...(sourceHash ? { sourceHash } : {}),
        ...(keepPrivate ? { private: true } : {}),
        // The upload form doesn't start without the box ticked.
        rightsConfirmed: true,
      }),
    },
    { signal, attempts: sourceHash ? 3 : 1, what: "Couldn't reach the server to save the song" }
  );
  const track = await created.json().catch(() => null);
  if (!created.ok || !track?.id) {
    const message = track?.error ?? "Couldn't save the track";
    throw created.status >= 500 ? new TransientError(message) : new Error(message);
  }

  try {
    await uploadStems(track.uploads, result, onStage, undefined, signal);

    onStage({ stage: "saving" });
    await finishTrack(track.id, signal);
  } catch (err) {
    dropUnfinished(track.id);
    throw err;
  }
  return { id: track.id as string, existing: null };
}

/**
 * Flips an uploaded track to ready. Asked again a few times: a stem the
 * store has only just taken can take a moment to show up (409), and the
 * answer can be lost on a bad connection — asking twice is harmless.
 */
async function finishTrack(trackId: string, signal?: AbortSignal) {
  for (let attempt = 1; ; attempt++) {
    const done = await callApi(
      `/api/tracks/${trackId}/complete`,
      { method: "POST" },
      { signal, attempts: 3, what: "Couldn't reach the server to finish saving the song" }
    );
    if (done.ok) return;
    const data = await done.json().catch(() => null);
    if (done.status === 409 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      continue;
    }
    const message = data?.error ?? "Couldn't finish saving the track";
    throw done.status >= 500 ? new TransientError(message) : new Error(message);
  }
}

/**
 * Takes a track whose stems never all arrived out of the library at once,
 * rather than leaving it "Uploading…" until the server's 20-minute sweep.
 */
export function dropUnfinished(trackId: string) {
  void fetch(`/api/tracks/${trackId}?unfinished=1`, { method: "DELETE" }).catch(() => {});
}

/**
 * Gets the song behind a link (YouTube, SoundCloud, …) as a File, ready
 * for `uploadSong`. The server fetches it — browsers aren't allowed to
 * read those sites — and parks it briefly; it's deleted as soon as it's
 * here.
 */
/** Songs fetchSongFromLink found by searching for the song a link named, rather than at the link itself. */
export const foundBySearch = new WeakSet<File>();

/** A failure worth trying again by itself: the connection, or the server, not the song. */
export class TransientError extends Error {}

export async function fetchSongFromLink(
  link: string,
  onStage: (stage: UploadStage) => void,
  signal?: AbortSignal
): Promise<File> {
  onStage({ stage: "fetching-link" });
  let res: Response;
  try {
    res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link }),
      signal,
    });
  } catch (err) {
    signal?.throwIfAborted();
    throw new TransientError("Couldn't reach the server — check your connection", { cause: err });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    const message = data?.error ?? "Couldn't get a song from that link";
    // 422: the link itself (private, unsupported, too long) — asking again won't help.
    throw res.status >= 500 || res.status === 429 || res.status === 408 ? new TransientError(message) : new Error(message);
  }

  const url = `/api/import/${data.id}`;
  onStage({ stage: "downloading", progress: 0 });
  try {
    const bytes = await fetchInSlices(url, (loaded, total) =>
      onStage({ stage: "downloading", progress: loaded / Math.max(1, total) })
    );
    const ext = String(data.id).split(".").pop();
    const file = new File([bytes], `${data.title}.${ext}`);
    // Looked up by name (a streaming service's link, or YouTube's): say so.
    if (data.foundBySearch) foundBySearch.add(file);
    // The song's page had a picture (and the file none of its own): the track's cover.
    if (typeof data.coverId === "string") linkCovers.set(file, data.coverId);
    return file;
  } finally {
    void fetch(url, { method: "DELETE" }).catch(() => {});
  }
}
