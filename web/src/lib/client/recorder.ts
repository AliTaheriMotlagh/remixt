"use client";

import { audioEngine } from "./audioEngine";
import { encodeMp3Bytes } from "./mp3";
import { upload, type UploadTarget } from "./directUpload";
import { bleedWithLag, checkTake, type TakeCheck } from "@/lib/bleed";

// Records a vocal over the Studio mix. The microphone is read inside the
// Studio's own audio graph (an AudioWorklet), so every block of samples
// comes stamped with the audio clock's time — which is what lets the take
// land on the timeline exactly where it was sung, rather than wherever a
// MediaRecorder happened to start.
//
// The mix is fed into the same worklet as a second input, so for every
// block the worklet has what the singer sang and what they were hearing,
// sample for sample. Their high-frequency envelopes (drum transients live
// there; a voice mostly doesn't) are compared over a range of delays: when
// the mic's envelope follows the mix's, the beat is coming out of speakers
// and into the take.

/** Frames per envelope step: about 10 ms. */
const ENV_STEP = 512;

const WORKLET = `
class RemixtTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 4096;
    this.left = new Float32Array(this.size);
    this.right = new Float32Array(this.size);
    this.filled = 0;
    this.startTime = 0;
    this.step = ${ENV_STEP};
    this.stepFill = 0;
    this.micSum = 0;
    this.mixSum = 0;
    this.micPrev = 0;
    this.mixPrev = 0;
    this.micEnv = [];
    this.mixEnv = [];
  }
  process(inputs) {
    const input = inputs[0];
    const mix = inputs[1];
    if (input && input[0]) {
      const l = input[0];
      const r = input[1] || input[0];
      const m0 = mix && mix[0];
      const m1 = mix && mix[1];
      if (this.filled === 0) this.startTime = currentTime;
      this.left.set(l, this.filled);
      this.right.set(r, this.filled);
      this.filled += l.length;
      // High-frequency envelopes of the mic and the mix, in step.
      for (let i = 0; i < l.length; i++) {
        const v = l[i];
        const dv = v - this.micPrev;
        this.micPrev = v;
        this.micSum += dv * dv;
        const x = m0 ? (m1 ? (m0[i] + m1[i]) * 0.5 : m0[i]) : 0;
        const dx = x - this.mixPrev;
        this.mixPrev = x;
        this.mixSum += dx * dx;
        if (++this.stepFill === this.step) {
          this.micEnv.push(Math.sqrt(this.micSum / this.step));
          this.mixEnv.push(Math.sqrt(this.mixSum / this.step));
          this.stepFill = 0;
          this.micSum = 0;
          this.mixSum = 0;
        }
      }
      if (this.filled + 128 > this.size) {
        this.port.postMessage({
          time: this.startTime,
          left: this.left.slice(0, this.filled),
          right: this.right.slice(0, this.filled),
          micEnv: this.micEnv,
          mixEnv: this.mixEnv,
        });
        this.filled = 0;
        this.micEnv = [];
        this.mixEnv = [];
      }
    }
    return true;
  }
}
registerProcessor("remixt-tap", RemixtTap);
`;

const loadedContexts = new WeakSet<BaseAudioContext>();

async function ensureWorklet(ctx: AudioContext) {
  if (loadedContexts.has(ctx)) return;
  if (!ctx.audioWorklet) throw new Error("This browser can't record here — try an up-to-date Chrome, Safari or Firefox");
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
    loadedContexts.add(ctx);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type Take = {
  buffer: AudioBuffer;
  /** Where the take starts on the project timeline, in seconds. */
  start: number;
  peaks: number[];
  /** Levels: clipping, or too quiet. */
  check: TakeCheck;
  /** The beat was heard leaking into the mic during the take. */
  bleed: boolean;
};

/** How the take is captured. */
export type RecordOptions = {
  countIn?: CountIn;
  /** A microphone or audio interface to record from; the default one when left out. */
  deviceId?: string;
  /**
   * The mix plays out of speakers rather than headphones: the browser's
   * echo canceller is switched on to keep the beat out of the take (at
   * some cost to the voice). Off — the clean studio path — by default.
   */
  speakers?: boolean;
};

/** The microphones and interfaces to record from (named once the mic has been allowed). */
export async function listInputs(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "communications")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  } catch {
    return [];
  }
}

export type Recording = {
  /** Stops recording (and the mix) and hands back the take, or null if nothing was captured. */
  stop: () => Promise<Take | null>;
  /** Stops without keeping anything. */
  cancel: () => void;
  /** Live input level, 0..1, for a meter. */
  level: () => number;
  /**
   * How much of the beat is leaking into the mic right now, 0..1 — read
   * it beside `level` every frame. High while the singer's speakers (not
   * headphones) are carrying the mix, so the take would come home with
   * the beat baked in.
   */
  bleed: () => number;
};

/** A one-bar metronome count-in before the mix comes in, so the take starts in time. */
export type CountIn = {
  /** The project tempo, which spaces the clicks. */
  bpm: number;
  /** Called as each beat is counted, `beats` left (4, 3, 2, 1) — for a countdown on screen. */
  onBeat?: (beatsLeft: number) => void;
};

/**
 * Plays the count-in clicks on the audio clock and waits them out. The
 * singer gets one bar to breathe in before the mix starts, and nothing
 * recorded before the first downbeat — the recorder only keeps chunks
 * once the mix is playing.
 */
async function playCountIn(ctx: AudioContext, { bpm, onBeat }: CountIn) {
  const beats = 4;
  const beat = 60 / (bpm > 0 ? bpm : 120);
  const at = ctx.currentTime + 0.08;
  for (let i = 0; i < beats; i++) {
    const click = ctx.createOscillator();
    const gain = ctx.createGain();
    // The first beat is the downbeat: higher and louder, so it reads.
    click.type = "sine";
    click.frequency.value = i === 0 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, at + i * beat);
    gain.gain.exponentialRampToValueAtTime(i === 0 ? 0.5 : 0.35, at + i * beat + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + i * beat + Math.min(0.14, beat * 0.8));
    click.connect(gain);
    gain.connect(ctx.destination);
    click.start(at + i * beat);
    click.stop(at + i * beat + 0.2);
    const left = beats - i;
    setTimeout(() => onBeat?.(left), Math.max(0, (at + i * beat - ctx.currentTime) * 1000));
  }
  await new Promise((resolve) => setTimeout(resolve, (at + beat * beats - ctx.currentTime) * 1000 + 80));
}

function peaksOf(left: Float32Array, buckets = 600) {
  const size = Math.max(1, Math.floor(left.length / buckets));
  const out: number[] = [];
  let top = 0;
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    for (let i = b * size; i < Math.min(left.length, (b + 1) * size); i++) peak = Math.max(peak, Math.abs(left[i]));
    out.push(peak);
    top = Math.max(top, peak);
  }
  return out.map((p) => Math.round((p / (top || 1)) * 10000) / 10000);
}

/**
 * Gets audio ready for a take. Must run synchronously inside the tap on
 * Record: it puts the phone's audio session into recording mode (iOS
 * otherwise gives the page a silent mic) and unlocks the audio, before
 * anything is awaited. Pass the result to startRecording.
 */
export function prepareRecording(): Promise<AudioContext> {
  audioEngine.setMicActive(true);
  return audioEngine.prepareAudio();
}

/** iOS can pause the audio for a moment while it switches the mic on. */
async function ensureRunning(ctx: AudioContext) {
  if (ctx.state === "running") return;
  await Promise.race([ctx.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1500))]);
  // (Re-read: the await above is what changes it.)
  if ((ctx.state as AudioContextState) !== "running") {
    throw new Error("The phone paused the audio while turning the mic on — tap Record again");
  }
}

/**
 * Starts recording and the mix together. `ctxPromise` must be the result
 * of prepareRecording() called inside the tap that started this. With a
 * `countIn`, the metronome clicks one bar first and the mix (and the take)
 * comes in on the next downbeat.
 */
export async function startRecording(ctxPromise: Promise<AudioContext>, options: RecordOptions = {}): Promise<Recording> {
  try {
    return await openTake(await ctxPromise, options);
  } catch (err) {
    audioEngine.setMicActive(false);
    throw err;
  }
}

async function openTake(ctx: AudioContext, { countIn, deviceId, speakers = false }: RecordOptions): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia) {
    // Browsers only offer the mic to pages on https (or localhost).
    throw new Error(
      window.isSecureContext
        ? "This browser can't record here — try an up-to-date Chrome, Safari or Firefox"
        : "Recording needs a secure (https) connection to the site"
    );
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // A singer wants their voice as it is, not phone-call processed —
      // unless the beat is coming out of speakers, when cancelling it
      // matters more. (Preferences, not requirements: a phone's mic is
      // mono, and a mic that's gone falls back to the default.)
      audio: {
        ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
        echoCancellation: speakers,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
      },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    throw new Error(
      name === "NotAllowedError"
        ? "Microphone access was blocked — allow it in the browser's site settings and try again"
        : name === "NotFoundError"
          ? "No microphone found"
          : name === "NotReadableError"
            ? "The microphone is busy — close other apps using it (a call, a voice memo) and try again"
            : "Couldn't open the microphone"
    );
  }

  let source: MediaStreamAudioSourceNode;
  let tap: AudioWorkletNode;
  const silent = ctx.createGain();
  try {
    await ensureRunning(ctx);
    await ensureWorklet(ctx);
    source = ctx.createMediaStreamSource(stream);
    tap = new AudioWorkletNode(ctx, "remixt-tap", { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    // Firefox refuses a mic whose sample rate differs from the output's.
    if (err instanceof DOMException && err.name === "NotSupportedError") {
      throw new Error("This browser can't record at your device's sample rate — try Chrome or Safari");
    }
    throw err;
  }
  // The tap has to be connected through to the output to be run; silently.
  silent.gain.value = 0;
  source.connect(tap, 0, 0);
  // The mix, sample-aligned with the mic, for the bleed watch.
  const mixTap = audioEngine.getAnalyser();
  mixTap?.connect(tap, 0, 1);
  tap.connect(silent);
  silent.connect(ctx.destination);

  type Block = { time: number; left: Float32Array; right: Float32Array; micEnv: number[]; mixEnv: number[] };
  const chunks: { time: number; left: Float32Array; right: Float32Array }[] = [];
  let recording = false;
  let lastLevel = 0;

  // Beat-bleed watch: the last few seconds of both envelopes, compared at
  // every delay up to ~0.4 s (speakers, the room, Bluetooth). Hysteresis
  // keeps the verdict from flickering: a few blocks in a row to raise it,
  // more to drop it.
  const stepsPerSecond = ctx.sampleRate / ENV_STEP;
  const WINDOW = Math.round(stepsPerSecond * 3);
  const MAX_LAG = Math.round(stepsPerSecond * 0.4);
  const HOT_AT = 0.5;
  const micEnv: number[] = [];
  const mixEnv: number[] = [];
  let hot = 0;
  let bleeding = 0;
  let bledDuringTake = false;

  tap.port.onmessage = (event: MessageEvent<Block>) => {
    const block = event.data;
    let peak = 0;
    for (let i = 0; i < block.left.length; i += 8) peak = Math.max(peak, Math.abs(block.left[i]));
    lastLevel = peak;
    if (mixTap) {
      micEnv.push(...block.micEnv);
      mixEnv.push(...block.mixEnv);
      if (micEnv.length > WINDOW) micEnv.splice(0, micEnv.length - WINDOW);
      if (mixEnv.length > WINDOW) mixEnv.splice(0, mixEnv.length - WINDOW);
      // Only a playing beat and a live mic mean anything.
      let mixLevel = 0;
      for (const v of block.mixEnv) mixLevel = Math.max(mixLevel, v);
      const { score } = mixLevel > 0.002 && peak > 0.004 ? bleedWithLag(micEnv, mixEnv, MAX_LAG) : { score: 0 };
      hot = score >= HOT_AT ? Math.min(8, hot + 1) : Math.max(0, hot - 1);
      bleeding = hot >= 4 ? Math.max(HOT_AT, score) : hot === 0 ? 0 : bleeding;
      if (recording && hot >= 4) bledDuringTake = true;
    }
    if (recording) chunks.push(block);
  };

  const teardown = () => {
    recording = false;
    tap.port.onmessage = null;
    source.disconnect();
    try {
      mixTap?.disconnect(tap);
    } catch {
      // Already apart.
    }
    tap.disconnect();
    silent.disconnect();
    for (const track of stream.getTracks()) track.stop();
    audioEngine.setMicActive(false);
  };

  // What the singer hears comes out late by the output latency, and their
  // voice reaches us late by the input latency; the take is shifted back
  // by both so it lines up with the beat it was sung to.
  const inputLatency = (stream.getAudioTracks()[0]?.getSettings() as { latency?: number }).latency ?? 0.01;
  const outputLatency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
  const latency = inputLatency + outputLatency;

  try {
    // With a count-in, the metronome gives the singer a bar of beats
    // first; the mix (and the take) come in on the next downbeat.
    if (countIn) await playCountIn(ctx, countIn);
    await audioEngine.play();
    // From here on, each block's clock time maps onto the timeline.
    recording = true;
  } catch (err) {
    teardown();
    throw err;
  }

  return {
    level: () => lastLevel,
    bleed: () => bleeding,
    cancel: () => {
      teardown();
      audioEngine.pause();
    },
    stop: async () => {
      // Let the last block through before closing up.
      await new Promise((resolve) => setTimeout(resolve, 120));
      teardown();
      audioEngine.pause();
      if (chunks.length === 0) return null;

      const first = chunks[0];
      const frames = chunks.reduce((n, c) => n + c.left.length, 0);
      let start = audioEngine.timelineAt(first.time) - latency;
      // Anything from before the start of the song is cut off.
      const skip = start < 0 ? Math.min(frames, Math.ceil(-start * ctx.sampleRate)) : 0;
      if (skip) start = 0;
      const length = frames - skip;
      if (length < ctx.sampleRate * 0.3) return null;

      const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      let written = -skip;
      for (const chunk of chunks) {
        for (let i = 0; i < chunk.left.length; i++, written++) {
          if (written < 0) continue;
          left[written] = chunk.left[i];
          right[written] = chunk.right[i];
        }
      }
      return { buffer, start, peaks: peaksOf(left), check: checkTake(left, ctx.sampleRate), bleed: bledDuringTake };
    },
  };
}

/** Where a take's save has got to — each step is named on screen, so a slow one doesn't look like a frozen 0%. */
export type SaveStep = "encoding" | "creating" | "uploading" | "finishing";

/** A call to this app's API that gives up rather than hang on a phone's stalled connection. */
const API_LIMIT_MS = 30_000;

/** `fetch` + reading its JSON, with a time limit, stopped early by `signal`. */
async function apiJson(url: string, init: RequestInit, signal: AbortSignal | undefined, what: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_LIMIT_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data };
  } catch (err) {
    signal?.throwIfAborted();
    throw new Error(`${what} — check your connection and try again`, { cause: err });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** Rejects as soon as `signal` aborts, whatever `work` is still doing. */
function unlessAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * Uploads a take as a vocal stem in the library (a "track" with just a
 * vocal) and returns its stem, ready to add as a lane. `onProgress` gets
 * the step it's on and how far through that step (0–1). `signal` stops it;
 * a track already created for it is deleted.
 */
export async function uploadTake(
  take: Take,
  title: string,
  bpm: number | null,
  onProgress: (step: SaveStep, fraction: number) => void,
  signal?: AbortSignal
): Promise<{ stemId: string; trackId: string }> {
  onProgress("encoding", 0);
  const bytes = await encodeMp3Bytes(take.buffer, {
    bitrate: 192,
    trimDelay: true,
    signal,
    onProgress: (f) => onProgress("encoding", f),
  });

  onProgress("creating", 0);
  const created = await apiJson(
    "/api/tracks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.slice(0, 200) || "Recorded vocal",
        filename: "studio-recording.mp3",
        duration: take.buffer.duration,
        bpm: bpm && bpm >= 20 && bpm <= 300 ? bpm : null,
        vocalsPeaks: take.peaks,
        recording: true,
        tags: ["studio recording"],
        rightsConfirmed: true,
      }),
    },
    signal,
    "Couldn't reach the server to save the take"
  );
  const track = created.data;
  if (!created.ok || !track?.id) throw new Error(track?.error ?? "Couldn't save the recording");

  try {
    onProgress("uploading", 0);
    // The upload has its own stall detection and retries; a cancel just stops waiting for it.
    await unlessAborted(
      upload(track.uploads.vocals as UploadTarget, bytes, (n) => onProgress("uploading", n / bytes.length)),
      signal
    );

    onProgress("finishing", 0);
    const done = await apiJson(`/api/tracks/${track.id}/complete`, { method: "POST" }, signal, "Couldn't finish saving the take");
    if (!done.ok) throw new Error(done.data?.error ?? "Couldn't finish saving the recording");
    const info = await apiJson(`/api/tracks/${track.id}`, {}, signal, "Couldn't finish saving the take");
    const stem = (info.data?.stems as { id: string; kind: string }[] | undefined)?.find((s) => s.kind === "vocals");
    if (!stem) throw new Error("The recording saved, but its stem is missing");
    onProgress("finishing", 1);
    return { stemId: stem.id, trackId: track.id };
  } catch (err) {
    // A half-saved take shouldn't sit in the library as a broken track.
    void fetch(`/api/tracks/${track.id}?unfinished=1`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}
