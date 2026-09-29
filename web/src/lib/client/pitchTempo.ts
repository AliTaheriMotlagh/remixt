"use client";

import { SimpleFilter, SoundTouch, WebAudioBufferSource } from "soundtouchjs";
import type { PitchTempoRequest, PitchTempoResponse } from "./pitchTempo.worker";

// Renders a new AudioBuffer with an independent tempo and pitch applied,
// using SoundTouch's offline (non-realtime) processing pipeline. This is a
// "freeze"/bounce-style operation, not live DSP — we run it once whenever
// a lane's pitch or tempo changes, then play the resulting buffer back
// normally. That keeps multi-lane transport sync simple: after the
// transform, buffer duration == real playback duration, same as today.
export async function renderPitchTempo(
  audioCtx: BaseAudioContext,
  sourceBuffer: AudioBuffer,
  { tempo, pitchSemitones }: { tempo: number; pitchSemitones: number }
): Promise<AudioBuffer> {
  if (Math.abs(tempo - 1) < 0.001 && Math.abs(pitchSemitones) < 0.001) {
    return sourceBuffer;
  }
  let rendered: { left: Float32Array; right: Float32Array };
  try {
    rendered = await renderInWorker(sourceBuffer, tempo, pitchSemitones);
  } catch {
    // No worker (or it failed to start) — slower, but still works.
    rendered = await renderOnPage(sourceBuffer, tempo, pitchSemitones);
  }
  if (rendered.left.length === 0) return sourceBuffer;

  const outBuffer = audioCtx.createBuffer(2, rendered.left.length, sourceBuffer.sampleRate);
  outBuffer.copyToChannel(rendered.left as Float32Array<ArrayBuffer>, 0);
  outBuffer.copyToChannel(rendered.right as Float32Array<ArrayBuffer>, 1);
  return outBuffer;
}

/**
 * One worker per render, so lanes changed together (AI Match, "match
 * all") render in parallel on separate cores, and the page stays
 * responsive throughout.
 */
function renderInWorker(sourceBuffer: AudioBuffer, tempo: number, pitchSemitones: number) {
  return new Promise<{ left: Float32Array; right: Float32Array }>((resolve, reject) => {
    const worker = new Worker(new URL("./pitchTempo.worker.ts", import.meta.url), { type: "module" });
    const left = sourceBuffer.getChannelData(0).slice();
    const right = (
      sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1) : sourceBuffer.getChannelData(0)
    ).slice();
    worker.onmessage = (event: MessageEvent<PitchTempoResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "pitch/tempo worker failed"));
    };
    worker.postMessage({ left, right, tempo, pitchSemitones } satisfies PitchTempoRequest, [
      left.buffer,
      right.buffer,
    ]);
  });
}

async function renderOnPage(sourceBuffer: AudioBuffer, tempo: number, pitchSemitones: number) {
  const source = new WebAudioBufferSource(sourceBuffer);
  const soundtouch = new SoundTouch();
  soundtouch.tempo = tempo;
  soundtouch.pitchSemitones = pitchSemitones;
  const filter = new SimpleFilter(source, soundtouch);

  const CHUNK_FRAMES = 4096;
  const scratch = new Float32Array(CHUNK_FRAMES * 2);
  const chunks: Float32Array[] = [];
  let totalFrames = 0;
  let iterations = 0;

  // Yield to the event loop periodically so a long track doesn't freeze
  // the UI thread for the whole render.
  const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

  for (;;) {
    const framesExtracted = filter.extract(scratch, CHUNK_FRAMES);
    if (framesExtracted <= 0) break;
    chunks.push(scratch.slice(0, framesExtracted * 2));
    totalFrames += framesExtracted;
    iterations++;
    if (iterations % 40 === 0) await yieldToUI();
  }

  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of chunks) {
    const frames = chunk.length / 2;
    for (let i = 0; i < frames; i++) {
      left[offset + i] = chunk[i * 2];
      right[offset + i] = chunk[i * 2 + 1];
    }
    offset += frames;
  }
  return { left, right };
}
