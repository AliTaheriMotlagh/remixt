declare module "soundtouchjs" {
  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames?: number, position?: number): number;
  }

  /** Interleaved stereo FIFO (frames = sample pairs). */
  export interface FifoSampleBuffer {
    readonly frameCount: number;
    putSamples(samples: Float32Array, position?: number, numFrames?: number): void;
    receiveSamples(output: Float32Array, numFrames?: number): void;
    clear(): void;
  }

  export class SoundTouch {
    constructor();
    tempo: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
    clear(): void;
    readonly inputBuffer: FifoSampleBuffer;
    readonly outputBuffer: FifoSampleBuffer;
    /** The time-stretch stage; its parameters can be tuned. */
    readonly stretch: { setParameters(sampleRate: number, sequenceMs: number, seekWindowMs: number, overlapMs: number): void };
    process(): void;
  }

  export class SimpleFilter {
    constructor(sourceSound: WebAudioBufferSource, pipe: SoundTouch, callback?: () => void);
    extract(target: Float32Array, numFrames?: number): number;
    clear(): void;
  }
}
