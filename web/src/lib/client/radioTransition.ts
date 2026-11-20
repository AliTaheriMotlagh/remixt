// Renders a radio transition (lib/radioTransitions.ts) into the start of the
// incoming song: the outgoing song's last `seconds` and the incoming song,
// processed together offline as a DJ would and mixed into one buffer as long
// as the incoming song. The player then hands over to it at the change (no
// live Web Audio in the sound's path: phones keep it playing locked).
//
// Each style, from the change's start (t = 0) to its end (t = L):
//   bassSwap  both songs, equal-power; the outgoing's lows cut and the
//             incoming's restored at exactly L/2 (one bass at a time)
//   filter    outgoing high-passed 30 Hz → 2.5 kHz (resonant), incoming
//             low-passed 250 Hz → open, over the whole change
//   echo      outgoing dry until L/2, its last beat fed into a dotted-eighth
//             echo (damped, ping-pong) that rings on; incoming from L/2
//   rise      outgoing high-passed up, a filtered-noise riser over it, a beat
//             of silence, the incoming drops in full at L (muffled under the build)
//   tapeStop  outgoing slows to a stop over its last ~85% beat, incoming at full
//   automix   (like Apple Music's AutoMix) over 16 bars the outgoing song's
//             speed glides to the incoming tempo so the beats lock; lows swap
//             at the midpoint, the outgoing's highs soften as it leaves

import { barOf, glideRatio, styleGains, type TransitionStyle } from "@/lib/radioTransitions";

/** The outgoing song's tail: `buffer` from `from` seconds for `seconds`. */
export type Tail = { buffer: AudioBuffer; from: number };

function curve(ctx: BaseAudioContext, param: AudioParam, fn: (p: number) => number, start: number, seconds: number, steps = 64) {
  const values = new Float32Array(steps);
  for (let i = 0; i < steps; i++) values[i] = fn(i / (steps - 1));
  param.setValueAtTime(values[0], start);
  param.setValueCurveAtTime(values, start, Math.max(0.01, seconds));
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(2, Math.max(1, Math.round(seconds * ctx.sampleRate)), ctx.sampleRate);
  let seed = 0x2f6b;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = seed / 2 ** 31 - 1;
    }
  }
  return b;
}

/**
 * The incoming song with the change rendered into its first `seconds`.
 * `bpm`: the outgoing song's tempo (bar lines, echo time); `tail` its last part.
 */
export async function renderTransition(
  style: TransitionStyle,
  tail: Tail,
  incoming: AudioBuffer,
  seconds: number,
  bpm: number | null,
  /** The incoming song's tempo (AutoMix glides the outgoing one to it). */
  inBpm: number | null = null
): Promise<AudioBuffer> {
  const rate = incoming.sampleRate;
  const ctx = new OfflineAudioContext(2, incoming.length, rate);
  const L = Math.max(0.2, Math.min(seconds, incoming.duration));
  const beat = barOf(bpm) / 4;

  // ——— the outgoing song ———
  const out = ctx.createBufferSource();
  out.buffer = tail.buffer;
  const outGain = ctx.createGain();
  let outChain: AudioNode = out;

  // ——— the incoming song ———
  const inn = ctx.createBufferSource();
  inn.buffer = incoming;
  const inGain = ctx.createGain();
  let inChain: AudioNode = inn;

  const gains = (p: number) => styleGains(style, p);
  curve(ctx, outGain.gain, (p) => gains(p).out, 0, L);
  curve(ctx, inGain.gain, (p) => gains(p).in, 0, L);
  // After the change the incoming plays as it is.
  inGain.gain.setValueAtTime(1, L + 0.001);

  if (style === "automix") {
    // The tempo glide: smooth (an S-curve) over the first half, then held, so the beats are locked through the swap.
    const ratio = glideRatio(bpm, inBpm) ?? 1;
    const steps = 48;
    const rates = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const p = i / (steps - 1);
      rates[i] = 1 + (ratio - 1) * (0.5 - 0.5 * Math.cos(Math.PI * p));
    }
    out.playbackRate.setValueAtTime(1, 0);
    out.playbackRate.setValueCurveAtTime(rates, 0, L / 2);
    out.playbackRate.setValueAtTime(ratio, L / 2 + 0.001);
    const outLow = ctx.createBiquadFilter();
    outLow.type = "lowshelf";
    outLow.frequency.value = 180;
    curve(ctx, outLow.gain, (p) => (p < 0.48 ? 0 : p > 0.52 ? -30 : -30 * ((p - 0.48) / 0.04)), 0, L);
    const outHigh = ctx.createBiquadFilter();
    outHigh.type = "highshelf";
    outHigh.frequency.value = 4000;
    curve(ctx, outHigh.gain, (p) => (p < 0.6 ? 0 : -9 * ((p - 0.6) / 0.4)), 0, L);
    const inLow = ctx.createBiquadFilter();
    inLow.type = "lowshelf";
    inLow.frequency.value = 180;
    curve(ctx, inLow.gain, (p) => (p < 0.48 ? -30 : p > 0.52 ? 0 : -30 + 30 * ((p - 0.48) / 0.04)), 0, L);
    outChain = outChain.connect(outLow).connect(outHigh);
    inChain = inChain.connect(inLow);
  }

  if (style === "bassSwap") {
    const outLow = ctx.createBiquadFilter();
    outLow.type = "lowshelf";
    outLow.frequency.value = 200;
    outLow.gain.setValueAtTime(0, 0);
    outLow.gain.setValueAtTime(0, L / 2 - 0.03);
    outLow.gain.linearRampToValueAtTime(-30, L / 2 + 0.03);
    const inLow = ctx.createBiquadFilter();
    inLow.type = "lowshelf";
    inLow.frequency.value = 200;
    inLow.gain.setValueAtTime(-30, 0);
    inLow.gain.setValueAtTime(-30, L / 2 - 0.03);
    inLow.gain.linearRampToValueAtTime(0, L / 2 + 0.03);
    outChain = outChain.connect(outLow);
    inChain = inChain.connect(inLow);
  }

  if (style === "filter") {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.Q.value = 6;
    hp.frequency.setValueAtTime(30, 0);
    hp.frequency.exponentialRampToValueAtTime(2500, L);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(250, 0);
    lp.frequency.exponentialRampToValueAtTime(20_000, L);
    outChain = outChain.connect(hp);
    inChain = inChain.connect(lp);
  }

  if (style === "echo") {
    // The beat before the dry cut goes into the echo; nothing after it.
    const send = ctx.createGain();
    send.gain.setValueAtTime(0, 0);
    send.gain.setValueAtTime(0, Math.max(0, L / 2 - beat));
    send.gain.linearRampToValueAtTime(1, Math.max(0.01, L / 2 - beat + 0.01));
    send.gain.setValueAtTime(1, L / 2);
    send.gain.linearRampToValueAtTime(0, L / 2 + 0.02);
    const delayL = ctx.createDelay(4);
    const delayR = ctx.createDelay(4);
    delayL.delayTime.value = beat * 0.75;
    delayR.delayTime.value = beat * 0.75;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 3500;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.55;
    const merger = ctx.createChannelMerger(2);
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    out.connect(send).connect(delayL);
    delayL.connect(damp).connect(delayR);
    delayR.connect(feedback).connect(delayL);
    delayL.connect(merger, 0, 0);
    delayR.connect(merger, 0, 1);
    merger.connect(wet).connect(ctx.destination);
  }

  if (style === "rise") {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(30, 0);
    hp.frequency.exponentialRampToValueAtTime(900, L * 0.875);
    outChain = outChain.connect(hp);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, 0);
    lp.frequency.setValueAtTime(400, L - 0.01);
    lp.frequency.setValueAtTime(20_000, L);
    inChain = inChain.connect(lp);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, L);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(400, 0);
    band.frequency.exponentialRampToValueAtTime(9000, L * 0.875);
    const nGain = ctx.createGain();
    curve(ctx, nGain.gain, (p) => (p < 0.875 ? 0.28 * (p / 0.875) ** 2.5 : 0), 0, L);
    noise.connect(band).connect(nGain).connect(ctx.destination);
    noise.start(0);
  }

  if (style === "tapeStop") {
    // The last 85% … slows from full speed to almost nothing over ~one beat, the way a turntable powers down.
    const stopAt = L * 0.85;
    const slow = Math.min(stopAt, Math.max(0.25, beat * 1.2));
    out.playbackRate.setValueAtTime(1, 0);
    out.playbackRate.setValueAtTime(1, stopAt - slow);
    out.playbackRate.exponentialRampToValueAtTime(0.06, stopAt);
  }

  outChain.connect(outGain).connect(ctx.destination);
  inChain.connect(inGain).connect(ctx.destination);
  out.start(0, tail.from, Math.min(tail.buffer.duration - tail.from, L + 4));
  inn.start(0);
  return ctx.startRendering();
}

/**
 * Two short made-up songs to hear a style with in the console (no library
 * song needed): an outgoing four-on-the-floor loop in A minor at `bpm`, and
 * an incoming one in C with a different groove.
 */
export function demoSongs(rate = 44_100, bpm = 124): { a: AudioBuffer; b: AudioBuffer } {
  const ctx = new OfflineAudioContext(2, 1, rate);
  const beat = 60 / bpm;
  const make = (seconds: number, root: number, kickEvery: number, seed: number) => {
    const b = ctx.createBuffer(2, Math.round(seconds * rate), rate);
    const l = b.getChannelData(0);
    const r = b.getChannelData(1);
    let s = seed;
    for (let i = 0; i < l.length; i++) {
      const t = i / rate;
      const inBeat = t % (beat * kickEvery);
      const kick = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-inBeat * 30)) * inBeat) * Math.exp(-inBeat * 8) * 0.8;
      const hatT = (t + beat / 2) % beat;
      s = (s * 1664525 + 1013904223) >>> 0;
      const hat = (s / 2 ** 32 - 0.5) * Math.exp(-hatT * 60) * 0.25;
      const bassT = t % (beat / 2);
      const bass = Math.sin(2 * Math.PI * (root / 4) * t) * Math.exp(-bassT * 4) * 0.35;
      const chord = [1, 1.2, 1.5].reduce((sum, m) => sum + Math.sin(2 * Math.PI * root * m * t), 0) * 0.06 * (0.6 + 0.4 * Math.sin(t * 2));
      l[i] = kick + hat + bass + chord;
      r[i] = kick + hat * 0.7 + bass + chord * 0.9;
    }
    return b;
  };
  return { a: make(beat * 32, 220, 1, 7), b: make(beat * 32, 261.6, 1, 11) };
}
