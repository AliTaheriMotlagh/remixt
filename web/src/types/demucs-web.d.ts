declare module "demucs-web" {
  type Channels = { left: Float32Array; right: Float32Array };

  type Progress = { progress: number; currentSegment: number; totalSegments: number };

  export class DemucsProcessor {
    /** Replaceable after construction; called once per model segment. */
    onProgress: (progress: Progress) => void;
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
