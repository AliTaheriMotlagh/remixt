declare module "signalsmith-stretch" {
  /** An AudioWorkletNode with Signalsmith Stretch's controls (see its README). */
  export type StretchNode = AudioWorkletNode & {
    addBuffers(channels: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<unknown>;
    schedule(change: {
      output?: number;
      active?: boolean;
      input?: number;
      rate?: number;
      semitones?: number;
      tonalityHz?: number;
      formantSemitones?: number;
      formantCompensation?: boolean;
      formantBaseHz?: number;
      loopStart?: number;
      loopEnd?: number;
    }): Promise<unknown>;
    start(when?: number): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    latency(): number;
    configure(options: { blockMs?: number | null; intervalMs?: number; splitComputation?: boolean; preset?: "default" | "cheaper" }): Promise<unknown>;
  };

  export default function SignalsmithStretch(context: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>;
}
