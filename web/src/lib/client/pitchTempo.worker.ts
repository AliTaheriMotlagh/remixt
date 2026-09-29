/// <reference lib="webworker" />

// Runs a SoundTouch pitch/tempo render off the main thread (see
// pitchTempo.ts). A four-minute stem is several seconds of number
// crunching; done on the page it froze the Studio — the play button
// included — until it finished.

import { SimpleFilter, SoundTouch, WebAudioBufferSource } from "soundtouchjs";

declare const self: DedicatedWorkerGlobalScope;

export type PitchTempoRequest = {
  left: Float32Array;
  right: Float32Array;
  tempo: number;
  pitchSemitones: number;
};

export type PitchTempoResponse =
  | { ok: true; left: Float32Array; right: Float32Array }
  | { ok: false; message: string };

self.onmessage = (event: MessageEvent<PitchTempoRequest>) => {
  try {
    const { left, right, tempo, pitchSemitones } = event.data;
    // WebAudioBufferSource only reads channels through this much of the
    // AudioBuffer interface, which workers don't have.
    const buffer = {
      numberOfChannels: 2,
      length: left.length,
      getChannelData: (channel: number) => (channel === 0 ? left : right),
    };
    const soundtouch = new SoundTouch();
    soundtouch.tempo = tempo;
    soundtouch.pitchSemitones = pitchSemitones;
    const filter = new SimpleFilter(new WebAudioBufferSource(buffer as unknown as AudioBuffer), soundtouch);

    const CHUNK_FRAMES = 16384;
    const scratch = new Float32Array(CHUNK_FRAMES * 2);
    // Output length is about input / tempo; grow if SoundTouch gives more.
    let capacity = Math.ceil(left.length / tempo) + CHUNK_FRAMES;
    let outLeft = new Float32Array(capacity);
    let outRight = new Float32Array(capacity);
    let frames = 0;
    for (;;) {
      const extracted = filter.extract(scratch, CHUNK_FRAMES);
      if (extracted <= 0) break;
      if (frames + extracted > capacity) {
        capacity = Math.ceil((frames + extracted) * 1.25);
        const grownLeft = new Float32Array(capacity);
        const grownRight = new Float32Array(capacity);
        grownLeft.set(outLeft.subarray(0, frames));
        grownRight.set(outRight.subarray(0, frames));
        outLeft = grownLeft;
        outRight = grownRight;
      }
      for (let i = 0; i < extracted; i++) {
        outLeft[frames + i] = scratch[i * 2];
        outRight[frames + i] = scratch[i * 2 + 1];
      }
      frames += extracted;
    }

    const resultLeft = outLeft.slice(0, frames);
    const resultRight = outRight.slice(0, frames);
    self.postMessage({ ok: true, left: resultLeft, right: resultRight } satisfies PitchTempoResponse, [
      resultLeft.buffer,
      resultRight.buffer,
    ]);
  } catch (err) {
    self.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) } satisfies PitchTempoResponse);
  }
};
