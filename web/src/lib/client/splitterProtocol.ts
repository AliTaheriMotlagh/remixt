// Messages between the page (splitter.ts) and the splitting worker
// (splitter.worker.ts).

/** MP3 bitrates, in kbit/s, worth offering for stems. */
export const STEM_BITRATES = [128, 160, 192, 224, 256, 320] as const;
export type StemBitrate = (typeof STEM_BITRATES)[number];

export type SplitterRequest =
  | {
      type: "init";
      modelUrl: string;
      wasmUrl: string;
      ortUrl: string;
      ortBase: string;
      expectedBytes: number;
    }
  | {
      type: "split";
      jobId: number;
      left: Float32Array;
      right: Float32Array;
      sampleRate: number;
      bitrate: StemBitrate;
    };

export type SplitResult = {
  vocalsMp3: Uint8Array;
  beatMp3: Uint8Array;
  vocalsPeaks: number[];
  beatPeaks: number[];
  bpm: number | null;
};

export type SplitterResponse =
  | { type: "download"; loaded: number; total: number; fromCache: boolean }
  | { type: "starting" }
  | { type: "ready"; backend: "webgpu" | "wasm"; threads: number }
  | { type: "init-error"; message: string }
  | { type: "progress"; jobId: number; stage: "splitting" | "encoding"; value: number }
  | ({ type: "result"; jobId: number } & SplitResult)
  | { type: "split-error"; jobId: number; message: string };
