"use client";

import {
  resolveDelayTime,
  type LaneFx,
  type StudioLane,
} from "./studioStore";

// The signal path a lane runs through, live and during an export bounce:
//
//   source → highpass → lowpass → low/mid/high EQ → drive → compressor
//          → fadeGain → volumeGain → widener (Haas) → panner → master
//                                  ├→ reverb send → convolver ─┘
//                                  └→ delay send → delay(+feedback) ─┘
//
// Everything except `drive` is a plain AudioParam, so a lane's chain is
// built once and then updated in place whenever the store changes; only
// pitch/tempo (rendered offline into a new buffer) needs a rebuild.

export type LaneChain = {
  input: AudioNode;
  fadeGain: GainNode;
  volumeGain: GainNode;
  update: (lane: StudioLane, projectBpm: number) => void;
  disconnect: () => void;
};

const impulseCache = new Map<string, AudioBuffer>();

/** Synthesises a decaying-noise impulse response — no IR files to ship. */
function getImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(0.1, seconds);
  const key = `${ctx.sampleRate}:${length.toFixed(2)}`;
  const cached = impulseCache.get(key);
  if (cached) return cached;

  const frames = Math.floor(ctx.sampleRate * length);
  const impulse = ctx.createBuffer(2, frames, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < frames; i++) {
      // Noise with an exponential tail; the early part is attenuated a
      // little to fake a pre-delay rather than starting on a hard wall.
      const decay = Math.pow(1 - i / frames, 2.2);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  impulseCache.set(key, impulse);
  return impulse;
}

const curveCache = new Map<number, Float32Array<ArrayBuffer>>();

/** Soft-clip curve for the drive control: 0 = clean, 1 = crunchy. */
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const quantised = Math.round(amount * 20) / 20;
  const cached = curveCache.get(quantised);
  if (cached) return cached;

  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const k = quantised * 80;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  curveCache.set(quantised, curve);
  return curve;
}

function setParam(param: AudioParam, value: number, ctx: BaseAudioContext) {
  // A short ramp instead of a jump keeps slider drags from zipper-noising.
  param.setTargetAtTime(value, ctx.currentTime, 0.01);
}

export function createLaneChain(
  ctx: BaseAudioContext,
  lane: StudioLane,
  projectBpm: number,
  destination: AudioNode
): LaneChain {
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";

  const eqLow = ctx.createBiquadFilter();
  eqLow.type = "lowshelf";
  eqLow.frequency.value = 220;
  const eqMid = ctx.createBiquadFilter();
  eqMid.type = "peaking";
  eqMid.frequency.value = 1400;
  eqMid.Q.value = 0.9;
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = "highshelf";
  eqHigh.frequency.value = 5200;

  const shaper = ctx.createWaveShaper();
  shaper.oversample = "2x";
  // Saturation adds level, so trim it back to keep the fader meaningful.
  const driveTrim = ctx.createGain();

  const compressor = ctx.createDynamicsCompressor();
  const compressorBypass = ctx.createGain();
  const compressorWet = ctx.createGain();

  const fadeGain = ctx.createGain();
  const volumeGain = ctx.createGain();

  // Haas widener: the right channel is delayed by a few milliseconds,
  // which reads as width without changing the mono content much.
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const widthDelay = ctx.createDelay(0.05);

  const panner = ctx.createStereoPanner();

  const reverbSend = ctx.createGain();
  const convolver = ctx.createConvolver();
  const delaySend = ctx.createGain();
  const delayNode = ctx.createDelay(4);
  const feedback = ctx.createGain();
  // Successive echoes should get darker, not just quieter.
  const feedbackDamp = ctx.createBiquadFilter();
  feedbackDamp.type = "lowpass";
  feedbackDamp.frequency.value = 4000;

  highpass.connect(lowpass);
  lowpass.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(shaper);
  shaper.connect(driveTrim);

  driveTrim.connect(compressor);
  compressor.connect(compressorWet);
  driveTrim.connect(compressorBypass);
  compressorWet.connect(fadeGain);
  compressorBypass.connect(fadeGain);

  fadeGain.connect(volumeGain);

  volumeGain.connect(splitter);
  splitter.connect(merger, 0, 0);
  splitter.connect(widthDelay, 1);
  widthDelay.connect(merger, 0, 1);
  merger.connect(panner);
  panner.connect(destination);

  volumeGain.connect(reverbSend);
  reverbSend.connect(convolver);
  convolver.connect(destination);

  volumeGain.connect(delaySend);
  delaySend.connect(delayNode);
  delayNode.connect(feedbackDamp);
  feedbackDamp.connect(feedback);
  feedback.connect(delayNode);
  delayNode.connect(destination);

  let appliedDrive = -1;
  let appliedReverbSize = -1;

  function update(next: StudioLane, bpm: number) {
    const fx: LaneFx = next.fx;

    setParam(highpass.frequency, Math.max(20, fx.highpass), ctx);
    setParam(lowpass.frequency, Math.min(20000, fx.lowpass), ctx);
    setParam(eqLow.gain, fx.eqLow, ctx);
    setParam(eqMid.gain, fx.eqMid, ctx);
    setParam(eqHigh.gain, fx.eqHigh, ctx);

    if (fx.drive !== appliedDrive) {
      appliedDrive = fx.drive;
      shaper.curve = driveCurve(fx.drive);
    }
    setParam(driveTrim.gain, 1 - fx.drive * 0.45, ctx);

    compressor.threshold.value = -22;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.18;
    setParam(compressorWet.gain, fx.compress ? 1 : 0, ctx);
    setParam(compressorBypass.gain, fx.compress ? 0 : 1, ctx);

    setParam(widthDelay.delayTime, fx.width * 0.022, ctx);
    setParam(panner.pan, Math.max(-1, Math.min(1, fx.pan)), ctx);

    if (fx.reverb > 0 && fx.reverbSize !== appliedReverbSize) {
      appliedReverbSize = fx.reverbSize;
      convolver.buffer = getImpulse(ctx, fx.reverbSize);
    }
    setParam(reverbSend.gain, fx.reverb, ctx);

    setParam(delaySend.gain, fx.delay, ctx);
    setParam(delayNode.delayTime, resolveDelayTime(fx, bpm), ctx);
    setParam(feedback.gain, Math.min(0.85, Math.max(0, fx.delayFeedback)), ctx);
  }

  update(lane, projectBpm);

  return {
    input: highpass,
    fadeGain,
    volumeGain,
    update,
    disconnect: () => {
      for (const node of [
        highpass, lowpass, eqLow, eqMid, eqHigh, shaper, driveTrim,
        compressor, compressorBypass, compressorWet, fadeGain, volumeGain,
        splitter, merger, widthDelay, panner, reverbSend, convolver,
        delaySend, delayNode, feedback, feedbackDamp,
      ]) {
        try {
          node.disconnect();
        } catch {
          // already torn down
        }
      }
    },
  };
}

/**
 * Master bus: the fader first, then a limiter, then a little headroom.
 * The limiter has to sit *after* the fader — in front of it, pushing the
 * master past unity would just clip whatever the limiter had tamed.
 */
export function createMasterChain(ctx: BaseAudioContext, destination: AudioNode) {
  const gain = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  // A fast attack: slower than this and isolated transients slip past
  // the limiter and clip on the way into a 16-bit export.
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  // DynamicsCompressor has no lookahead, so even a 1 ms attack lets
  // transients overshoot the threshold before it clamps down. This trim
  // leaves room for that overshoot, which is what keeps an exported WAV
  // under full scale with the master fader pushed all the way up.
  const headroom = ctx.createGain();
  headroom.gain.value = 0.89;

  gain.connect(limiter);
  limiter.connect(headroom);
  headroom.connect(destination);
  return { input: gain as AudioNode, gain };
}

/**
 * Schedules a lane's buffer on the timeline.
 *
 * `playhead` is a project-timeline position; a lane that starts later than
 * the playhead is scheduled into the future instead of being trimmed, and
 * a lane whose end is already behind the playhead is skipped entirely.
 * Returns null when the lane has nothing left to play.
 */
export function scheduleLane({
  ctx,
  lane,
  buffer,
  chain,
  startTime,
  playhead,
  until,
}: {
  ctx: BaseAudioContext;
  lane: StudioLane;
  buffer: AudioBuffer;
  chain: LaneChain;
  startTime: number;
  playhead: number;
  until?: number;
}): AudioBufferSourceNode | null {
  const local = playhead - lane.offsetSeconds;
  if (local >= buffer.duration) return null;

  const when = local < 0 ? startTime - local : startTime;
  const bufferOffset = Math.max(0, local);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(chain.input);

  const { fadeIn, fadeOut } = lane.fx;
  const fade = chain.fadeGain.gain;
  fade.cancelScheduledValues(startTime);

  if (fadeIn > 0 && bufferOffset < fadeIn) {
    const from = bufferOffset / fadeIn;
    fade.setValueAtTime(from, when);
    fade.linearRampToValueAtTime(1, when + (fadeIn - bufferOffset));
  } else {
    fade.setValueAtTime(1, when);
  }

  const remaining = buffer.duration - bufferOffset;
  if (fadeOut > 0) {
    const fadeOutStartsIn = remaining - fadeOut;
    if (fadeOutStartsIn > 0) {
      fade.setValueAtTime(1, when + fadeOutStartsIn);
      fade.linearRampToValueAtTime(0.0001, when + remaining);
    } else {
      fade.linearRampToValueAtTime(0.0001, when + remaining);
    }
  }

  source.start(when, bufferOffset);
  if (until !== undefined) source.stop(until);
  return source;
}
