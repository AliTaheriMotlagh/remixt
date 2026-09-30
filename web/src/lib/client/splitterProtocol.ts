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
      /** Also keep the beat's drums, bass and other parts as stems of their own. */
      parts: boolean;
    }
  /** Stop a split at the next segment; it ends with a split-error. */
  | { type: "cancel"; jobId: number };

/** What a split produces: always vocals and beat, plus the beat's parts if asked. */
export type SplitOutput = "vocals" | "beat" | "drums" | "bass" | "other";

export type SplitResult = {
  mp3: Partial<Record<SplitOutput, Uint8Array>> & { vocals: Uint8Array; beat: Uint8Array };
  peaks: Partial<Record<SplitOutput, number[]>> & { vocals: number[]; beat: number[] };
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
