"use client";

import { audioEngine } from "./audioEngine";
import { encodeMp3Bytes } from "./mp3";
import { upload, type UploadTarget } from "./splitter";

// Records a vocal over the Studio mix. The microphone is read inside the
// Studio's own audio graph (an AudioWorklet), so every block of samples
// comes stamped with the audio clock's time — which is what lets the take
// land on the timeline exactly where it was sung, rather than wherever a
// MediaRecorder happened to start.

const WORKLET = `
class RemixtTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 4096;
    this.left = new Float32Array(this.size);
    this.right = new Float32Array(this.size);
    this.filled = 0;
    this.startTime = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const l = input[0];
      const r = input[1] || input[0];
      if (this.filled === 0) this.startTime = currentTime;
      this.left.set(l, this.filled);
      this.right.set(r, this.filled);
      this.filled += l.length;
      if (this.filled + 128 > this.size) {
        this.port.postMessage({
          time: this.startTime,
          left: this.left.slice(0, this.filled),
          right: this.right.slice(0, this.filled),
        });
        this.filled = 0;
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
};

export type Recording = {
  /** Stops recording (and the mix) and hands back the take, or null if nothing was captured. */
  stop: () => Promise<Take | null>;
  /** Stops without keeping anything. */
  cancel: () => void;
  /** Live input level, 0..1, for a meter. */
  level: () => number;
};

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
 * Starts recording and the mix together. `ctxPromise` must be the result
 * of audioEngine.prepareAudio() called inside the tap that started this.
 */
export async function startRecording(ctxPromise: Promise<AudioContext>): Promise<Recording> {
  const ctx = await ctxPromise;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // A singer wants their voice as it is, not phone-call processed.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    throw new Error(
      name === "NotAllowedError"
        ? "Microphone access was blocked — allow it in the browser's site settings and try again"
        : name === "NotFoundError"
          ? "No microphone found"
          : "Couldn't open the microphone"
    );
  }
  await ensureWorklet(ctx);

  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, "remixt-tap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  // The tap has to be connected through to the output to be run; silently.
  const silent = ctx.createGain();
  silent.gain.value = 0;
  source.connect(tap);
  tap.connect(silent);
  silent.connect(ctx.destination);

  const chunks: { time: number; left: Float32Array; right: Float32Array }[] = [];
  let recording = false;
  let lastLevel = 0;
  tap.port.onmessage = (event: MessageEvent<{ time: number; left: Float32Array; right: Float32Array }>) => {
    let peak = 0;
    for (let i = 0; i < event.data.left.length; i += 8) peak = Math.max(peak, Math.abs(event.data.left[i]));
    lastLevel = peak;
    if (recording) chunks.push(event.data);
  };

  const teardown = () => {
    recording = false;
    tap.port.onmessage = null;
    source.disconnect();
    tap.disconnect();
    silent.disconnect();
    for (const track of stream.getTracks()) track.stop();
  };

  // What the singer hears comes out late by the output latency, and their
  // voice reaches us late by the input latency; the take is shifted back
  // by both so it lines up with the beat it was sung to.
  const inputLatency = (stream.getAudioTracks()[0]?.getSettings() as { latency?: number }).latency ?? 0.01;
  const outputLatency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
  const latency = inputLatency + outputLatency;

  try {
    await audioEngine.play();
    // From here on, each block's clock time maps onto the timeline.
    recording = true;
  } catch (err) {
    teardown();
    throw err;
  }

  return {
    level: () => lastLevel,
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
      return { buffer, start, peaks: peaksOf(left) };
    },
  };
}

/**
 * Uploads a take as a vocal stem in the library (a "track" with just a
 * vocal) and returns its stem, ready to add as a lane.
 */
export async function uploadTake(
  take: Take,
  title: string,
  bpm: number | null,
  onProgress: (fraction: number) => void
): Promise<{ stemId: string; trackId: string }> {
  const bytes = await encodeMp3Bytes(take.buffer, { bitrate: 192, trimDelay: true });
  const created = await fetch("/api/tracks", {
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
  });
  const track = await created.json().catch(() => null);
  if (!created.ok || !track?.id) throw new Error(track?.error ?? "Couldn't save the recording");

  await upload(track.uploads.vocals as UploadTarget, bytes, (n) => onProgress(n / bytes.length));
  const done = await fetch(`/api/tracks/${track.id}/complete`, { method: "POST" });
  if (!done.ok) {
    const data = await done.json().catch(() => null);
    throw new Error(data?.error ?? "Couldn't finish saving the recording");
  }
  const info = await fetch(`/api/tracks/${track.id}`).then((res) => res.json());
  const stem = (info.stems as { id: string; kind: string }[]).find((s) => s.kind === "vocals");
  if (!stem) throw new Error("The recording saved, but its stem is missing");
  return { stemId: stem.id, trackId: track.id };
}
