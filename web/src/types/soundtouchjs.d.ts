declare module "soundtouchjs" {
  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames?: number, position?: number): number;
  }

  export class SoundTouch {
    constructor();
    tempo: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
    clear(): void;
  }

  export class SimpleFilter {
    constructor(sourceSound: WebAudioBufferSource, pipe: SoundTouch, callback?: () => void);
    extract(target: Float32Array, numFrames?: number): number;
    clear(): void;
  }
}
