"use client";

import { SimpleFilter, SoundTouch, WebAudioBufferSource } from "soundtouchjs";

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

  if (totalFrames === 0) return sourceBuffer;

  const outBuffer = audioCtx.createBuffer(
    2,
    totalFrames,
    sourceBuffer.sampleRate
  );
  const left = outBuffer.getChannelData(0);
  const right = outBuffer.getChannelData(1);
  let offset = 0;
  for (const chunk of chunks) {
    const frames = chunk.length / 2;
    for (let i = 0; i < frames; i++) {
      left[offset + i] = chunk[i * 2];
      right[offset + i] = chunk[i * 2 + 1];
    }
    offset += frames;
  }
  return outBuffer;
}
