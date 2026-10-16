"use client";

import {
  DEFAULT_MASTER,
  resolveDelayTime,
  type LaneClip,
  type LaneFx,
  type MasterFx,
  type StudioLane,
} from "./studioStore";

// The signal path a lane runs through, live and during an export bounce:
//
//   source → highpass → lowpass → low/mid/high EQ → drive → compressor
//          → fadeGain → autoGain → autoFilter → duckGain
//          → volumeGain → widener (Haas) → panner → master
//                                  ├→ reverb send → reverb bus ─┘  (one per room size, shared)
//                                  └→ delay send → delay(+feedback) ─┘
//
// Everything except `drive` is a plain AudioParam, so a lane's chain is
// built once and then updated in place whenever the store changes; only
// pitch/tempo (rendered offline into a new buffer) needs a rebuild.
// autoGain/autoFilter follow the lane's drawn automation and duckGain the
// vocals (sidechain ducking) — both scheduled per play, see modulation.ts.

export type LaneChain = {
  input: AudioNode;
  fadeGain: GainNode;
  autoGain: GainNode;
  autoFilter: BiquadFilterNode;
  duckGain: GainNode;
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

/**
 * One reverb per room size, shared by every lane that sends to it, by
 * where it plays into. A convolver is the costliest node a lane has, and
 * the sum of the sends through one is exactly the sum of each through its
 * own (the same impulse) — so twenty lanes with reverb cost one.
 */
const reverbBuses = new WeakMap<AudioNode, Map<string, ConvolverNode>>();

function reverbBus(ctx: BaseAudioContext, destination: AudioNode, seconds: number): ConvolverNode {
  let buses = reverbBuses.get(destination);
  if (!buses) {
    buses = new Map();
    reverbBuses.set(destination, buses);
  }
  const key = Math.max(0.1, seconds).toFixed(2);
  let bus = buses.get(key);
  if (!bus) {
    bus = ctx.createConvolver();
    bus.buffer = getImpulse(ctx, seconds);
    bus.connect(destination);
    buses.set(key, bus);
  }
  return bus;
}

/** How long a stage switched off keeps running, so what it's still sounding (a compressor's release, a reverb's tail) isn't cut off. */
const RELEASE_MS = 80;

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
  // What the oversampled shaper delays a lane by (measured in Chrome: one
  // 128-frame block). With drive off a plain delay stands in for it, so
  // switching drive on or off never moves the lane against the others.
  const shaperLatency = ctx.createDelay(0.01);
  shaperLatency.delayTime.value = 128 / ctx.sampleRate;
  // Saturation adds level, so trim it back to keep the fader meaningful.
  const driveTrim = ctx.createGain();

  const compressor = ctx.createDynamicsCompressor();
  const compressorBypass = ctx.createGain();
  const compressorWet = ctx.createGain();

  const fadeGain = ctx.createGain();
  const autoGain = ctx.createGain();
  const autoFilter = ctx.createBiquadFilter();
  autoFilter.type = "lowpass";
  autoFilter.frequency.value = 20000;
  autoFilter.Q.value = 0.9;
  const duckGain = ctx.createGain();
  const volumeGain = ctx.createGain();

  // Haas widener: the right channel is delayed by a few milliseconds,
  // which reads as width without changing the mono content much.
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const widthDelay = ctx.createDelay(0.05);

  const panner = ctx.createStereoPanner();

  const reverbSend = ctx.createGain();
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
  shaper.connect(driveTrim);
  shaperLatency.connect(driveTrim);

  driveTrim.connect(compressorBypass);
  compressor.connect(compressorWet);
  compressorWet.connect(fadeGain);
  compressorBypass.connect(fadeGain);

  fadeGain.connect(autoGain);
  autoGain.connect(autoFilter);
  autoFilter.connect(duckGain);
  duckGain.connect(volumeGain);

  volumeGain.connect(splitter);
  splitter.connect(merger, 0, 0);
  splitter.connect(widthDelay, 1);
  widthDelay.connect(merger, 0, 1);
  merger.connect(panner);
  panner.connect(destination);

  volumeGain.connect(reverbSend);

  volumeGain.connect(delaySend);
  delaySend.connect(delayNode);
  delayNode.connect(feedbackDamp);
  feedbackDamp.connect(feedback);
  feedback.connect(delayNode);
  delayNode.connect(destination);

  let appliedDrive = -1;

  // The costly stages — drive (oversampled), the compressor and the
  // reverb — are only in the signal path while they're on, so a lane
  // with them off costs nothing for them. (Twenty lanes running all
  // three took a third of a fast computer's audio thread, and all of a
  // phone's: the mix broke up.) A node nothing feeds stops working once
  // what it's still sounding has died away.
  const unlink = (from: AudioNode, to: AudioNode) => {
    try {
      from.disconnect(to);
    } catch {
      // wasn't connected
    }
  };
  let driveOn: boolean | null = null;
  let compressOn: boolean | null = null;
  let compressorRelease: ReturnType<typeof setTimeout> | null = null;
  let reverbTo: ConvolverNode | null = null;
  let reverbRelease: ReturnType<typeof setTimeout> | null = null;

  function routeDrive(on: boolean) {
    if (on === driveOn) return;
    driveOn = on;
    unlink(eqHigh, on ? shaperLatency : shaper);
    eqHigh.connect(on ? shaper : shaperLatency);
  }

  function routeCompressor(on: boolean) {
    if (on === compressOn) return;
    const first = compressOn === null;
    compressOn = on;
    if (compressorRelease) clearTimeout(compressorRelease);
    compressorRelease = null;
    if (on) driveTrim.connect(compressor);
    // Switched off: unhooked once the crossfade to the dry path is over.
    else if (!first) compressorRelease = setTimeout(() => ((compressorRelease = null), unlink(driveTrim, compressor)), RELEASE_MS);
  }

  function routeReverb(level: number, seconds: number) {
    const bus = level > 0 ? reverbBus(ctx, destination, seconds) : null;
    if (bus) {
      if (reverbRelease) clearTimeout(reverbRelease);
      reverbRelease = null;
      if (bus === reverbTo) return;
      // A new room size: the old room's tail rings out on its own.
      if (reverbTo) unlink(reverbSend, reverbTo);
      reverbSend.connect(bus);
      reverbTo = bus;
    } else if (reverbTo && !reverbRelease) {
      // Unhooked once the send has faded to nothing (the tail is the bus's, and plays on).
      const leaving = reverbTo;
      reverbRelease = setTimeout(() => {
        reverbRelease = null;
        if (reverbTo !== leaving) return;
        unlink(reverbSend, leaving);
        reverbTo = null;
      }, RELEASE_MS);
    }
  }

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
    routeDrive(fx.drive > 0.001);
    setParam(driveTrim.gain, 1 - fx.drive * 0.45, ctx);

    compressor.threshold.value = -22;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.18;
    routeCompressor(fx.compress);
    setParam(compressorWet.gain, fx.compress ? 1 : 0, ctx);
    setParam(compressorBypass.gain, fx.compress ? 0 : 1, ctx);

    setParam(widthDelay.delayTime, fx.width * 0.022, ctx);
    setParam(panner.pan, Math.max(-1, Math.min(1, fx.pan)), ctx);

    routeReverb(fx.reverb, fx.reverbSize);
    setParam(reverbSend.gain, fx.reverb, ctx);

    setParam(delaySend.gain, fx.delay, ctx);
    setParam(delayNode.delayTime, resolveDelayTime(fx, bpm), ctx);
    setParam(feedback.gain, Math.min(0.85, Math.max(0, fx.delayFeedback)), ctx);
  }

  update(lane, projectBpm);

  return {
    input: highpass,
    fadeGain,
    autoGain,
    autoFilter,
    duckGain,
    volumeGain,
    update,
    disconnect: () => {
      if (compressorRelease) clearTimeout(compressorRelease);
      if (reverbRelease) clearTimeout(reverbRelease);
      for (const node of [
        highpass, lowpass, eqLow, eqMid, eqHigh, shaper, shaperLatency, driveTrim,
        compressor, compressorBypass, compressorWet, fadeGain, autoGain, autoFilter, duckGain, volumeGain,
        splitter, merger, widthDelay, panner, reverbSend,
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

export type MasterChain = { input: AudioNode; gain: GainNode; update: (master: MasterFx) => void };

/**
 * Master bus: tone and glue, then the fader, then a limiter, then a
 * little headroom. The limiter has to sit *after* the fader — in front of
 * it, pushing the master past unity would just clip whatever the limiter
 * had tamed.
 */
export function createMasterChain(ctx: BaseAudioContext, destination: AudioNode, master: MasterFx = DEFAULT_MASTER): MasterChain {
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 90;
  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 9000;
  // Glue: a slow, gentle bus compressor, blended in, with make-up gain.
  const glue = ctx.createDynamicsCompressor();
  glue.knee.value = 12;
  glue.attack.value = 0.03;
  glue.release.value = 0.25;
  const glueWet = ctx.createGain();
  const glueDry = ctx.createGain();
  const makeUp = ctx.createGain();

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

  low.connect(high);
  high.connect(glue);
  glue.connect(glueWet);
  high.connect(glueDry);
  glueWet.connect(makeUp);
  glueDry.connect(makeUp);
  makeUp.connect(gain);
  gain.connect(limiter);
  limiter.connect(headroom);
  headroom.connect(destination);

  function update(next: MasterFx) {
    const amount = Math.min(1, Math.max(0, next.glue));
    setParam(low.gain, next.low, ctx);
    setParam(high.gain, next.high, ctx);
    glue.threshold.value = -8 - 16 * amount;
    glue.ratio.value = 1.5 + 2.5 * amount;
    setParam(glueWet.gain, amount > 0 ? 1 : 0, ctx);
    setParam(glueDry.gain, amount > 0 ? 0 : 1, ctx);
    // Win back about what the compressor takes off, so "more glue" reads as denser, not quieter.
    setParam(makeUp.gain, 10 ** ((amount * 7) / 20), ctx);
  }
  update(master);
  // Set outright the first time: an offline render has no time to ramp.
  low.gain.value = master.low;
  high.gain.value = master.high;
  glueWet.gain.value = master.glue > 0 ? 1 : 0;
  glueDry.gain.value = master.glue > 0 ? 0 : 1;
  makeUp.gain.value = 10 ** ((Math.min(1, Math.max(0, master.glue)) * 7) / 20);

  return { input: low, gain, update };
}

/** Fade at each end of an arranged clip, so the cut doesn't click. */
const CLIP_FADE_IN = 0.008;
const CLIP_FADE_OUT = 0.03;

/** A clip rendered on its own at its own speed — see LaneClip.stretch. */
export type ClipBufferLookup = (clip: LaneClip) => AudioBuffer | undefined;

/** Whether a clip plays at a speed of its own. */
export function hasOwnStretch(clip: LaneClip) {
  return clip.stretch !== undefined && Math.abs(clip.stretch - 1) > 0.0005;
}

/** Whether a clip plays from a render of its own: its own speed, or backwards. */
export function needsOwnRender(clip: LaneClip) {
  return hasOwnStretch(clip) || !!clip.reverse;
}

/**
 * Where each piece of a lane sounds, in timeline seconds, and where it's
 * read from: a clip's own render (`own`), or the lane's processed (already
 * stretched) audio, `length` seconds long, at `from`. A lane without an
 * arrangement is one piece: all of it.
 */
export function laneSegments(lane: StudioLane, length: number, clipBuffer?: ClipBufferLookup) {
  if (!lane.clips?.length) {
    return [{ own: null, start: lane.offsetSeconds, from: 0, length, fades: false, clip: null }];
  }
  const ratio = lane.tempoRatio;
  return lane.clips
    .filter((clip) => !clip.muted)
    .map((clip) => {
      const start = lane.offsetSeconds + clip.at / ratio;
      const own = needsOwnRender(clip) ? clipBuffer?.(clip) : undefined;
      if (own) return { own, start, from: 0, length: own.duration, fades: true, clip };
      // Not rendered yet (or no stretch of its own): read it from the lane's audio.
      const from = Math.min(length, clip.from / ratio);
      return { own: null, start, from, length: Math.max(0, Math.min(length, clip.to / ratio) - from), fades: true, clip };
    });
}

/**
 * A stand-in for a lane whose audio at its speed and pitch is still
 * rendering: a few seconds of it, rendered on their own, played for the
 * timeline from `from` to `to` (see audioEngine's stand-ins). `buffer` is
 * the lane's audio from `bufferStart` (in the lane's stretched seconds).
 */
export type LaneWindow = { from: number; to: number; buffer: AudioBuffer; bufferStart: number };

/** How long one stand-in window crossfades into the next (and a stand-in into the finished render). */
export const WINDOW_SEAM = 0.015;

/**
 * The stretch of a lane's audio (in its stretched seconds) that plays
 * between `from` and `to` on the timeline, the seam after it included —
 * what a stand-in for that time has to render. Null when the lane plays
 * none of its own audio then (silent, or only clips with renders of their own).
 */
export function windowRange(lane: StudioLane, length: number, from: number, to: number): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const s of laneSegments(lane, length)) {
    if (s.clip && needsOwnRender(s.clip)) continue;
    const a = Math.max(s.start, from);
    const b = Math.min(s.start + s.length, to + WINDOW_SEAM);
    if (b <= a) continue;
    start = Math.min(start, s.from + (a - s.start));
    end = Math.max(end, s.from + (b - s.start));
  }
  return end > start ? { start, end } : null;
}

/**
 * A clip's level shape: its gain, faded in over `fadeIn` and out over
 * `fadeOut` (never shorter than the anti-click fades; scaled down together
 * if they'd overlap). `length` is how long the clip plays, in seconds.
 */
export function clipEnvelope(clip: Pick<LaneClip, "gain" | "fadeIn" | "fadeOut"> | null, length: number) {
  const level = Math.max(0, clip?.gain ?? 1);
  let fadeIn = Math.max(CLIP_FADE_IN, clip?.fadeIn ?? 0);
  let fadeOut = Math.max(CLIP_FADE_OUT, clip?.fadeOut ?? 0);
  if (fadeIn + fadeOut > length && length > 0) {
    const k = length / (fadeIn + fadeOut);
    fadeIn *= k;
    fadeOut *= k;
  }
  /** The level `x` seconds into the clip. */
  const at = (x: number) => level * Math.min(1, fadeIn > 0 ? x / fadeIn : 1) * Math.min(1, fadeOut > 0 ? (length - x) / fadeOut : 1);
  return { level, fadeIn, fadeOut, at };
}

/**
 * Schedules a lane's buffer on the timeline — one source per clip when
 * the lane is arranged.
 *
 * `playhead` is a project-timeline position; a lane that starts later than
 * the playhead is scheduled into the future instead of being trimmed, and
 * a piece whose end is already behind the playhead is skipped entirely.
 * Returns the sources started (none when the lane has nothing left to play).
 *
 * With `window`, it plays a stand-in instead (see LaneWindow): only the
 * timeline from `window.from` to `window.to`, read from the stand-in's
 * audio, faded across the seams with the windows either side. `laneLength`
 * is how long the lane's audio is at its speed (the buffer's own length
 * when there's no window). `keepFade` leaves the lane's fade in/out as it
 * was scheduled (a window queued up behind the one playing). Sources go to
 * `destination` (default: the lane's chain).
 */
export function scheduleLane({
  ctx,
  lane,
  buffer,
  chain,
  startTime,
  playhead,
  until,
  clipBuffer,
  window,
  laneLength = buffer.duration,
  keepFade = false,
  destination = chain.input,
}: {
  ctx: BaseAudioContext;
  lane: StudioLane;
  buffer: AudioBuffer;
  chain: LaneChain;
  startTime: number;
  playhead: number;
  until?: number;
  clipBuffer?: ClipBufferLookup;
  window?: LaneWindow;
  laneLength?: number;
  keepFade?: boolean;
  destination?: AudioNode;
}): AudioBufferSourceNode[] {
  const segments = laneSegments(lane, laneLength, clipBuffer);
  const laneEnd = Math.max(...segments.map((s) => s.start + s.length));
  if (playhead >= laneEnd) return [];

  // Timeline position → audio-clock time.
  const at = (seconds: number) => startTime + (seconds - playhead);

  // The lane's own fade in/out spans the whole lane, clips and all.
  if (!keepFade) {
    const { fadeIn, fadeOut } = lane.fx;
    const fade = chain.fadeGain.gain;
    fade.cancelScheduledValues(startTime);
    const laneStart = lane.offsetSeconds;
    const into = Math.max(0, playhead - laneStart);
    const when = at(Math.max(playhead, laneStart));
    if (fadeIn > 0 && into < fadeIn) {
      fade.setValueAtTime(into / fadeIn, when);
      fade.linearRampToValueAtTime(1, at(laneStart + fadeIn));
    } else {
      fade.setValueAtTime(1, when);
    }
    if (fadeOut > 0) {
      const fadeOutStart = laneEnd - fadeOut;
      if (fadeOutStart > playhead) fade.setValueAtTime(1, at(fadeOutStart));
      fade.linearRampToValueAtTime(0.0001, at(laneEnd));
    }
  }

  const sources: AudioBufferSourceNode[] = [];
  for (const segment of segments) {
    if (segment.length <= 0) continue;
    // What it reads: a clip's own render, the stand-in's audio, or the lane's.
    const source = segment.own ?? (window ? window.buffer : buffer);
    const shift = !segment.own && window ? window.bufferStart : 0;
    // The part of it heard: from the playhead (and the window, and where the stand-in's audio starts) to its end (or the window's, and the stand-in's).
    let from = Math.max(segment.start, playhead);
    let to = segment.start + segment.length;
    if (window) {
      from = Math.max(from, window.from, segment.start + (shift - segment.from));
      to = Math.min(to, window.to + WINDOW_SEAM, segment.start + (shift + source.duration - segment.from));
    }
    if (to - from < 0.002) continue;
    const offset = from - segment.start;
    const remaining = to - from;
    const startsAt = at(from);

    const node = ctx.createBufferSource();
    node.buffer = source;
    let out: AudioNode = destination;
    const gains: GainNode[] = [];
    if (window) {
      // Across a seam the windows either side overlap, one fading in as the other fades out.
      const seam = ctx.createGain();
      const g = seam.gain;
      const seamIn = from > playhead + 0.001 && from <= window.from + 0.001 && window.from > segment.start + 0.001;
      const seamOut = to > window.to + 0.001;
      g.setValueAtTime(seamIn ? 0 : 1, startsAt);
      if (seamIn) g.linearRampToValueAtTime(1, startsAt + Math.min(WINDOW_SEAM, remaining));
      if (seamOut) {
        g.setValueAtTime(1, at(window.to));
        g.linearRampToValueAtTime(0, at(to));
      }
      seam.connect(out);
      out = seam;
      gains.push(seam);
    }
    if (segment.fades) {
      const gain = ctx.createGain();
      const g = gain.gain;
      const shape = clipEnvelope(segment.clip, segment.length);
      const end = offset + remaining;
      // From where playback joins the clip: up to full level, held, then down to nothing at its end.
      g.setValueAtTime(shape.at(offset), startsAt);
      if (offset < shape.fadeIn && shape.fadeIn < end) g.linearRampToValueAtTime(shape.level, startsAt + shape.fadeIn - offset);
      const fadeOutFrom = segment.length - shape.fadeOut;
      if (fadeOutFrom > offset && fadeOutFrom < end) g.setValueAtTime(shape.level, startsAt + fadeOutFrom - offset);
      g.linearRampToValueAtTime(shape.at(end), startsAt + remaining);
      gain.connect(out);
      out = gain;
      gains.push(gain);
    }
    node.connect(out);
    // Safari holds on to a finished source (and the buffer it played) while it's still connected.
    node.onended = () => {
      node.disconnect();
      for (const gain of gains) gain.disconnect();
    };
    node.start(startsAt, segment.from - shift + offset, remaining);
    if (until !== undefined) node.stop(until);
    sources.push(node);
  }
  return sources;
}
