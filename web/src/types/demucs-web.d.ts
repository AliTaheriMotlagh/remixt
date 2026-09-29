declare module "demucs-web" {
  type Channels = { left: Float32Array; right: Float32Array };

  type Progress = { progress: number; currentSegment: number; totalSegments: number };

  export class DemucsProcessor {
    /** Replaceable after construction; called once per model segment. */
    onProgress: (progress: Progress) => void;
    /** The ONNX Runtime session, once loadModel has resolved. */
    session: {
      inputNames: string[];
      outputNames: string[];
      run(
        feeds: Record<string, unknown>
      ): Promise<Record<string, { dims: readonly number[]; data: Float32Array }>>;
    } | null;
    constructor(options: {
      ort: unknown;
      sessionOptions?: Record<string, unknown>;
      onProgress?: (progress: Progress) => void;
      onLog?: (phase: string, message: string) => void;
    });
    loadModel(model: ArrayBuffer | string): Promise<unknown>;
    separate(
      left: Float32Array,
      right: Float32Array
    ): Promise<{ drums: Channels; bass: Channels; other: Channels; vocals: Channels }>;
  }
}

declare module "demucs-web/processor" {
  type Spec = {
    leftReal: Float32Array;
    leftImag: Float32Array;
    rightReal: Float32Array;
    rightImag: Float32Array;
  };
  export function prepareModelInput(
    left: Float32Array,
    right: Float32Array
  ): { waveform: Float32Array; magSpec: Float32Array };
  export function standaloneMask(freqOutput: Float32Array): Spec[];
  export function standaloneIspec(
    spec: Spec,
    targetLength: number
  ): { left: Float32Array; right: Float32Array };
}

declare module "demucs-web/constants" {
  export const CONSTANTS: {
    SAMPLE_RATE: number;
    TRAINING_SAMPLES: number;
    MODEL_SPEC_BINS: number;
    MODEL_SPEC_FRAMES: number;
    SEGMENT_OVERLAP: number;
    TRACKS: string[];
  };
}
