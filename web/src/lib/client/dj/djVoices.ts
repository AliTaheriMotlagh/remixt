"use client";

// The two ways a deck plays that Web Audio's buffer sources can't do:
//
//  - Key lock (master tempo): the stems are mixed (stem kills applied) and
//    run through SoundTouch's time-stretcher in real time, so the tempo
//    fader changes speed but not pitch. The stretcher only follows the
//    deck's clock on average, so every block compares the deck's analytic
//    position with where the audio is and trims the stretch tempo by up to
//    ±2 % (see keyLockTrim), or restarts it in place after a seek or a stall.
//    The deck's position maths stays exactly as without key lock.
//  - Scratching / needle search: a varispeed reader that follows the hand
//    on the platter, forwards or backwards.
//
// Both run in a ScriptProcessorNode on the main thread. An AudioWorklet
// would be glitch-proof, but it would need its own copy of the decoded
// stems (~85 MB each) since SharedArrayBuffer needs cross-origin isolation
// this site doesn't have. With a 2048-frame block (~46 ms) the main thread
// has headroom; a long stall (a heavy re-render) can still cause a click,
// after which the voice resyncs by itself.

import { SoundTouch } from "soundtouchjs";
import { keyLockTrim, loopAwareDiff } from "./djControls";

/** How far ahead of its input the stretcher's output starts (see KeyLockVoice.process). */
const LEAD_SEC = 0.022;

export type VoiceHost = {
  buffers: AudioBuffer[];
  /** Target gain per buffer (stem kills), read every block. */
  gains: () => number[];
  loop: () => { active: boolean; start: number; end: number };
  duration: number;
};

export function canRunJsVoices(ctx: BaseAudioContext) {
  return typeof (ctx as AudioContext).createScriptProcessor === "function";
}

/** Reads the stems as one stereo signal, with smoothed per-stem gains and loop wrap. */
class StemMixer {
  private readonly ch: { l: Float32Array; r: Float32Array }[];
  readonly frames: number;
  private readonly g: Float32Array;

  constructor(buffers: AudioBuffer[]) {
    this.ch = buffers.map((b) => ({ l: b.getChannelData(0), r: b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0) }));
    this.frames = Math.min(...buffers.map((b) => b.length));
    this.g = new Float32Array(buffers.length);
  }

  setGainsNow(target: number[]) {
    for (let i = 0; i < this.g.length; i++) this.g[i] = target[i] ?? 1;
  }

  /** `n` frames from integer frame `cursor` into interleaved `out`; returns the next cursor. */
  read(out: Float32Array, n: number, cursor: number, target: number[], loop: { start: number; end: number } | null) {
    const k = this.ch.length;
    const from = Array.from(this.g);
    let c = cursor;
    for (let i = 0; i < n; i++) {
      if (loop && c >= loop.end && c < loop.end + n * 4) c = loop.start + (c - loop.end);
      let l = 0;
      let r = 0;
      if (c >= 0 && c < this.frames) {
        const f = i / n;
        for (let s = 0; s < k; s++) {
          const gain = from[s] + ((target[s] ?? 1) - from[s]) * f;
          if (gain === 0) continue;
          l += this.ch[s].l[c] * gain;
          r += this.ch[s].r[c] * gain;
        }
      }
      out[2 * i] = l;
      out[2 * i + 1] = r;
      c++;
    }
    for (let s = 0; s < k; s++) this.g[s] = target[s] ?? 1;
    return c;
  }

  /** One interpolated frame at a fractional position. */
  sample(pos: number, out: [number, number]) {
    const i = Math.floor(pos);
    const f = pos - i;
    let l = 0;
    let r = 0;
    if (i >= 0 && i + 1 < this.frames) {
      for (let s = 0; s < this.ch.length; s++) {
        const g = this.g[s];
        if (g === 0) continue;
        const { l: L, r: R } = this.ch[s];
        l += (L[i] + (L[i + 1] - L[i]) * f) * g;
        r += (R[i] + (R[i + 1] - R[i]) * f) * g;
      }
    }
    out[0] = l;
    out[1] = r;
  }

  approachGains(target: number[], amount: number) {
    for (let s = 0; s < this.g.length; s++) this.g[s] += ((target[s] ?? 1) - this.g[s]) * amount;
  }
}

abstract class JsVoice {
  protected readonly ctx: AudioContext;
  protected readonly node: ScriptProcessorNode;
  protected readonly env: GainNode;
  protected readonly mixer: StemMixer;
  protected readonly host: VoiceHost;
  protected readonly sr: number;
  protected stopped = false;

  constructor(ctx: AudioContext, out: AudioNode, host: VoiceHost, blockSize: number) {
    this.ctx = ctx;
    this.host = host;
    this.sr = host.buffers[0]?.sampleRate ?? ctx.sampleRate;
    this.mixer = new StemMixer(host.buffers);
    this.mixer.setGainsNow(host.gains());
    this.node = ctx.createScriptProcessor(blockSize, 2, 2);
    this.env = ctx.createGain();
    this.env.gain.value = 0;
    this.env.gain.setTargetAtTime(1, ctx.currentTime, 0.004);
    this.node.onaudioprocess = (e) => {
      if (this.stopped) return;
      this.process(e);
    };
    this.node.connect(this.env).connect(out);
  }

  protected abstract process(e: AudioProcessingEvent): void;

  protected loopFrames() {
    const loop = this.host.loop();
    if (!loop.active || loop.end - loop.start < 0.005) return null;
    return { start: Math.round(loop.start * this.sr), end: Math.round(loop.end * this.sr) };
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setTargetAtTime(0, now, 0.004);
    setTimeout(() => {
      this.node.onaudioprocess = null;
      this.node.disconnect();
      this.env.disconnect();
    }, 60);
  }
}

/** Key-locked playback: time-stretched to the deck's rate, pitch untouched. */
export class KeyLockVoice extends JsVoice {
  private readonly st = new SoundTouch();
  private readonly chunk = new Float32Array(2048 * 2);
  private block: Float32Array;
  private cursor = 0;
  /** Source seconds of the next output frame, by our own accounting. */
  private model = 0;
  private needsSync = true;
  private readonly positionAt: (t: number) => number;
  private readonly rate: () => number;
  private readonly startsAt: number;

  constructor(ctx: AudioContext, out: AudioNode, host: VoiceHost, opts: { positionAt: (t: number) => number; rate: () => number; startsAt: number }) {
    super(ctx, out, host, 2048);
    this.positionAt = opts.positionAt;
    this.rate = opts.rate;
    this.startsAt = opts.startsAt;
    this.block = new Float32Array(2048 * 2);
    this.st.stretch.setParameters(this.sr, 0, 0, 8);
  }

  /** After a seek or loop change: restart the stretcher where the deck is. */
  resync() {
    this.needsSync = true;
  }

  protected process(e: AudioProcessingEvent) {
    const L = e.outputBuffer.getChannelData(0);
    const R = e.outputBuffer.getChannelData(1);
    const n = L.length;
    const t = e.playbackTime || this.ctx.currentTime + n / this.ctx.sampleRate;
    const rate = this.rate();
    if (t + n / this.ctx.sampleRate <= this.startsAt || rate < 0.02) {
      L.fill(0);
      R.fill(0);
      this.needsSync = true;
      return;
    }
    const target = this.positionAt(Math.max(t, this.startsAt));
    const loop = this.host.loop();
    let trim = this.needsSync ? null : keyLockTrim(loopAwareDiff(target, this.model, loop));
    if (trim === null) {
      this.st.clear();
      // WSOLA's first output comes from a little way into its input (the
      // overlap and seek window): start that much earlier so what's heard
      // lines up with the deck's clock (measured: ~20 ms).
      this.cursor = Math.max(0, Math.round((target - LEAD_SEC * rate) * this.sr));
      this.model = target;
      this.needsSync = false;
      trim = 1;
    }
    const tempo = rate * trim;
    this.st.tempo = tempo;
    if (this.block.length < n * 2) this.block = new Float32Array(n * 2);
    const gains = this.host.gains();
    const lf = this.loopFrames();
    let guard = 0;
    while (this.st.outputBuffer.frameCount < n && guard++ < 64) {
      const frames = this.chunk.length / 2;
      this.cursor = this.mixer.read(this.chunk, frames, this.cursor, gains, lf);
      this.st.inputBuffer.putSamples(this.chunk, 0, frames);
      this.st.process();
    }
    const got = Math.min(n, this.st.outputBuffer.frameCount);
    this.st.outputBuffer.receiveSamples(this.block, got);
    for (let i = 0; i < got; i++) {
      L[i] = this.block[2 * i];
      R[i] = this.block[2 * i + 1];
    }
    for (let i = got; i < n; i++) L[i] = R[i] = 0;
    this.model += (n / this.ctx.sampleRate) * tempo;
    if (loop.active && this.model >= loop.end && loop.end - loop.start > 0.005) this.model = loop.start + ((this.model - loop.start) % (loop.end - loop.start));
    if (this.model >= this.host.duration) this.needsSync = true;
  }
}

/**
 * A hand on the platter. `target()` is where the hand has put the record
 * (source seconds); the reader glides there over the next block, so the
 * sound follows the hand's speed and direction, like a real scratch.
 */
export class ScratchVoice extends JsVoice {
  private pos: number;
  private vel = 0;
  private readonly target: () => number;
  private readonly frame: [number, number] = [0, 0];

  constructor(ctx: AudioContext, out: AudioNode, host: VoiceHost, start: number, target: () => number) {
    super(ctx, out, host, 1024);
    this.pos = start * this.sr;
    this.target = target;
  }

  /** Where the audio is now (source seconds). */
  get position() {
    return this.pos / this.sr;
  }

  protected process(e: AudioProcessingEvent) {
    const L = e.outputBuffer.getChannelData(0);
    const R = e.outputBuffer.getChannelData(1);
    const n = L.length;
    this.mixer.approachGains(this.host.gains(), 0.5);
    const goal = this.target() * this.sr;
    // Frames per output frame needed to arrive in one block, limited to ±6× speed.
    const want = Math.max(-6, Math.min(6, (goal - this.pos) / n));
    const end = this.host.duration * this.sr;
    for (let i = 0; i < n; i++) {
      // A light hand: the platter's inertia smooths the speed.
      this.vel += (want - this.vel) * 0.02;
      this.pos = Math.max(0, Math.min(end - 2, this.pos + this.vel));
      this.mixer.sample(this.pos, this.frame);
      // Slow movement is quieter, as on a real record.
      const level = Math.min(1, Math.abs(this.vel) * 1.6);
      L[i] = this.frame[0] * level;
      R[i] = this.frame[1] * level;
    }
  }
}
