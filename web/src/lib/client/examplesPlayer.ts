// A tiny player for the Examples lab. It owns its own AudioContext, so the
// page can never disturb the Studio's engine, and gets everything it started
// back on stop/dispose.

export type LabLayer = {
  id: string;
  buffer: AudioBuffer;
  gain: number;
  /** Loop the buffer from 0 to this many seconds (or the whole buffer if loop is true without it). */
  loop?: boolean;
  loopEnd?: number;
};

export class LabPlayback {
  private readonly ctx: AudioContext;
  private readonly sources = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private readonly startedAt: number;
  private readonly offset: number;
  private readonly loopLength: number;
  private stopped = false;
  onEnded: (() => void) | null = null;

  constructor(ctx: AudioContext, out: AudioNode, layers: LabLayer[], offset: number) {
    this.ctx = ctx;
    this.offset = offset;
    this.startedAt = ctx.currentTime + 0.06;
    this.loopLength = layers.find((l) => l.loop)?.loopEnd ?? layers[0]?.buffer.duration ?? 1;
    for (const layer of layers) {
      const src = ctx.createBufferSource();
      src.buffer = layer.buffer;
      if (layer.loop) {
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = Math.min(layer.loopEnd ?? layer.buffer.duration, layer.buffer.duration);
      }
      const gain = ctx.createGain();
      gain.gain.value = layer.gain;
      src.connect(gain).connect(out);
      src.start(this.startedAt, Math.min(offset, Math.max(0, layer.buffer.duration - 0.01)));
      this.sources.set(layer.id, { src, gain });
    }
    const first = this.sources.values().next().value;
    if (first && !layers.some((l) => l.loop)) {
      first.src.onended = () => {
        if (!this.stopped) this.onEnded?.();
      };
    }
  }

  setGain(id: string, value: number) {
    const s = this.sources.get(id);
    if (!s) return;
    const t = this.ctx.currentTime;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setTargetAtTime(value, t, 0.015);
  }

  /** Seconds into the (looped) material. */
  position() {
    const t = Math.max(0, this.ctx.currentTime - this.startedAt);
    return this.loopLength > 0 ? (this.offset + t) % this.loopLength : this.offset + t;
  }

  /** Seconds since playback began. */
  elapsed() {
    return Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  /** Fraction (0..1) through the loop length; for non-looped playback pass the duration. */
  fraction(total: number) {
    return Math.min(1, this.position() / total);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    for (const { src, gain } of this.sources.values()) {
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, 0.008);
        src.stop(t + 0.05);
      } catch {
        // Already stopped.
      }
      src.onended = null;
    }
    const sources = [...this.sources.values()];
    setTimeout(() => {
      for (const { src, gain } of sources) {
        try {
          src.disconnect();
          gain.disconnect();
        } catch {
          // Already gone.
        }
      }
    }, 120);
    this.sources.clear();
  }
}

export class LabAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: LabPlayback | null = null;
  private unlocked = false;

  /** Creates (or resumes) the context. Call it from a click/tap handler: iOS only allows audio then. */
  ensure(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.unlocked = false;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.unlocked) {
      // A silent blip inside the gesture unlocks output on iOS.
      const blip = this.ctx.createBufferSource();
      blip.buffer = this.ctx.createBuffer(1, 1, 22050);
      blip.connect(this.ctx.destination);
      blip.start(0);
      this.unlocked = true;
    }
    return this.ctx;
  }

  play(layers: LabLayer[], offset = 0): LabPlayback {
    const ctx = this.ensure();
    this.current?.stop();
    this.current = new LabPlayback(ctx, this.master!, layers, offset);
    return this.current;
  }

  stop() {
    this.current?.stop();
    this.current = null;
  }

  dispose() {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }
}
